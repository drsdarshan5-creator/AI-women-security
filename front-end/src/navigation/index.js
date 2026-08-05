import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import AuthScreen from '../screens/AuthScreen';
import HomeScreen from '../screens/HomeScreen';
import SOSScreen from '../screens/SOSScreen';
import MapScreen from '../screens/MapScreen';
import IncidentReportScreen from '../screens/IncidentReportScreen';

const Stack = createNativeStackNavigator();

export default function AppNavigator() {
  return (
    <NavigationContainer>
      <Stack.Navigator initialRouteName="Auth">
        <Stack.Screen name="Auth" component={AuthScreen} />
        <Stack.Screen name="Home" component={HomeScreen} />
        <Stack.Screen name="SOS" component={SOSScreen} />
        <Stack.Screen name="Map" component={MapScreen} />
        <Stack.Screen name="Report" component={IncidentReportScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
