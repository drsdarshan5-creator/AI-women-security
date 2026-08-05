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
  FlatList,
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

const SESSIONS_KEY = 'EMERGENCY_EVIDENCE_LOGS';

// Admin credentials (local, per request)
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
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedSession, setSelectedSession] = useState(null);

  // audio playback state
  const soundRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);

  useEffect(() => {
    setLoading(false);

    return () => {
      // cleanup audio
      if (soundRef.current) {
        try {
          soundRef.current.unloadAsync && soundRef.current.unloadAsync();
        } catch (e) {}
        soundRef.current = null;
      }
    };
  }, []);

  const verifyAdmin = async () => {
    try {
      if (loginIdInput === ADMIN_CREDENTIALS.loginId && emailInput === ADMIN_CREDENTIALS.email && passwordInput === ADMIN_CREDENTIALS.password) {
        setAuthenticated(true);
        await loadSessions();
        Alert.alert('Access Granted', 'Welcome Indian Rescue Commander.');
      } else {
        Alert.alert('Access Denied', 'Invalid login credentials.');
      }
    } catch (e) {
      Alert.alert('Error', 'Verification failed.');
    }
  };

  const loadSessions = async () => {
    try {
      const raw = await AsyncStorage.getItem(SESSIONS_KEY);
      if (!raw) {
        setSessions([]);
        return;
      }
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        setSessions([]);
        return;
      }
      const normalized = parsed.map((item) => ({
        id: item.id || `evidence-${item.timestamp || Date.now()}`,
        timestamp: item.timestamp || Date.now(),
        coords: item.location || item.coords || null,
        evidence: {
          photoUri: item.photoUri || (item.evidence && item.evidence.photoUri) || null,
          audioUri: item.audioUri || (item.evidence && item.evidence.audioUri) || null,
          videoUri: item.videoUri || (item.evidence && item.evidence.videoUri) || null,
        },
        overallReport: item.overallReport || null,
        raw: item,
      }));
      normalized.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
      setSessions(normalized);
    } catch (e) {
      console.warn('Failed to load sessions', e?.message || e);
      setSessions([]);
    }
  };

  const openMap = (coords) => {
    if (!coords) return;
    const { latitude, longitude } = coords;
    const url = `https://maps.google.com/?q=${latitude},${longitude}`;
    Linking.openURL(url).catch(() => Alert.alert('Error', 'Unable to open maps.'));
  };

  const playAudio = async (uri) => {
    if (!AudioModule) {
      Alert.alert('Audio Unavailable', 'Audio playback not available (expo-av not installed).');
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

  const renderSession = ({ item }) => {
    const ts = item.timestamp ? new Date(item.timestamp).toLocaleString() : 'Unknown time';
    return (
      <View style={styles.sessionCard}>
        <Text style={styles.sessionTitle}>Incident: {item.id || '—'}</Text>
        <Text style={styles.sessionTime}>{ts}</Text>
        <Text style={styles.sessionCoords}>{item.coords ? `${item.coords.latitude.toFixed(5)}, ${item.coords.longitude.toFixed(5)}` : 'No location'}</Text>
        {item.overallReport ? <Text style={styles.sessionSummary}>{item.overallReport}</Text> : null}
        <View style={styles.sessionButtonsRow}>
          <TouchableOpacity style={styles.viewButton} onPress={() => setSelectedSession(item)}>
            <Text style={styles.viewButtonText}>View Evidence</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.mapButton} onPress={() => openMap(item.coords)}>
            <Text style={styles.mapButtonText}>Open Map</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const renderSelected = () => {
    const s = selectedSession;
    if (!s) return null;
    return (
      <View style={styles.detailCard}>
        <Text style={styles.detailTitle}>Session Details</Text>
        <Text style={styles.detailText}>ID: {s.id || '—'}</Text>
        <Text style={styles.detailText}>Time: {s.timestamp ? new Date(s.timestamp).toLocaleString() : '—'}</Text>
        <Text style={styles.detailText}>Coords: {s.coords ? `${s.coords.latitude}, ${s.coords.longitude}` : '—'}</Text>
        {s.overallReport ? <Text style={styles.detailText}>Report: {s.overallReport}</Text> : null}
        {s.evidenceSummary ? <Text style={styles.detailText}>Evidence: {s.evidenceSummary}</Text> : null}

        {s.evidence?.photoUri ? (
          <>
            <Image source={{ uri: s.evidence.photoUri }} style={styles.evidenceImage} resizeMode="cover" />
            <TouchableOpacity style={styles.openLinkButton} onPress={() => Linking.openURL(s.evidence.photoUri)}>
              <Text style={styles.openLinkText}>Open Photo URI</Text>
            </TouchableOpacity>
          </>
        ) : (
          <Text style={styles.detailText}>No photo available</Text>
        )}

        {s.evidence?.photoUri ? <Text style={styles.uriText}>{s.evidence.photoUri}</Text> : null}

        {s.evidence?.videoUri ? (
          VideoModule ? (
            <VideoModule
              source={{ uri: s.evidence.videoUri }}
              style={styles.video}
              useNativeControls
              resizeMode="contain"
            />
          ) : (
            <TouchableOpacity onPress={() => Linking.openURL(s.evidence.videoUri)} style={styles.externalLink}>
              <Text style={styles.externalLinkText}>Open Video</Text>
            </TouchableOpacity>
          )
        ) : (
          <Text style={styles.detailText}>No video available</Text>
        )}

        {s.evidence?.audioUri ? (
          <View style={styles.audioRow}>
            <Text style={styles.detailText}>Audio Clip</Text>
            {isPlaying ? (
              <TouchableOpacity style={styles.audioButton} onPress={stopAudio}><Text style={styles.audioButtonText}>Stop</Text></TouchableOpacity>
            ) : (
              <TouchableOpacity style={styles.audioButton} onPress={() => playAudio(s.evidence.audioUri)}><Text style={styles.audioButtonText}>Play</Text></TouchableOpacity>
            )}
            <TouchableOpacity style={styles.externalLink} onPress={() => Linking.openURL(s.evidence.audioUri)}><Text style={styles.externalLinkText}>Open Audio</Text></TouchableOpacity>
          </View>
        ) : (
          <Text style={styles.detailText}>No audio available</Text>
        )}
        {s.evidence?.audioUri ? <Text style={styles.uriText}>{s.evidence.audioUri}</Text> : null}

        <View style={{ height: 12 }} />
        <TouchableOpacity style={styles.closeButton} onPress={() => { stopAudio(); setSelectedSession(null); }}>
          <Text style={styles.closeButtonText}>Close</Text>
        </TouchableOpacity>
      </View>
    );
  };

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
          <TextInput
            style={styles.input}
            value={loginIdInput}
            onChangeText={setLoginIdInput}
            placeholder="Login ID"
            autoCapitalize="none"
          />

          <Text style={styles.fieldLabel}>Email</Text>
          <TextInput
            style={styles.input}
            value={emailInput}
            onChangeText={setEmailInput}
            placeholder="Email"
            autoCapitalize="none"
            keyboardType="email-address"
          />

          <Text style={styles.fieldLabel}>Password</Text>
          <TextInput
            style={styles.input}
            value={passwordInput}
            onChangeText={setPasswordInput}
            secureTextEntry
            placeholder="Password"
          />

          <TouchableOpacity style={styles.primaryButton} onPress={verifyAdmin}>
            <Text style={styles.primaryButtonText}>Sign In</Text>
          </TouchableOpacity>

          <View style={{ height: 8 }} />

          <Text style={{ color: '#666', fontSize: 12 }}>Default admin account (pre-created):</Text>
          <Text style={{ color: '#333', fontSize: 12 }}>Login ID: IndianRescueCommander</Text>
          <Text style={{ color: '#333', fontSize: 12 }}>Email: indianrescuecommander@gmail.com</Text>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      <View style={styles.header}>
        <Text style={styles.title}>Active Incident Sessions</Text>
        <Text style={styles.subtitle}>Select an incident to review captured evidence</Text>
      </View>

      {sessions.length === 0 ? (
        <View style={styles.emptyBox}>
          <Text style={styles.emptyText}>No active sessions found.</Text>
          <TouchableOpacity style={styles.primaryButton} onPress={loadSessions}>
            <Text style={styles.primaryButtonText}>Refresh</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={sessions}
          keyExtractor={(it) => (it.id ? String(it.id) : String(it.timestamp || Math.random()))}
          renderItem={renderSession}
          contentContainerStyle={{ paddingBottom: 40 }}
        />
      )}

      {renderSelected()}

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  contentContainer: { padding: 16, paddingBottom: 40 },
  header: { marginBottom: 12 },
  title: { fontSize: 20, fontWeight: '700', color: '#1a1a1a', marginBottom: 4 },
  subtitle: { fontSize: 13, color: '#666' },
  authCard: { backgroundColor: '#fff', padding: 12, borderRadius: 10, marginTop: 12 },
  fieldLabel: { fontSize: 12, color: '#666', marginBottom: 6 },
  input: { backgroundColor: '#f8f8f8', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 14, borderWidth: 1, borderColor: '#eee', marginBottom: 12 },
  primaryButton: { backgroundColor: '#2196f3', paddingVertical: 12, borderRadius: 10, alignItems: 'center', marginBottom: 8 },
  primaryButtonText: { color: '#fff', fontWeight: '700' },
  secondaryButton: { backgroundColor: '#fff', paddingVertical: 10, borderRadius: 10, alignItems: 'center', borderWidth: 1, borderColor: '#ddd' },
  secondaryButtonText: { color: '#333', fontWeight: '700' },
  emptyBox: { backgroundColor: '#fff', padding: 12, borderRadius: 10, alignItems: 'center' },
  emptyText: { color: '#666', marginBottom: 8 },
  sessionCard: { backgroundColor: '#fff', padding: 12, borderRadius: 10, marginBottom: 12 },
  sessionTitle: { fontSize: 15, fontWeight: '700' },
  sessionTime: { fontSize: 12, color: '#666', marginBottom: 6 },
  sessionCoords: { fontSize: 12, color: '#444', marginBottom: 8 },
  sessionButtonsRow: { flexDirection: 'row', gap: 8 },
  viewButton: { backgroundColor: '#4caf50', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8, marginRight: 8 },
  viewButtonText: { color: '#fff', fontWeight: '700' },
  mapButton: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#2196f3', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8 },
  mapButtonText: { color: '#2196f3', fontWeight: '700' },
  detailCard: { backgroundColor: '#fff', padding: 12, borderRadius: 10, marginTop: 12 },
  detailTitle: { fontSize: 16, fontWeight: '800', marginBottom: 8 },
  detailText: { fontSize: 13, color: '#333', marginBottom: 6 },
  evidenceImage: { width: '100%', height: 220, borderRadius: 8, marginBottom: 8 },
  video: { width: '100%', height: 220, marginBottom: 8 },
  externalLink: { padding: 8, borderRadius: 8, borderWidth: 1, borderColor: '#ddd', alignItems: 'center', marginTop: 8 },
  externalLinkText: { color: '#2196f3', fontWeight: '700' },
  openLinkButton: { backgroundColor: '#e3f2fd', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8, marginTop: 8, alignItems: 'center' },
  openLinkText: { color: '#1565c0', fontWeight: '700' },
  uriText: { fontSize: 12, color: '#666', marginVertical: 6 },
  audioRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  audioButton: { backgroundColor: '#2196f3', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8 },
  audioButtonText: { color: '#fff', fontWeight: '700' },
  closeButton: { backgroundColor: '#f44336', paddingVertical: 10, borderRadius: 8, alignItems: 'center', marginTop: 12 },
  closeButtonText: { color: '#fff', fontWeight: '700' },
});
