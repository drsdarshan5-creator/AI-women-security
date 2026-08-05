import React, { useContext } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { AuthContext } from '../context/AuthContext';

export default function HomeScreen({ navigation }) {
  const { user, logout } = useContext(AuthContext);
  const greetingText = user?.name ? `Welcome back, ${user.name}` : 'Welcome Back';

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      {/* Header Section */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View style={{ flex: 1 }}>
            <Text style={styles.greeting}>{greetingText}</Text>
            <Text style={styles.title}>AI Women's Security</Text>
          </View>
          <TouchableOpacity style={styles.logoutButton} onPress={logout}>
            <Text style={styles.logoutText}>Logout</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.subtitle}>Stay safe, stay empowered</Text>
      </View>

      {/* Quick Actions Title */}
      <Text style={styles.sectionTitle}>Quick Actions</Text>

      {/* Action Cards */}
      <View style={styles.cardsContainer}>
        {/* Send SOS Card */}
        <TouchableOpacity
          style={[styles.card, styles.sosCard]}
          onPress={() => navigation.navigate('SOS')}
          activeOpacity={0.8}
        >
          <View style={styles.cardIconContainer}>
            <Text style={styles.cardIcon}>🆘</Text>
          </View>
          <Text style={styles.cardTitle}>Send SOS</Text>
          <Text style={styles.cardDescription}>Trigger emergency alert</Text>
        </TouchableOpacity>

        {/* Safety Map Card */}
        <TouchableOpacity
          style={[styles.card, styles.mapCard]}
          onPress={() => navigation.navigate('Map')}
          activeOpacity={0.8}
        >
          <View style={styles.cardIconContainer}>
            <Text style={styles.cardIcon}>🗺️</Text>
          </View>
          <Text style={styles.cardTitle}>Safety Map</Text>
          <Text style={styles.cardDescription}>Plan safe routes</Text>
        </TouchableOpacity>

        {/* Report Incident Card */}
        <TouchableOpacity
          style={[styles.card, styles.reportCard]}
          onPress={() => navigation.navigate('IncidentReport')}
          activeOpacity={0.8}
        >
          <View style={styles.cardIconContainer}>
            <Text style={styles.cardIcon}>📋</Text>
          </View>
          <Text style={styles.cardTitle}>Report Incident</Text>
          <Text style={styles.cardDescription}>Document an incident</Text>
        </TouchableOpacity>

        {/* Fake Call Card */}
        <TouchableOpacity
          style={[styles.card, styles.callCard]}
          onPress={() => navigation.navigate('FakeCall')}
          activeOpacity={0.8}
        >
          <View style={styles.cardIconContainer}>
            <Text style={styles.cardIcon}>☎️</Text>
          </View>
          <Text style={styles.cardTitle}>Fake Call</Text>
          <Text style={styles.cardDescription}>Trigger fake incoming call</Text>
        </TouchableOpacity>

        {/* Emergency Contacts Management */}
        <TouchableOpacity
          style={[styles.card, styles.contactsCard]}
          onPress={() => navigation.navigate('EmergencyContacts')}
          activeOpacity={0.8}
        >
          <View style={styles.cardIconContainer}>
            <Text style={styles.cardIcon}>👥</Text>
          </View>
          <Text style={styles.cardTitle}>Emergency Contacts</Text>
          <Text style={styles.cardDescription}>Manage your 3 priority contacts</Text>
        </TouchableOpacity>

        {/* Public Kiosk Mode */}
        <TouchableOpacity
          style={[styles.card, styles.kioskCard]}
          onPress={() => navigation.navigate('PublicKioskSOS')}
          activeOpacity={0.8}
        >
          <View style={styles.cardIconContainer}>
            <Text style={styles.cardIcon}>🏧</Text>
          </View>
          <Text style={styles.cardTitle}>Public Kiosk Mode</Text>
          <Text style={styles.cardDescription}>Simulated public SOS kiosk</Text>
        </TouchableOpacity>

        {/* Officer Evidence Portal */}
        <TouchableOpacity
          style={[styles.card, styles.officerCard]}
          onPress={() => navigation.navigate('OfficerEvidence')}
          activeOpacity={0.8}
        >
          <View style={styles.cardIconContainer}>
            <Text style={styles.cardIcon}>👮</Text>
          </View>
          <Text style={styles.cardTitle}>Officer Evidence Portal</Text>
          <Text style={styles.cardDescription}>Authorized access for rescue officers</Text>
        </TouchableOpacity>
      </View>

      {/* Features Section */}
      <View style={styles.featuresSection}>
        <Text style={styles.sectionTitle}>Features</Text>
        <View style={styles.featuresList}>
          <View style={styles.featureItem}>
            <Text style={styles.featureBullet}>✓</Text>
            <Text style={styles.featureText}>Real-time location sharing</Text>
          </View>
          <View style={styles.featureItem}>
            <Text style={styles.featureBullet}>✓</Text>
            <Text style={styles.featureText}>Emergency contact notifications</Text>
          </View>
          <View style={styles.featureItem}>
            <Text style={styles.featureBullet}>✓</Text>
            <Text style={styles.featureText}>Safe route recommendations</Text>
          </View>
          <View style={styles.featureItem}>
            <Text style={styles.featureBullet}>✓</Text>
            <Text style={styles.featureText}>Incident documentation</Text>
          </View>
        </View>
      </View>

      {/* Safety Tips */}
      <View style={styles.tipsBox}>
        <Text style={styles.tipsTitle}>💡 Daily Safety Tip</Text>
        <Text style={styles.tipsText}>
          Always share your location with trusted friends when traveling alone. Check in with them when you arrive safely.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  contentContainer: {
    padding: 16,
    paddingBottom: 40,
  },
  header: {
    marginBottom: 32,
    marginTop: 8,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  logoutButton: {
    backgroundColor: '#ffebee',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ef5350',
  },
  logoutText: {
    color: '#d32f2f',
    fontWeight: 'bold',
    fontSize: 13,
  },
  greeting: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  title: {
    fontSize: 26,
    fontWeight: 'bold',
    color: '#1a1a1a',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: '#999',
    fontStyle: 'italic',
    marginTop: 4,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 16,
    marginTop: 8,
  },
  cardsContainer: {
    gap: 14,
    marginBottom: 32,
  },
  card: {
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 5,
  },
  sosCard: {
    backgroundColor: '#f44336',
  },
  mapCard: {
    backgroundColor: '#2196f3',
  },
  reportCard: {
    backgroundColor: '#ff9800',
  },
  callCard: {
    backgroundColor: '#9c27b0',
  },
  contactsCard: {
    backgroundColor: '#4caf50',
  },
  kioskCard: {
    backgroundColor: '#d32f2f',
  },
  officerCard: {
    backgroundColor: '#3f51b5',
  },
  cardIconContainer: {
    marginBottom: 12,
  },
  cardIcon: {
    fontSize: 40,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 6,
  },
  cardDescription: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.85)',
    textAlign: 'center',
    lineHeight: 18,
  },
  featuresSection: {
    marginBottom: 24,
  },
  featuresList: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  featureBullet: {
    fontSize: 16,
    color: '#4caf50',
    fontWeight: 'bold',
    marginTop: 2,
  },
  featureText: {
    fontSize: 13,
    color: '#555',
    flex: 1,
    lineHeight: 18,
  },
  tipsBox: {
    backgroundColor: '#fff3e0',
    borderRadius: 12,
    padding: 16,
    borderLeftWidth: 4,
    borderLeftColor: '#ff9800',
  },
  tipsTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#e65100',
    marginBottom: 8,
  },
  tipsText: {
    fontSize: 13,
    color: '#d84315',
    lineHeight: 18,
  },
});