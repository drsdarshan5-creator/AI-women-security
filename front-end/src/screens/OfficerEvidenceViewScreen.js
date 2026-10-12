import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
  Image,
  Linking,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

let AudioModule;
let VideoModule;
try {
  AudioModule = require('expo-av').Audio;
  VideoModule = require('expo-av').Video;
} catch (e) {
  AudioModule = null;
  VideoModule = null;
}

const SOS_EVIDENCE_KEY = 'EMERGENCY_EVIDENCE_LOGS';
const PUBLIC_REPORTS_KEY = 'PUBLIC_INCIDENT_REPORTS';

const ADMIN_CREDENTIALS = {
  loginId: 'IndianRescueCommander',
  email: 'indianrescuecommander@gmail.com',
  password: 'MathiAnu@123',
};

export default function OfficerEvidenceViewScreen() {
  const [loginIdInput, setLoginIdInput] = useState('');
  const [emailInput, setEmailInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [authenticated, setAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('sos_hardware');
  const [sosEvidence, setSosEvidence] = useState([]);
  const [manualReports, setManualReports] = useState([]);
  const [selectedRecord, setSelectedRecord] = useState(null);

  const soundRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);

  useEffect(() => {
    setLoading(false);

    return () => {
      if (soundRef.current) {
        try {
          soundRef.current.unloadAsync && soundRef.current.unloadAsync();
        } catch (e) {}
        soundRef.current = null;
      }
    };
  }, []);

  const normalizeRecord = (item, fallbackType) => {
    const reportType = item?.report_type || fallbackType;
    const coords = item?.location && typeof item.location === 'object' && !Array.isArray(item.location)
      ? item.location
      : item?.coords || null;

    return {
      id: item?.id || `record-${item?.timestamp || Date.now()}`,
      report_type: reportType,
      hardware_id: item?.hardware_id || item?.id || null,
      title: item?.title || item?.hardware_id || 'Evidence Record',
      category: item?.category || 'General',
      description: item?.description || item?.overallReport || item?.note || '',
      location: item?.location?.address || item?.location || item?.coords?.address || null,
      latitude: item?.latitude ?? item?.location?.latitude ?? item?.coords?.latitude ?? null,
      longitude: item?.longitude ?? item?.location?.longitude ?? item?.coords?.longitude ?? null,
      timestamp: item?.timestamp || Date.now(),
      audioUri: item?.audioUri || item?.audio_uri || null,
      videoUri: item?.videoUri || item?.video_uri || null,
      photoUri: item?.photoUri || item?.photo_uri || item?.image_uri || null,
      reporter_name: item?.reporter_name || null,
      reporter_phone: item?.reporter_phone || null,
      anonymous: !!item?.anonymous,
      hardware_log: item?.hardware_log || item?.overallReport || null,
      coords,
      raw: item,
    };
  };

  const verifyAdmin = async () => {
    try {
      if (loginIdInput === ADMIN_CREDENTIALS.loginId && emailInput === ADMIN_CREDENTIALS.email && passwordInput === ADMIN_CREDENTIALS.password) {
        setAuthenticated(true);
        await loadAllRecords();
        Alert.alert('Access Granted', 'Welcome Indian Rescue Commander.');
      } else {
        Alert.alert('Access Denied', 'Invalid login credentials.');
      }
    } catch (e) {
      Alert.alert('Error', 'Verification failed.');
    }
  };

  const loadAllRecords = async () => {
    try {
      const [sosRaw, publicRaw] = await Promise.all([
        AsyncStorage.getItem(SOS_EVIDENCE_KEY),
        AsyncStorage.getItem(PUBLIC_REPORTS_KEY),
      ]);

      const sosList = (() => {
        if (!sosRaw) return [];
        try {
          const parsed = JSON.parse(sosRaw);
          if (!Array.isArray(parsed)) return [];
          return parsed
            .map((item) => normalizeRecord(item, 'sos_hardware'))
            .filter((item) => item.report_type === 'sos_hardware')
            .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
        } catch (e) {
          return [];
        }
      })();

      const manualList = (() => {
        if (!publicRaw) return [];
        try {
          const parsed = JSON.parse(publicRaw);
          if (!Array.isArray(parsed)) return [];
          return parsed
            .map((item) => normalizeRecord(item, 'manual_public'))
            .filter((item) => item.report_type === 'manual_public')
            .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
        } catch (e) {
          return [];
        }
      })();

      setSosEvidence(sosList);
      setManualReports(manualList);
    } catch (e) {
      console.warn('Failed to load officer evidence', e?.message || e);
      setSosEvidence([]);
      setManualReports([]);
    }
  };

  const openMap = (coords) => {
    if (!coords) {
      Alert.alert('No GPS', 'This record does not include coordinates.');
      return;
    }

    const latitude = coords.latitude ?? coords.lat;
    const longitude = coords.longitude ?? coords.lng;
    if (latitude == null || longitude == null) {
      Alert.alert('No GPS', 'This record does not include coordinates.');
      return;
    }

    const url = `https://maps.google.com/?q=${latitude},${longitude}`;
    Linking.openURL(url).catch(() => Alert.alert('Error', 'Unable to open maps.'));
  };

  const playAudio = async (uri) => {
    if (!AudioModule) {
      Alert.alert('Audio Unavailable', 'Audio playback is not available.');
      return;
    }

    try {
      if (soundRef.current) {
        await soundRef.current.unloadAsync();
        soundRef.current = null;
      }
      const { sound } = await AudioModule.Sound.createAsync({ uri });
      soundRef.current = sound;
      await sound.playAsync();
      setIsPlaying(true);
      sound.setOnPlaybackStatusUpdate((status) => {
        if (status && status.didJustFinish) {
          setIsPlaying(false);
          try {
            sound.unloadAsync();
          } catch (e) {}
          soundRef.current = null;
        }
      });
    } catch (e) {
      console.warn('Audio play failed', e?.message || e);
      Alert.alert('Playback Failed', 'Unable to play audio.');
    }
  };

  const stopAudio = async () => {
    try {
      if (soundRef.current) {
        await soundRef.current.stopAsync();
        await soundRef.current.unloadAsync();
        soundRef.current = null;
      }
    } catch (e) {}
    setIsPlaying(false);
  };

  const renderSosCard = (item) => (
    <View key={item.id} style={[styles.sessionCard, styles.sosCard]}>
      <Text style={styles.sessionTitle}>{item.hardware_id || item.id}</Text>
      <Text style={styles.sessionTime}>{new Date(item.timestamp).toLocaleString()}</Text>
      <Text style={styles.sessionCoords}>
        {item.latitude != null && item.longitude != null
          ? `${item.latitude.toFixed(5)}, ${item.longitude.toFixed(5)}`
          : 'No GPS lock'}
      </Text>
      {item.hardware_log ? <Text style={styles.sessionSummary}>{item.hardware_log}</Text> : null}
      {item.description ? <Text style={styles.sessionSummary}>{item.description}</Text> : null}
      <View style={styles.sessionButtonsRow}>
        <TouchableOpacity style={styles.viewButton} onPress={() => setSelectedRecord(item)}>
          <Text style={styles.viewButtonText}>View Evidence</Text>
        </TouchableOpacity>
        {item.latitude != null && item.longitude != null ? (
          <TouchableOpacity style={styles.mapButton} onPress={() => openMap({ latitude: item.latitude, longitude: item.longitude })}>
            <Text style={styles.mapButtonText}>Open Map</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );

  const renderManualReportCard = (item) => (
    <View key={item.id} style={[styles.sessionCard, styles.publicCard]}>
      <Text style={styles.sessionTitle}>{item.title}</Text>
      <Text style={styles.sessionTime}>{new Date(item.timestamp).toLocaleString()}</Text>
      <View style={styles.metaRow}>
        <Text style={styles.metaPill}>{item.category || 'General'}</Text>
        {item.anonymous ? <Text style={styles.metaPill}>Anonymous</Text> : null}
      </View>
      <Text style={styles.sessionCoords}>{item.location || 'Location not provided'}</Text>
      {item.description ? <Text style={styles.sessionSummary}>{item.description}</Text> : null}
      {item.photoUri ? <Image source={{ uri: item.photoUri }} style={styles.evidenceImage} resizeMode="cover" /> : null}
      <View style={styles.sessionButtonsRow}>
        <TouchableOpacity style={styles.viewButton} onPress={() => setSelectedRecord(item)}>
          <Text style={styles.viewButtonText}>View Report</Text>
        </TouchableOpacity>
        {item.latitude != null && item.longitude != null ? (
          <TouchableOpacity style={styles.mapButton} onPress={() => openMap({ latitude: item.latitude, longitude: item.longitude })}>
            <Text style={styles.mapButtonText}>Open Map</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );

  const renderSelectedRecord = () => {
    const record = selectedRecord;
    if (!record) return null;
    const isSos = record.report_type === 'sos_hardware';

    return (
      <View style={styles.detailCard}>
        <Text style={styles.detailTitle}>{isSos ? 'SOS Hardware Evidence' : 'Manual Public Report'}</Text>
        <Text style={styles.detailText}>ID: {record.id || '—'}</Text>
        <Text style={styles.detailText}>Type: {record.report_type || 'unknown'}</Text>
        <Text style={styles.detailText}>Time: {new Date(record.timestamp).toLocaleString()}</Text>

        {isSos ? (
          <>
            <Text style={styles.detailText}>Hardware ID: {record.hardware_id || '—'}</Text>
            <Text style={styles.detailText}>Coordinates: {record.latitude != null && record.longitude != null ? `${record.latitude}, ${record.longitude}` : 'No GPS lock'}</Text>
            {record.hardware_log ? <Text style={styles.detailText}>Hardware Log: {record.hardware_log}</Text> : null}
            {record.audioUri ? (
              <View style={styles.audioRow}>
                <Text style={styles.detailText}>Audio Clip</Text>
                {isPlaying ? (
                  <TouchableOpacity style={styles.audioButton} onPress={stopAudio}><Text style={styles.audioButtonText}>Stop</Text></TouchableOpacity>
                ) : (
                  <TouchableOpacity style={styles.audioButton} onPress={() => playAudio(record.audioUri)}><Text style={styles.audioButtonText}>Play</Text></TouchableOpacity>
                )}
                <TouchableOpacity style={styles.externalLink} onPress={() => Linking.openURL(record.audioUri)}><Text style={styles.externalLinkText}>Open Audio</Text></TouchableOpacity>
              </View>
            ) : (
              <Text style={styles.detailText}>No audio available</Text>
            )}
            {record.videoUri ? (
              VideoModule ? (
                <VideoModule source={{ uri: record.videoUri }} style={styles.video} useNativeControls resizeMode="contain" />
              ) : (
                <TouchableOpacity onPress={() => Linking.openURL(record.videoUri)} style={styles.externalLink}><Text style={styles.externalLinkText}>Open Video</Text></TouchableOpacity>
              )
            ) : (
              <Text style={styles.detailText}>No video available</Text>
            )}
            {record.photoUri ? (
              <>
                <Image source={{ uri: record.photoUri }} style={styles.evidenceImage} resizeMode="cover" />
                <TouchableOpacity style={styles.openLinkButton} onPress={() => Linking.openURL(record.photoUri)}><Text style={styles.openLinkText}>Open Photo</Text></TouchableOpacity>
              </>
            ) : (
              <Text style={styles.detailText}>No photo available</Text>
            )}
          </>
        ) : (
          <>
            <Text style={styles.detailText}>Title: {record.title || '—'}</Text>
            <Text style={styles.detailText}>Category: {record.category || 'General'}</Text>
            <Text style={styles.detailText}>Location: {record.location || 'Not provided'}</Text>
            <Text style={styles.detailText}>Description: {record.description || 'No description'}</Text>
            {record.reporter_name ? <Text style={styles.detailText}>Reporter: {record.reporter_name}</Text> : null}
            {record.anonymous ? <Text style={styles.detailText}>Anonymous report</Text> : null}
            {record.photoUri ? (
              <>
                <Image source={{ uri: record.photoUri }} style={styles.evidenceImage} resizeMode="cover" />
                <TouchableOpacity style={styles.openLinkButton} onPress={() => Linking.openURL(record.photoUri)}><Text style={styles.openLinkText}>Open Image</Text></TouchableOpacity>
              </>
            ) : (
              <Text style={styles.detailText}>No attachment</Text>
            )}
          </>
        )}

        <TouchableOpacity style={styles.closeButton} onPress={() => { stopAudio(); setSelectedRecord(null); }}>
          <Text style={styles.closeButtonText}>Close</Text>
        </TouchableOpacity>
      </View>
    );
  };

  const currentRecords = activeTab === 'sos_hardware' ? sosEvidence : manualReports;

  if (loading) {
    return (
      <View style={styles.container}>
        <Text style={{ padding: 20 }}>Loading...</Text>
      </View>
    );
  }

  if (!authenticated) {
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
        <View style={styles.header}>
          <Text style={styles.title}>Officer / Admin Evidence Access</Text>
          <Text style={styles.subtitle}>Sign in with the official admin account to review incident evidence</Text>
        </View>

        <View style={styles.authCard}>
          <Text style={styles.fieldLabel}>Login ID</Text>
          <TextInput style={styles.input} value={loginIdInput} onChangeText={setLoginIdInput} placeholder="Login ID" autoCapitalize="none" />

          <Text style={styles.fieldLabel}>Email</Text>
          <TextInput style={styles.input} value={emailInput} onChangeText={setEmailInput} placeholder="Email" autoCapitalize="none" keyboardType="email-address" />

          <Text style={styles.fieldLabel}>Password</Text>
          <TextInput style={styles.input} value={passwordInput} onChangeText={setPasswordInput} secureTextEntry placeholder="Password" />

          <TouchableOpacity style={styles.primaryButton} onPress={verifyAdmin}>
            <Text style={styles.primaryButtonText}>Sign In</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      <View style={styles.header}>
        <Text style={styles.title}>Officer Evidence Portal</Text>
        <Text style={styles.subtitle}>Separate official emergency sessions from community reports.</Text>
      </View>

      <View style={styles.segmentedControl}>
        <TouchableOpacity
          style={[styles.segmentButton, activeTab === 'sos_hardware' ? styles.segmentButtonActive : styles.segmentButtonInactive]}
          onPress={() => setActiveTab('sos_hardware')}
        >
          <Text style={[styles.segmentText, activeTab === 'sos_hardware' ? styles.segmentTextActive : styles.segmentTextInactive]}>
            SOS Hardware Evidence
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.segmentButton, activeTab === 'manual_public' ? styles.segmentButtonActive : styles.segmentButtonInactive]}
          onPress={() => setActiveTab('manual_public')}
        >
          <Text style={[styles.segmentText, activeTab === 'manual_public' ? styles.segmentTextActive : styles.segmentTextInactive]}>
            Manual Public Reports
          </Text>
        </TouchableOpacity>
      </View>

      {currentRecords.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyStateText}>
            {activeTab === 'sos_hardware' ? 'No SOS hardware evidence found.' : 'No manual public reports found.'}
          </Text>
        </View>
      ) : (
        currentRecords.map((item) => activeTab === 'sos_hardware' ? renderSosCard(item) : renderManualReportCard(item))
      )}

      {renderSelectedRecord()}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  contentContainer: { padding: 16, paddingBottom: 32 },
  header: { marginBottom: 18 },
  title: { color: '#ffffff', fontSize: 24, fontWeight: 'bold', marginBottom: 6 },
  subtitle: { color: '#94a3b8', fontSize: 13 },
  authCard: { backgroundColor: '#111827', borderRadius: 14, padding: 16, borderWidth: 1, borderColor: '#334155' },
  fieldLabel: { color: '#cbd5e1', fontWeight: '600', marginBottom: 6, marginTop: 12 },
  input: { backgroundColor: '#1e293b', color: '#fff', padding: 12, borderRadius: 10, borderWidth: 1, borderColor: '#334155' },
  primaryButton: { backgroundColor: '#2563eb', padding: 14, borderRadius: 10, marginTop: 18, alignItems: 'center' },
  primaryButtonText: { color: '#ffffff', fontWeight: 'bold' },
  segmentedControl: { flexDirection: 'row', backgroundColor: '#111827', borderRadius: 12, padding: 4, marginBottom: 16, borderWidth: 1, borderColor: '#334155' },
  segmentButton: { flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
  segmentButtonActive: { backgroundColor: '#2563eb' },
  segmentButtonInactive: { backgroundColor: 'transparent' },
  segmentText: { fontWeight: '700', fontSize: 12 },
  segmentTextActive: { color: '#ffffff' },
  segmentTextInactive: { color: '#94a3b8' },
  sessionCard: { borderRadius: 12, padding: 14, marginBottom: 14, borderWidth: 1 },
  sosCard: { backgroundColor: 'rgba(37, 99, 235, 0.12)', borderColor: '#2563eb' },
  publicCard: { backgroundColor: 'rgba(16, 185, 129, 0.12)', borderColor: '#10b981' },
  sessionTitle: { color: '#ffffff', fontWeight: 'bold', fontSize: 16, marginBottom: 4 },
  sessionTime: { color: '#cbd5e1', fontSize: 12, marginBottom: 8 },
  sessionCoords: { color: '#e2e8f0', fontSize: 12, marginBottom: 8 },
  sessionSummary: { color: '#e2e8f0', fontSize: 13, lineHeight: 20, marginBottom: 8 },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 8 },
  metaPill: { backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 999, color: '#e2e8f0', fontSize: 11, paddingHorizontal: 8, paddingVertical: 4, marginRight: 8, marginBottom: 6 },
  sessionButtonsRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  viewButton: { flex: 1, backgroundColor: '#1d4ed8', padding: 8, borderRadius: 8, alignItems: 'center', marginRight: 8 },
  viewButtonText: { color: '#fff', fontWeight: 'bold' },
  mapButton: { flex: 1, backgroundColor: '#0f766e', padding: 8, borderRadius: 8, alignItems: 'center' },
  mapButtonText: { color: '#fff', fontWeight: 'bold' },
  detailCard: { backgroundColor: '#111827', borderRadius: 12, borderWidth: 1, borderColor: '#334155', padding: 16, marginTop: 6 },
  detailTitle: { color: '#ffffff', fontWeight: 'bold', fontSize: 18, marginBottom: 10 },
  detailText: { color: '#e2e8f0', fontSize: 13, marginBottom: 8 },
  evidenceImage: { width: '100%', height: 180, borderRadius: 8, marginTop: 10, marginBottom: 10 },
  video: { width: '100%', height: 220, borderRadius: 8, marginTop: 10 },
  audioRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 },
  audioButton: { backgroundColor: '#16a34a', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
  audioButtonText: { color: '#fff', fontWeight: 'bold' },
  externalLink: { backgroundColor: '#374151', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
  externalLinkText: { color: '#fff', fontWeight: 'bold' },
  openLinkButton: { backgroundColor: '#3b82f6', padding: 10, borderRadius: 8, alignItems: 'center', marginBottom: 10 },
  openLinkText: { color: '#fff', fontWeight: 'bold' },
  closeButton: { backgroundColor: '#ef4444', padding: 12, borderRadius: 10, alignItems: 'center', marginTop: 12 },
  closeButtonText: { color: '#fff', fontWeight: 'bold' },
  emptyState: { backgroundColor: '#111827', borderRadius: 12, borderWidth: 1, borderColor: '#334155', padding: 18, alignItems: 'center' },
  emptyStateText: { color: '#cbd5e1', fontSize: 14 },
});
