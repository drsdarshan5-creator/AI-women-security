import React, { useContext } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { AuthContext } from '../context/AuthContext';

export default function HomeScreen({ navigation }) {
  const { user } = useContext(AuthContext);
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

        {/* AI Safety Chatbot */}
        <TouchableOpacity
          style={[styles.card, styles.chatCard]}
          onPress={() => navigation.navigate('Chat')}
          activeOpacity={0.8}
        >
          <View style={styles.cardIconContainer}>
            <Text style={styles.cardIcon}>🤖</Text>
          </View>
          <Text style={styles.cardTitle}>AI Safety Chatbot</Text>
          <Text style={styles.cardDescription}>Talk to your safety assistant</Text>
        </TouchableOpacity>
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
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 32,
  },
  card: {
    width: '48%',
    minHeight: 170,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 18,
    marginBottom: 14,
    alignItems: 'center',
    justifyContent: 'center',
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
  contactsCard: {
    backgroundColor: '#4caf50',
  },
  officerCard: {
    backgroundColor: '#3f51b5',
  },
  chatCard: {
    backgroundColor: '#6a1b9a',
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
    textAlign: 'center',
    flexShrink: 1,
  },
  cardDescription: {
    fontSize: 12.5,
    color: 'rgba(255, 255, 255, 0.85)',
    textAlign: 'center',
    lineHeight: 18,
    flexShrink: 1,
  },

});