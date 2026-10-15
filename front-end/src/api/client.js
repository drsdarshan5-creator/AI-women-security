import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_V1_URL } from './config';

const client = axios.create({
  baseURL: API_V1_URL,
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
