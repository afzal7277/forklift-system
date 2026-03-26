import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useApp } from '../context/AppContext';
import { COLORS } from '../constants/config';
import { getDevices, deleteDevice } from '../services/api';

export default function AdminModeScreen({ navigation }) {
  const { dispatch } = useApp();
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadDevices();
  }, []);

  const loadDevices = async () => {
    setLoading(true);
    const result = await getDevices();
    if (result.success) setDevices(result.data);
    setLoading(false);
  };

  const handleDeleteDevice = (device) => {
    Alert.alert(
      'Remove Device',
      'Remove this device from the system?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            await deleteDevice(device.device_id);
            loadDevices();
          },
        },
      ]
    );
  };

  const handleResetTablet = () => {
    Alert.alert(
      'Reset This Tablet',
      'This will clear the current mode assignment on this tablet.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: async () => {
            await AsyncStorage.removeItem('tablet_mode');
            await AsyncStorage.removeItem('cell_data');
            await AsyncStorage.removeItem('forklift_data');
            dispatch({ type: 'RESET' });
          },
        },
      ]
    );
  };

  const getDeviceStatusColor = (mode) => {
    if (mode === 'cell') return COLORS.primary;
    if (mode === 'forklift') return COLORS.success;
    return COLORS.gray;
  };

  const formatLastSeen = (lastSeen) => {
    if (!lastSeen) return 'Never';
    const diff = Math.floor((Date.now() - new Date(lastSeen)) / 1000);
    if (diff < 60) return diff + 's ago';
    if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
    return Math.floor(diff / 3600) + 'h ago';
  };

  const menuItems = [
    {
      label: 'Forklifts',
      description: 'Add or remove forklifts',
      color: COLORS.success,
      screen: 'AdminConfig',
      params: { tab: 'forklifts' },
    },
    {
      label: 'Cells',
      description: 'Add or remove workstation cells',
      color: COLORS.primary,
      screen: 'AdminConfig',
      params: { tab: 'cells' },
    },
    {
      label: 'System Config',
      description: 'Timeouts and leave comments',
      color: COLORS.warning,
      screen: 'AdminConfig',
      params: { tab: 'config' },
    },
    {
      label: 'Change PIN',
      description: 'Update admin PIN',
      color: COLORS.darkGray,
      screen: 'AdminConfig',
      params: { tab: 'pin' },
    },
    {
      label: 'Supervisor Dashboard',
      description: 'Live status and KPI monitoring',
      color: COLORS.danger,
      screen: 'SupervisorDashboard',
      params: {},
    },
  ];

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.backButtonText}>Exit</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Admin Mode</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>

        {/* Menu Items */}
        <Text style={styles.sectionTitle}>Management</Text>
        {menuItems.map((item) => (
          <TouchableOpacity
            key={item.label}
            style={styles.menuItem}
            onPress={() => navigation.navigate(item.screen, item.params)}
          >
            <View
              style={[styles.menuDot, { backgroundColor: item.color }]}
            />
            <View style={styles.menuText}>
              <Text style={styles.menuLabel}>{item.label}</Text>
              <Text style={styles.menuDescription}>{item.description}</Text>
            </View>
            <Text style={styles.menuArrow}>›</Text>
          </TouchableOpacity>
        ))}

        {/* Registered Devices */}
        <Text style={[styles.sectionTitle, { marginTop: 24 }]}>
          Registered Tablets ({devices.length})
        </Text>
        {devices.length === 0 ? (
          <Text style={styles.emptyText}>No tablets registered yet</Text>
        ) : (
          devices.map((device) => (
            <View key={device.id} style={styles.deviceCard}>
              <View style={styles.deviceInfo}>
                <View style={styles.deviceHeader}>
                  <View
                    style={[
                      styles.deviceModeBadge,
                      { backgroundColor: getDeviceStatusColor(device.mode) },
                    ]}
                  >
                    <Text style={styles.deviceModeBadgeText}>
                      {device.mode ? device.mode.toUpperCase() : 'UNASSIGNED'}
                    </Text>
                  </View>
                  <Text style={styles.deviceLastSeen}>
                    {formatLastSeen(device.last_seen)}
                  </Text>
                </View>
                {device.cell_number ? (
                  <Text style={styles.deviceAssignment}>
                    Cell {device.cell_number}
                  </Text>
                ) : null}
                {device.forklift_name ? (
                  <Text style={styles.deviceAssignment}>
                    {device.forklift_name} ({device.forklift_type_name})
                  </Text>
                ) : null}
                <Text style={styles.deviceId} numberOfLines={1}>
                  ID: {device.device_id}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.deleteButton}
                onPress={() => handleDeleteDevice(device)}
              >
                <Text style={styles.deleteButtonText}>Remove</Text>
              </TouchableOpacity>
            </View>
          ))
        )}

        {/* Reset this tablet */}
        <Text style={[styles.sectionTitle, { marginTop: 24 }]}>
          This Tablet
        </Text>
        <TouchableOpacity
          style={styles.resetButton}
          onPress={handleResetTablet}
        >
          <Text style={styles.resetButtonText}>Reset Tablet Mode</Text>
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    backgroundColor: COLORS.white,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.lightGray,
  },
  backButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: COLORS.lightGray,
    width: 60,
    alignItems: 'center',
  },
  backButtonText: {
    fontSize: 14,
    color: COLORS.darkGray,
    fontWeight: 'bold',
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 12,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    borderRadius: 10,
    padding: 16,
    marginBottom: 8,
    elevation: 2,
    borderWidth: 1,
    borderColor: COLORS.lightGray,
  },
  menuDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 12,
  },
  menuText: {
    flex: 1,
  },
  menuLabel: {
    fontSize: 15,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  menuDescription: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  menuArrow: {
    fontSize: 22,
    color: COLORS.gray,
  },
  deviceCard: {
    backgroundColor: COLORS.white,
    borderRadius: 10,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: COLORS.lightGray,
    flexDirection: 'row',
    alignItems: 'center',
  },
  deviceInfo: {
    flex: 1,
  },
  deviceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  deviceModeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  deviceModeBadgeText: {
    color: COLORS.white,
    fontSize: 11,
    fontWeight: 'bold',
  },
  deviceLastSeen: {
    fontSize: 11,
    color: COLORS.textSecondary,
  },
  deviceAssignment: {
    fontSize: 14,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 2,
  },
  deviceId: {
    fontSize: 10,
    color: COLORS.gray,
    marginTop: 4,
  },
  deleteButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: COLORS.danger,
    borderRadius: 6,
    marginLeft: 8,
  },
  deleteButtonText: {
    color: COLORS.white,
    fontSize: 12,
    fontWeight: 'bold',
  },
  resetButton: {
    backgroundColor: COLORS.danger,
    borderRadius: 10,
    padding: 16,
    alignItems: 'center',
  },
  resetButtonText: {
    color: COLORS.white,
    fontSize: 15,
    fontWeight: 'bold',
  },
  emptyText: {
    textAlign: 'center',
    color: COLORS.textSecondary,
    fontSize: 14,
    paddingVertical: 20,
  },
});