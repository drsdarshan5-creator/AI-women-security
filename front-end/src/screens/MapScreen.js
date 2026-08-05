import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
  Dimensions,
  Linking,
} from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import AsyncStorage from '@react-native-async-storage/async-storage';

const { width } = Dimensions.get('window');

export default function MapScreen() {
  const mapRef = useRef(null);
  const [destination, setDestination] = useState('');
  const [routeMode, setRouteMode] = useState('safe'); // 'safe' or 'direct'
  const [currentLocation, setCurrentLocation] = useState({
    latitude: 12.9716,
    longitude: 77.6412,
  });
  const [routeActive, setRouteActive] = useState(false);

  // AI Safety Score state
  const [incidentDensity, setIncidentDensity] = useState(0.2); // simulated 0..1
  const [safetyScore, setSafetyScore] = useState(85); // 0..100, higher is safer
  const [safetyLevel, setSafetyLevel] = useState('safe'); // 'safe' | 'caution' | 'high'

  // Emergency route optimization state
  const [rescueUnits, setRescueUnits] = useState([
    { id: 'R1', name: 'Unit Alpha (Police)', latitude: 12.9735, longitude: 77.6405, available: true },
    { id: 'R2', name: 'Unit Bravo (Medical)', latitude: 12.9690, longitude: 77.6450, available: true },
    { id: 'R3', name: 'Unit Charlie (Helpline)', latitude: 12.9780, longitude: 77.6380, available: false },
  ]);
  const [roadClosures, setRoadClosures] = useState([
    { id: 'C1', latitude: 12.975, longitude: 77.642, radiusMeters: 300, severity: 0.8 },
  ]);
  const [trafficMultipliers, setTrafficMultipliers] = useState([
    { id: 'T1', latitude: 12.972, longitude: 77.641, radiusMeters: 800, multiplier: 1.4 },
  ]);
  const [optimizedRoute, setOptimizedRoute] = useState(null);
  const [computingRoute, setComputingRoute] = useState(false);

  // SOS location broadcasting state
  const [sosBroadcasting, setSosBroadcasting] = useState(false);
  const [sosSession, setSosSession] = useState(null);
  const locationSubscriptionRef = useRef(null);
  const pollingRef = useRef(null);

  const LOCATION_POLL_INTERVAL = 5000;
  const LOCATION_BROADCAST_ENDPOINT = null;
  const CURRENT_SOS_SESSION_KEY = 'currentSOSSession';

  // Get current GPS location on mount
  useEffect(() => {
    (async () => {
      let Location;
      try {
        Location = require('expo-location');
        let { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          let loc = await Location.getCurrentPositionAsync({});
          const coords = {
            latitude: loc.coords.latitude,
            longitude: loc.coords.longitude,
          };
          setCurrentLocation(coords);
          mapRef.current?.animateToRegion({
            ...coords,
            latitudeDelta: 0.015,
            longitudeDelta: 0.015,
          });
        }
      } catch (e) {
        console.warn('Fallback to default coordinates');
      }
    })();

    pollForSosSession();

    return () => {
      stopSosPolling();
      stopLocationTracking();
    };
  }, []);

  const pollForSosSession = () => {
    checkCurrentSosSession();
    pollingRef.current = setInterval(checkCurrentSosSession, LOCATION_POLL_INTERVAL);
  };

  const stopSosPolling = () => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  };

  const checkCurrentSosSession = async () => {
    try {
      const raw = await AsyncStorage.getItem(CURRENT_SOS_SESSION_KEY);
      if (!raw) {
        if (sosBroadcasting) {
          stopLocationTracking();
        }
        return;
      }
      const session = JSON.parse(raw);
      if (session && session.active && !session.rescueCompleted) {
        if (!sosBroadcasting) {
          startLocationTracking(session);
        }
      } else if (session && session.rescueCompleted) {
        if (sosBroadcasting) stopLocationTracking();
      }
    } catch (e) {
      console.warn('Failed to check SOS session', e?.message || e);
    }
  };

  const startLocationTracking = async (session) => {
    let Location;
    try {
      Location = require('expo-location');
    } catch (e) {
      Location = null;
    }

    setSosSession(session);
    setSosBroadcasting(true);

    if (Location) {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('Location Permission', 'Permission to access location was denied. Live broadcasting unavailable.');
          return;
        }

        locationSubscriptionRef.current = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.Balanced, timeInterval: 5000, distanceInterval: 5 },
          (loc) => {
            const coords = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
            setCurrentLocation(coords);
            sendLocationBroadcast(coords, session).catch((err) => console.warn('broadcast failed', err));
          }
        );
      } catch (e) {
        console.warn('Location watch failed', e?.message || e);
      }
    }
  };

  const stopLocationTracking = async () => {
    setSosBroadcasting(false);
    setSosSession(null);
    if (locationSubscriptionRef.current && typeof locationSubscriptionRef.current.remove === 'function') {
      try {
        locationSubscriptionRef.current.remove();
      } catch (e) {}
      locationSubscriptionRef.current = null;
    }
  };

  const sendLocationBroadcast = async (coords, session) => {
    if (LOCATION_BROADCAST_ENDPOINT) {
      try {
        await fetch(LOCATION_BROADCAST_ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId: session?.id, coords, timestamp: Date.now() }),
        });
        return;
      } catch (e) {
        console.warn('Broadcast POST failed', e?.message || e);
      }
    }

    try {
      await AsyncStorage.setItem('sos_live_location', JSON.stringify({ sessionId: session?.id, coords, timestamp: Date.now() }));
    } catch (e) {
      console.warn('Failed to persist live location', e?.message || e);
    }
  };

  // Emergency Route Optimization Calculations
  const toRad = (deg) => (deg * Math.PI) / 180;
  const haversine = (aLat, aLon, bLat, bLon) => {
    const R = 6371; // km
    const dLat = toRad(bLat - aLat);
    const dLon = toRad(bLon - aLon);
    const lat1 = toRad(aLat);
    const lat2 = toRad(bLat);
    const sinDLat = Math.sin(dLat / 2);
    const sinDLon = Math.sin(dLon / 2);
    const a = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLon * sinDLon;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  const pointInCircle = (lat, lon, circle) => {
    const dKm = haversine(lat, lon, circle.latitude, circle.longitude);
    return dKm * 1000 <= (circle.radiusMeters || 0);
  };

  const estimateTimeSeconds = (distanceKm, baseSpeedKmh = 40, trafficMultiplier = 1, closurePenalty = 0) => {
    const effectiveSpeed = Math.max(5, baseSpeedKmh / trafficMultiplier - closurePenalty * 10);
    const hours = distanceKm / effectiveSpeed;
    return Math.round(hours * 3600);
  };

  const computeOptimizedRoute = (origin, target, units, closures, trafficAreas) => {
    const candidates = units
      .filter((u) => u.available)
      .map((u) => {
        const distKm = haversine(u.latitude, u.longitude, target.latitude, target.longitude);
        const midLat = (u.latitude + target.latitude) / 2;
        const midLon = (u.longitude + target.longitude) / 2;
        let trafficMul = 1;
        trafficAreas.forEach((t) => {
          if (pointInCircle(midLat, midLon, t)) trafficMul = Math.max(trafficMul, t.multiplier || 1);
        });
        let closurePenalty = 0;
        closures.forEach((c) => {
          if (pointInCircle(midLat, midLon, c)) closurePenalty = Math.max(closurePenalty, c.severity || 0);
        });
        const travelSec = estimateTimeSeconds(distKm, 60, trafficMul, closurePenalty);
        const safetyDetourSec = Math.round(distKm * 30);
        const totalSec = travelSec + safetyDetourSec + Math.round((closurePenalty || 0) * 60);
        return {
          unit: u,
          distKm,
          travelSec,
          totalSec,
          trafficMul,
          closurePenalty,
        };
      });

    if (candidates.length === 0) return null;
    candidates.sort((a, b) => a.totalSec - b.totalSec);
    const best = candidates[0];
    const etaMinutes = Math.round(best.totalSec / 60);
    const etaText = `${etaMinutes} min`;
    return { best, etaText, candidates };
  };

  const handleComputeRoute = () => {
    if (!currentLocation) {
      Alert.alert('No location', 'Current location unknown');
      return;
    }
    setComputingRoute(true);
    setTimeout(() => {
      const result = computeOptimizedRoute(null, currentLocation, rescueUnits, roadClosures, trafficMultipliers);
      setOptimizedRoute(result);
      setComputingRoute(false);
    }, 600);
  };

  const markRescueCompleted = async () => {
    try {
      const raw = await AsyncStorage.getItem(CURRENT_SOS_SESSION_KEY);
      if (!raw) return;
      const session = JSON.parse(raw);
      session.rescueCompleted = true;
      session.active = false;
      await AsyncStorage.setItem(CURRENT_SOS_SESSION_KEY, JSON.stringify(session));
      stopLocationTracking();
      Alert.alert('Rescue Completed', 'Marked rescue as completed. Live broadcasting stopped.');
    } catch (e) {
      console.warn('Failed to mark rescue completed', e?.message || e);
    }
  };

  useEffect(() => {
    const id = setInterval(() => {
      setIncidentDensity((prev) => {
        const variation = (Math.random() - 0.5) * 0.1;
        return Math.max(0, Math.min(1, +(prev + variation).toFixed(3)));
      });
    }, 10000);

    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const computeSafety = () => {
      const hour = new Date().getHours();
      let timePenalty = 0;
      if (hour >= 20 || hour < 6) timePenalty = 25;
      else if (hour >= 18 || hour < 8) timePenalty = 10;

      const score = Math.max(0, Math.min(100, Math.round(100 - incidentDensity * 70 - timePenalty)));
      setSafetyScore(score);
      if (score >= 70) setSafetyLevel('safe');
      else if (score >= 40) setSafetyLevel('caution');
      else setSafetyLevel('high');
    };

    computeSafety();
    const tick = setInterval(computeSafety, 60000);
    return () => clearInterval(tick);
  }, [incidentDensity]);

  const handleSearchDestination = () => {
    if (!destination.trim()) {
      Alert.alert('Error', 'Please enter a destination');
      return;
    }
    setRouteActive(true);
    Alert.alert(
      'Route Calculated',
      `${routeMode === 'safe' ? 'Safe' : 'Direct'} route to "${destination}" is ready`,
      [{ text: 'OK' }]
    );
  };

  const handleModeChange = (mode) => {
    setRouteMode(mode);
    if (routeActive) {
      Alert.alert('Route Updated', `Switched to ${mode === 'safe' ? 'Safe' : 'Direct'} route`);
    }
  };

  const safePoints = [
    { id: 1, name: 'Central Police Station', distance: '0.3 km', phone: '112' },
    { id: 2, name: 'City Hospital', distance: '0.8 km', phone: '108' },
    { id: 3, name: "Women's Safety Hub", distance: '1.2 km', phone: '1091' },
  ];

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Safety Mapping</Text>
        <Text style={styles.subtitle}>Plan your route with live satellite safety tracking</Text>
      </View>

      {/* AI Safety Score Card */}
      <View style={[
        styles.safetyCard,
        safetyLevel === 'safe' ? styles.safetySafe : safetyLevel === 'caution' ? styles.safetyCaution : styles.safetyHigh,
      ]}>
        <Text style={styles.safetyTitle}>AI Safety Score</Text>
        <View style={styles.safetyRow}>
          <Text style={styles.safetyScore}>{safetyScore}</Text>
          <View style={[styles.safetyBadge, { backgroundColor: safetyLevel === 'safe' ? '#4caf50' : safetyLevel === 'caution' ? '#ffb300' : '#f44336' }]}>
            <Text style={styles.safetyBadgeText}>{safetyLevel === 'safe' ? 'Safe' : safetyLevel === 'caution' ? 'Caution' : 'High Risk'}</Text>
          </View>
        </View>
        <Text style={styles.safetyMeta}>Time: {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} • Incidents: {(incidentDensity * 100).toFixed(0)}%</Text>
      </View>

      {/* Live SOS Broadcasting Status */}
      {sosBroadcasting && (
        <View style={styles.broadcastCard}>
          <Text style={styles.broadcastTitle}>🔴 Live Location Broadcasting Active</Text>
          <Text style={styles.broadcastText}>Session: {sosSession?.id || '—'}</Text>
          <Text style={styles.broadcastText}>Started: {sosSession?.startedAt ? new Date(sosSession.startedAt).toLocaleString() : '—'}</Text>
          <Text style={styles.broadcastCoords}>Current: {currentLocation.latitude.toFixed(5)}, {currentLocation.longitude.toFixed(5)}</Text>
          <View style={{ height: 8 }} />
          <TouchableOpacity style={styles.rescueButton} onPress={markRescueCompleted}>
            <Text style={styles.rescueButtonText}>Mark Rescue Completed (Test)</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Current Location Status */}
      <View style={styles.locationCard}>
        <Text style={styles.locationTitle}>📍 Current Location</Text>
        <View style={styles.coordinateRow}>
          <Text style={styles.coordinateLabel}>Latitude:</Text>
          <Text style={styles.coordinateValue}>{currentLocation.latitude.toFixed(4)}</Text>
        </View>
        <View style={styles.coordinateRow}>
          <Text style={styles.coordinateLabel}>Longitude:</Text>
          <Text style={styles.coordinateValue}>{currentLocation.longitude.toFixed(4)}</Text>
        </View>
        <Text style={styles.locationStatus}>✓ GPS Lock acquired</Text>
      </View>

      {/* Destination Search */}
      <View style={styles.searchSection}>
        <Text style={styles.sectionLabel}>Where are you going?</Text>
        <View style={styles.searchContainer}>
          <TextInput
            style={styles.searchInput}
            placeholder="Enter destination address"
            placeholderTextColor="#999"
            value={destination}
            onChangeText={setDestination}
          />
          <TouchableOpacity
            style={styles.searchButton}
            onPress={handleSearchDestination}
          >
            <Text style={styles.searchButtonText}>🔍</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Route Mode Selector */}
      <View style={styles.modeSection}>
        <Text style={styles.sectionLabel}>Route Type</Text>
        <View style={styles.modeButtonsContainer}>
          <TouchableOpacity
            style={[
              styles.modeButton,
              routeMode === 'safe' && styles.modeButtonActive,
            ]}
            onPress={() => handleModeChange('safe')}
          >
            <Text style={styles.modeButtonLabel}>🛡️ Safe Route</Text>
            <Text style={styles.modeButtonDesc}>Well-lit, high safety score</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.modeButton,
              routeMode === 'direct' && styles.modeButtonActive,
            ]}
            onPress={() => handleModeChange('direct')}
          >
            <Text style={styles.modeButtonLabel}>🗺️ Direct Route</Text>
            <Text style={styles.modeButtonDesc}>Shortest distance</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* REAL INTERACTIVE SATELLITE & 3D GOOGLE MAP */}
      <View style={styles.mapContainer}>
        <MapView
          ref={mapRef}
          provider={PROVIDER_GOOGLE}
          style={StyleSheet.absoluteFillObject}
          initialRegion={{
            latitude: currentLocation.latitude,
            longitude: currentLocation.longitude,
            latitudeDelta: 0.015,
            longitudeDelta: 0.015,
          }}
          mapType="hybrid"
          showsUserLocation={true}
          showsBuildings={true}
          showsTraffic={true}
        >
          {/* User Live Marker */}
          <Marker
            coordinate={currentLocation}
            title="Your Location"
            description="Live tracking target"
            pinColor="#3b82f6"
          />

          {/* Rescue Units Markers */}
          {rescueUnits.map((unit) => (
            <Marker
              key={unit.id}
              coordinate={{ latitude: unit.latitude, longitude: unit.longitude }}
              title={unit.name}
              description={unit.available ? 'Ready for Dispatch' : 'Occupied'}
              pinColor={unit.available ? '#22c55e' : '#ef4444'}
            />
          ))}

          {/* Render Safe / Direct Polyline Route */}
          {routeActive && (
            <Polyline
              coordinates={[
                currentLocation,
                { latitude: currentLocation.latitude + 0.003, longitude: currentLocation.longitude + 0.002 },
                { latitude: currentLocation.latitude + 0.006, longitude: currentLocation.longitude + 0.005 },
              ]}
              strokeColor={routeMode === 'safe' ? '#22c55e' : '#f59e0b'}
              strokeWidth={5}
            />
          )}
        </MapView>
      </View>

      {/* Safe Points Along Route */}
      {routeActive && (
        <View style={styles.safePointsSection}>
          <Text style={styles.sectionLabel}>Nearby Emergency Havens</Text>
          <View style={styles.safePointsList}>
            {safePoints.map((point) => (
              <View key={point.id} style={styles.safePointCard}>
                <View style={styles.safePointDot} />
                <View style={styles.safePointInfo}>
                  <Text style={styles.safePointName}>{point.name}</Text>
                  <Text style={styles.safePointDistance}>{point.distance} away</Text>
                </View>
                <TouchableOpacity
                  style={styles.navigateButton}
                  onPress={() => Linking.openURL(`tel:${point.phone}`)}
                >
                  <Text style={styles.navigateButtonText}>📞 Call</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* Emergency Route Optimization Controls */}
      <View style={styles.emergencySection}>
        <Text style={styles.sectionLabel}>Emergency Dispatch Optimization</Text>
        <TouchableOpacity
          style={styles.computeButton}
          onPress={handleComputeRoute}
          disabled={computingRoute}
        >
          <Text style={styles.computeButtonText}>
            {computingRoute ? 'Calculating Rescue Dispatch...' : '⚡ Find Fastest Rescue Unit'}
          </Text>
        </TouchableOpacity>

        {optimizedRoute && (
          <View style={styles.dispatchCard}>
            <Text style={styles.dispatchTitle}>Optimal Unit: {optimizedRoute.best.unit.name}</Text>
            <Text style={styles.dispatchDetail}>Estimated Arrival: {optimizedRoute.etaText}</Text>
            <Text style={styles.dispatchDetail}>Distance: {optimizedRoute.best.distKm.toFixed(2)} km</Text>
            <Text style={styles.dispatchDetail}>Traffic Congestion: {optimizedRoute.best.trafficMul}x</Text>
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  contentContainer: {
    padding: 16,
    paddingBottom: 40,
  },
  header: {
    marginBottom: 20,
    marginTop: 10,
  },
  title: {
    fontSize: 26,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  subtitle: {
    fontSize: 14,
    color: '#94a3b8',
    marginTop: 4,
  },
  safetyCard: {
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
  },
  safetySafe: {
    backgroundColor: 'rgba(76, 175, 80, 0.15)',
    borderColor: '#4caf50',
    borderWidth: 1,
  },
  safetyCaution: {
    backgroundColor: 'rgba(255, 179, 0, 0.15)',
    borderColor: '#ffb300',
    borderWidth: 1,
  },
  safetyHigh: {
    backgroundColor: 'rgba(244, 67, 54, 0.15)',
    borderColor: '#f44336',
    borderWidth: 1,
  },
  safetyTitle: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: 'bold',
    textTransform: 'uppercase',
  },
  safetyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginVertical: 8,
  },
  safetyScore: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  safetyBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  safetyBadgeText: {
    color: '#ffffff',
    fontWeight: 'bold',
    fontSize: 12,
  },
  safetyMeta: {
    color: '#94a3b8',
    fontSize: 12,
  },
  broadcastCard: {
    backgroundColor: 'rgba(220, 38, 38, 0.2)',
    borderColor: '#dc2626',
    borderWidth: 1,
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
  },
  broadcastTitle: {
    color: '#ef4444',
    fontWeight: 'bold',
    fontSize: 15,
    marginBottom: 6,
  },
  broadcastText: {
    color: '#f87171',
    fontSize: 13,
    marginBottom: 2,
  },
  broadcastCoords: {
    color: '#ffffff',
    fontWeight: 'bold',
    fontSize: 13,
    marginTop: 4,
  },
  rescueButton: {
    backgroundColor: '#dc2626',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  rescueButtonText: {
    color: '#ffffff',
    fontWeight: 'bold',
  },
  locationCard: {
    backgroundColor: '#1e293b',
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#334155',
  },
  locationTitle: {
    color: '#ffffff',
    fontWeight: 'bold',
    fontSize: 15,
    marginBottom: 10,
  },
  coordinateRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  coordinateLabel: {
    color: '#94a3b8',
  },
  coordinateValue: {
    color: '#ffffff',
    fontWeight: '600',
  },
  locationStatus: {
    color: '#22c55e',
    fontSize: 12,
    marginTop: 8,
  },
  searchSection: {
    marginBottom: 16,
  },
  sectionLabel: {
    color: '#ffffff',
    fontWeight: '600',
    fontSize: 14,
    marginBottom: 8,
  },
  searchContainer: {
    flexDirection: 'row',
    backgroundColor: '#1e293b',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#334155',
    overflow: 'hidden',
  },
  searchInput: {
    flex: 1,
    padding: 12,
    color: '#ffffff',
  },
  searchButton: {
    padding: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchButtonText: {
    fontSize: 18,
  },
  modeSection: {
    marginBottom: 16,
  },
  modeButtonsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  modeButton: {
    flex: 0.48,
    backgroundColor: '#1e293b',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#334155',
  },
  modeButtonActive: {
    borderColor: '#3b82f6',
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
  },
  modeButtonLabel: {
    color: '#ffffff',
    fontWeight: 'bold',
    fontSize: 14,
    marginBottom: 4,
  },
  modeButtonDesc: {
    color: '#94a3b8',
    fontSize: 11,
  },
  mapContainer: {
    height: 300,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#334155',
    marginBottom: 16,
    overflow: 'hidden',
  },
  safePointsSection: {
    marginBottom: 16,
  },
  safePointsList: {
    backgroundColor: '#1e293b',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#334155',
  },
  safePointCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  safePointDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#22c55e',
    marginRight: 12,
  },
  safePointInfo: {
    flex: 1,
  },
  safePointName: {
    color: '#ffffff',
    fontWeight: '600',
  },
  safePointDistance: {
    color: '#94a3b8',
    fontSize: 12,
  },
  navigateButton: {
    backgroundColor: '#3b82f6',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  navigateButtonText: {
    color: '#ffffff',
    fontWeight: 'bold',
    fontSize: 12,
  },
  emergencySection: {
    marginTop: 8,
  },
  computeButton: {
    backgroundColor: '#2563eb',
    padding: 14,
    borderRadius: 10,
    alignItems: 'center',
    marginBottom: 12,
  },
  computeButtonText: {
    color: '#ffffff',
    fontWeight: 'bold',
    fontSize: 14,
  },
  dispatchCard: {
    backgroundColor: '#1e293b',
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: '#3b82f6',
  },
  dispatchTitle: {
    color: '#ffffff',
    fontWeight: 'bold',
    fontSize: 15,
    marginBottom: 6,
  },
  dispatchDetail: {
    color: '#94a3b8',
    fontSize: 13,
    marginBottom: 2,
  },
});