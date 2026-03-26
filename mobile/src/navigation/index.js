import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { useApp } from '../context/AppContext';

import ModeSelectScreen from '../screens/ModeSelect';
import AdminModeScreen from '../screens/AdminMode';
import AdminConfigScreen from '../screens/AdminConfig';
import SupervisorDashboardScreen from '../screens/SupervisorDashboard';

import CellHomeScreen from '../screens/cell/CellHome';
import CellWaitingScreen from '../screens/cell/CellWaiting';

import ForkliftHomeScreen from '../screens/forklift/ForkliftHome';
import ForkliftAlertScreen from '../screens/forklift/ForkliftAlert';

const Stack = createStackNavigator();

export default function Navigation() {
  const { state } = useApp();

  return (
    <NavigationContainer>
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
          gestureEnabled: false,
        }}
      >
        {!state.mode ? (
          <>
            <Stack.Screen name="ModeSelect" component={ModeSelectScreen} />
            <Stack.Screen name="AdminMode" component={AdminModeScreen} />
            <Stack.Screen name="AdminConfig" component={AdminConfigScreen} />
            <Stack.Screen name="SupervisorDashboard" component={SupervisorDashboardScreen} />
          </>
        ) : state.mode === 'cell' ? (
          <>
            <Stack.Screen name="CellHome" component={CellHomeScreen} />
            <Stack.Screen name="CellWaiting" component={CellWaitingScreen} />
          </>
        ) : (
          <>
            <Stack.Screen name="ForkliftHome" component={ForkliftHomeScreen} />
            <Stack.Screen name="ForkliftAlert" component={ForkliftAlertScreen} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}