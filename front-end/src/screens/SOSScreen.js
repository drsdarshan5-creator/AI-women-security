import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
  Linking,
  Platform,
} from 'react-native';
let NetInfo;
try {
  // use require so the app won't crash if the optional package isn't installed
  NetInfo = require('@react-native-community/netinfo');
} catch (e) {
  NetInfo = null;
}
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Accelerometer } from 'expo-sensors';
import { Camera, CameraView } from 'expo-camera';
import { Audio } from 'expo-av';
import { getCurrentLocation } from '../services/locationService';
import { triggerSequentialCalls } from './EmergencyContactsScreen';
import { captureEmergencyMedia } from '../utils/mediaCaptures';

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

  // Response/acknowledgement state for call loop
  const [responseAcknowledged, setResponseAcknowledged] = useState(false);
  const callTimerRef = useRef(null);

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
      stopCallSequence();
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
    async function requestCapturePermissions() {
      try {
        const cameraResult = await Camera.requestCameraPermissionsAsync();
        const audioResult = await Audio.requestMicrophonePermissionsAsync();
        setCameraPermission(cameraResult.status === 'granted');
        setMicrophonePermission(audioResult.status === 'granted');
      } catch (e) {
        console.warn('Permission request failed', e?.message || e);
      }
    }

    requestCapturePermissions();
  }, []);

  const ADMIN_NUMBER = '112';
  const CONTACTS_STORAGE_KEY = 'userEmergencyContacts_v1';

  // Connectivity check helper
  const isOnline = async () => {
    try {
      if (NetInfo && NetInfo.fetch) {
        const state = await NetInfo.fetch();
        if (typeof state.isConnected !== 'undefined') {
          return state.isConnected && (typeof state.isInternetReachable === 'undefined' ? true : state.isInternetReachable);
        }
      }
    } catch (e) {
      // ignore, fallback
    }

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const res = await fetch('https://clients3.google.com/generate_204', { method: 'GET', signal: controller.signal });
      clearTimeout(timeout);
      return res && (res.status === 204 || res.status === 200);
    } catch (e) {
      return false;
    }
  };

  // Helper: load saved priority contacts
  const loadSavedPriorityContacts = async () => {
    try {
      const raw = await AsyncStorage.getItem(CONTACTS_STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.slice(0, 3).map((c, i) => ({ ...c, id: c.id ?? `user-${i}` }));
    } catch (e) {
      console.warn('Failed to load saved priority contacts:', e?.message || e);
      return [];
    }
  };

  // Send SMS via standard device composer fallback
  const sendEmergencySMS = async (coords, recipientsOverride) => {
    try {
      let phones = [];
      if (Array.isArray(recipientsOverride) && recipientsOverride.length > 0) {
        phones = recipientsOverride;
      } else {
        const savedContacts = await loadSavedPriorityContacts();
        phones = savedContacts.map((c) => c.phone).filter(Boolean);
      }

      const unique = Array.from(new Set([...phones.slice(0, 3), ADMIN_NUMBER])).filter(Boolean).slice(0, 4);

      const lat = coords?.latitude ?? lastKnownLocation?.latitude ?? 'unknown';
      const lon = coords?.longitude ?? lastKnownLocation?.longitude ?? 'unknown';
      const mapLink = lat !== 'unknown' && lon !== 'unknown' ? `https://maps.google.com/?q=${lat},${lon}` : 'Location unavailable';
      const body = `EMERGENCY SOS: I need immediate help. Location: ${mapLink} (lat:${lat}, lon:${lon}). Time: ${new Date().toLocaleString()}`;

      const separator = Platform.OS === 'ios' ? '&' : '?';
      const url = `sms:${unique.join(',')}${separator}body=${encodeURIComponent(body)}`;

      await Linking.openURL(url);
    } catch (err) {
      console.warn('Failed to open SMS composer:', err?.message || err);
    }
  };

  // Live automated response sequence (SMS fallback + native immediate dialer trigger)
  const startEmergencyResponse = async (coords) => {
    setResponseAcknowledged(false);

    const saved = await loadSavedPriorityContacts();
    const recipientPhones = saved.map((c) => c.phone).filter(Boolean);
    const targets = [...recipientPhones.slice(0, 3), ADMIN_NUMBER].filter(Boolean);

    // Open SMS composer with prefilled message & contacts
    await sendEmergencySMS(coords, targets);

    // Trigger immediate, direct native phone calls sequentially (Rescue 112 -> Priority 2 -> 3 -> 4)
    await triggerSequentialCalls(15000);
  };

  const stopCallSequence = () => {
    if (callTimerRef.current) {
      clearTimeout(callTimerRef.current);
      callTimerRef.current = null;
    }
  };

  const acknowledgeResponse = () => {
    setResponseAcknowledged(true);
    setAlertActive(false);
    setEmergencyState('IDLE');
    setSirenActive(false);
    stopCallSequence();
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

      // Evidence Collection (6 Photos + 10s Video + Audio)
      try {
        setNotificationMessage('Capturing emergency multi-media evidence...');
        const capturedMedia = await captureEmergencyMedia(cameraRef, 6);

        const evidenceRecord = {
          id: `evidence-${Date.now()}`,
          timestamp: Date.now(),
          location: coords || null,
          photos: capturedMedia.photos,
          videoUri: capturedMedia.videoUri,
          audioUri: capturedMedia.audioUri,
        };

        const rawLogs = await AsyncStorage.getItem('EMERGENCY_EVIDENCE_LOGS');
        const logs = rawLogs ? JSON.parse(rawLogs) : [];
        const normalizedLogs = Array.isArray(logs) ? logs : [];
        normalizedLogs.unshift(evidenceRecord);
        await AsyncStorage.setItem('EMERGENCY_EVIDENCE_LOGS', JSON.stringify(normalizedLogs));
        
        setNotificationMessage(`SOS evidence saved: ${capturedMedia.photos.length} Photos, Video & Audio.`);
      } catch (e) {
        console.warn('Evidence collection failed', e?.message || e);
      }

      const online = await isOnline();
      if (!online) {
        setEmergencyState('OFFLINE_SOS_MODE');
        Alert.alert('Offline SOS', 'No internet connection detected. Switching to Offline SOS Mode.');
      } else {
        Alert.alert('SOS Alert Activated', `Triggered by ${trigger}. Contacts and emergency services are being called sequentially.`);
      }

      startEmergencyResponse(coords);
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
            ? `State: ${emergencyState} | Sequentially calling emergency contacts...`
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