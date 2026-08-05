import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
  PermissionsAndroid,
  Platform,
  Linking,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import RNImmediatePhoneCall from 'react-native-immediate-phone-call';

// Priority 1: Static Emergency Contact (Government / Rescue Team)
export const ADMIN_CONTACT = {
  id: 'admin_112',
  name: 'Rescue Team / Emergency Services',
  phone: '112',
  relationship: 'Government Dispatch',
  fixed: true,
  priority: 1,
};

const STORAGE_KEY = 'userEmergencyContacts_v1';

const makeEmptyContact = () => ({
  id: `${Date.now()}-${Math.random()}`,
  name: '',
  phone: '',
  relationship: '',
});

// Helper: Fetch all contacts (1 Static + Up to 3 Personal) in Priority order
export async function getFullCallSequence() {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    const userContacts = raw ? JSON.parse(raw) : [];
    
    // Attach priorities
    const orderedUserContacts = userContacts.slice(0, 3).map((item, idx) => ({
      ...item,
      priority: idx + 2, // Priority 2, 3, or 4
    }));

    return [ADMIN_CONTACT, ...orderedUserContacts];
  } catch (e) {
    console.warn('Error fetching contacts sequence:', e);
    return [ADMIN_CONTACT];
  }
}

// Helper: Trigger SOS sequential auto-calling (Priority 1 -> 2 -> 3 -> 4)
export async function triggerSequentialCalls(delayMs = 15000) {
  const sequence = await getFullCallSequence();
  console.log('Initiating Sequential SOS Call Sequence:', sequence);

  sequence.forEach((contact, index) => {
    if (contact.phone) {
      setTimeout(() => {
        console.log(`[SOS Priority ${contact.priority}] Dialing: ${contact.name} (${contact.phone})`);
        
        // Safe execution: Check if native module is linked (Dev Build), otherwise fallback to standard Linking (Expo Go)
        if (RNImmediatePhoneCall && typeof RNImmediatePhoneCall.immediatePhoneCall === 'function') {
          try {
            RNImmediatePhoneCall.immediatePhoneCall(contact.phone);
          } catch (e) {
            console.warn('Native call failed, defaulting to Linking:', e);
            Linking.openURL(`tel:${contact.phone}`);
          }
        } else {
          // Fallback dialer open for Expo Go
          Linking.openURL(`tel:${contact.phone}`);
        }
      }, index * delayMs); // 15s delay per step
    }
  });
}

export default function EmergencyContactsScreen() {
  const [userContacts, setUserContacts] = useState([]);

  useEffect(() => {
    loadUserContacts();
    requestCallPermissionOnFirstLoad();
  }, []);

  // Request Android Call Permission once upon registering/first-open
  const requestCallPermissionOnFirstLoad = async () => {
    if (Platform.OS === 'android') {
      try {
        await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.CALL_PHONE,
          {
            title: 'Emergency Call Access',
            message: 'This app needs direct call permission to automatically contact emergency services and your trusted contacts sequentially during an SOS trigger.',
            buttonPositive: 'Grant Permission',
          }
        );
      } catch (err) {
        console.warn('Call Permission Error:', err);
      }
    }
  };

  const loadUserContacts = async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        setUserContacts(Array.isArray(parsed) ? parsed.slice(0, 3) : []);
      }
    } catch (e) {
      console.warn('Failed to load emergency contacts:', e);
    }
  };

  const persistUserContacts = async () => {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(userContacts));
      Alert.alert('Saved', 'Emergency contacts successfully updated.');
    } catch (e) {
      Alert.alert('Save Failed', 'Unable to save contacts. Please try again.');
    }
  };

  const addContact = () => {
    if (userContacts.length >= 3) {
      Alert.alert('Limit Reached', 'You can add up to 3 personal emergency contacts (1 Rescue + 3 Personal = 4 Total).');
      return;
    }
    setUserContacts((prev) => [...prev, makeEmptyContact()]);
  };

  const updateContactField = (index, field, value) => {
    setUserContacts((prev) =>
      prev.map((c, i) => (i === index ? { ...c, [field]: value } : c))
    );
  };

  const deleteContact = (index) => {
    Alert.alert('Delete Contact', 'Are you sure you want to delete this contact?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => setUserContacts((prev) => prev.filter((_, i) => i !== index)),
      },
    ]);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      <View style={styles.header}>
        <Text style={styles.title}>Emergency Priority Contacts ({userContacts.length + 1}/4)</Text>
        <Text style={styles.subtitle}>
          1st priority is pinned. You can configure Priorities 2, 3, and 4 below.
        </Text>
      </View>

      {/* Static Admin/Rescue Contact (Priority 1) */}
      <View style={[styles.card, styles.adminCard]}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>Priority 1: {ADMIN_CONTACT.name}</Text>
          <Text style={styles.adminBadge}>Locked</Text>
        </View>
        <View style={styles.fieldRow}>
          <Text style={styles.fieldLabel}>Emergency Hotline</Text>
          <Text style={styles.adminPhone}>{ADMIN_CONTACT.phone}</Text>
        </View>
        <Text style={styles.helpText}>
          System default contact. Cannot be removed or edited.
        </Text>
      </View>

      {/* Customizable Personal Contacts (Priorities 2, 3, 4) */}
      {userContacts.map((contact, idx) => (
        <View key={contact.id} style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Priority {idx + 2} Contact</Text>
            <TouchableOpacity onPress={() => deleteContact(idx)} style={styles.deleteButton}>
              <Text style={styles.deleteButtonText}>Delete</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.fieldRow}>
            <Text style={styles.fieldLabel}>Contact Name</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. John Doe"
              value={contact.name}
              onChangeText={(v) => updateContactField(idx, 'name', v)}
            />
          </View>

          <View style={styles.fieldRow}>
            <Text style={styles.fieldLabel}>Phone Number</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. +1234567890"
              keyboardType="phone-pad"
              value={contact.phone}
              onChangeText={(v) => updateContactField(idx, 'phone', v)}
            />
          </View>

          <View style={styles.fieldRow}>
            <Text style={styles.fieldLabel}>Relationship</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Parent, Friend, Spouse"
              value={contact.relationship}
              onChangeText={(v) => updateContactField(idx, 'relationship', v)}
            />
          </View>
        </View>
      ))}

      {/* Bottom Action Controls */}
      <View style={styles.actionsRow}>
        {userContacts.length < 3 && (
          <TouchableOpacity style={styles.addButton} onPress={addContact}>
            <Text style={styles.addButtonText}>+ Add Contact</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity style={styles.primaryButton} onPress={persistUserContacts}>
          <Text style={styles.primaryButtonText}>Save Changes</Text>
        </TouchableOpacity>
      </View>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  contentContainer: { padding: 16, paddingBottom: 40 },
  header: { marginBottom: 16 },
  title: { fontSize: 20, fontWeight: '700', color: '#1a1a1a', marginBottom: 4 },
  subtitle: { fontSize: 13, color: '#666' },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  adminCard: { borderColor: '#e53935', borderWidth: 1, backgroundColor: '#ffebee' },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  cardTitle: { fontSize: 15, fontWeight: '700', color: '#1a1a1a' },
  adminBadge: { backgroundColor: '#e53935', color: '#fff', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, fontSize: 11, fontWeight: '700' },
  helpText: { color: '#777', fontSize: 12, marginTop: 4, fontStyle: 'italic' },
  adminPhone: { fontSize: 16, fontWeight: '700', color: '#d32f2f' },
  fieldRow: { marginBottom: 8 },
  fieldLabel: { fontSize: 12, color: '#555', marginBottom: 4, fontWeight: '600' },
  input: { backgroundColor: '#f8f8f8', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 14, borderWidth: 1, borderColor: '#ddd' },
  actionsRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 10, marginTop: 10 },
  addButton: { flex: 1, backgroundColor: '#4caf50', paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
  addButtonText: { color: '#fff', fontWeight: '700' },
  primaryButton: { flex: 1, backgroundColor: '#2196f3', paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
  primaryButtonText: { color: '#fff', fontWeight: '700' },
  deleteButton: { backgroundColor: 'transparent' },
  deleteButtonText: { color: '#ff5252', fontWeight: '700', fontSize: 13 },
});