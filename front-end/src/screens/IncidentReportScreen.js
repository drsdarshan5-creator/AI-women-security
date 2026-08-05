import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
  Switch,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function IncidentReportScreen({ route, navigation }) {
  const [title, setTitle] = useState('');
  const [location, setLocation] = useState('');
  const [description, setDescription] = useState('');
  const [severity, setSeverity] = useState('medium'); // 'low', 'medium', 'high'

  // Anonymous reporting toggle and reporter fields
  const [anonymous, setAnonymous] = useState(route?.params?.anonymous ?? false);
  const [reporterName, setReporterName] = useState('');
  const [reporterPhone, setReporterPhone] = useState('');

  // Keep anonymous in sync with navigation params (if provided)
  useEffect(() => {
    if (route?.params?.anonymous !== undefined) {
      setAnonymous(!!route.params.anonymous);
    }
  }, [route?.params?.anonymous]);

  const handleAnonymousToggle = (value) => {
    setAnonymous(value);
    if (value) {
      // Clear any personal contact fields when enabling anonymous reporting
      setReporterName('');
      setReporterPhone('');
    }
  };

  // Attachments
  const [photoAttached, setPhotoAttached] = useState(false);
  const [videoAttached, setVideoAttached] = useState(false);
  const [attachments, setAttachments] = useState([]); // { type: 'photo'|'video', uri: 'file://...' }

  const handlePhotoAttachment = () => {
    // Simulate photo attachment toggle
    const newVal = !photoAttached;
    setPhotoAttached(newVal);

    if (newVal) {
      // add a placeholder attachment record
      setAttachments((prev) => [...prev, { type: 'photo', uri: 'placeholder-photo.jpg' }]);
    } else {
      setAttachments((prev) => prev.filter((a) => a.type !== 'photo'));
    }

    Alert.alert('Photo', newVal ? 'Photo attached successfully' : 'Photo removed', [{ text: 'OK' }]);
  };

  const handleVideoAttachment = () => {
    const newVal = !videoAttached;
    setVideoAttached(newVal);

    if (newVal) {
      setAttachments((prev) => [...prev, { type: 'video', uri: 'placeholder-video.mp4' }]);
    } else {
      setAttachments((prev) => prev.filter((a) => a.type !== 'video'));
    }

    Alert.alert('Video', newVal ? 'Video attached successfully' : 'Video removed', [{ text: 'OK' }]);
  };

  const validateForm = () => {
    if (!title.trim()) {
      Alert.alert('Error', 'Please enter an incident title');
      return false;
    }
    if (!location.trim()) {
      Alert.alert('Error', 'Please enter the incident location');
      return false;
    }
    if (!description.trim()) {
      Alert.alert('Error', 'Please provide a detailed description');
      return false;
    }
    return true;
  };

  // AI Fake Report Detection for incident reports
  const INCIDENT_HISTORY_KEY = 'recentIncidentReports_v1';
  const aiFakeReportCheck = async ({ title, description, attachments = [] }) => {
    const reasons = [];
    let score = 0; // higher score -> more likely fake/accidental/spam

    const descLen = (description || '').trim().length;
    if (descLen < 30) {
      score += 30;
      reasons.push('Very short description — may lack detail.');
    }

    if (!attachments || attachments.length === 0) {
      score += 20;
      reasons.push('No supporting media attached.');
    }

    // Load history to detect duplicates/spam
    try {
      const raw = await AsyncStorage.getItem(INCIDENT_HISTORY_KEY);
      const list = raw ? JSON.parse(raw) : [];
      const fingerprint = (title + '|' + description).toLowerCase().replace(/\s+/g, ' ').trim();

      // duplicate exact match within last 24 hours
      const now = Date.now();
      const duplicate = list.find((r) => r.fingerprint === fingerprint && now - r.ts < 24 * 60 * 60 * 1000);
      if (duplicate) {
        score += 50;
        reasons.push('Duplicate of a recent report.');
      }

      // frequency check: too many reports in short window
      const recentCount = list.filter((r) => now - r.ts < 5 * 60 * 1000).length; // last 5 minutes
      if (recentCount >= 3) {
        score += 60;
        reasons.push('Multiple reports submitted recently from this device — possible spam.');
      }
    } catch (e) {
      // non-fatal
      console.warn('Incident history check failed', e?.message || e);
    }

    const flagged = score >= 50;
    return { flagged, score, reasons };
  };

  const handleSubmitReport = async () => {
    if (!validateForm()) {
      return;
    }

    // Run AI fake report check before submitting
    const check = await aiFakeReportCheck({ title, description, attachments });
    if (check.flagged) {
      Alert.alert(
        'Potential False/Spam Report Detected',
        `The report appears suspicious for the following reasons:\n- ${check.reasons.join('\n- ')}\n\nDo you still want to submit?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Submit Anyway',
            onPress: async () => {
              await finalizeSubmit();
            },
          },
        ]
      );
      return;
    }

    // proceed normally
    await finalizeSubmit();
  };

  // finalizeSubmit separates actual submission and history persistence
  const finalizeSubmit = async () => {
    // Build the submission payload. If anonymous, exclude personal identifiers.
    const payload = {
      title: title.trim(),
      location: location.trim(),
      description: description.trim(),
      severity,
      attachments,
      anonymous: !!anonymous,
      timestamp: new Date().toISOString(),
    };

    if (!anonymous) {
      payload.reporter = {
        name: reporterName.trim() || null,
        phone: reporterPhone.trim() || null,
      };
    }

    // Simulate secure submission: in a real app this would POST to a secure endpoint with transport encryption
    // and possibly client-side encryption of personally identifying information. Here we only simulate by
    // not including reporter fields when anonymous === true.

    const alertMessage = anonymous
      ? `Your anonymous report "${title}" has been securely submitted.`
      : `Incident report "${title}" has been submitted.`;

    Alert.alert('Report Submitted', alertMessage, [
      {
        text: 'OK',
        onPress: async () => {
          // Reset form
          setTitle('');
          setLocation('');
          setDescription('');
          setSeverity('medium');
          setPhotoAttached(false);
          setVideoAttached(false);
          setAttachments([]);
          // Optionally keep reporter info for convenience if not anonymous
          if (anonymous) {
            setReporterName('');
            setReporterPhone('');
          }

          // persist fingerprint in local history for duplicate detection
          try {
            const KEY = INCIDENT_HISTORY_KEY;
            const raw = await AsyncStorage.getItem(KEY);
            const list = raw ? JSON.parse(raw) : [];
            const fingerprint = (payload.title + '|' + payload.description).toLowerCase().replace(/\s+/g, ' ').trim();
            list.unshift({ fingerprint, ts: Date.now() });
            // prune older than 7 days and keep last 50
            const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
            const pruned = list.filter((r) => r.ts >= cutoff).slice(0, 50);
            await AsyncStorage.setItem(KEY, JSON.stringify(pruned));
          } catch (e) {
            console.warn('Failed to persist incident history', e?.message || e);
          }
        },
      },
    ]);

    // For debugging / developer visibility only (do not log PII in production)
    // console.log('Submitting report payload:', payload);
  };

  const getSeverityColor = (level) => {
    switch (level) {
      case 'low':
        return '#4caf50';
      case 'medium':
        return '#ff9800';
      case 'high':
        return '#f44336';
      default:
        return '#666';
    }
  };

  const getSeverityLabel = (level) => {
    return level.charAt(0).toUpperCase() + level.slice(1);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Report an Incident</Text>
        <Text style={styles.subtitle}>
          Provide details to help emergency responders assist you
        </Text>
      </View>

      {/* Incident Title */}
      <View style={styles.formGroup}>
        <Text style={styles.label}>Incident Title *</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g., Harassment on street, Suspicious activity"
          placeholderTextColor="#999"
          value={title}
          onChangeText={setTitle}
          editable={true}
        />
      </View>

      {/* Location */}
      <View style={styles.formGroup}>
        <Text style={styles.label}>Location *</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g., Main Street and 5th Avenue"
          placeholderTextColor="#999"
          value={location}
          onChangeText={setLocation}
          editable={true}
        />
      </View>

      {/* Anonymous Reporting Toggle */}
      <View style={styles.formGroup}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={styles.label}>Submit Anonymously</Text>
          <Switch value={anonymous} onValueChange={handleAnonymousToggle} />
        </View>
        <Text style={styles.helperText}>When enabled, personal identifiers will be hidden from this report.</Text>
      </View>

      {/* Reporter Contact Info (hidden when anonymous) */}
      {!anonymous && (
        <View style={styles.formGroup}>
          <Text style={styles.label}>Your Contact Info (Optional)</Text>
          <TextInput
            style={styles.input}
            placeholder="Your name"
            placeholderTextColor="#999"
            value={reporterName}
            onChangeText={setReporterName}
            editable={true}
          />
          <View style={{ height: 10 }} />
          <TextInput
            style={styles.input}
            placeholder="Phone number (optional)"
            placeholderTextColor="#999"
            value={reporterPhone}
            onChangeText={setReporterPhone}
            keyboardType="phone-pad"
            editable={true}
          />
        </View>
      )}

      {/* Severity Level */}
      <View style={styles.formGroup}>
        <Text style={styles.label}>Severity Level *</Text>
        <View style={styles.severityContainer}>
          {['low', 'medium', 'high'].map((level) => (
            <TouchableOpacity
              key={level}
              style={[
                styles.severityButton,
                severity === level && [
                  styles.severityButtonActive,
                  { backgroundColor: getSeverityColor(level) },
                ],
              ]}
              onPress={() => setSeverity(level)}
            >
              <Text
                style={[
                  styles.severityButtonText,
                  severity === level && styles.severityButtonTextActive,
                ]}
              >
                {getSeverityLabel(level)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Description */}
      <View style={styles.formGroup}>
        <Text style={styles.label}>Detailed Description *</Text>
        <TextInput
          style={[styles.input, styles.descriptionInput]}
          placeholder="Describe what happened, any identifiable information, witness details, etc."
          placeholderTextColor="#999"
          value={description}
          onChangeText={setDescription}
          multiline={true}
          numberOfLines={6}
          textAlignVertical="top"
          editable={true}
        />
      </View>

      {/* Attachments (Photo / Video) */}
      <View style={styles.formGroup}>
        <Text style={styles.label}>Attachments (Optional)</Text>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
          <TouchableOpacity
            style={[
              styles.photoButton,
              photoAttached && styles.photoButtonActive,
              { flex: 1, marginRight: 6 },
            ]}
            onPress={handlePhotoAttachment}
          >
            <Text style={styles.photoButtonIcon}>📷</Text>
            <View style={styles.photoButtonContent}>
              <Text style={styles.photoButtonText}>
                {photoAttached ? '✓ Photo Attached' : 'Attach Photo'}
              </Text>
              <Text style={styles.photoButtonSubtext}>
                {photoAttached ? 'Photo ready for upload' : 'JPG, PNG up to 10 MB'}
              </Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.photoButton,
              videoAttached && styles.photoButtonActive,
              { flex: 1, marginLeft: 6 },
            ]}
            onPress={handleVideoAttachment}
          >
            <Text style={styles.photoButtonIcon}>🎥</Text>
            <View style={styles.photoButtonContent}>
              <Text style={styles.photoButtonText}>
                {videoAttached ? '✓ Video Attached' : 'Attach Video'}
              </Text>
              <Text style={styles.photoButtonSubtext}>
                {videoAttached ? 'Video ready for upload' : 'MP4 up to 30 MB'}
              </Text>
            </View>
          </TouchableOpacity>
        </View>

        {attachments.length > 0 && (
          <Text style={styles.attachmentSummary}>{attachments.length} attachment(s) ready</Text>
        )}
      </View>

      {/* Info Box */}
      <View style={styles.infoBox}>
        <Text style={styles.infoTitle}>📋 Report Information</Text>
        <Text style={styles.infoText}>
          • Your report will be sent to emergency contacts and local authorities
        </Text>
        <Text style={styles.infoText}>
          • Include as many details as possible to help responders
        </Text>
        <Text style={styles.infoText}>
          • Your location will be automatically included
        </Text>
        <Text style={styles.infoText}>
          • Photos help verify and respond to incidents faster
        </Text>
      </View>

      {/* Submit Button */}
      <TouchableOpacity
        style={styles.submitButton}
        onPress={handleSubmitReport}
      >
        <Text style={styles.submitButtonText}>Submit Report</Text>
      </TouchableOpacity>

      {/* Clear Button */}
      <TouchableOpacity
        style={styles.clearButton}
        onPress={() => {
          setTitle('');
          setLocation('');
          setDescription('');
          setSeverity('medium');
          setPhotoAttached(false);
          setVideoAttached(false);
          setAttachments([]);
          setAnonymous(false);
          setReporterName('');
          setReporterPhone('');
        }}
      >
        <Text style={styles.clearButtonText}>Clear Form</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  contentContainer: {
    padding: 16,
    paddingBottom: 40,
  },
  header: {
    marginBottom: 28,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1a1a1a',
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
  },
  formGroup: {
    marginBottom: 22,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 10,
  },
  input: {
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    color: '#1a1a1a',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  descriptionInput: {
    minHeight: 120,
    paddingTop: 12,
  },
  severityContainer: {
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'space-between',
  },
  severityButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#e0e0e0',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  severityButtonActive: {
    borderColor: 'transparent',
  },
  severityButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#666',
  },
  severityButtonTextActive: {
    color: '#fff',
  },
  photoButton: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#e0e0e0',
    borderStyle: 'dashed',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  photoButtonActive: {
    borderColor: '#4caf50',
    backgroundColor: '#f1f8f4',
  },
  photoButtonIcon: {
    fontSize: 32,
    marginRight: 14,
  },
  photoButtonContent: {
    flex: 1,
  },
  photoButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 4,
  },
  photoButtonSubtext: {
    fontSize: 12,
    color: '#999',
  },
  helperText: {
    fontSize: 12,
    color: '#666',
    marginTop: 6,
  },
  attachmentSummary: {
    marginTop: 8,
    fontSize: 13,
    color: '#2e7d32',
    fontWeight: '600',
  },
  infoBox: {
    backgroundColor: '#e3f2fd',
    borderRadius: 10,
    padding: 14,
    marginBottom: 24,
    borderLeftWidth: 4,
    borderLeftColor: '#2196f3',
  },
  infoTitle: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#1565c0',
    marginBottom: 10,
  },
  infoText: {
    fontSize: 12,
    color: '#0d47a1',
    marginBottom: 6,
    lineHeight: 16,
  },
  submitButton: {
    backgroundColor: '#f44336',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 5,
  },
  submitButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#fff',
    letterSpacing: 0.5,
  },
  clearButton: {
    backgroundColor: '#e0e0e0',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  clearButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },
});
