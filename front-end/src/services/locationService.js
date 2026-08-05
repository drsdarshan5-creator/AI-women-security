import * as Location from 'expo-location';

export async function requestLocationPermissions() {
  const { status } = await Location.requestForegroundPermissionsAsync();
  return status === 'granted';
}

export async function getCurrentLocation() {
  const hasPermission = await requestLocationPermissions();
  if (!hasPermission) {
    throw new Error('Location permission denied');
  }

  const location = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.Highest,
  });

  return location.coords;
}
