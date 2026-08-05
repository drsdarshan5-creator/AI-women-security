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
import { Ionicons } from '@expo/vector-icons';
import { AuthContext } from '../context/AuthContext';

// Local Wi-Fi API Base Host
const API_HOST = 'http://10.245.81.156:8000';
const API_PATH = '/api/v1/auth';

const DEFAULT_REQUEST_TIMEOUT = 10000;

// Axios helper with custom timeout and request handling
const axiosRequestWithTimeout = async (cfg, timeout = DEFAULT_REQUEST_TIMEOUT) => {
  const controller = new AbortController();
  const timerId = setTimeout(() => controller.abort(), timeout);
  try {
    const merged = {
      ...cfg,
      signal: controller.signal,
      headers: {
        ...(cfg.headers || {}),
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    };
    return await axios(merged);
  } finally {
    clearTimeout(timerId);
  }
};

const validateEmail = (email) => {
  if (!email) return false;
  const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return regex.test(email.trim());
};

const validatePhone = (phone) => {
  if (!phone) return false;
  const digits = phone.replace(/[^0-9]/g, '');
  return digits.length === 10;
};

export default function AuthScreen({ navigation }) {
  const { login } = useContext(AuthContext);
  const [mode, setMode] = useState('signin');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Password visibility state
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [loading, setLoading] = useState(false);

  const [apiBaseUrl, setApiBaseUrl] = useState(`${API_HOST}${API_PATH}`);
  const [backendResolved, setBackendResolved] = useState(false);
  const [backendDiscoveryLoading, setBackendDiscoveryLoading] = useState(true);

  // Inline availability state
  const [emailAvailable, setEmailAvailable] = useState(null);
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
    setConfirmPassword('');
    setEmailAvailable(null);
    setPhoneAvailable(null);
  };

  // Check connection against backend root endpoint '/'
  const detectBackend = async () => {
    setBackendDiscoveryLoading(true);
    setBackendResolved(false);
    const healthUrl = `${API_HOST}/`;
    try {
      const response = await axiosRequestWithTimeout({ method: 'get', url: healthUrl });
      if (response?.status === 200) {
        setApiBaseUrl(`${API_HOST}${API_PATH}`);
        setBackendResolved(true);
        setBackendDiscoveryLoading(false);
        return true;
      }
    } catch (err) {
      console.log('Backend health check failed:', err?.message);
    }
    setBackendDiscoveryLoading(false);
    setBackendResolved(false);
    return false;
  };

  useEffect(() => {
    detectBackend();
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
      const url = `${getApiUrl()}/check?${params.toString()}`;
      const resp = await axiosRequestWithTimeout({ method: 'get', url });
      return resp?.data || {};
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
    if (!fullName.trim()) return Alert.alert('Validation Error', 'Full Name is required.');
    if (!validateEmail(email)) return Alert.alert('Validation Error', 'Please enter a valid email address.');
    if (!validatePhone(phone)) return Alert.alert('Validation Error', 'Please enter a valid 10-digit phone number.');
    if (!password || password.length < 6) return Alert.alert('Validation Error', 'Password must be at least 6 characters.');
    if (password !== confirmPassword) return Alert.alert('Validation Error', 'Passwords do not match.');

    setLoading(true);
    try {
      const currentUrl = getApiUrl();
      const payload = {
        name: fullName.trim(),
        email: email.trim().toLowerCase(),
        phone: phone.replace(/[^0-9]/g, ''),
        password,
      };
      const response = await axiosRequestWithTimeout({ method: 'post', url: `${currentUrl}/register`, data: payload });

      const session = response.data;
      await login(session);
      Alert.alert('Success', 'Account created successfully!');
    } catch (error) {
      const backendMessage = error.response?.data?.message || error.response?.data?.detail;
      const status = error.response?.status;

      if (status === 409 || /duplicate|already exists/i.test(String(backendMessage || ''))) {
        Alert.alert('Duplicate Account', 'An account already exists with this Email or Mobile Number. Please Sign In.');
      } else if (backendMessage) {
        Alert.alert('Registration Failed', String(backendMessage));
      } else {
        Alert.alert('Registration Failed', 'Could not reach backend server. Make sure Uvicorn is running.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSignIn = async () => {
    let identifier = (email || '').trim() || phone.replace(/[^0-9]/g, '');

    if (!identifier) return Alert.alert('Validation Error', 'Email or Phone Number is required.');
    if (email.trim() && !validateEmail(email)) return Alert.alert('Validation Error', 'Please enter a valid email address.');
    if (!email.trim() && phone && !validatePhone(phone)) return Alert.alert('Validation Error', 'Please enter a valid 10-digit phone number.');
    if (!password) return Alert.alert('Validation Error', 'Password is required.');

    setLoading(true);
    try {
      const currentUrl = getApiUrl();
      const response = await axiosRequestWithTimeout({ 
        method: 'post', 
        url: `${currentUrl}/login`, 
        data: { identifier, password } 
      });

      const session = response.data;
      await login(session);
      Alert.alert('Login Successful', 'Welcome back!');
    } catch (error) {
      const backendMessage = error.response?.data?.message || error.response?.data?.detail;
      if (backendMessage) {
        Alert.alert('Sign In Failed', String(backendMessage));
      } else {
        Alert.alert('Sign In Failed', 'Unable to reach backend server. Check your connection.');
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
        <Text style={styles.brandTitle}>WOMEN'S SAFETY AI</Text>

        <View style={styles.card}>
          {mode === 'signin' ? (
            <>
              <Text style={styles.cardHeaderSmall}>SECURE LOGIN</Text>
              <Text style={styles.cardHeaderTitle}>Welcome back</Text>
              <Text style={styles.cardSubtitle}>
                Sign in to access your emergency dashboard and safety tools.
              </Text>
            </>
          ) : (
            <>
              <View style={styles.iconCircle}>
                <Ionicons name="shield-checkmark" size={26} color="#2563eb" />
              </View>
              <Text style={styles.cardHeaderTitle}>Create Your Account</Text>
              <Text style={styles.cardSubtitle}>
                Register to access the AI Women's Safety platform.
              </Text>
            </>
          )}

          {mode === 'register' && (
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Full Name</Text>
              <View style={styles.inputContainer}>
                <Ionicons name="person-outline" size={18} color="#6b7280" style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  value={fullName}
                  onChangeText={setFullName}
                  placeholder="Enter your full name"
                  autoCapitalize="words"
                  textContentType="name"
                />
              </View>
            </View>
          )}

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>{mode === 'register' ? 'Email Address' : 'Email Address'}</Text>
            <View style={styles.inputContainer}>
              <Ionicons name="mail-outline" size={18} color="#6b7280" style={styles.inputIcon} />
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
                    scheduleAvailabilityCheck(value.trim().toLowerCase(), phone.replace(/[^0-9]/g, ''));
                  }
                }}
                placeholder={mode === 'register' ? 'darshni@gmail.com' : 'Enter email address'}
                keyboardType={mode === 'register' ? 'email-address' : 'default'}
                autoCapitalize="none"
                textContentType={mode === 'register' ? 'emailAddress' : 'username'}
              />
            </View>
            {mode === 'register' && (
              availabilityChecking ? (
                <Text style={styles.smallNote}>Checking availability...</Text>
              ) : availabilityError ? (
                <Text style={[styles.smallNote, { color: '#ef4444' }]}>{availabilityError}</Text>
              ) : emailAvailable !== null ? (
                <Text style={[styles.smallNote, { color: emailAvailable ? '#10b981' : '#ef4444' }]}>
                  {emailAvailable ? 'Email is available' : 'Email is already taken'}
                </Text>
              ) : null
            )}
          </View>

          {mode === 'register' && (
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Mobile Number</Text>
              <View style={styles.inputContainer}>
                <Ionicons name="call-outline" size={18} color="#6b7280" style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  value={phone}
                  onChangeText={(value) => {
                    setPhone(value);
                    scheduleAvailabilityCheck(email.trim().toLowerCase(), value.replace(/[^0-9]/g, ''));
                  }}
                  placeholder="Enter your number"
                  keyboardType="phone-pad"
                  textContentType="telephoneNumber"
                />
              </View>
              {availabilityChecking ? (
                <Text style={styles.smallNote}>Checking availability...</Text>
              ) : availabilityError ? (
                <Text style={[styles.smallNote, { color: '#ef4444' }]}>{availabilityError}</Text>
              ) : phoneAvailable !== null ? (
                <Text style={[styles.smallNote, { color: phoneAvailable ? '#10b981' : '#ef4444' }]}>
                  {phoneAvailable ? 'Phone number is available' : 'Phone number is already taken'}
                </Text>
              ) : null}
            </View>
          )}

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Password</Text>
            <View style={styles.inputContainer}>
              <Ionicons name="lock-closed-outline" size={18} color="#6b7280" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                value={password}
                onChangeText={setPassword}
                placeholder="••••••••"
                secureTextEntry={!showPassword}
                textContentType="password"
              />
              <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeIcon}>
                <Ionicons name={showPassword ? 'eye-outline' : 'eye-off-outline'} size={18} color="#6b7280" />
              </TouchableOpacity>
            </View>
          </View>

          {mode === 'register' && (
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Confirm Password</Text>
              <View style={styles.inputContainer}>
                <Ionicons name="lock-closed-outline" size={18} color="#6b7280" style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  placeholder="Confirm your password"
                  secureTextEntry={!showConfirmPassword}
                  textContentType="password"
                />
                <TouchableOpacity onPress={() => setShowConfirmPassword(!showConfirmPassword)} style={styles.eyeIcon}>
                  <Ionicons name={showConfirmPassword ? 'eye-outline' : 'eye-off-outline'} size={18} color="#6b7280" />
                </TouchableOpacity>
              </View>
            </View>
          )}

          <TouchableOpacity style={styles.submitButton} onPress={submit} disabled={loading}>
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.submitButtonText}>{mode === 'register' ? 'Register' : 'Sign In'}</Text>
            )}
          </TouchableOpacity>

          <View style={styles.footerRow}>
            <Text style={styles.footerText}>
              {mode === 'register' ? 'Already have an account? ' : "Don't have an account? "}
            </Text>
            <TouchableOpacity onPress={() => toggleMode(mode === 'register' ? 'signin' : 'register')}>
              <Text style={styles.footerLink}>
                {mode === 'register' ? 'Login' : 'Register now'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        <Text style={styles.statusText}>
          {backendDiscoveryLoading ? (
            'Connecting to backend...'
          ) : backendResolved ? (
            'Connected to backend server'
          ) : (
            'Backend could not be reached. Ensure Uvicorn is running.'
          )}
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 20,
  },
  brandTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#38bdf8',
    textAlign: 'center',
    letterSpacing: 1.5,
    marginBottom: 20,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 8,
  },
  iconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#dbeafe',
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  cardHeaderSmall: {
    fontSize: 12,
    fontWeight: '700',
    color: '#2563eb',
    textAlign: 'center',
    letterSpacing: 1,
    marginBottom: 4,
  },
  cardHeaderTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1e293b',
    textAlign: 'center',
    marginBottom: 6,
  },
  cardSubtitle: {
    fontSize: 13,
    color: '#64748b',
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 20,
  },
  fieldGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
    marginBottom: 6,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#cbd5e1',
    borderRadius: 10,
    paddingHorizontal: 12,
  },
  inputIcon: {
    marginRight: 8,
  },
  input: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 15,
    color: '#0f172a',
  },
  eyeIcon: {
    padding: 6,
  },
  submitButton: {
    backgroundColor: '#0284c7',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 10,
  },
  submitButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 18,
  },
  footerText: {
    fontSize: 13,
    color: '#64748b',
  },
  footerLink: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0284c7',
  },
  smallNote: {
    marginTop: 4,
    fontSize: 12,
  },
  statusText: {
    marginTop: 16,
    color: '#94a3b8',
    fontSize: 12,
    textAlign: 'center',
  },
});