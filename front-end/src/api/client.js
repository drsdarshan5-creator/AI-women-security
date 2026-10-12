import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

const BACKEND_URL = process.env.BACKEND_URL || 'http://10.124.87.156:8000/api/v1';

const client = axios.create({
  baseURL: BACKEND_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 10000,
});

client.interceptors.response.use(
  response => response,
  error => Promise.reject(error),
);

client.interceptors.request.use(async config => {
  const raw = await AsyncStorage.getItem('USER_SESSION');
  if (raw) {
    const session = JSON.parse(raw);
    const token = session.token || session.access_token;
    if (token) config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export default client;
