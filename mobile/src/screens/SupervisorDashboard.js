import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS } from '../constants/config';
import {
  connectSocket,
  registerAsSupervisor,
  getSocket,
} from '../services/socket';
import { getKpiSummary } from '../services/api';

export default function SupervisorDashboard({ navigation }) {
  const [systemStatus, setSystemStatus] = useState(null);
  const [kpi, setKpi] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [alerts, setAlerts] = useState([]);

  useEffect(() => {
    initSocket();
    loadKpi();
    return () => {
      const socket = getSocket();
      if (socket) {
        socket.off('system_status');
        socket.off('forklift_connection_lost');
      }
    };
  }, []);

  const initSocket = useCallback(() => {
    connectSocket(
      () => {
        setIsConnected(true);
        registerAsSupervisor();
      },
      () => {
        setIsConnected(false);
      }
    );

    const socket = getSocket();

    socket.on('system_status', (status) => {
      setSystemStatus(status);
    });

    socket.on('forklift_connection_lost', (data) => {
      setAlerts((prev) => [
        {
          id: Date.now(),
          type: 'connection_lost',
          message: 'Forklift tablet disconnected during active task',
          data,
          time: new Date().toLocaleTimeString(),
        },
        ...prev.slice(0, 9),
      ]);
    });
  }, []);

  const loadKpi = async () => {
    const result = await getKpiSummary();
    if (result.success) setKpi(result.data);
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadKpi();
    setRefreshing(false);
  };

  const getForkliftStatusColor = (status) => {
    if (status === 'available') return COLORS.success;
    if (status === 'busy') return COLORS.warning;
    if (status === 'on_leave') return COLORS.danger;
    return COLORS.gray;
  };

  const getForkliftStatusLabel = (status) => {
    if (status === 'available') return 'Available';
    if (status === 'busy') return 'Busy';
    if (status === 'on_leave') return 'On Leave';
    return 'Unknown';
  };

  const formatSeconds = (seconds) => {
    if (!seconds || seconds === 0) return '0s';
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return m > 0 ? m + 'm ' + s + 's' : s + 's';
  };

  const dismissAlert = (id) => {
    setAlerts((prev) => prev.filter((a) => a.id !== id));
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.backButtonText}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Supervisor Dashboard</Text>
        <View
          style={[
            styles.connectionDot,
            { backgroundColor: isConnected ? COLORS.success : COLORS.danger },
          ]}
        />
      </View>

      <ScrollView
        style={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >

        {/* Alerts */}
        {alerts.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Alerts</Text>
            {alerts.map((alert) => (
              <View key={alert.id} style={styles.alertCard}>
                <View style={styles.alertContent}>
                  <Text style={styles.alertMessage}>{alert.message}</Text>
                  <Text style={styles.alertTime}>{alert.time}</Text>
                </View>
                <TouchableOpacity
                  style={styles.dismissButton}
                  onPress={() => dismissAlert(alert.id)}
                >
                  <Text style={styles.dismissButtonText}>Dismiss</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        ) : null}

        {/* KPI Summary */}
        {kpi ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>KPI Summary</Text>
            <View style={styles.kpiGrid}>
              <View style={styles.kpiCard}>
                <Text style={styles.kpiValue}>{kpi.total_requests}</Text>
                <Text style={styles.kpiLabel}>Total Requests</Text>
              </View>
              <View style={styles.kpiCard}>
                <Text style={styles.kpiValue}>{kpi.completed_requests}</Text>
                <Text style={styles.kpiLabel}>Completed</Text>
              </View>
              <View style={styles.kpiCard}>
                <Text style={styles.kpiValue}>{kpi.pending_requests}</Text>
                <Text style={styles.kpiLabel}>Pending</Text>
              </View>
              <View style={styles.kpiCard}>
                <Text style={styles.kpiValue}>
                  {formatSeconds(kpi.avg_response_time_seconds)}
                </Text>
                <Text style={styles.kpiLabel}>Avg Response</Text>
              </View>
              <View style={styles.kpiCard}>
                <Text style={styles.kpiValue}>
                  {formatSeconds(kpi.avg_task_time_seconds)}
                </Text>
                <Text style={styles.kpiLabel}>Avg Task Time</Text>
              </View>
            </View>
          </View>
        ) : null}

        {/* Active Requests */}
        {systemStatus?.activeRequests?.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              Active Requests ({systemStatus.activeRequests.length})
            </Text>
            {systemStatus.activeRequests.map((req) => (
              <View key={req.id} style={styles.requestCard}>
                <View style={styles.requestHeader}>
                  <Text style={styles.requestCell}>
                    Cell {req.cell_number}
                  </Text>
                  <View
                    style={[
                      styles.requestStatusBadge,
                      {
                        backgroundColor:
                          req.status === 'accepted'
                            ? COLORS.success
                            : COLORS.warning,
                      },
                    ]}
                  >
                    <Text style={styles.requestStatusText}>
                      {req.status === 'accepted' ? 'Accepted' : 'Pending'}
                    </Text>
                  </View>
                </View>
                <Text style={styles.requestType}>
                  Type: {req.forklift_type_name}
                </Text>
                {req.forklift_name ? (
                  <Text style={styles.requestForklift}>
                    Forklift: {req.forklift_name}
                  </Text>
                ) : null}
                <Text style={styles.requestTime}>
                  Created: {new Date(req.created_at).toLocaleTimeString()}
                </Text>
              </View>
            ))}
          </View>
        ) : (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Active Requests</Text>
            <Text style={styles.emptyText}>No active requests</Text>
          </View>
        )}

        {/* Forklift Status */}
        {systemStatus?.forklifts?.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Forklift Status</Text>
            {systemStatus.forklifts.map((f) => (
              <View key={f.id} style={styles.forkliftCard}>
                <View>
                  <Text style={styles.forkliftName}>{f.name}</Text>
                  <Text style={styles.forkliftType}>{f.type_name}</Text>
                </View>
                <View
                  style={[
                    styles.statusBadge,
                    { backgroundColor: getForkliftStatusColor(f.status) },
                  ]}
                >
                  <Text style={styles.statusBadgeText}>
                    {getForkliftStatusLabel(f.status)}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        ) : null}

        {/* Cell Status */}
        {systemStatus?.cells?.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Cell Status</Text>
            {systemStatus.cells.map((c) => {
              const activeRequest = systemStatus.activeRequests?.find(
                (r) => r.cell_id === c.id
              );
              return (
                <View key={c.id} style={styles.cellCard}>
                  <View>
                    <Text style={styles.cellNumber}>
                      Cell {c.cell_number}
                    </Text>
                    {c.operator_name ? (
                      <Text style={styles.cellOperator}>
                        {c.operator_name}
                      </Text>
                    ) : null}
                  </View>
                  <View
                    style={[
                      styles.statusBadge,
                      {
                        backgroundColor: activeRequest
                          ? COLORS.warning
                          : COLORS.success,
                      },
                    ]}
                  >
                    <Text style={styles.statusBadgeText}>
                      {activeRequest ? 'Active' : 'Idle'}
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>
        ) : null}

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
  connectionDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 12,
  },
  kpiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  kpiCard: {
    backgroundColor: COLORS.white,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    width: '47%',
    elevation: 2,
    borderWidth: 1,
    borderColor: COLORS.lightGray,
  },
  kpiValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: COLORS.primary,
    marginBottom: 4,
  },
  kpiLabel: {
    fontSize: 12,
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
  alertCard: {
    backgroundColor: '#FFF3F3',
    borderRadius: 8,
    padding: 14,
    marginBottom: 8,
    borderLeftWidth: 4,
    borderLeftColor: COLORS.danger,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  alertContent: {
    flex: 1,
  },
  alertMessage: {
    fontSize: 14,
    color: COLORS.danger,
    fontWeight: 'bold',
  },
  alertTime: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  dismissButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: COLORS.danger,
    borderRadius: 6,
    marginLeft: 8,
  },
  dismissButtonText: {
    color: COLORS.white,
    fontSize: 12,
    fontWeight: 'bold',
  },
  requestCard: {
    backgroundColor: COLORS.white,
    borderRadius: 10,
    padding: 14,
    marginBottom: 8,
    elevation: 2,
    borderWidth: 1,
    borderColor: COLORS.lightGray,
  },
  requestHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  requestCell: {
    fontSize: 16,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  requestStatusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  requestStatusText: {
    color: COLORS.white,
    fontSize: 12,
    fontWeight: 'bold',
  },
  requestType: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginBottom: 2,
  },
  requestForklift: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginBottom: 2,
  },
  requestTime: {
    fontSize: 12,
    color: COLORS.gray,
    marginTop: 4,
  },
  forkliftCard: {
    backgroundColor: COLORS.white,
    borderRadius: 10,
    padding: 14,
    marginBottom: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    elevation: 2,
    borderWidth: 1,
    borderColor: COLORS.lightGray,
  },
  forkliftName: {
    fontSize: 15,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  forkliftType: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusBadgeText: {
    color: COLORS.white,
    fontSize: 12,
    fontWeight: 'bold',
  },
  cellCard: {
    backgroundColor: COLORS.white,
    borderRadius: 10,
    padding: 14,
    marginBottom: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    elevation: 2,
    borderWidth: 1,
    borderColor: COLORS.lightGray,
  },
  cellNumber: {
    fontSize: 15,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  cellOperator: {
    fontSize: 12,
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