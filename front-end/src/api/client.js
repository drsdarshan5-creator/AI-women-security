import axios from 'axios';

const BACKEND_URL = process.env.BACKEND_URL || 'http://10.245.81.156:8000/api/v1';

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

export default client;
