import AsyncStorage from '@react-native-async-storage/async-storage';
import client from '../api/client';

const ACTIVE_EMERGENCY_KEY = 'activeEmergencyId';

export async function createEmergency({ trigger, emergencyType = 'sos', coords, liveLocation }) {
  const idempotencyKey = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const response = await client.post('/emergencies', {
    idempotency_key: idempotencyKey,
    emergency_type: emergencyType,
    trigger,
    latitude: coords?.latitude ?? null,
    longitude: coords?.longitude ?? null,
    live_location: liveLocation || null,
  });
  const emergency = response.data;
  if (emergency?.emergency_id) {
    await AsyncStorage.setItem(ACTIVE_EMERGENCY_KEY, emergency.emergency_id);
  }
  return emergency;
}

export async function updateEmergencyLocation(emergencyId, coords) {
  if (!emergencyId || !coords) return null;
  const response = await client.post(`/emergencies/${emergencyId}/location`, {
    latitude: coords.latitude,
    longitude: coords.longitude,
    timestamp: new Date().toISOString(),
  });
  return response.data;
}

export async function getActiveEmergencyId() {
  return AsyncStorage.getItem(ACTIVE_EMERGENCY_KEY);
}
