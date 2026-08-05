import React, { useContext } from 'react';
import { TouchableOpacity, Text } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

// Correct imports matching your actual folder tree
import { AuthProvider, AuthContext } from './src/context/AuthContext';
import AuthScreen from './src/screens/AuthScreen';
import HomeScreen from './src/screens/HomeScreen';
import SOSScreen from './src/screens/SOSScreen';
import MapScreen from './src/screens/MapScreen';
import IncidentReportScreen from './src/screens/IncidentReportScreen';
import FakeCallScreen from './src/screens/FakeCallScreen';
import EmergencyContactsScreen from './src/screens/EmergencyContactsScreen';
import PublicKioskSOSScreen from './src/screens/PublicKioskSOSScreen';
import OfficerEvidenceViewScreen from './src/screens/OfficerEvidenceViewScreen';

const Stack = createNativeStackNavigator();

// Header Logout Button Component
function HeaderLogoutButton() {
  const { logout } = useContext(AuthContext);

  return (
    <TouchableOpacity
      onPress={logout}
      style={{
        backgroundColor: '#ffebee',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 6,
        borderWidth: 1,
        borderColor: '#ef5350',
      }}
    >
      <Text style={{ color: '#d32f2f', fontWeight: 'bold', fontSize: 13 }}>
        Logout
      </Text>
    </TouchableOpacity>
  );
}

function Navigation() {
  const { userToken } = useContext(AuthContext);

  return (
    <NavigationContainer>
      <Stack.Navigator>
        {userToken == null ? (
          /* Authentication Flow */
          <Stack.Screen 
            name="Auth" 
            component={AuthScreen} 
            options={{ headerShown: false }} 
          />
        ) : (
          /* Main Application Flow */
          <>
            <Stack.Screen 
              name="Home" 
              component={HomeScreen} 
              options={{ 
                title: 'Dashboard',
                headerRight: () => <HeaderLogoutButton />,
              }} 
            />
            <Stack.Screen 
              name="SOS" 
              component={SOSScreen} 
              options={{ title: 'SOS Alert' }} 
            />
            <Stack.Screen 
              name="Map" 
              component={MapScreen} 
              options={{ title: 'Map' }} 
            />
            <Stack.Screen 
              name="IncidentReport" 
              component={IncidentReportScreen} 
              options={{ title: 'Report Incident' }} 
            />
            <Stack.Screen 
              name="EmergencyContacts" 
              component={EmergencyContactsScreen} 
              options={{ title: 'Emergency Contacts' }} 
            />
            <Stack.Screen 
              name="PublicKioskSOS" 
              component={PublicKioskSOSScreen} 
              options={{ title: 'Public Kiosk SOS' }} 
            />
            <Stack.Screen 
              name="OfficerEvidence" 
              component={OfficerEvidenceViewScreen} 
              options={{ title: 'Officer Evidence' }} 
            />
            <Stack.Screen 
              name="FakeCall" 
              component={FakeCallScreen} 
              options={{ headerShown: false }} 
            />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Navigation />
    </AuthProvider>
  );
}