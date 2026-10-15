import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
  AppState,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Accelerometer } from 'expo-sensors';
import { Camera, CameraView } from 'expo-camera';
import {
  getRecordingPermissionsAsync,
  RecordingPresets,
  requestRecordingPermissionsAsync,
  useAudioRecorder,
} from 'expo-audio';
import { getCurrentLocation } from '../services/locationService';
import { captureEmergencyMedia } from '../utils/mediaCaptures';
import { createEmergency } from '../services/emergencyService';

const SHAKE_THRESHOLD = 2.5;
const SHAKE_COOLDOWN_MS = 1500;

const SOSScreen = ({ navigation }) => {
  const [alertActive, setAlertActive] = useState(false);
  const [emergencyState, setEmergencyState] = useState('IDLE'); // 'IDLE' | 'EMERGENCY_ACTIVE' | 'OFFLINE_SOS_MODE'
  const [shakeSensitivityEnabled, setShakeSensitivityEnabled] = useState(false);

  // Hold-to-activate (press-and-hold) state
  const [holdProgress, setHoldProgress] = useState(0); // 0..100
  const [holdActive, setHoldActive] = useState(false);
  const HOLD_TARGET_SECONDS = 3; // require ~3 seconds
  const MIN_HOLD_SECONDS = 3;
  const holdIntervalRef = useRef(null);
  const holdStartRef = useRef(null);

  // Side-button simulation state
  const [sidePressCount, setSidePressCount] = useState(0);
  const [sidePressMode, setSidePressMode] = useState(3); // 3 or 5 rapid presses
  const sidePressTimeoutRef = useRef(null);

  const alertActiveRef = useRef(alertActive);
  const lastShakeTimeRef = useRef(0);

  // Track last known location so offline SMS can include something
  const [lastKnownLocation, setLastKnownLocation] = useState(null);
  const [sirenActive, setSirenActive] = useState(false);
  const [notificationMessage, setNotificationMessage] = useState('');
  const [cameraPermission, setCameraPermission] = useState(false);
  const [microphonePermission, setMicrophonePermission] = useState(false);
  const cameraRef = useRef(null);
  const audioRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);

  // Response/acknowledgement state
  const [responseAcknowledged, setResponseAcknowledged] = useState(false);

  useEffect(() => {
    alertActiveRef.current = alertActive;
  }, [alertActive]);

  // cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (holdIntervalRef.current) {
        clearInterval(holdIntervalRef.current);
        holdIntervalRef.current = null;
      }
      if (sidePressTimeoutRef.current) {
        clearTimeout(sidePressTimeoutRef.current);
        sidePressTimeoutRef.current = null;
      }
    };
  }, []);

  // Accelerometer / Shake detection
  useEffect(() => {
    if (!shakeSensitivityEnabled) {
      return undefined;
    }

    Accelerometer.setUpdateInterval(100);
    const subscription = Accelerometer.addListener(({ x, y, z }) => {
      const acceleration = Math.sqrt(x * x + y * y + z * z);
      const now = Date.now();

      if (
        acceleration < SHAKE_THRESHOLD ||
        alertActiveRef.current ||
        now - lastShakeTimeRef.current < SHAKE_COOLDOWN_MS
      ) {
        return;
      }

      lastShakeTimeRef.current = now;
      activateEmergency('shake');
    });

    return () => subscription.remove();
  }, [shakeSensitivityEnabled]);

  useEffect(() => {
    let isMounted = true;

    async function requestCapturePermissions() {
      try {
        let cameraResult = await Camera.getCameraPermissionsAsync();
        let audioResult = await getRecordingPermissionsAsync();

        if (cameraResult.status !== 'granted') {
          cameraResult = await Camera.requestCameraPermissionsAsync();
        }

        if (audioResult.status !== 'granted') {
          audioResult = await requestRecordingPermissionsAsync();
        }

        const cameraGranted = cameraResult.status === 'granted';
        const microphoneGranted = audioResult.status === 'granted';

        if (isMounted) {
          setCameraPermission(cameraGranted);
          setMicrophonePermission(microphoneGranted);
        }

        if (!cameraGranted || !microphoneGranted) {
          Alert.alert(
            'Missing Permissions',
            'Camera and microphone access are required to capture SOS evidence. Please grant them in Settings.'
          );
        }
      } catch (e) {
        console.warn('Permission request failed', e?.message || e);
        if (isMounted) {
          setCameraPermission(false);
          setMicrophonePermission(false);
        }
      }
    }

    requestCapturePermissions();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!alertActive) {
      return undefined;
    }

    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'background' || nextAppState === 'inactive') {
        console.log('[SOS Screen] Emergency session remains active while app loses foreground focus.');
      }
    });

    return () => subscription?.remove?.();
  }, [alertActive]);

  const acknowledgeResponse = () => {
    setResponseAcknowledged(true);
    setAlertActive(false);
    setEmergencyState('IDLE');
    setSirenActive(false);
    Alert.alert('SOS Deactivated', 'Emergency response has been safely acknowledged and deactivated.');
  };

  // AI Fake SOS detection heuristic check
  const SOS_HISTORY_KEY = 'recentSOSActivations_v1';
  const aiFakeSOSCheck = async ({ trigger = 'manual', holdDurationSeconds = 0, attachments = [] } = {}) => {
    const reasons = [];
    let score = 0;

    if (trigger === 'shake') {
      score += 30;
      reasons.push('Shake-based trigger has higher accidental/false-positive risk.');
    }
    if (trigger === 'side-button' && sidePressMode === 3) {
      score += 10;
      reasons.push('Short rapid side-button sequence detected (3 presses).');
    }

    if (holdDurationSeconds && holdDurationSeconds < MIN_HOLD_SECONDS) {
      score += 80;
      reasons.push(`Hold duration was only ${Math.round(holdDurationSeconds)}s — below required minimum.`);
    }

    try {
      const raw = await AsyncStorage.getItem(SOS_HISTORY_KEY);
      const list = raw ? JSON.parse(raw) : [];
      const now = Date.now();
      const recent2min = list.filter((r) => now - r.ts < 2 * 60 * 1000).length;
      if (recent2min >= 1) {
        score += 60;
        reasons.push('Another SOS was triggered from this device within the last 2 minutes.');
      }
    } catch (e) {
      console.warn('Failed to read SOS history', e?.message || e);
    }

    const flagged = score >= 50;
    return { flagged, score, reasons };
  };

  const persistSosActivation = async (meta = {}) => {
    try {
      const raw = await AsyncStorage.getItem(SOS_HISTORY_KEY);
      const list = raw ? JSON.parse(raw) : [];
      list.unshift({ ts: Date.now(), meta });
      const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
      const pruned = list.filter((r) => r.ts >= cutoff).slice(0, 50);
      await AsyncStorage.setItem(SOS_HISTORY_KEY, JSON.stringify(pruned));
    } catch (e) {
      console.warn('Failed to persist sos activation', e?.message || e);
    }
  };

  // Centralized emergency activator
  const activateEmergency = async (trigger = 'manual', options = {}) => {
    if (alertActive) return;

    const holdDurationSeconds = options.holdDurationSeconds ?? (holdStartRef.current ? (Date.now() - holdStartRef.current) / 1000 : 0);

    const check = await aiFakeSOSCheck({ trigger, holdDurationSeconds, attachments: [] });
    if (check.flagged) {
      Alert.alert(
        'Suspicious Activation Detected',
        `This activation appears suspicious:\n- ${check.reasons.join('\n- ')}\n\nDo you want to proceed and notify emergency responders?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Proceed',
            onPress: async () => {
              await doEmergencyActivation();
            },
          },
        ]
      );
      return;
    }

    await doEmergencyActivation();

    async function doEmergencyActivation() {
      setAlertActive(true);
      setEmergencyState('EMERGENCY_ACTIVE');
      setSirenActive(true);

      let coords = null;
      try {
        coords = await getCurrentLocation();
        setLastKnownLocation(coords);
      } catch (e) {
        console.warn('Could not get current location at activation:', e?.message || e);
        coords = lastKnownLocation;
      }

      persistSosActivation({ trigger, coords });

      try {
        const emergency = await createEmergency({ trigger, coords });
        await AsyncStorage.setItem('currentSOSSession', JSON.stringify({
          id: emergency.emergency_id,
          active: true,
          timestamp: Date.now(),
          coords: coords || null,
        }));
        setNotificationMessage(`SOS ${emergency.emergency_id} received. Notifications are being dispatched.`);
      } catch (e) {
        console.warn('Backend SOS submission failed:', e?.message || e);
        setEmergencyState('OFFLINE_SOS_MODE');
        setNotificationMessage('SOS is active locally. Backend notification could not be reached.');
      }

      // Evidence Collection (photo/video/audio) must never block SOS workflow.
      try {
        setNotificationMessage('Capturing emergency multi-media evidence...');
        const capturedMedia = await captureEmergencyMedia(cameraRef, 6, audioRecorder);

        const evidenceRecord = {
          id: `evidence-${Date.now()}`,
          report_type: 'sos_hardware',
          hardware_id: `sos-${Date.now()}`,
          timestamp: Date.now(),
          location: coords || null,
          latitude: coords?.latitude ?? null,
          longitude: coords?.longitude ?? null,
          photos: capturedMedia.photos || [],
          photoUri: capturedMedia.photos?.[0] || null,
          videoUri: capturedMedia.videoUri || null,
          audioUri: capturedMedia.audioUri || null,
        };

        const rawLogs = await AsyncStorage.getItem('EMERGENCY_EVIDENCE_LOGS');
        const logs = rawLogs ? JSON.parse(rawLogs) : [];
        const normalizedLogs = Array.isArray(logs) ? logs : [];
        normalizedLogs.unshift(evidenceRecord);
        await AsyncStorage.setItem('EMERGENCY_EVIDENCE_LOGS', JSON.stringify(normalizedLogs));

        const evidenceSummary = [
          `${capturedMedia.photos?.length || 0} photos`,
          capturedMedia.videoUri ? 'video' : 'no video',
          capturedMedia.audioUri ? 'audio' : 'no audio',
        ].join(', ');

        setNotificationMessage(`SOS evidence saved: ${evidenceSummary}.`);
      } catch (e) {
        console.warn('Evidence collection failed', e?.message || e);
        setNotificationMessage('SOS is active. Location and fallback notifications were recorded even though evidence capture failed.');
      }

      Alert.alert('SOS Alert Activated', `Triggered by ${trigger}. Emergency contacts and the rescue dashboard are being notified.`);
    }
  };

  // Hold-to-activate Handlers
  const handlePanicPressIn = () => {
    if (alertActive) return;
    setHoldActive(true);
    setHoldProgress(0);
    holdStartRef.current = Date.now();

    const updateIntervalMs = 100;
    const targetMs = HOLD_TARGET_SECONDS * 1000;

    holdIntervalRef.current = setInterval(() => {
      const elapsed = Date.now() - holdStartRef.current;
      const progress = Math.min(100, Math.floor((elapsed / targetMs) * 100));
      setHoldProgress(progress);

      if (elapsed >= targetMs) {
        clearInterval(holdIntervalRef.current);
        holdIntervalRef.current = null;
        setHoldActive(false);
        setHoldProgress(100);
        activateEmergency('hold-to-activate', { holdDurationSeconds: HOLD_TARGET_SECONDS });
      }
    }, updateIntervalMs);
  };

  const handlePanicPressOut = () => {
    if (holdIntervalRef.current) {
      clearInterval(holdIntervalRef.current);
      holdIntervalRef.current = null;
    }
    setHoldActive(false);

    if (holdStartRef.current) {
      const durationSeconds = (Date.now() - holdStartRef.current) / 1000;
      if (durationSeconds < HOLD_TARGET_SECONDS && !alertActive) {
        setHoldProgress(0);
        Alert.alert('Hold Cancelled', `Please hold the button for a full ${HOLD_TARGET_SECONDS} seconds to trigger SOS.`);
      }
    }
    holdStartRef.current = null;
  };

  // Side-button press simulator
  const handleSimulatedSidePress = () => {
    if (alertActive) return;
    const nextCount = sidePressCount + 1;
    setSidePressCount(nextCount);

    if (sidePressTimeoutRef.current) {
      clearTimeout(sidePressTimeoutRef.current);
    }

    if (nextCount >= sidePressMode) {
      setSidePressCount(0);
      activateEmergency('side-button');
    } else {
      sidePressTimeoutRef.current = setTimeout(() => {
        setSidePressCount(0);
      }, 2000);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      {/* Hidden Active CameraView bound to cameraRef */}
      <CameraView
        ref={cameraRef}
        style={styles.hiddenCamera}
        facing="back"
        mode="video"
      />

      {/* Header Banner */}
      <View style={[styles.statusCard, alertActive ? styles.statusCardActive : styles.statusCardIdle]}>
        <Text style={styles.statusTitle}>
          {alertActive ? '🚨 EMERGENCY ACTIVE' : '🛡️ SYSTEM READY'}
        </Text>
        <Text style={styles.statusSubtitle}>
          {alertActive
            ? `State: ${emergencyState} | Backend notifications are processing...`
            : 'Hold the button for 3 seconds or trigger shake/side-button to send SOS.'}
        </Text>
      </View>

      {/* Main Trigger Button */}
      <View style={styles.triggerContainer}>
        <TouchableOpacity
          activeOpacity={0.8}
          onPressIn={handlePanicPressIn}
          onPressOut={handlePanicPressOut}
          style={[
            styles.sosButton,
            alertActive && styles.sosButtonActive,
            holdActive && styles.sosButtonHolding,
          ]}
        >
          <Text style={styles.sosButtonText}>
            {alertActive ? 'ACTIVE' : holdActive ? `${holdProgress}%` : 'HOLD FOR SOS'}
          </Text>
          <Text style={styles.sosSubText}>
            {alertActive ? 'Tap below to reset' : '(Hold 3 Seconds)'}
          </Text>
        </TouchableOpacity>

        {holdActive && (
          <View style={styles.progressBarBackground}>
            <View style={[styles.progressBarFill, { width: `${holdProgress}%` }]} />
          </View>
        )}
      </View>

      {/* Response Control & Acknowledge */}
      {alertActive && (
        <TouchableOpacity style={styles.deactivateButton} onPress={acknowledgeResponse}>
          <Text style={styles.deactivateButtonText}>I AM SAFE (STOP CALLS)</Text>
        </TouchableOpacity>
      )}

      {/* Secondary Triggers & Settings */}
      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>Alternative Triggers</Text>

        <TouchableOpacity
          style={[styles.toggleButton, shakeSensitivityEnabled && styles.toggleButtonActive]}
          onPress={() => setShakeSensitivityEnabled(!shakeSensitivityEnabled)}
        >
          <Text style={styles.toggleButtonText}>
            {shakeSensitivityEnabled ? 'Shake Detection: ON' : 'Shake Detection: OFF'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.simulatedButton} onPress={handleSimulatedSidePress}>
          <Text style={styles.simulatedButtonText}>
            Simulate Rapid Side-Key Press ({sidePressCount}/{sidePressMode})
          </Text>
        </TouchableOpacity>
      </View>

      {notificationMessage ? (
        <View style={styles.notificationBox}>
          <Text style={styles.notificationText}>{notificationMessage}</Text>
        </View>
      ) : null}
    </ScrollView>
  );
};

export default SOSScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121212',
  },
  contentContainer: {
    padding: 18,
    alignItems: 'center',
  },
  hiddenCamera: {
    width: 1,
    height: 1,
    opacity: 0,
    position: 'absolute',
  },
  statusCard: {
    width: '100%',
    padding: 16,
    borderRadius: 12,
    marginBottom: 20,
    alignItems: 'center',
  },
  statusCardIdle: {
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
  },
  statusCardActive: {
    backgroundColor: '#7f1d1d',
    borderWidth: 1,
    borderColor: '#f87171',
  },
  statusTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#ffffff',
    marginBottom: 4,
  },
  statusSubtitle: {
    fontSize: 12,
    color: '#cbd5e1',
    textAlign: 'center',
  },
  triggerContainer: {
    alignItems: 'center',
    marginVertical: 20,
    width: '100%',
  },
  sosButton: {
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: '#dc2626',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 8,
    shadowColor: '#ef4444',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.6,
    shadowRadius: 12,
    borderWidth: 6,
    borderColor: '#fca5a5',
  },
  sosButtonHolding: {
    backgroundColor: '#991b1b',
    borderColor: '#f87171',
  },
  sosButtonActive: {
    backgroundColor: '#b91c1c',
    borderColor: '#ef4444',
  },
  sosButtonText: {
    color: '#ffffff',
    fontSize: 26,
    fontWeight: '900',
    letterSpacing: 1,
  },
  sosSubText: {
    color: '#fecaca',
    fontSize: 12,
    marginTop: 4,
  },
  progressBarBackground: {
    width: '80%',
    height: 10,
    backgroundColor: '#334155',
    borderRadius: 5,
    marginTop: 20,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#ef4444',
  },
  deactivateButton: {
    width: '100%',
    backgroundColor: '#16a34a',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    marginBottom: 20,
  },
  deactivateButtonText: {
    color: '#ffffff',
    fontWeight: '800',
    fontSize: 15,
  },
  sectionCard: {
    width: '100%',
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
  },
  sectionTitle: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 12,
  },
  toggleButton: {
    backgroundColor: '#334155',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginBottom: 10,
    alignItems: 'center',
  },
  toggleButtonActive: {
    backgroundColor: '#2563eb',
  },
  toggleButtonText: {
    color: '#ffffff',
    fontWeight: '600',
    fontSize: 14,
  },
  simulatedButton: {
    backgroundColor: '#334155',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  simulatedButtonText: {
    color: '#cbd5e1',
    fontSize: 13,
    fontWeight: '600',
  },
  notificationBox: {
    width: '100%',
    backgroundColor: '#334155',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  notificationText: {
    color: '#38bdf8',
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
});