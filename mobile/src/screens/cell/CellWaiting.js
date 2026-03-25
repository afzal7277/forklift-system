import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useApp } from '../../context/AppContext';
import { COLORS } from '../../constants/config';
import { cancelRequest, getSocket } from '../../services/socket';

export default function CellWaitingScreen({ navigation, route }) {
  const { state, dispatch } = useApp();
  const { currentRequest } = state;

  const request = route.params?.request || currentRequest;

  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      if (request?.accepted_at) {
        const seconds = Math.floor(
          (Date.now() - new Date(request.accepted_at)) / 1000
        );
        setElapsed(seconds);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [request]);

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    socket.on('request_completed', (data) => {
      dispatch({ type: 'CLEAR_REQUEST' });
      Alert.alert(
        'Task Complete',
        'The forklift task has been completed.',
        [
          {
            text: 'OK',
            onPress: () => navigation.navigate('CellHome'),
          },
        ]
      );
    });

    socket.on('request_cancelled', () => {
      dispatch({ type: 'CLEAR_REQUEST' });
      navigation.navigate('CellHome');
    });

    socket.on('request_timeout_completed', () => {
      dispatch({ type: 'CLEAR_REQUEST' });
      Alert.alert(
        'Task Complete',
        'Task timed out and was marked complete.',
        [
          {
            text: 'OK',
            onPress: () => navigation.navigate('CellHome'),
          },
        ]
      );
    });

    return () => {
      socket.off('request_completed');
      socket.off('request_cancelled');
      socket.off('request_timeout_completed');
    };
  }, []);

  const handleCancel = () => {
    Alert.alert(
      'Cancel Request',
      'Are you sure you want to cancel this request?',
      [
        { text: 'No', style: 'cancel' },
        {
          text: 'Yes, Cancel',
          style: 'destructive',
          onPress: () => {
            if (request) {
              cancelRequest(request.id);
            }
            dispatch({ type: 'CLEAR_REQUEST' });
            navigation.navigate('CellHome');
          },
        },
      ]
    );
  };

  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return (m > 0 ? m + 'm ' : '') + s + 's';
  };

  if (!request) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}>
          <Text style={styles.errorText}>No active request found.</Text>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.navigate('CellHome')}
          >
            <Text style={styles.backButtonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>

        {/* Status Icon Area */}
        <View style={styles.iconArea}>
          <View style={styles.iconCircle}>
            <Text style={styles.iconText}>ON THE WAY</Text>
          </View>
        </View>

        {/* Request Info */}
        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>Forklift Accepted</Text>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Cell</Text>
            <Text style={styles.infoValue}>Cell {request.cell_number}</Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Type</Text>
            <Text style={styles.infoValue}>{request.forklift_type_name}</Text>
          </View>

          {request.forklift_name ? (
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Forklift</Text>
              <Text style={styles.infoValue}>{request.forklift_name}</Text>
            </View>
          ) : null}

          {request.operator_name ? (
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Operator</Text>
              <Text style={styles.infoValue}>{request.operator_name}</Text>
            </View>
          ) : null}

          <View style={styles.divider} />

          <View style={styles.timerRow}>
            <Text style={styles.timerLabel}>Time elapsed</Text>
            <Text style={styles.timerValue}>{formatTime(elapsed)}</Text>
          </View>
        </View>

        {/* Cancel Button */}
        <TouchableOpacity
          style={styles.cancelButton}
          onPress={handleCancel}
        >
          <Text style={styles.cancelButtonText}>Cancel Request</Text>
        </TouchableOpacity>

      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  content: {
    flex: 1,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconArea: {
    marginBottom: 32,
  },
  iconCircle: {
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: COLORS.success,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 8,
  },
  iconText: {
    color: COLORS.white,
    fontSize: 16,
    fontWeight: 'bold',
    textAlign: 'center',
    letterSpacing: 1,
  },
  infoCard: {
    backgroundColor: COLORS.white,
    borderRadius: 16,
    padding: 24,
    width: '100%',
    elevation: 4,
    marginBottom: 24,
  },
  infoTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: COLORS.success,
    textAlign: 'center',
    marginBottom: 20,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.lightGray,
  },
  infoLabel: {
    fontSize: 15,
    color: COLORS.textSecondary,
  },
  infoValue: {
    fontSize: 15,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.lightGray,
    marginVertical: 12,
  },
  timerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  timerLabel: {
    fontSize: 15,
    color: COLORS.textSecondary,
  },
  timerValue: {
    fontSize: 22,
    fontWeight: 'bold',
    color: COLORS.primary,
  },
  cancelButton: {
    width: '100%',
    backgroundColor: COLORS.danger,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    elevation: 4,
  },
  cancelButtonText: {
    color: COLORS.white,
    fontSize: 16,
    fontWeight: 'bold',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorText: {
    fontSize: 16,
    color: COLORS.textSecondary,
    marginBottom: 16,
  },
  backButton: {
    backgroundColor: COLORS.primary,
    borderRadius: 8,
    padding: 12,
    paddingHorizontal: 24,
  },
  backButtonText: {
    color: COLORS.white,
    fontWeight: 'bold',
  },
});