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
import {
  getConfig,
  updateConfig,
  getLeaveComments,
  addLeaveComment,
  deleteLeaveComment,
} from '../../services/api';

export default function SystemConfigScreen({ navigation }) {
  const [taskTimeout, setTaskTimeout] = useState('');
  const [requestTimeout, setRequestTimeout] = useState('');
  const [leaveComments, setLeaveComments] = useState([]);
  const [newComment, setNewComment] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    const [config, comments] = await Promise.all([
      getConfig(),
      getLeaveComments(),
    ]);
    if (config.success) {
      setTaskTimeout(config.data.task_timeout_seconds || '300');
      setRequestTimeout(config.data.request_timeout_seconds || '30');
    }
    if (comments.success) setLeaveComments(comments.data);
    setLoading(false);
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
    Alert.alert(
      'Delete Comment',
      'Delete this leave reason?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const result = await deleteLeaveComment(id);
            if (result.success) loadData();
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
        <Text style={styles.title}>System Config</Text>
        <View style={{ width: 60 }} />
      </View>

      {loading ? (
        <ActivityIndicator style={styles.loader} size="large" color={COLORS.primary} />
      ) : (
        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
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
          <TouchableOpacity style={styles.addButton} onPress={handleSaveConfig}>
            <Text style={styles.addButtonText}>Save Config</Text>
          </TouchableOpacity>

          <Text style={[styles.sectionTitle, { marginTop: 24 }]}>
            Leave Reasons
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
          <View style={{ height: 12 }} />
          {leaveComments.length === 0 ? (
            <Text style={styles.emptyText}>No leave reasons added yet</Text>
          ) : (
            leaveComments.map((c) => (
              <View key={c.id} style={styles.listItem}>
                <Text style={styles.listItemTitle}>{c.comment}</Text>
                <TouchableOpacity
                  style={styles.deleteButton}
                  onPress={() => handleDeleteComment(c.id)}
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
  label: { fontSize: 13, color: COLORS.textSecondary, marginBottom: 6 },
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
  row: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  inlineAddButton: {
    backgroundColor: COLORS.primary,
    borderRadius: 8,
    paddingHorizontal: 16,
    justifyContent: 'center',
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
  listItemTitle: { fontSize: 15, color: COLORS.text },
  deleteButton: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6, backgroundColor: COLORS.danger },
  deleteButtonText: { color: COLORS.white, fontSize: 13, fontWeight: 'bold' },
  emptyText: { textAlign: 'center', color: COLORS.textSecondary, fontSize: 14, paddingVertical: 20 },
});