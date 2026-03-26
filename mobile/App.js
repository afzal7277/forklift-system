import React, { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppProvider, useApp } from './src/context/AppContext';
import Navigation from './src/navigation';
import { View, ActivityIndicator } from 'react-native';
import { COLORS } from './src/constants/config';

function AppContent() {
  const { dispatch } = useApp();
  const [restoring, setRestoring] = useState(true);

  useEffect(() => {
    restoreSession();
  }, []);

  const restoreSession = async () => {
    try {
      const mode = await AsyncStorage.getItem('tablet_mode');
      const cellData = await AsyncStorage.getItem('cell_data');
      const forkliftData = await AsyncStorage.getItem('forklift_data');

      if (mode) {
        dispatch({ type: 'SET_MODE', payload: mode });
      }
      if (cellData) {
        dispatch({ type: 'SET_CELL_DATA', payload: JSON.parse(cellData) });
      }
      if (forkliftData) {
        dispatch({
          type: 'SET_FORKLIFT_DATA',
          payload: JSON.parse(forkliftData),
        });
      }
    } catch (error) {
      console.log('Session restore error: ' + error.message);
    }
    setRestoring(false);
  };

  if (restoring) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return <Navigation />;
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AppProvider>
        <StatusBar style="auto" />
        <AppContent />
      </AppProvider>
    </SafeAreaProvider>
  );
}