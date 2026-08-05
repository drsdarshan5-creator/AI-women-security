import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Alert,
} from 'react-native';

export default function FakeCallScreen({ navigation }) {
  const [callActive, setCallActive] = useState(true);
  const [callDuration, setCallDuration] = useState(0);
  const [isRinging, setIsRinging] = useState(true);
  const pulseAnim = React.useRef(new Animated.Value(1)).current;

  // Mock caller data
  const [caller, setCaller] = useState({
    name: 'Unknown Number',
    number: '+1-800-FAKE-911',
    photoEmoji: '👤',
  });

  // Simulate ringing animation
  useEffect(() => {
    if (isRinging) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.1,
            duration: 500,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 500,
            useNativeDriver: true,
          }),
        ])
      ).start();
    }
  }, [isRinging, pulseAnim]);

  // Simulate call duration timer
  useEffect(() => {
    let timer;
    if (callActive && !isRinging) {
      timer = setInterval(() => {
        setCallDuration((prev) => prev + 1);
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [callActive, isRinging]);

  const handleAcceptCall = () => {
    setIsRinging(false);
    Alert.alert(
      'Call Connected',
      `Connected to ${caller.name}. This is a simulation of a fake call feature to alert contacts during emergencies.`,
      [{ text: 'OK' }]
    );
  };

  const handleDeclineCall = () => {
    setCallActive(false);
    Alert.alert(
      'Call Declined',
      'The fake call has been declined. This feature helps alert your trusted contacts in emergency situations.',
      [
        {
          text: 'OK',
          onPress: () => {
            navigation.goBack();
          },
        },
      ]
    );
  };

  const handleEndCall = () => {
    setCallActive(false);
    Alert.alert(
      'Call Ended',
      `Call duration: ${formatTime(callDuration)}. Your emergency contacts have been notified.`,
      [
        {
          text: 'OK',
          onPress: () => {
            navigation.goBack();
          },
        },
      ]
    );
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <View style={styles.container}>
      {/* Background */}
      <View style={styles.background} />

      {/* Call Content */}
      <View style={styles.content}>
        {/* Caller Info Section */}
        <View style={styles.callerSection}>
          {/* Animated Caller Photo */}
          <Animated.View
            style={[
              styles.photoContainer,
              isRinging && { transform: [{ scale: pulseAnim }] },
            ]}
          >
            <Text style={styles.photo}>{caller.photoEmoji}</Text>
          </Animated.View>

          {/* Caller Name */}
          <Text style={styles.callerName}>{caller.name}</Text>
          <Text style={styles.callerNumber}>{caller.number}</Text>

          {/* Status/Duration */}
          <View style={styles.statusContainer}>
            {isRinging && (
              <>
                <Text style={styles.ringingDot}>● </Text>
                <Text style={styles.statusText}>Incoming Call</Text>
              </>
            )}
            {!isRinging && callActive && (
              <>
                <Text style={styles.connectedDot}>● </Text>
                <Text style={styles.statusText}>Connected</Text>
                <Text style={styles.durationText}>{formatTime(callDuration)}</Text>
              </>
            )}
          </View>
        </View>

        {/* Action Buttons */}
        <View style={styles.buttonsContainer}>
          {isRinging ? (
            <>
              {/* Decline Button */}
              <TouchableOpacity
                style={styles.declineButton}
                onPress={handleDeclineCall}
                activeOpacity={0.7}
              >
                <Text style={styles.buttonIcon}>✕</Text>
                <Text style={styles.buttonLabel}>Decline</Text>
              </TouchableOpacity>

              {/* Accept Button */}
              <TouchableOpacity
                style={styles.acceptButton}
                onPress={handleAcceptCall}
                activeOpacity={0.7}
              >
                <Text style={styles.buttonIcon}>☎</Text>
                <Text style={styles.buttonLabel}>Accept</Text>
              </TouchableOpacity>
            </>
          ) : (
            /* End Call Button */
            <>
              <View style={{ flex: 1 }} />
              <TouchableOpacity
                style={styles.endCallButton}
                onPress={handleEndCall}
                activeOpacity={0.7}
              >
                <Text style={styles.buttonIcon}>☎</Text>
                <Text style={styles.buttonLabel}>End Call</Text>
              </TouchableOpacity>
              <View style={{ flex: 1 }} />
            </>
          )}
        </View>

        {/* Info Text */}
        <View style={styles.infoSection}>
          <Text style={styles.infoText}>
            💡 This feature simulates an incoming call to alert your emergency contacts
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a1a',
  },
  background: {
    flex: 1,
    backgroundColor: '#2a2a2a',
  },
  content: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 40,
    paddingHorizontal: 20,
  },
  callerSection: {
    alignItems: 'center',
    marginTop: 40,
  },
  photoContainer: {
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: '#4a4a4a',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 10,
  },
  photo: {
    fontSize: 64,
  },
  callerName: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
    textAlign: 'center',
  },
  callerNumber: {
    fontSize: 14,
    color: '#bbb',
    marginBottom: 16,
    letterSpacing: 0.5,
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringingDot: {
    fontSize: 12,
    color: '#ff6b6b',
    marginRight: 6,
    fontWeight: 'bold',
  },
  connectedDot: {
    fontSize: 12,
    color: '#4caf50',
    marginRight: 6,
    fontWeight: 'bold',
  },
  statusText: {
    fontSize: 14,
    color: '#fff',
    fontWeight: '500',
  },
  durationText: {
    fontSize: 14,
    color: '#4caf50',
    fontWeight: '600',
    marginLeft: 12,
    letterSpacing: 1,
  },
  buttonsContainer: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingBottom: 20,
    gap: 20,
  },
  declineButton: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: '#f44336',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#f44336',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
  },
  acceptButton: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: '#4caf50',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#4caf50',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
  },
  endCallButton: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: '#f44336',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#f44336',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
  },
  buttonIcon: {
    fontSize: 28,
    color: '#fff',
    marginBottom: 4,
  },
  buttonLabel: {
    fontSize: 12,
    color: '#fff',
    fontWeight: '600',
  },
  infoSection: {
    width: '100%',
    paddingHorizontal: 16,
  },
  infoText: {
    fontSize: 12,
    color: '#999',
    textAlign: 'center',
    lineHeight: 16,
  },
});
