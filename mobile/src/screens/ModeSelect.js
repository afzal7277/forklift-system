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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useApp } from '../context/AppContext';
import { COLORS, TABLET_MODES } from '../constants/config';
import { getCells, getForklifts } from '../services/api';

export default function ModeSelectScreen({ navigation }) {
  const { dispatch } = useApp();

  const [showPinModal, setShowPinModal] = useState(false);
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState('');
  const [loading, setLoading] = useState(false);
  const [pendingMode, setPendingMode] = useState(null);

  const [showCellPicker, setShowCellPicker] = useState(false);
  const [showForkliftPicker, setShowForkliftPicker] = useState(false);
  const [cells, setCells] = useState([]);
  const [forklifts, setForklifts] = useState([]);

  const handleModePress = (mode) => {
    setPendingMode(mode);
    setPin('');
    setPinError('');
    setShowPinModal(true);
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

      if (pendingMode === TABLET_MODES.CELL) {
        const result = await getCells();
        if (result.success) {
          setCells(result.data);
          setShowCellPicker(true);
        } else {
          Alert.alert('Error', 'Could not load cells. Check server connection.');
        }
      } else {
        const result = await getForklifts();
        if (result.success) {
          setForklifts(result.data);
          setShowForkliftPicker(true);
        } else {
          Alert.alert('Error', 'Could not load forklifts. Check server connection.');
        }
      }
    } catch (error) {
      setPinError('Cannot connect to server');
      setLoading(false);
    }
  };

  const handleCellSelect = async (cell) => {
    setShowCellPicker(false);
    await AsyncStorage.setItem('tablet_mode', TABLET_MODES.CELL);
    await AsyncStorage.setItem('cell_data', JSON.stringify(cell));
    dispatch({ type: 'SET_MODE', payload: TABLET_MODES.CELL });
    dispatch({ type: 'SET_CELL_DATA', payload: cell });
  };

  const handleForkliftSelect = async (forklift) => {
    setShowForkliftPicker(false);
    await AsyncStorage.setItem('tablet_mode', TABLET_MODES.FORKLIFT);
    await AsyncStorage.setItem('forklift_data', JSON.stringify(forklift));
    dispatch({ type: 'SET_MODE', payload: TABLET_MODES.FORKLIFT });
    dispatch({ type: 'SET_FORKLIFT_DATA', payload: forklift });
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Forklift Call System</Text>
        <Text style={styles.subtitle}>Select tablet mode to continue</Text>
      </View>

      <View style={styles.buttonContainer}>
        <TouchableOpacity
          style={[styles.modeButton, { backgroundColor: COLORS.primary }]}
          onPress={() => handleModePress(TABLET_MODES.CELL)}
        >
          <Text style={styles.modeIcon}>CELL</Text>
          <Text style={styles.modeTitle}>Cell Mode</Text>
          <Text style={styles.modeDescription}>
            For workstations to request forklifts
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.modeButton, { backgroundColor: COLORS.success }]}
          onPress={() => handleModePress(TABLET_MODES.FORKLIFT)}
        >
          <Text style={styles.modeIcon}>FORKLIFT</Text>
          <Text style={styles.modeTitle}>Forklift Mode</Text>
          <Text style={styles.modeDescription}>
            For forklift drivers to receive requests
          </Text>
        </TouchableOpacity>
      </View>

      {/* PIN Modal */}
      <Modal visible={showPinModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Enter Admin PIN</Text>
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
                style={[styles.modalBtn, { backgroundColor: COLORS.primary }]}
                onPress={handlePinSubmit}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color={COLORS.white} />
                ) : (
                  <Text style={styles.modalBtnText}>Confirm</Text>
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
            {cells.length === 0 ? (
              <Text style={styles.emptyText}>
                No cells configured. Add cells in admin config.
              </Text>
            ) : (
              cells.map((cell) => (
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
              ))
            )}
            <TouchableOpacity
              style={[styles.modalBtn, { backgroundColor: COLORS.lightGray, marginTop: 12 }]}
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
            {forklifts.length === 0 ? (
              <Text style={styles.emptyText}>
                No forklifts configured. Add forklifts in admin config.
              </Text>
            ) : (
              forklifts.map((forklift) => (
                <TouchableOpacity
                  key={forklift.id}
                  style={styles.pickerItem}
                  onPress={() => handleForkliftSelect(forklift)}
                >
                  <Text style={styles.pickerItemTitle}>{forklift.name}</Text>
                  <Text style={styles.pickerItemSub}>{forklift.type_name}</Text>
                </TouchableOpacity>
              ))
            )}
            <TouchableOpacity
              style={[styles.modalBtn, { backgroundColor: COLORS.lightGray, marginTop: 12 }]}
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
    paddingTop: 60,
    paddingBottom: 40,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: COLORS.textSecondary,
  },
  buttonContainer: {
    flex: 1,
    paddingHorizontal: 24,
    gap: 20,
  },
  modeButton: {
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
    elevation: 4,
  },
  modeIcon: {
    fontSize: 14,
    fontWeight: 'bold',
    color: 'rgba(255,255,255,0.7)',
    letterSpacing: 2,
    marginBottom: 8,
  },
  modeTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: COLORS.white,
    marginBottom: 8,
  },
  modeDescription: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.8)',
    textAlign: 'center',
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
    maxHeight: '80%',
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
    fontSize: 18,
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
  emptyText: {
    textAlign: 'center',
    color: COLORS.textSecondary,
    fontSize: 14,
    paddingVertical: 20,
  },
});