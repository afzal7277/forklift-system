import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS } from '../../constants/config';
import { getRequestHistory, getCells, getForkliftTypes } from '../../services/api';

const PERIODS = [
  { label: 'Today', value: 'day' },
  { label: 'Week', value: 'week' },
  { label: 'Month', value: 'month' },
];

const STATUS_COLORS = {
  completed: COLORS.success,
  cancelled: COLORS.danger,
  pending: COLORS.warning,
  accepted: COLORS.primary,
};

export default function RequestHistoryScreen({ navigation }) {
  const [loading, setLoading] = useState(false);
  const [period, setPeriod] = useState('day');
  const [data, setData] = useState([]);
  const [summary, setSummary] = useState(null);
  const [expandedId, setExpandedId] = useState(null);

  useEffect(() => { loadHistory(); }, [period]);

  const loadHistory = async () => {
    setLoading(true);
    const result = await getRequestHistory({ period });
    if (result.success) {
      setData(result.data);
      setSummary(result.summary);
    } else {
      Alert.alert('Error', result.message || 'Failed to load history');
    }
    setLoading(false);
  };

  const formatTime = (iso) => {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const formatDuration = (seconds) => {
    if (!seconds) return '—';
    if (seconds < 60) return seconds + 's';
    return Math.floor(seconds / 60) + 'm ' + (seconds % 60) + 's';
  };

  const getEventLabel = (event) => {
    const labels = {
      request_created: 'Created',
      request_accepted: 'Accepted',
      request_declined: 'Declined',
      request_completed: 'Completed',
      request_cancelled: 'Cancelled',
      not_responded: 'No Response',
      forklift_snapshot: 'Status at Request',
      forklift_disconnected: 'Disconnected',
      forklift_went_offline: 'Went Offline',
      request_timeout_completed: 'Timeout Complete',
    };
    return labels[event] || event;
  };

  const getEventColor = (event) => {
    if (event.includes('accepted') || event.includes('completed')) return COLORS.success;
    if (event.includes('declined') || event.includes('cancelled') || event.includes('offline') || event.includes('disconnected')) return COLORS.danger;
    if (event.includes('not_responded') || event.includes('timeout')) return COLORS.warning;
    return COLORS.textSecondary;
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Text style={styles.backButtonText}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Request History</Text>
        <View style={{ width: 60 }} />
      </View>

      {/* Period Filter */}
      <View style={styles.filterRow}>
        {PERIODS.map((p) => (
          <TouchableOpacity
            key={p.value}
            style={[styles.filterChip, period === p.value && styles.filterChipActive]}
            onPress={() => setPeriod(p.value)}
          >
            <Text style={[styles.filterChipText, period === p.value && styles.filterChipTextActive]}>{p.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <ActivityIndicator style={styles.loader} size="large" color={COLORS.primary} />
      ) : (
        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>

          {/* Summary Cards */}
          {summary ? (
            <View style={styles.summaryGrid}>
              <View style={[styles.summaryCard, { borderLeftColor: COLORS.primary }]}>
                <Text style={styles.summaryValue}>{summary.total}</Text>
                <Text style={styles.summaryLabel}>Total</Text>
              </View>
              <View style={[styles.summaryCard, { borderLeftColor: COLORS.success }]}>
                <Text style={styles.summaryValue}>{summary.completed}</Text>
                <Text style={styles.summaryLabel}>Completed</Text>
              </View>
              <View style={[styles.summaryCard, { borderLeftColor: COLORS.danger }]}>
                <Text style={styles.summaryValue}>{summary.cancelled}</Text>
                <Text style={styles.summaryLabel}>Cancelled</Text>
              </View>
              <View style={[styles.summaryCard, { borderLeftColor: COLORS.warning }]}>
                <Text style={styles.summaryValue}>{summary.avg_response_time_seconds}s</Text>
                <Text style={styles.summaryLabel}>Avg Response</Text>
              </View>
              <View style={[styles.summaryCard, { borderLeftColor: COLORS.warning }]}>
                <Text style={styles.summaryValue}>{summary.avg_task_time_seconds}s</Text>
                <Text style={styles.summaryLabel}>Avg Task Time</Text>
              </View>
              <View style={[styles.summaryCard, { borderLeftColor: COLORS.danger }]}>
                <Text style={styles.summaryValue}>{summary.not_responded_count}</Text>
                <Text style={styles.summaryLabel}>No Response</Text>
              </View>
            </View>
          ) : null}

          {/* Request List */}
          {data.length === 0 ? (
            <Text style={styles.emptyText}>No requests found for this period.</Text>
          ) : (
            data.map((req) => (
              <TouchableOpacity
                key={req.id}
                style={styles.requestCard}
                onPress={() => setExpandedId(expandedId === req.id ? null : req.id)}
                activeOpacity={0.8}
              >
                {/* Request Header */}
                <View style={styles.requestHeader}>
                  <View style={styles.requestMeta}>
                    <Text style={styles.requestCell}>Cell {req.cell_number}</Text>
                    {req.operator_name ? <Text style={styles.requestOperator}>{req.operator_name}</Text> : null}
                    <Text style={styles.requestType}>{req.forklift_type_name}</Text>
                  </View>
                  <View style={styles.requestRight}>
                    <View style={[styles.statusBadge, { backgroundColor: STATUS_COLORS[req.status] || COLORS.gray }]}>
                      <Text style={styles.statusBadgeText}>{req.status.toUpperCase()}</Text>
                    </View>
                    <Text style={styles.requestTime}>{formatTime(req.created_at)}</Text>
                    {req.forklift_name ? <Text style={styles.requestForklift}>{req.forklift_name}</Text> : null}
                  </View>
                </View>

                {/* Cancel reason */}
                {req.cancel_reason ? (
                  <Text style={styles.cancelReason}>Reason: {req.cancel_reason.replace(/_/g, ' ')}</Text>
                ) : null}

                {/* Expanded log */}
                {expandedId === req.id && req.logs && req.logs.length > 0 ? (
                  <View style={styles.logsSection}>
                    <Text style={styles.logsSectionTitle}>Full Log</Text>
                    {req.logs.map((log, idx) => (
                      <View key={idx} style={styles.logRow}>
                        <View style={[styles.logDot, { backgroundColor: getEventColor(log.event) }]} />
                        <View style={styles.logContent}>
                          <Text style={[styles.logEvent, { color: getEventColor(log.event) }]}>{getEventLabel(log.event)}</Text>
                          {log.forklift_name ? <Text style={styles.logDetail}>Forklift: {log.forklift_name}</Text> : null}
                          {log.forklift_status_at_time ? <Text style={styles.logDetail}>Status: {log.forklift_status_at_time}</Text> : null}
                          {log.reason ? <Text style={styles.logDetail}>Reason: {log.reason.replace(/_/g, ' ')}</Text> : null}
                          {log.value_seconds ? <Text style={styles.logDetail}>Duration: {formatDuration(log.value_seconds)}</Text> : null}
                        </View>
                        <Text style={styles.logTime}>{formatTime(log.recorded_at)}</Text>
                      </View>
                    ))}
                  </View>
                ) : expandedId === req.id ? (
                  <Text style={styles.noLogsText}>No detailed logs available.</Text>
                ) : (
                  <Text style={styles.tapHint}>Tap to see full log ›</Text>
                )}
              </TouchableOpacity>
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
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, backgroundColor: COLORS.white, borderBottomWidth: 1, borderBottomColor: COLORS.lightGray },
  backButton: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6, backgroundColor: COLORS.lightGray, width: 60, alignItems: 'center' },
  backButtonText: { fontSize: 14, color: COLORS.darkGray, fontWeight: 'bold' },
  title: { fontSize: 18, fontWeight: 'bold', color: COLORS.text },
  filterRow: { flexDirection: 'row', padding: 12, gap: 8, backgroundColor: COLORS.white, borderBottomWidth: 1, borderBottomColor: COLORS.lightGray },
  filterChip: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.white },
  filterChipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  filterChipText: { fontSize: 13, color: COLORS.text },
  filterChipTextActive: { color: COLORS.white, fontWeight: 'bold' },
  loader: { marginTop: 40 },
  content: { flex: 1, padding: 16 },
  summaryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  summaryCard: { backgroundColor: COLORS.white, borderRadius: 8, padding: 12, borderLeftWidth: 4, minWidth: '30%', flex: 1, elevation: 2 },
  summaryValue: { fontSize: 20, fontWeight: 'bold', color: COLORS.text },
  summaryLabel: { fontSize: 11, color: COLORS.textSecondary, marginTop: 2 },
  emptyText: { textAlign: 'center', color: COLORS.textSecondary, fontSize: 14, paddingVertical: 40 },
  requestCard: { backgroundColor: COLORS.white, borderRadius: 10, padding: 14, marginBottom: 10, elevation: 2, borderWidth: 1, borderColor: COLORS.lightGray },
  requestHeader: { flexDirection: 'row', justifyContent: 'space-between' },
  requestMeta: { flex: 1 },
  requestCell: { fontSize: 16, fontWeight: 'bold', color: COLORS.text },
  requestOperator: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  requestType: { fontSize: 13, color: COLORS.primary, fontWeight: 'bold', marginTop: 4 },
  requestRight: { alignItems: 'flex-end' },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, marginBottom: 4 },
  statusBadgeText: { color: COLORS.white, fontSize: 10, fontWeight: 'bold' },
  requestTime: { fontSize: 11, color: COLORS.textSecondary },
  requestForklift: { fontSize: 12, color: COLORS.text, fontWeight: 'bold', marginTop: 2 },
  cancelReason: { fontSize: 12, color: COLORS.danger, marginTop: 6, fontStyle: 'italic' },
  tapHint: { fontSize: 11, color: COLORS.textSecondary, marginTop: 8, textAlign: 'right' },
  logsSection: { marginTop: 12, borderTopWidth: 1, borderTopColor: COLORS.lightGray, paddingTop: 12 },
  logsSectionTitle: { fontSize: 13, fontWeight: 'bold', color: COLORS.text, marginBottom: 8 },
  logRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 8 },
  logDot: { width: 8, height: 8, borderRadius: 4, marginTop: 5, marginRight: 8 },
  logContent: { flex: 1 },
  logEvent: { fontSize: 13, fontWeight: 'bold' },
  logDetail: { fontSize: 11, color: COLORS.textSecondary, marginTop: 1 },
  logTime: { fontSize: 10, color: COLORS.textSecondary, marginLeft: 8 },
  noLogsText: { fontSize: 12, color: COLORS.textSecondary, marginTop: 8, textAlign: 'center' },
});