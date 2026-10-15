export const API_ORIGIN = (process.env.EXPO_PUBLIC_API_URL || 'http://10.135.15.156:8000').replace(/\/+$/, '');

export const API_V1_URL = `${API_ORIGIN}/api/v1`;
export const API_HEALTH_URL = `${API_ORIGIN}/`;
