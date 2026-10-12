import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import AIPriorityEngine from '../services/AIPriorityEngine';

// Static kiosk config (replace with real kiosk metadata in production)
const KIOSK_ID = 'kiosk-001-main-station';
const KIOSK_NAME = 'Central Station - North Platform';
const KIOSK_LOCATION = { latitude: 12.9715987, longitude: 77.594566 }; // example coords

export default function PublicKioskSOSScreen() {
  const [busy, setBusy] = useState(false);
  const [lastSession, setLastSession] = useState(null);

  const broadcastKioskSOS = async () => {
    if (busy) return;
    setBusy(true);

    try {
      // Build a minimal SOS session object
      const session = {
        id: `${KIOSK_ID}-${Date.now()}`,
        kioskId: KIOSK_ID,
        kioskName: KIOSK_NAME,
        trigger: 'kiosk-button',
        coords: KIOSK_LOCATION,
        timestamp: Date.now(),
        source: 'public-kiosk',
        status: 'EMERGENCY_ACTIVE',
        attachments: [],
        note: 'Public kiosk SOS — immediate assistance requested at kiosk location',
      };

      // Evaluate priority using AIPriorityEngine
      let priorityResult = { score: 0, rank: 'Medium', factors: {}, reasons: [] };
      try {
        // AIPriorityEngine may export default or module.exports; handle both
        const engine = AIPriorityEngine && AIPriorityEngine.evaluateSOS ? AIPriorityEngine : (AIPriorityEngine.default || AIPriorityEngine);
        priorityResult = await engine.evaluateSOS(session);
      } catch (e) {
        console.warn('AIPriorityEngine evaluateSOS failed', e?.message || e);
      }

      // Attach priority metadata
      session.priority = {
        score: priorityResult.score,
        rank: priorityResult.rank,
        reasons: priorityResult.reasons || [],
        factors: priorityResult.factors || {},
      };

      // Persist as the currentSOSSession so MapScreen and responders can pick it up
      try {
        await AsyncStorage.setItem('currentSOSSession', JSON.stringify(session));
      } catch (e) {
        console.warn('Failed to persist currentSOSSession', e?.message || e);
      }

      // Also persist into a short history for kiosks (optional)
      try {
        const key = 'publicKioskSOSHistory_v1';
        const raw = await AsyncStorage.getItem(key);
        const list = raw ? JSON.parse(raw) : [];
        list.unshift(session);
        await AsyncStorage.setItem(key, JSON.stringify(list.slice(0, 50)));
      } catch (e) {
        console.warn('Failed to persist kiosk history', e?.message || e);
      }

      setLastSession(session);

      Alert.alert('Kiosk SOS Sent', `Emergency broadcast sent for ${KIOSK_NAME}. Priority: ${session.priority.rank}`);
    } catch (err) {
      console.warn('Failed to broadcast kiosk SOS', err?.message || err);
      Alert.alert('Error', 'Unable to send kiosk SOS at this time.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.header}>Public SOS Kiosk</Text>
      <Text style={styles.subheader}>{KIOSK_NAME}</Text>
      <View style={styles.kioskInfo}>
        <Text style={styles.label}>Kiosk ID</Text>
        <Text style={styles.value}>{KIOSK_ID}</Text>
        <Text style={[styles.label, { marginTop: 10 }]}>Location</Text>
        <Text style={styles.value}>{`${KIOSK_LOCATION.latitude.toFixed(5)}, ${KIOSK_LOCATION.longitude.toFixed(5)}`}</Text>
      </View>

      <TouchableOpacity style={styles.bigButton} onPress={broadcastKioskSOS} disabled={busy} activeOpacity={0.8}>
        {busy ? (
          <ActivityIndicator size="large" color="#fff" />
        ) : (
          <Text style={styles.bigButtonText}>Press for Immediate Help</Text>
        )}
      </TouchableOpacity>

      {lastSession && (
        <View style={styles.lastCard}>
          <Text style={styles.lastTitle}>Last Broadcast</Text>
          <Text style={styles.lastText}>Time: {new Date(lastSession.timestamp).toLocaleString()}</Text>
          <Text style={styles.lastText}>Priority: {lastSession.priority?.rank} ({lastSession.priority?.score})</Text>
        </View>
      )}

      <View style={styles.noteBox}>
        <Text style={styles.noteText}>This kiosk broadcasts a static location and does not require a mobile login. In a real deployment, kiosk hardware would authenticate to the rescue backend and use secure signed messages.</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: '#f8fafc',
  },
  header: {
    fontSize: 22,
    fontWeight: '700',
    textAlign: 'center',
    marginTop: 12,
    color: '#1a1a1a',
  },
  subheader: {
    fontSize: 14,
    textAlign: 'center',
    color: '#666',
    marginBottom: 18,
  },
  kioskInfo: {
    backgroundColor: '#fff',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e6eef8',
    marginBottom: 20,
  },
  label: {
    fontSize: 12,
    color: '#3b3b3b',
    fontWeight: '600',
  },
  value: {
    fontSize: 14,
    color: '#111',
  },
  bigButton: {
    backgroundColor: '#d32f2f',
    paddingVertical: 24,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 6,
    marginVertical: 8,
  },
  bigButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  lastCard: {
    marginTop: 18,
    backgroundColor: '#fff',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e6eef8',
  },
  lastTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#222',
    marginBottom: 6,
  },
  lastText: {
    fontSize: 13,
    color: '#333',
  },
  noteBox: {
    marginTop: 16,
    backgroundColor: '#fff3e0',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#ffe0b2',
  },
  noteText: {
    fontSize: 12,
    color: '#6d4c41',
  },
});
