import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  TextInput,
  Modal,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useApp } from '../context/AppContext';
import { COLORS, TABLET_MODES } from '../constants/config';
import { getCells, getForklifts, registerDevice } from '../services/api';
import { getDeviceId } from '../services/device';

export default function ModeSelectScreen({ navigation }) {
  const { dispatch } = useApp();

  const [showPinModal, setShowPinModal] = useState(false);
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState('');
  const [loading, setLoading] = useState(false);

  const [showCellPicker, setShowCellPicker] = useState(false);
  const [showForkliftPicker, setShowForkliftPicker] = useState(false);
  const [cells, setCells] = useState([]);
  const [forklifts, setForklifts] = useState([]);

  const handleAdminPress = () => {
    setPin('');
    setPinError('');
    setShowPinModal(true);
  };

  const handleCellPress = async () => {
    setLoading(true);
    const result = await getCells();
    if (result.success && result.data.length > 0) {
      setCells(result.data);
      setShowCellPicker(true);
    } else {
      Alert.alert(
        'No Cells Found',
        'No cells configured. Ask admin to add cells first.'
      );
    }
    setLoading(false);
  };

  const handleForkliftPress = async () => {
    setLoading(true);
    const result = await getForklifts();
    if (result.success && result.data.length > 0) {
      setForklifts(result.data);
      setShowForkliftPicker(true);
    } else {
      Alert.alert(
        'No Forklifts Found',
        'No forklifts configured. Ask admin to add forklifts first.'
      );
    }
    setLoading(false);
  };

  const handlePinSubmit = async () => {
    if (pin.length < 4) {
      setPinError('PIN must be at least 4 digits');
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(
        require('../constants/config').CONFIG.SERVER_URL + '/api/auth/verify-pin',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pin }),
        }
      );
      const data = await response.json();

      if (!data.success) {
        setPinError('Invalid PIN');
        setLoading(false);
        return;
      }

      setShowPinModal(false);
      setLoading(false);
      navigation.navigate('AdminMode');
    } catch (error) {
      setPinError('Cannot connect to server');
      setLoading(false);
    }
  };

  const handleCellSelect = async (cell) => {
    setShowCellPicker(false);
    setLoading(true);

    const deviceId = await getDeviceId();

    await registerDevice({
      device_id: deviceId,
      mode: TABLET_MODES.CELL,
      cell_id: cell.id,
    });

    await AsyncStorage.setItem('tablet_mode', TABLET_MODES.CELL);
    await AsyncStorage.setItem('cell_data', JSON.stringify(cell));

    dispatch({ type: 'SET_MODE', payload: TABLET_MODES.CELL });
    dispatch({ type: 'SET_CELL_DATA', payload: cell });

    setLoading(false);
  };

  const handleForkliftSelect = async (forklift) => {
    setShowForkliftPicker(false);
    setLoading(true);

    const deviceId = await getDeviceId();

    await registerDevice({
      device_id: deviceId,
      mode: TABLET_MODES.FORKLIFT,
      forklift_id: forklift.id,
    });

    await AsyncStorage.setItem('tablet_mode', TABLET_MODES.FORKLIFT);
    await AsyncStorage.setItem('forklift_data', JSON.stringify(forklift));

    dispatch({ type: 'SET_MODE', payload: TABLET_MODES.FORKLIFT });
    dispatch({ type: 'SET_FORKLIFT_DATA', payload: forklift });

    setLoading(false);
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Forklift Call System</Text>
        <Text style={styles.subtitle}>Select tablet mode</Text>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      ) : (
        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          <TouchableOpacity
            style={[styles.modeButton, { backgroundColor: COLORS.primary }]}
            onPress={handleCellPress}
          >
            <Text style={styles.modeLabel}>WORKSTATION</Text>
            <Text style={styles.modeTitle}>Cell Mode</Text>
            <Text style={styles.modeDescription}>
              For workstations to request forklifts
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.modeButton, { backgroundColor: COLORS.success }]}
            onPress={handleForkliftPress}
          >
            <Text style={styles.modeLabel}>DRIVER</Text>
            <Text style={styles.modeTitle}>Forklift Mode</Text>
            <Text style={styles.modeDescription}>
              For forklift drivers to receive requests
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.modeButton, { backgroundColor: COLORS.darkGray }]}
            onPress={handleAdminPress}
          >
            <Text style={styles.modeLabel}>RESTRICTED</Text>
            <Text style={styles.modeTitle}>Admin Mode</Text>
            <Text style={styles.modeDescription}>
              System configuration and monitoring
            </Text>
          </TouchableOpacity>
        </ScrollView>
      )}

      {/* PIN Modal */}
      <Modal visible={showPinModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Admin PIN</Text>
            <TextInput
              style={styles.pinInput}
              value={pin}
              onChangeText={(text) => {
                setPin(text);
                setPinError('');
              }}
              keyboardType="numeric"
              secureTextEntry
              maxLength={6}
              placeholder="Enter PIN"
              placeholderTextColor={COLORS.gray}
            />
            {pinError ? (
              <Text style={styles.errorText}>{pinError}</Text>
            ) : null}
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: COLORS.lightGray }]}
                onPress={() => setShowPinModal(false)}
              >
                <Text style={[styles.modalBtnText, { color: COLORS.darkGray }]}>
                  Cancel
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: COLORS.darkGray }]}
                onPress={handlePinSubmit}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color={COLORS.white} />
                ) : (
                  <Text style={styles.modalBtnText}>Enter</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Cell Picker Modal */}
      <Modal visible={showCellPicker} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.pickerBox}>
            <Text style={styles.modalTitle}>Select Cell</Text>
            <ScrollView>
              {cells.map((cell) => (
                <TouchableOpacity
                  key={cell.id}
                  style={styles.pickerItem}
                  onPress={() => handleCellSelect(cell)}
                >
                  <Text style={styles.pickerItemTitle}>
                    Cell {cell.cell_number}
                  </Text>
                  {cell.operator_name ? (
                    <Text style={styles.pickerItemSub}>
                      {cell.operator_name}
                    </Text>
                  ) : null}
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity
              style={[styles.modalBtn, {
                backgroundColor: COLORS.lightGray,
                marginTop: 12,
              }]}
              onPress={() => setShowCellPicker(false)}
            >
              <Text style={[styles.modalBtnText, { color: COLORS.darkGray }]}>
                Cancel
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Forklift Picker Modal */}
      <Modal visible={showForkliftPicker} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.pickerBox}>
            <Text style={styles.modalTitle}>Select Forklift</Text>
            <ScrollView>
              {forklifts.map((forklift) => (
                <TouchableOpacity
                  key={forklift.id}
                  style={styles.pickerItem}
                  onPress={() => handleForkliftSelect(forklift)}
                >
                  <Text style={styles.pickerItemTitle}>{forklift.name}</Text>
                  <Text style={styles.pickerItemSub}>{forklift.type_name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity
              style={[styles.modalBtn, {
                backgroundColor: COLORS.lightGray,
                marginTop: 12,
              }]}
              onPress={() => setShowForkliftPicker(false)}
            >
              <Text style={[styles.modalBtnText, { color: COLORS.darkGray }]}>
                Cancel
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    alignItems: 'center',
    paddingTop: 48,
    paddingBottom: 32,
    paddingHorizontal: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 15,
    color: COLORS.textSecondary,
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modeButton: {
    borderRadius: 16,
    padding: 28,
    marginBottom: 16,
    elevation: 4,
  },
  modeLabel: {
    fontSize: 11,
    fontWeight: 'bold',
    color: 'rgba(255,255,255,0.7)',
    letterSpacing: 2,
    marginBottom: 6,
  },
  modeTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: COLORS.white,
    marginBottom: 6,
  },
  modeDescription: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.8)',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalBox: {
    backgroundColor: COLORS.white,
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 400,
  },
  pickerBox: {
    backgroundColor: COLORS.white,
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    maxHeight: '70%',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 16,
    textAlign: 'center',
  },
  pinInput: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    padding: 12,
    fontSize: 24,
    textAlign: 'center',
    letterSpacing: 8,
    marginBottom: 8,
    color: COLORS.text,
  },
  errorText: {
    color: COLORS.danger,
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 8,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  modalBtn: {
    flex: 1,
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
  },
  modalBtnText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: COLORS.white,
  },
  pickerItem: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.lightGray,
  },
  pickerItemTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  pickerItemSub: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
});