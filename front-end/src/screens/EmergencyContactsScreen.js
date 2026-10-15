import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
} from 'react-native';
import client from '../api/client';
import { API_ORIGIN } from '../api/config';

const makeEmptyContact = () => ({
  id: `${Date.now()}-${Math.random()}`,
  name: '',
  phone: '',
  relationship: '',
});

export default function EmergencyContactsScreen() {
  const [userContacts, setUserContacts] = useState([]);
  const [validationErrors, setValidationErrors] = useState({});

  useEffect(() => {
    loadUserContacts();
  }, []);

  const loadUserContacts = async () => {
    try {
      const response = await client.get('/emergency-contacts');
      setUserContacts(Array.isArray(response.data) ? response.data : []);
    } catch (e) {
      console.warn('Failed to load emergency contacts:', e);
    }
  };

  const handleSaveChanges = async () => {
    const errors = {};

    if (userContacts.length !== 3) {
      Alert.alert('Validation Error', 'Exactly 3 priority contacts are required.');
      return;
    }

    userContacts.forEach((contact, index) => {
      const priority = index + 1;
      if (!contact.name?.trim()) {
        errors[`${index}.name`] = `Name for Priority ${priority} is required`;
      }
      if (!contact.phone?.trim()) {
        errors[`${index}.phone`] = `Phone Number for Priority ${priority} is required`;
      }
      if (!contact.relationship?.trim()) {
        errors[`${index}.relationship`] = `Relationship for Priority ${priority} is required`;
      }
    });

    if (Object.keys(errors).length > 0) {
      setValidationErrors(errors);
      Alert.alert('Validation Error', Object.values(errors)[0]);
      return;
    }

    const invalidPhoneIndex = userContacts.findIndex(
      (contact) => !/^\d{10}$/.test(contact.phone.trim()),
    );
    if (invalidPhoneIndex !== -1) {
      const fieldKey = `${invalidPhoneIndex}.phone`;
      const message = `Phone Number for Priority ${invalidPhoneIndex + 1} must be exactly 10 digits.`;
      setValidationErrors({ [fieldKey]: message });
      Alert.alert('Validation Error', message);
      return;
    }

    const phoneNumbers = userContacts.map((contact) => contact.phone.trim());
    if (new Set(phoneNumbers).size !== phoneNumbers.length) {
      const duplicateErrors = {};
      phoneNumbers.forEach((phoneNumber, index) => {
        if (phoneNumbers.filter((candidate) => candidate === phoneNumber).length > 1) {
          duplicateErrors[`${index}.phone`] = 'Each priority number must be unique.';
        }
      });
      setValidationErrors(duplicateErrors);
      Alert.alert('Validation Error', 'Each priority number must be unique.');
      return;
    }

    setValidationErrors({});
    try {
      const response = await client.put('/emergency-contacts', {
        contacts: userContacts.map(({ name, phone, relationship }) => ({
          name: name.trim(),
          phone_number: phone.trim(),
          relationship: relationship.trim(),
        })),
      });
      if (Array.isArray(response.data)) {
        setUserContacts(response.data);
      }
      Alert.alert('Saved', 'Emergency contacts successfully updated.');
    } catch (error) {
      const detail = error?.response?.data?.detail;
      const backendMessage = Array.isArray(detail)
        ? detail.map((item) => item.msg || item.message).filter(Boolean).join('\n')
        : typeof detail === 'string'
          ? detail
          : error?.response?.data?.message;
      const message = backendMessage || (
        !error?.response
          ? `Cannot reach the backend at ${API_ORIGIN}. Check that the phone and computer are on the same Wi-Fi and the backend is running.`
          : 'Unable to save contacts. Please try again.'
      );
      Alert.alert('Save Failed', message);
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
    setValidationErrors((prev) => {
      const next = { ...prev };
      delete next[`${index}.${field}`];
      return next;
    });
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
        <Text style={styles.title}>Emergency Contacts ({userContacts.length})</Text>
        <Text style={styles.subtitle}>
          Contacts are stored securely on the backend and notified through configured emergency channels.
        </Text>
      </View>

      {/* Customizable contacts */}
      {userContacts.map((contact, idx) => (
        <View key={contact.id} style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Priority {idx + 1} Contact</Text>
            <TouchableOpacity onPress={() => deleteContact(idx)} style={styles.deleteButton}>
              <Text style={styles.deleteButtonText}>Delete</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.fieldRow}>
            <Text style={styles.fieldLabel}>Contact Name</Text>
            <TextInput
              style={[styles.input, validationErrors[`${idx}.name`] && styles.inputError]}
              placeholder="e.g. John Doe"
              value={contact.name}
              onChangeText={(v) => updateContactField(idx, 'name', v)}
            />
          </View>

          <View style={styles.fieldRow}>
            <Text style={styles.fieldLabel}>Phone Number</Text>
            <TextInput
              style={[styles.input, validationErrors[`${idx}.phone`] && styles.inputError]}
              placeholder="e.g. 9876543210 (10 digits)"
              keyboardType="phone-pad"
              value={contact.phone}
              onChangeText={(v) => updateContactField(idx, 'phone', v)}
            />
          </View>

          <View style={styles.fieldRow}>
            <Text style={styles.fieldLabel}>Relationship</Text>
            <TextInput
              style={[styles.input, validationErrors[`${idx}.relationship`] && styles.inputError]}
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

        <TouchableOpacity style={styles.primaryButton} onPress={handleSaveChanges}>
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
  inputError: { borderColor: '#ff4d4d' },
  actionsRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 10, marginTop: 10 },
  addButton: { flex: 1, backgroundColor: '#4caf50', paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
  addButtonText: { color: '#fff', fontWeight: '700' },
  primaryButton: { flex: 1, backgroundColor: '#2196f3', paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
  primaryButtonText: { color: '#fff', fontWeight: '700' },
  deleteButton: { backgroundColor: 'transparent' },
  deleteButtonText: { color: '#ff5252', fontWeight: '700', fontSize: 13 },
});
