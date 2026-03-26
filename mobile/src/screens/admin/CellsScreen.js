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
import { COLORS } from '../../constants/config';
import { getCells, createCell, deleteCell } from '../../services/api';

export default function CellsScreen({ navigation }) {
  const [cells, setCells] = useState([]);
  const [newCellNumber, setNewCellNumber] = useState('');
  const [newOperatorName, setNewOperatorName] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    const result = await getCells();
    if (result.success) setCells(result.data);
    setLoading(false);
  };

  const handleAdd = async () => {
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
      setLoading(false);
    }
  };

  const handleDelete = (cell) => {
    Alert.alert(
      'Delete Cell',
      'Delete Cell ' + cell.cell_number + '?',
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

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.backButtonText}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Cells</Text>
        <View style={{ width: 60 }} />
      </View>

      {loading ? (
        <ActivityIndicator style={styles.loader} size="large" color={COLORS.primary} />
      ) : (
        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
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
          <TouchableOpacity style={styles.addButton} onPress={handleAdd}>
            <Text style={styles.addButtonText}>Add Cell</Text>
          </TouchableOpacity>

          <Text style={[styles.sectionTitle, { marginTop: 24 }]}>
            Existing Cells ({cells.length})
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
                  onPress={() => handleDelete(c)}
                >
                  <Text style={styles.deleteButtonText}>Delete</Text>
                </TouchableOpacity>
              </View>
            ))
          )}
          <View style={{ height: 40 }} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
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
  backButtonText: { fontSize: 14, color: COLORS.darkGray, fontWeight: 'bold' },
  title: { fontSize: 18, fontWeight: 'bold', color: COLORS.text },
  loader: { marginTop: 40 },
  content: { flex: 1, padding: 20 },
  sectionTitle: { fontSize: 16, fontWeight: 'bold', color: COLORS.text, marginBottom: 12 },
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
  addButton: { backgroundColor: COLORS.primary, borderRadius: 8, padding: 14, alignItems: 'center' },
  addButtonText: { color: COLORS.white, fontSize: 15, fontWeight: 'bold' },
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
  listItemTitle: { fontSize: 15, fontWeight: 'bold', color: COLORS.text },
  listItemSub: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  deleteButton: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6, backgroundColor: COLORS.danger },
  deleteButtonText: { color: COLORS.white, fontSize: 13, fontWeight: 'bold' },
  emptyText: { textAlign: 'center', color: COLORS.textSecondary, fontSize: 14, paddingVertical: 20 },
});