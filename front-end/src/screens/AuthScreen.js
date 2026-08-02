﻿import React, { useContext, useEffect, useState, useRef } from 'react';
import {
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import axios from 'axios';
import { AuthContext } from '../context/AuthContext';

const BACKEND_CANDIDATES = Platform.OS === 'android'
  ? ['10.0.2.2', '10.0.3.2', 'localhost', '10.245.81.156']
  : ['127.0.0.1', 'localhost', '10.245.81.156'];
const BACKEND_PORT = '8000';
const API_PATH = '/api/v1/auth';
const HEALTH_PATH = '/api/v1/health';

const getNetworkErrorMessage = (apiUrl = `http://${BACKEND_CANDIDATES[0]}:${BACKEND_PORT}${API_PATH}`) =>
  `Could not reach the backend at ${apiUrl}. ` +
  `Trying common host addresses: ${BACKEND_CANDIDATES.map((host) => `http://${host}:${BACKEND_PORT}`).join(', ')}. ` +
  'If you are on a physical device, make sure your phone is on the same Wi-Fi network as your computer and the backend is running.';

const validateEmail = (email) => {
  if (!email) {
    return false;
  }
  const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return regex.test(email.trim());
};

const validatePhone = (phone) => {
  if (!phone) {
    return false;
  }
  const digits = phone.replace(/[^0-9]/g, '');
  return digits.length === 10;
};

export default function AuthScreen() {
  const { login } = useContext(AuthContext);
  const [mode, setMode] = useState('signin');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [apiBaseUrl, setApiBaseUrl] = useState(`http://${BACKEND_CANDIDATES[0]}:${BACKEND_PORT}${API_PATH}`);
  const [backendResolved, setBackendResolved] = useState(false);
  const [backendDiscoveryLoading, setBackendDiscoveryLoading] = useState(true);

  // Inline availability state for registration fields
  const [emailAvailable, setEmailAvailable] = useState(null); // null = unknown, true/false = availability
  const [phoneAvailable, setPhoneAvailable] = useState(null);
  const [availabilityChecking, setAvailabilityChecking] = useState(false);
  const [availabilityError, setAvailabilityError] = useState(null);
  const availabilityTimerRef = useRef(null);

  const getApiUrl = () => apiBaseUrl;

  const toggleMode = (nextMode) => {
    setMode(nextMode);
    setFullName('');
    setEmail('');
    setPhone('');
    setPassword('');
  };

  useEffect(() => {
    const resolveBackendHost = async () => {
      for (const host of BACKEND_CANDIDATES) {
        const url = `http://${host}:${BACKEND_PORT}${HEALTH_PATH}`;
        try {
          const response = await axios.get(url, { timeout: 3000 });
          if (response.status === 200) {
            setApiBaseUrl(`http://${host}:${BACKEND_PORT}${API_PATH}`);
            setBackendResolved(true);
            break;
          }
        } catch (err) {
          // ignore and try the next candidate
        }
      }
      setBackendDiscoveryLoading(false);
    };

    resolveBackendHost();
  }, []);

  useEffect(() => {
    return () => {
      if (availabilityTimerRef.current) {
        clearTimeout(availabilityTimerRef.current);
      }
    };
  }, []);

  const checkAvailability = async (emailToCheck, phoneToCheck) => {
    try {
      const params = new URLSearchParams();
      if (emailToCheck) params.append('email', emailToCheck);
      if (phoneToCheck) params.append('phone', phoneToCheck);
      const resp = await axios.get(`${getApiUrl()}/check?${params.toString()}`);
      return resp.data || {};
    } catch (err) {
      console.debug('Availability check failed', err?.response ?? err?.message ?? err);
      return { email_available: null, phone_available: null };
    }
  };

  const scheduleAvailabilityCheck = (emailVal, phoneVal) => {
    if (availabilityTimerRef.current) {
      clearTimeout(availabilityTimerRef.current);
    }
    availabilityTimerRef.current = setTimeout(async () => {
      setAvailabilityChecking(true);
      setAvailabilityError(null);
      try {
        const resp = await checkAvailability(emailVal || '', phoneVal || '');
        setEmailAvailable(resp.email_available ?? null);
        setPhoneAvailable(resp.phone_available ?? null);
      } catch (e) {
        setAvailabilityError('Unable to check availability');
        setEmailAvailable(null);
        setPhoneAvailable(null);
      } finally {
        setAvailabilityChecking(false);
      }
    }, 500);
  };

  const handleRegister = async () => {
    if (!fullName.trim()) {
      return Alert.alert('Validation Error', 'Full Name is required.');
    }

    if (!validateEmail(email)) {
      return Alert.alert('Validation Error', 'Please enter a valid email address.');
    }

    if (!validatePhone(phone)) {
      return Alert.alert('Validation Error', 'Please enter a valid 10-digit phone number.');
    }

    if (!password || password.length < 6) {
      return Alert.alert('Validation Error', 'Password must be at least 6 characters.');
    }

    setLoading(true);
    try {
      const currentUrl = getApiUrl();
      const payload = {
        name: fullName.trim(),
        email: email.trim().toLowerCase(),
        phone: phone.replace(/[^0-9]/g, ''),
        password,
      };
      console.debug('Register payload:', payload, 'URL:', `${currentUrl}/register`);
      const response = await axios.post(`${currentUrl}/register`, payload);

      const session = response.data;
      await login(session);
    } catch (error) {
      const currentUrl = getApiUrl();
      console.debug('Registration error:', error?.response ?? error?.message ?? error);
      if (axios.isAxiosError(error)) {
        const status = error.response?.status;
        const backendMessage = error.response?.data?.message ?? error.response?.data?.detail ?? error.response?.data;
        const message = backendMessage ?? error.message;

        if (status === 409 || /duplicate|already exists/i.test(String(message))) {
          // Show backend message when available to help identify whether email or phone is the conflict.
          Alert.alert(
            'Duplicate Account',
            String(message) || 'An account already exists with this Email or Phone Number. Please Sign In.',
          );
        } else if (!error.response) {
          Alert.alert('Registration Failed', getNetworkErrorMessage(currentUrl));
        } else {
          Alert.alert('Registration Failed', String(message) || 'Unable to register. Please try again.');
        }
      } else {
        Alert.alert('Registration Failed', getNetworkErrorMessage(currentUrl));
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSignIn = async () => {
    const identifier = email.trim() || phone.replace(/[^0-9]/g, '');

    if (!identifier) {
      return Alert.alert('Validation Error', 'Email or Phone Number is required.');
    }

    if (email.trim() && !validateEmail(email)) {
      return Alert.alert('Validation Error', 'Please enter a valid email address.');
    }

    if (!email.trim() && phone && !validatePhone(phone)) {
      return Alert.alert('Validation Error', 'Please enter a valid 10-digit phone number.');
    }

    if (!password) {
      return Alert.alert('Validation Error', 'Password is required.');
    }

    setLoading(true);
    try {
      const currentUrl = getApiUrl();
      const response = await axios.post(`${currentUrl}/login`, {
        identifier,
        password,
      });

      const session = response.data;
      await login(session);
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const backendMessage = error.response?.data?.message ?? error.response?.data?.detail;
        const message = backendMessage ?? error.message;
            if (!error.response) {
          Alert.alert('Sign In Failed', getNetworkErrorMessage(getApiUrl()));
        } else {
          Alert.alert('Sign In Failed', message || 'Unable to sign in. Please check your credentials.');
        }
      } else {
        Alert.alert('Sign In Failed', getNetworkErrorMessage());
      }
    } finally {
      setLoading(false);
    }
  };

  const submit = () => {
    if (mode === 'register') {
      handleRegister();
    } else {
      handleSignIn();
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.heading}>AI Women's Security</Text>

        <View style={styles.modeSwitchContainer}>
          <TouchableOpacity
            style={[styles.modeButton, mode === 'signin' && styles.modeButtonActive]}
            onPress={() => toggleMode('signin')}
          >
            <Text style={[styles.modeButtonText, mode === 'signin' && styles.modeButtonTextActive]}>Sign In</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.modeButton, mode === 'register' && styles.modeButtonActive]}
            onPress={() => toggleMode('register')}
          >
            <Text style={[styles.modeButtonText, mode === 'register' && styles.modeButtonTextActive]}>Register</Text>
          </TouchableOpacity>
        </View>

        {mode === 'register' && (
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Full Name</Text>
            <TextInput
              style={styles.input}
              value={fullName}
              onChangeText={setFullName}
              placeholder="Jane Doe"
              autoCapitalize="words"
              textContentType="name"
            />
          </View>
        )}

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>{mode === 'register' ? 'Email' : 'Email or Phone Number'}</Text>
          <TextInput
            style={styles.input}
            value={mode === 'signin' ? email || phone : email}
            onChangeText={(value) => {
              if (mode === 'signin') {
                const digitsOnly = value.replace(/[^0-9]/g, '');
                if (digitsOnly === value) {
                  setPhone(value);
                  setEmail('');
                } else {
                  setEmail(value);
                  setPhone('');
                }
              } else {
                setEmail(value);
                // schedule availability check when registering
                scheduleAvailabilityCheck(value.trim().toLowerCase(), phone.replace(/[^0-9]/g, ''));
              }
            }}
            placeholder={mode === 'register' ? 'jane.doe@example.com' : 'Email or Phone Number'}
            keyboardType={mode === 'register' ? 'email-address' : 'default'}
            autoCapitalize="none"
            textContentType={mode === 'register' ? 'emailAddress' : 'username'}
          />
          {mode === 'register' && (
            availabilityChecking ? (
              <Text style={styles.smallNote}>Checking availability...</Text>
            ) : availabilityError ? (
              <Text style={[styles.smallNote, { color: '#EF4444' }]}>{availabilityError}</Text>
            ) : emailAvailable !== null ? (
              <Text style={[styles.smallNote, { color: emailAvailable ? '#10B981' : '#EF4444' }]}>
                {emailAvailable ? 'Email is available' : 'Email is already taken'}
              </Text>
            ) : null
          )}
        </View>

        <Text style={[styles.noteText, styles.statusText]}>
          {backendDiscoveryLoading ? (
            'Looking for backend...'
          ) : backendResolved ? (
            `Backend discovered at ${getApiUrl().replace(API_PATH, '')}`
          ) : (
            'Backend could not be auto-detected. Make sure the backend is running and your device is on the same network.'
          )}
        </Text>

        {mode === 'register' && (
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Phone Number</Text>
            <TextInput
              style={styles.input}
              value={phone}
              onChangeText={(value) => {
                setPhone(value);
                scheduleAvailabilityCheck(email.trim().toLowerCase(), value.replace(/[^0-9]/g, ''));
              }}
              placeholder="1234567890"
              keyboardType="phone-pad"
              textContentType="telephoneNumber"
            />
            {availabilityChecking ? (
              <Text style={styles.smallNote}>Checking availability...</Text>
            ) : availabilityError ? (
              <Text style={[styles.smallNote, { color: '#EF4444' }]}>{availabilityError}</Text>
            ) : phoneAvailable !== null ? (
              <Text style={[styles.smallNote, { color: phoneAvailable ? '#10B981' : '#EF4444' }]}>
                {phoneAvailable ? 'Phone number is available' : 'Phone number is already taken'}
              </Text>
            ) : null}
          </View>
        )}

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Password</Text>
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            placeholder="Password"
            secureTextEntry
            textContentType="password"
          />
        </View>

        <TouchableOpacity style={styles.submitButton} onPress={submit} disabled={loading}>
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.submitButtonText}>{mode === 'register' ? 'Create Account' : 'Sign In'}</Text>
          )}
        </TouchableOpacity>

        <Text style={styles.noteText}>
          {mode === 'register'
            ? 'Use a valid email and 10-digit phone number to register.'
            : 'Enter your email or phone number and password to sign in.'}
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
  },
  heading: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1f2937',
    textAlign: 'center',
    marginBottom: 32,
  },
  modeSwitchContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 24,
    borderRadius: 12,
    backgroundColor: '#e5e7eb',
    overflow: 'hidden',
  },
  modeButton: {
    flex: 1,
    paddingVertical: 14,
    alignItems: 'center',
  },
  modeButtonActive: {
    backgroundColor: '#2563eb',
  },
  modeButtonText: {
    color: '#374151',
    fontSize: 16,
    fontWeight: '600',
  },
  modeButtonTextActive: {
    color: '#fff',
  },
  fieldGroup: {
    marginBottom: 16,
  },
  label: {
    marginBottom: 8,
    color: '#4b5563',
    fontSize: 14,
    fontWeight: '500',
  },
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 10,
    backgroundColor: '#fff',
    color: '#111827',
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
  },
  submitButton: {
    marginTop: 12,
    paddingVertical: 16,
    borderRadius: 12,
    backgroundColor: '#2563eb',
    alignItems: 'center',
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  noteText: {
    marginTop: 20,
    color: '#6b7280',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 20,
  },
  smallNote: {
    marginTop: 6,
    color: '#9ca3af',
    fontSize: 12,
    lineHeight: 18,
  },
  statusText: {
    marginBottom: 16,
    color: '#374151',
  },
});
