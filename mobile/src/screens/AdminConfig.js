import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  TextInput,
  Alert,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useApp } from '../context/AppContext';
import { COLORS } from '../constants/config';
import {
  getForklifts,
  getForkliftTypes,
  createForklift,
  deleteForklift,
  getCells,
  createCell,
  updateCell,
  deleteCell,
  getConfig,
  updateConfig,
  getLeaveComments,
  addLeaveComment,
  deleteLeaveComment,
  changePin,
} from '../services/api';

export default function AdminConfigScreen({ navigation }) {
  const { dispatch } = useApp();

  const [activeTab, setActiveTab] = useState('forklifts');
  const [loading, setLoading] = useState(false);

  // Forklifts
  const [forklifts, setForklifts] = useState([]);
  const [forkliftTypes, setForkliftTypes] = useState([]);
  const [newForkliftName, setNewForkliftName] = useState('');
  const [selectedTypeId, setSelectedTypeId] = useState(null);

  // Cells
  const [cells, setCells] = useState([]);
  const [newCellNumber, setNewCellNumber] = useState('');
  const [newOperatorName, setNewOperatorName] = useState('');

  // Config
  const [taskTimeout, setTaskTimeout] = useState('');
  const [requestTimeout, setRequestTimeout] = useState('');

  // Leave comments
  const [leaveComments, setLeaveComments] = useState([]);
  const [newComment, setNewComment] = useState('');

  // PIN change
  const [showPinModal, setShowPinModal] = useState(false);
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [pinError, setPinError] = useState('');

  useEffect(() => {
    loadData();
  }, [activeTab]);

  const loadData = async () => {
    setLoading(true);
    try {
      if (activeTab === 'forklifts') {
        const [f, ft] = await Promise.all([getForklifts(), getForkliftTypes()]);
        if (f.success) setForklifts(f.data);
        if (ft.success) {
          setForkliftTypes(ft.data);
          if (ft.data.length > 0) setSelectedTypeId(ft.data[0].id);
        }
      } else if (activeTab === 'cells') {
        const c = await getCells();
        if (c.success) setCells(c.data);
      } else if (activeTab === 'config') {
        const [cfg, lc] = await Promise.all([getConfig(), getLeaveComments()]);
        if (cfg.success) {
          setTaskTimeout(cfg.data.task_timeout_seconds || '300');
          setRequestTimeout(cfg.data.request_timeout_seconds || '30');
        }
        if (lc.success) setLeaveComments(lc.data);
      }
    } catch (error) {
      Alert.alert('Error', 'Could not load data');
    }
    setLoading(false);
  };

  const handleAddForklift = async () => {
    if (!newForkliftName.trim()) {
      Alert.alert('Error', 'Forklift name is required');
      return;
    }
    if (!selectedTypeId) {
      Alert.alert('Error', 'Select a forklift type');
      return;
    }

    setLoading(true);
    const result = await createForklift({
      name: newForkliftName.trim(),
      type_id: selectedTypeId,
    });

    if (result.success) {
      setNewForkliftName('');
      await loadData();
    } else {
      Alert.alert('Error', result.message);
    }
    setLoading(false);
  };

  const handleDeleteForklift = (id, name) => {
    Alert.alert(
      'Delete Forklift',
      'Are you sure you want to delete ' + name + '?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const result = await deleteForklift(id);
            if (result.success) {
              await loadData();
            } else {
              Alert.alert('Error', result.message);
            }
          },
        },
      ]
    );
  };

  const handleAddCell = async () => {
    if (!newCellNumber.trim()) {
      Alert.alert('Error', 'Cell number is required');
      return;
    }

    setLoading(true);
    const result = await createCell({
      cell_number: newCellNumber.trim(),
      operator_name: newOperatorName.trim() || null,
    });

    if (result.success) {
      setNewCellNumber('');
      setNewOperatorName('');
      await loadData();
    } else {
      Alert.alert('Error', result.message);
    }
    setLoading(false);
  };

  const handleDeleteCell = (id, cell_number) => {
    Alert.alert(
      'Delete Cell',
      'Are you sure you want to delete Cell ' + cell_number + '?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const result = await deleteCell(id);
            if (result.success) {
              await loadData();
            } else {
              Alert.alert('Error', result.message);
            }
          },
        },
      ]
    );
  };

  const handleSaveConfig = async () => {
    setLoading(true);
    const [r1, r2] = await Promise.all([
      updateConfig('task_timeout_seconds', taskTimeout),
      updateConfig('request_timeout_seconds', requestTimeout),
    ]);

    if (r1.success && r2.success) {
      Alert.alert('Success', 'Configuration saved');
    } else {
      Alert.alert('Error', 'Could not save configuration');
    }
    setLoading(false);
  };

  const handleAddComment = async () => {
    if (!newComment.trim()) return;

    const result = await addLeaveComment(newComment.trim());
    if (result.success) {
      setNewComment('');
      await loadData();
    } else {
      Alert.alert('Error', result.message);
    }
  };

  const handleDeleteComment = async (id) => {
    const result = await deleteLeaveComment(id);
    if (result.success) {
      await loadData();
    }
  };

  const handleChangePin = async () => {
    if (!currentPin || !newPin || !confirmPin) {
      setPinError('All fields are required');
      return;
    }
    if (newPin !== confirmPin) {
      setPinError('New PINs do not match');
      return;
    }
    if (newPin.length < 4) {
      setPinError('PIN must be at least 4 digits');
      return;
    }

    const result = await changePin(currentPin, newPin);
    if (result.success) {
      setShowPinModal(false);
      setCurrentPin('');
      setNewPin('');
      setConfirmPin('');
      setPinError('');
      Alert.alert('Success', 'PIN changed successfully');
    } else {
      setPinError(result.message);
    }
  };

  const handleResetMode = async () => {
    Alert.alert(
      'Reset Tablet Mode',
      'This will return to mode selection screen. Continue?',
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

  const tabs = [
    { key: 'forklifts', label: 'Forklifts' },
    { key: 'cells', label: 'Cells' },
    { key: 'config', label: 'Config' },
  ];

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.backButtonText}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Admin Configuration</Text>
        <TouchableOpacity
          style={styles.resetButton}
          onPress={handleResetMode}
        >
          <Text style={styles.resetButtonText}>Reset Mode</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.tabBar}>
        {tabs.map((tab) => (
          <TouchableOpacity
            key={tab.key}
            style={[
              styles.tab,
              activeTab === tab.key && styles.activeTab,
            ]}
            onPress={() => setActiveTab(tab.key)}
          >
            <Text
              style={[
                styles.tabText,
                activeTab === tab.key && styles.activeTabText,
              ]}
            >
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <ActivityIndicator
          size="large"
          color={COLORS.primary}
          style={styles.loader}
        />
      ) : (
        <ScrollView style={styles.content}>

          {/* Forklifts Tab */}
          {activeTab === 'forklifts' && (
            <View>
              <Text style={styles.sectionTitle}>Add Forklift</Text>
              <TextInput
                style={styles.input}
                placeholder="Forklift name (e.g. Forklift 1)"
                placeholderTextColor={COLORS.gray}
                value={newForkliftName}
                onChangeText={setNewForkliftName}
              />
              <Text style={styles.label}>Forklift Type</Text>
              <View style={styles.typeRow}>
                {forkliftTypes.map((type) => (
                  <TouchableOpacity
                    key={type.id}
                    style={[
                      styles.typeChip,
                      selectedTypeId === type.id && styles.typeChipActive,
                    ]}
                    onPress={() => setSelectedTypeId(type.id)}
                  >
                    <Text
                      style={[
                        styles.typeChipText,
                        selectedTypeId === type.id && styles.typeChipTextActive,
                      ]}
                    >
                      {type.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TouchableOpacity
                style={styles.addButton}
                onPress={handleAddForklift}
              >
                <Text style={styles.addButtonText}>Add Forklift</Text>
              </TouchableOpacity>

              <Text style={styles.sectionTitle}>Registered Forklifts</Text>
              {forklifts.length === 0 ? (
                <Text style={styles.emptyText}>No forklifts registered yet</Text>
              ) : (
                forklifts.map((forklift) => (
                  <View key={forklift.id} style={styles.listItem}>
                    <View style={styles.listItemInfo}>
                      <Text style={styles.listItemTitle}>{forklift.name}</Text>
                      <Text style={styles.listItemSub}>{forklift.type_name}</Text>
                    </View>
                    <View style={[
                      styles.statusBadge,
                      { backgroundColor: COLORS[forklift.status] || COLORS.gray }
                    ]}>
                      <Text style={styles.statusBadgeText}>{forklift.status}</Text>
                    </View>
                    <TouchableOpacity
                      style={styles.deleteButton}
                      onPress={() => handleDeleteForklift(forklift.id, forklift.name)}
                    >
                      <Text style={styles.deleteButtonText}>Delete</Text>
                    </TouchableOpacity>
                  </View>
                ))
              )}
            </View>
          )}

          {/* Cells Tab */}
          {activeTab === 'cells' && (
            <View>
              <Text style={styles.sectionTitle}>Add Cell</Text>
              <TextInput
                style={styles.input}
                placeholder="Cell number (e.g. 101)"
                placeholderTextColor={COLORS.gray}
                value={newCellNumber}
                onChangeText={setNewCellNumber}
                keyboardType="numeric"
              />
              <TextInput
                style={styles.input}
                placeholder="Operator name (optional)"
                placeholderTextColor={COLORS.gray}
                value={newOperatorName}
                onChangeText={setNewOperatorName}
              />
              <TouchableOpacity
                style={styles.addButton}
                onPress={handleAddCell}
              >
                <Text style={styles.addButtonText}>Add Cell</Text>
              </TouchableOpacity>

              <Text style={styles.sectionTitle}>Registered Cells</Text>
              {cells.length === 0 ? (
                <Text style={styles.emptyText}>No cells registered yet</Text>
              ) : (
                cells.map((cell) => (
                  <View key={cell.id} style={styles.listItem}>
                    <View style={styles.listItemInfo}>
                      <Text style={styles.listItemTitle}>
                        Cell {cell.cell_number}
                      </Text>
                      {cell.operator_name ? (
                        <Text style={styles.listItemSub}>
                          {cell.operator_name}
                        </Text>
                      ) : null}
                    </View>
                    <TouchableOpacity
                      style={styles.deleteButton}
                      onPress={() => handleDeleteCell(cell.id, cell.cell_number)}
                    >
                      <Text style={styles.deleteButtonText}>Delete</Text>
                    </TouchableOpacity>
                  </View>
                ))
              )}
            </View>
          )}

          {/* Config Tab */}
          {activeTab === 'config' && (
            <View>
              <Text style={styles.sectionTitle}>Timeout Settings</Text>
              <Text style={styles.label}>
                Task timeout (seconds) — how long before forklift is auto-freed
              </Text>
              <TextInput
                style={styles.input}
                value={taskTimeout}
                onChangeText={setTaskTimeout}
                keyboardType="numeric"
                placeholder="300"
                placeholderTextColor={COLORS.gray}
              />
              <Text style={styles.label}>
                Request timeout (seconds) — how long driver has to respond
              </Text>
              <TextInput
                style={styles.input}
                value={requestTimeout}
                onChangeText={setRequestTimeout}
                keyboardType="numeric"
                placeholder="30"
                placeholderTextColor={COLORS.gray}
              />
              <TouchableOpacity
                style={styles.addButton}
                onPress={handleSaveConfig}
              >
                <Text style={styles.addButtonText}>Save Settings</Text>
              </TouchableOpacity>

              <Text style={styles.sectionTitle}>Leave Comments</Text>
              <View style={styles.row}>
                <TextInput
                  style={[styles.input, { flex: 1, marginBottom: 0 }]}
                  placeholder="Add comment..."
                  placeholderTextColor={COLORS.gray}
                  value={newComment}
                  onChangeText={setNewComment}
                />
                <TouchableOpacity
                  style={styles.inlineAddButton}
                  onPress={handleAddComment}
                >
                  <Text style={styles.addButtonText}>Add</Text>
                </TouchableOpacity>
              </View>
              {leaveComments.map((item) => (
                <View key={item.id} style={styles.listItem}>
                  <Text style={[styles.listItemTitle, { flex: 1 }]}>
                    {item.comment}
                  </Text>
                  <TouchableOpacity
                    style={styles.deleteButton}
                    onPress={() => handleDeleteComment(item.id)}
                  >
                    <Text style={styles.deleteButtonText}>Delete</Text>
                  </TouchableOpacity>
                </View>
              ))}

              <Text style={styles.sectionTitle}>Security</Text>
              <TouchableOpacity
                style={[styles.addButton, { backgroundColor: COLORS.warning }]}
                onPress={() => setShowPinModal(true)}
              >
                <Text style={styles.addButtonText}>Change Admin PIN</Text>
              </TouchableOpacity>
            </View>
          )}

          <View style={{ height: 40 }} />
        </ScrollView>
      )}

      {/* Change PIN Modal */}
      <Modal visible={showPinModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Change Admin PIN</Text>
            <TextInput
              style={styles.input}
              placeholder="Current PIN"
              placeholderTextColor={COLORS.gray}
              value={currentPin}
              onChangeText={setCurrentPin}
              keyboardType="numeric"
              secureTextEntry
              maxLength={6}
            />
            <TextInput
              style={styles.input}
              placeholder="New PIN"
              placeholderTextColor={COLORS.gray}
              value={newPin}
              onChangeText={setNewPin}
              keyboardType="numeric"
              secureTextEntry
              maxLength={6}
            />
            <TextInput
              style={styles.input}
              placeholder="Confirm New PIN"
              placeholderTextColor={COLORS.gray}
              value={confirmPin}
              onChangeText={setConfirmPin}
              keyboardType="numeric"
              secureTextEntry
              maxLength={6}
            />
            {pinError ? (
              <Text style={styles.errorText}>{pinError}</Text>
            ) : null}
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: COLORS.lightGray }]}
                onPress={() => {
                  setShowPinModal(false);
                  setPinError('');
                }}
              >
                <Text style={[styles.modalBtnText, { color: COLORS.darkGray }]}>
                  Cancel
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: COLORS.primary }]}
                onPress={handleChangePin}
              >
                <Text style={styles.modalBtnText}>Change PIN</Text>
              </TouchableOpacity>
            </View>
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: COLORS.white,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.lightGray,
  },
  backButton: {
    padding: 8,
  },
  backButtonText: {
    color: COLORS.primary,
    fontSize: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  resetButton: {
    padding: 8,
  },
  resetButtonText: {
    color: COLORS.danger,
    fontSize: 14,
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: COLORS.white,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.lightGray,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
  },
  activeTab: {
    borderBottomWidth: 2,
    borderBottomColor: COLORS.primary,
  },
  tabText: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  activeTabText: {
    color: COLORS.primary,
    fontWeight: 'bold',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  loader: {
    flex: 1,
    justifyContent: 'center',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: COLORS.text,
    marginTop: 20,
    marginBottom: 12,
  },
  label: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    padding: 12,
    fontSize: 15,
    color: COLORS.text,
    backgroundColor: COLORS.white,
    marginBottom: 12,
  },
  typeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  typeChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.white,
  },
  typeChipActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  typeChipText: {
    fontSize: 14,
    color: COLORS.text,
  },
  typeChipTextActive: {
    color: COLORS.white,
    fontWeight: 'bold',
  },
  addButton: {
    backgroundColor: COLORS.primary,
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
    marginBottom: 8,
  },
  addButtonText: {
    color: COLORS.white,
    fontSize: 15,
    fontWeight: 'bold',
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: COLORS.lightGray,
  },
  listItemInfo: {
    flex: 1,
  },
  listItemTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  listItemSub: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    marginRight: 8,
  },
  statusBadgeText: {
    color: COLORS.white,
    fontSize: 11,
    fontWeight: 'bold',
  },
  deleteButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: COLORS.danger,
  },
  deleteButtonText: {
    color: COLORS.white,
    fontSize: 13,
    fontWeight: 'bold',
  },
  emptyText: {
    textAlign: 'center',
    color: COLORS.textSecondary,
    fontSize: 14,
    paddingVertical: 20,
  },
  row: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  inlineAddButton: {
    backgroundColor: COLORS.primary,
    borderRadius: 8,
    paddingHorizontal: 16,
    justifyContent: 'center',
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
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 16,
    textAlign: 'center',
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
  errorText: {
    color: COLORS.danger,
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 8,
  },
});