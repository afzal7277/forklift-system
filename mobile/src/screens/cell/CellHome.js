import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useApp } from '../../context/AppContext';
import { COLORS, FORKLIFT_TYPES } from '../../constants/config';
import {
  connectSocket,
  registerAsCell,
  sendRequest,
  cancelRequest,
  getSocket,
} from '../../services/socket';

export default function CellHomeScreen({ navigation }) {
  const { state, dispatch } = useApp();
  const { cellData, currentRequest, isConnected } = state;

  const [selectedType, setSelectedType] = useState(null);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    initSocket();
    return () => {
      // cleanup listeners on unmount
      const socket = getSocket();
      if (socket) {
        socket.off('registered');
        socket.off('request_sent');
        socket.off('request_accepted');
        socket.off('request_completed');
        socket.off('request_timeout_completed');
        socket.off('no_forklifts_available');
        socket.off('error');
      }
    };
  }, []);

  // Elapsed timer when request is pending
  useEffect(() => {
    let interval = null;
    if (currentRequest && currentRequest.status === 'pending') {
      interval = setInterval(() => {
        const seconds = Math.floor(
          (Date.now() - new Date(currentRequest.created_at)) / 1000
        );
        setElapsed(seconds);
      }, 1000);
    } else {
      setElapsed(0);
    }
    return () => { if (interval) clearInterval(interval); };
  }, [currentRequest]);

  const initSocket = useCallback(() => {
    connectSocket(
      () => {
        dispatch({ type: 'SET_CONNECTED', payload: true });
        registerAsCell(cellData.id);
      },
      () => {
        dispatch({ type: 'SET_CONNECTED', payload: false });
      }
    );

    const socket = getSocket();

    socket.on('registered', (data) => {
      console.log('Cell registered successfully');
    });

    socket.on('request_sent', (request) => {
      dispatch({ type: 'SET_CURRENT_REQUEST', payload: request });
    });

    socket.on('request_accepted', (request) => {
      dispatch({ type: 'SET_CURRENT_REQUEST', payload: request });
      navigation.navigate('CellWaiting', { request });
    });

    socket.on('request_completed', (request) => {
      dispatch({ type: 'CLEAR_REQUEST' });
      Alert.alert(
        'Task Complete',
        'Forklift task has been completed.'
      );
    });

    socket.on('request_timeout_completed', () => {
      dispatch({ type: 'CLEAR_REQUEST' });
      Alert.alert(
        'Task Complete',
        'Task timed out and was marked complete.'
      );
    });

    socket.on('no_forklifts_available', (data) => {
      dispatch({ type: 'CLEAR_REQUEST' });
      Alert.alert(
        'No Forklifts Available',
        data.message || 'No forklifts of this type are currently available.'
      );
    });

    socket.on('error', (data) => {
      Alert.alert('Error', data.message);
    });
  }, [cellData]);

  const handleSendRequest = () => {
    if (!selectedType) {
      Alert.alert('Select Type', 'Please select a forklift type first.');
      return;
    }

    if (!isConnected) {
      Alert.alert('Not Connected', 'Cannot send request - server not connected.');
      return;
    }

    if (currentRequest) {
      Alert.alert('Active Request', 'You already have an active request.');
      return;
    }

    Alert.alert(
      'Confirm Request',
      'Request a ' + selectedType.name + ' forklift?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Send Request',
          onPress: () => {
            sendRequest(cellData.id, selectedType.id);
          },
        },
      ]
    );
  };

  const handleCancelRequest = () => {
    if (!currentRequest) return;

    Alert.alert(
      'Cancel Request',
      'Are you sure you want to cancel this request?',
      [
        { text: 'No', style: 'cancel' },
        {
          text: 'Yes, Cancel',
          style: 'destructive',
          onPress: () => {
            cancelRequest(currentRequest.id);
            dispatch({ type: 'CLEAR_REQUEST' });
          },
        },
      ]
    );
  };

  const formatElapsed = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return (m > 0 ? m + 'm ' : '') + s + 's';
  };

  const getStatusColor = () => {
    if (!isConnected) return COLORS.danger;
    if (currentRequest?.status === 'accepted') return COLORS.success;
    if (currentRequest?.status === 'pending') return COLORS.warning;
    return COLORS.success;
  };

  const getStatusText = () => {
    if (!isConnected) return 'Disconnected';
    if (currentRequest?.status === 'accepted') return 'Forklift On The Way';
    if (currentRequest?.status === 'pending') return 'Waiting for Forklift...';
    return 'Ready';
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.cellNumber}>Cell {cellData?.cell_number}</Text>
          {cellData?.operator_name ? (
            <Text style={styles.operatorName}>{cellData.operator_name}</Text>
          ) : null}
        </View>
        <View style={[styles.statusBadge, { backgroundColor: getStatusColor() }]}>
          <Text style={styles.statusText}>{getStatusText()}</Text>
        </View>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>

        {/* Active Request Banner */}
        {currentRequest ? (
          <View style={[
            styles.activeBanner,
            {
              backgroundColor: currentRequest.status === 'accepted'
                ? COLORS.success
                : COLORS.warning
            }
          ]}>
            <Text style={styles.bannerTitle}>
              {currentRequest.status === 'accepted'
                ? 'Forklift Accepted'
                : 'Request Pending'}
            </Text>
            <Text style={styles.bannerSub}>
              Type: {currentRequest.forklift_type_name}
            </Text>
            {currentRequest.forklift_name ? (
              <Text style={styles.bannerSub}>
                Forklift: {currentRequest.forklift_name}
              </Text>
            ) : null}
            {currentRequest.status === 'pending' ? (
              <Text style={styles.bannerTimer}>
                Waiting: {formatElapsed(elapsed)}
              </Text>
            ) : null}
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={handleCancelRequest}
            >
              <Text style={styles.cancelButtonText}>Cancel Request</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {/* Forklift Type Selection */}
        {!currentRequest ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Select Forklift Type</Text>
            <View style={styles.typeGrid}>
              {FORKLIFT_TYPES.map((type) => (
                <TouchableOpacity
                  key={type.id}
                  style={[
                    styles.typeCard,
                    selectedType?.id === type.id && styles.typeCardSelected,
                  ]}
                  onPress={() => setSelectedType(type)}
                >
                  <Text style={[
                    styles.typeCardText,
                    selectedType?.id === type.id && styles.typeCardTextSelected,
                  ]}>
                    {type.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity
              style={[
                styles.callButton,
                (!selectedType || !isConnected) && styles.callButtonDisabled,
              ]}
              onPress={handleSendRequest}
              disabled={!selectedType || !isConnected}
            >
              <Text style={styles.callButtonText}>
                {selectedType
                  ? 'Call ' + selectedType.name + ' Forklift'
                  : 'Select a Type First'}
              </Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {/* Admin Config Button */}
        <TouchableOpacity
          style={styles.adminButton}
          onPress={() => navigation.navigate('AdminConfig')}
        >
          <Text style={styles.adminButtonText}>Admin Settings</Text>
        </TouchableOpacity>

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
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    backgroundColor: COLORS.white,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.lightGray,
  },
  cellNumber: {
    fontSize: 22,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  operatorName: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  statusText: {
    color: COLORS.white,
    fontSize: 12,
    fontWeight: 'bold',
  },
  content: {
    flex: 1,
    padding: 20,
  },
  activeBanner: {
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
  },
  bannerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.white,
    marginBottom: 8,
  },
  bannerSub: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.9)',
    marginBottom: 4,
  },
  bannerTimer: {
    fontSize: 16,
    color: COLORS.white,
    fontWeight: 'bold',
    marginTop: 8,
    marginBottom: 8,
  },
  cancelButton: {
    marginTop: 12,
    backgroundColor: 'rgba(0,0,0,0.2)',
    borderRadius: 8,
    padding: 10,
    alignItems: 'center',
  },
  cancelButtonText: {
    color: COLORS.white,
    fontWeight: 'bold',
    fontSize: 14,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 16,
  },
  typeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 24,
  },
  typeCard: {
    width: '47%',
    backgroundColor: COLORS.white,
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: COLORS.lightGray,
    elevation: 2,
  },
  typeCardSelected: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primary,
  },
  typeCardText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  typeCardTextSelected: {
    color: COLORS.white,
  },
  callButton: {
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    padding: 18,
    alignItems: 'center',
    elevation: 4,
  },
  callButtonDisabled: {
    backgroundColor: COLORS.gray,
    elevation: 0,
  },
  callButtonText: {
    color: COLORS.white,
    fontSize: 18,
    fontWeight: 'bold',
  },
  adminButton: {
    marginTop: 8,
    padding: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
  },
  adminButtonText: {
    color: COLORS.textSecondary,
    fontSize: 14,
  },
});