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
  deleteCell,
  getConfig,
  updateConfig,
  getLeaveComments,
  addLeaveComment,
  deleteLeaveComment,
  changePin,
} from '../services/api';

export default function AdminConfigScreen({ navigation, route }) {
  const { dispatch } = useApp();
  const [activeTab, setActiveTab] = useState(route.params?.tab || 'forklifts');
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

  // PIN
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');

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
          if (ft.data.length > 0 && !selectedTypeId) {
            setSelectedTypeId(ft.data[0].id);
          }
        }
      } else if (activeTab === 'cells') {
        const result = await getCells();
        if (result.success) setCells(result.data);
      } else if (activeTab === 'config') {
        const [config, comments] = await Promise.all([
          getConfig(),
          getLeaveComments(),
        ]);
        if (config.success) {
          setTaskTimeout(config.data.task_timeout_seconds || '300');
          setRequestTimeout(config.data.request_timeout_seconds || '30');
        }
        if (comments.success) setLeaveComments(comments.data);
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to load data');
    }
    setLoading(false);
  };

  const handleAddForklift = async () => {
    if (!newForkliftName.trim()) {
      Alert.alert('Error', 'Forklift name is required');
      return;
    }
    if (!selectedTypeId) {
      Alert.alert('Error', 'Please select a forklift type');
      return;
    }
    setLoading(true);
    const result = await createForklift({
      name: newForkliftName.trim(),
      type_id: selectedTypeId,
    });
    if (result.success) {
      setNewForkliftName('');
      loadData();
    } else {
      Alert.alert('Error', result.message);
    }
    setLoading(false);
  };

  const handleDeleteForklift = (forklift) => {
    Alert.alert(
      'Delete Forklift',
      'Are you sure you want to delete ' + forklift.name + '?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const result = await deleteForklift(forklift.id);
            if (result.success) {
              loadData();
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
      loadData();
    } else {
      Alert.alert('Error', result.message);
    }
    setLoading(false);
  };

  const handleDeleteCell = (cell) => {
    Alert.alert(
      'Delete Cell',
      'Are you sure you want to delete Cell ' + cell.cell_number + '?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const result = await deleteCell(cell.id);
            if (result.success) {
              loadData();
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
      Alert.alert('Success', 'Config saved successfully');
    } else {
      Alert.alert('Error', 'Failed to save config');
    }
    setLoading(false);
  };

  const handleAddComment = async () => {
    if (!newComment.trim()) return;
    const result = await addLeaveComment(newComment.trim());
    if (result.success) {
      setNewComment('');
      loadData();
    } else {
      Alert.alert('Error', result.message);
    }
  };

  const handleDeleteComment = async (id) => {
    const result = await deleteLeaveComment(id);
    if (result.success) loadData();
  };

  const handleChangePin = async () => {
    if (!currentPin || !newPin || !confirmPin) {
      Alert.alert('Error', 'All PIN fields are required');
      return;
    }
    if (newPin !== confirmPin) {
      Alert.alert('Error', 'New PINs do not match');
      return;
    }
    if (newPin.length < 4) {
      Alert.alert('Error', 'PIN must be at least 4 digits');
      return;
    }
    const result = await changePin(currentPin, newPin);
    if (result.success) {
      Alert.alert('Success', 'PIN changed successfully');
      setCurrentPin('');
      setNewPin('');
      setConfirmPin('');
    } else {
      Alert.alert('Error', result.message);
    }
  };

  const handleResetMode = () => {
    Alert.alert(
      'Reset Tablet Mode',
      'This will reset the tablet back to mode selection. Continue?',
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
    { key: 'pin', label: 'PIN' },
  ];

  const renderForkliftsTab = () => (
    <View>
      <Text style={styles.sectionTitle}>Add Forklift</Text>
      <TextInput
        style={styles.input}
        value={newForkliftName}
        onChangeText={setNewForkliftName}
        placeholder="Forklift name (e.g. Forklift A)"
        placeholderTextColor={COLORS.gray}
      />
      <Text style={styles.label}>Select Type</Text>
      <View style={styles.typeRow}>
        {forkliftTypes.map((type) => (
          <TouchableOpacity
            key={type.id}
            style={[
              styles.typeChip,
              selectedTypeId === type.id && styles.typeChipSelected,
            ]}
            onPress={() => setSelectedTypeId(type.id)}
          >
            <Text
              style={[
                styles.typeChipText,
                selectedTypeId === type.id && styles.typeChipTextSelected,
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
        disabled={loading}
      >
        <Text style={styles.addButtonText}>Add Forklift</Text>
      </TouchableOpacity>

      <Text style={[styles.sectionTitle, { marginTop: 24 }]}>
        Existing Forklifts
      </Text>
      {forklifts.length === 0 ? (
        <Text style={styles.emptyText}>No forklifts added yet</Text>
      ) : (
        forklifts.map((f) => (
          <View key={f.id} style={styles.listItem}>
            <View>
              <Text style={styles.listItemTitle}>{f.name}</Text>
              <Text style={styles.listItemSub}>{f.type_name}</Text>
            </View>
            <TouchableOpacity
              style={styles.deleteButton}
              onPress={() => handleDeleteForklift(f)}
            >
              <Text style={styles.deleteButtonText}>Delete</Text>
            </TouchableOpacity>
          </View>
        ))
      )}
    </View>
  );

  const renderCellsTab = () => (
    <View>
      <Text style={styles.sectionTitle}>Add Cell</Text>
      <TextInput
        style={styles.input}
        value={newCellNumber}
        onChangeText={setNewCellNumber}
        placeholder="Cell number (e.g. 1)"
        placeholderTextColor={COLORS.gray}
        keyboardType="numeric"
      />
      <TextInput
        style={styles.input}
        value={newOperatorName}
        onChangeText={setNewOperatorName}
        placeholder="Operator name (optional)"
        placeholderTextColor={COLORS.gray}
      />
      <TouchableOpacity
        style={styles.addButton}
        onPress={handleAddCell}
        disabled={loading}
      >
        <Text style={styles.addButtonText}>Add Cell</Text>
      </TouchableOpacity>

      <Text style={[styles.sectionTitle, { marginTop: 24 }]}>
        Existing Cells
      </Text>
      {cells.length === 0 ? (
        <Text style={styles.emptyText}>No cells added yet</Text>
      ) : (
        cells.map((c) => (
          <View key={c.id} style={styles.listItem}>
            <View>
              <Text style={styles.listItemTitle}>Cell {c.cell_number}</Text>
              {c.operator_name ? (
                <Text style={styles.listItemSub}>{c.operator_name}</Text>
              ) : null}
            </View>
            <TouchableOpacity
              style={styles.deleteButton}
              onPress={() => handleDeleteCell(c)}
            >
              <Text style={styles.deleteButtonText}>Delete</Text>
            </TouchableOpacity>
          </View>
        ))
      )}
    </View>
  );

  const renderConfigTab = () => (
    <View>
      <Text style={styles.sectionTitle}>Timeouts</Text>
      <Text style={styles.label}>Task timeout (seconds)</Text>
      <TextInput
        style={styles.input}
        value={taskTimeout}
        onChangeText={setTaskTimeout}
        keyboardType="numeric"
        placeholderTextColor={COLORS.gray}
      />
      <Text style={styles.label}>Request response timeout (seconds)</Text>
      <TextInput
        style={styles.input}
        value={requestTimeout}
        onChangeText={setRequestTimeout}
        keyboardType="numeric"
        placeholderTextColor={COLORS.gray}
      />
      <TouchableOpacity
        style={styles.addButton}
        onPress={handleSaveConfig}
        disabled={loading}
      >
        <Text style={styles.addButtonText}>Save Config</Text>
      </TouchableOpacity>

      <Text style={[styles.sectionTitle, { marginTop: 24 }]}>
        Leave Comments
      </Text>
      <View style={styles.row}>
        <TextInput
          style={[styles.input, { flex: 1, marginBottom: 0 }]}
          value={newComment}
          onChangeText={setNewComment}
          placeholder="Add leave reason"
          placeholderTextColor={COLORS.gray}
        />
        <TouchableOpacity
          style={styles.inlineAddButton}
          onPress={handleAddComment}
        >
          <Text style={styles.addButtonText}>Add</Text>
        </TouchableOpacity>
      </View>
      {leaveComments.map((c) => (
        <View key={c.id} style={styles.listItem}>
          <Text style={styles.listItemTitle}>{c.comment}</Text>
          <TouchableOpacity
            style={styles.deleteButton}
            onPress={() => handleDeleteComment(c.id)}
          >
            <Text style={styles.deleteButtonText}>Delete</Text>
          </TouchableOpacity>
        </View>
      ))}
    </View>
  );

  const renderPinTab = () => (
    <View>
      <Text style={styles.sectionTitle}>Change Admin PIN</Text>
      <Text style={styles.label}>Current PIN</Text>
      <TextInput
        style={styles.input}
        value={currentPin}
        onChangeText={setCurrentPin}
        keyboardType="numeric"
        secureTextEntry
        maxLength={6}
        placeholderTextColor={COLORS.gray}
        placeholder="Enter current PIN"
      />
      <Text style={styles.label}>New PIN</Text>
      <TextInput
        style={styles.input}
        value={newPin}
        onChangeText={setNewPin}
        keyboardType="numeric"
        secureTextEntry
        maxLength={6}
        placeholderTextColor={COLORS.gray}
        placeholder="Enter new PIN"
      />
      <Text style={styles.label}>Confirm New PIN</Text>
      <TextInput
        style={styles.input}
        value={confirmPin}
        onChangeText={setConfirmPin}
        keyboardType="numeric"
        secureTextEntry
        maxLength={6}
        placeholderTextColor={COLORS.gray}
        placeholder="Confirm new PIN"
      />
      <TouchableOpacity
        style={styles.addButton}
        onPress={handleChangePin}
        disabled={loading}
      >
        <Text style={styles.addButtonText}>Change PIN</Text>
      </TouchableOpacity>

      <Text style={[styles.sectionTitle, { marginTop: 24 }]}>Tablet</Text>
      <TouchableOpacity
        style={[styles.addButton, { backgroundColor: COLORS.danger }]}
        onPress={handleResetMode}
      >
        <Text style={styles.addButtonText}>Reset Tablet Mode</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.backButtonText}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Admin Config</Text>
        <View style={{ width: 60 }} />
      </View>

      <View style={styles.tabBar}>
        {tabs.map((tab) => (
          <TouchableOpacity
            key={tab.key}
            style={[
              styles.tabItem,
              activeTab === tab.key && styles.tabItemActive,
            ]}
            onPress={() => setActiveTab(tab.key)}
          >
            <Text
              style={[
                styles.tabText,
                activeTab === tab.key && styles.tabTextActive,
              ]}
            >
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <ActivityIndicator
          style={{ marginTop: 40 }}
          size="large"
          color={COLORS.primary}
        />
      ) : (
        <ScrollView
          style={styles.content}
          showsVerticalScrollIndicator={false}
        >
          {activeTab === 'forklifts' && renderForkliftsTab()}
          {activeTab === 'cells' && renderCellsTab()}
          {activeTab === 'config' && renderConfigTab()}
          {activeTab === 'pin' && renderPinTab()}
          <View style={{ height: 40 }} />
        </ScrollView>
      )}
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
  tabBar: {
    flexDirection: 'row',
    backgroundColor: COLORS.white,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.lightGray,
  },
  tabItem: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
  },
  tabItemActive: {
    borderBottomWidth: 2,
    borderBottomColor: COLORS.primary,
  },
  tabText: {
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  tabTextActive: {
    color: COLORS.primary,
    fontWeight: 'bold',
  },
  content: {
    flex: 1,
    padding: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 12,
  },
  label: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginBottom: 6,
    marginTop: 4,
  },
  input: {
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    padding: 12,
    fontSize: 15,
    color: COLORS.text,
    marginBottom: 12,
  },
  typeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  typeChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.white,
  },
  typeChipSelected: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  typeChipText: {
    fontSize: 13,
    color: COLORS.text,
  },
  typeChipTextSelected: {
    color: COLORS.white,
    fontWeight: 'bold',
  },
  addButton: {
    backgroundColor: COLORS.primary,
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
  },
  addButtonText: {
    color: COLORS.white,
    fontSize: 15,
    fontWeight: 'bold',
  },
  listItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    borderRadius: 8,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: COLORS.lightGray,
  },
  listItemTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  listItemSub: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2,
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
});