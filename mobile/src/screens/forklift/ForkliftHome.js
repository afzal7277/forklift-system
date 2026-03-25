import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ScrollView,
  Modal,
  FlatList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useApp } from '../../context/AppContext';
import { COLORS } from '../../constants/config';
import {
  connectSocket,
  registerAsForklift,
  declineRequest,
  returnFromLeave,
  getSocket,
} from '../../services/socket';
import { getLeaveComments } from '../../services/api';

export default function ForkliftHomeScreen({ navigation }) {
  const { state, dispatch } = useApp();
  const { forkliftData, isConnected, isOnLeave, incomingRequest } = state;

  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [leaveComments, setLeaveComments] = useState([]);
  const [loadingComments, setLoadingComments] = useState(false);

  useEffect(() => {
    initSocket();
    return () => {
      const socket = getSocket();
      if (socket) {
        socket.off('registered');
        socket.off('incoming_request');
        socket.off('request_taken');
        socket.off('request_cancelled');
        socket.off('task_timeout');
        socket.off('error');
      }
    };
  }, []);

  const initSocket = useCallback(() => {
    connectSocket(
      () => {
        dispatch({ type: 'SET_CONNECTED', payload: true });
        registerAsForklift(forkliftData.id);
      },
      () => {
        dispatch({ type: 'SET_CONNECTED', payload: false });
      }
    );

    const socket = getSocket();

    socket.on('registered', (data) => {
      console.log('Forklift registered successfully');
    });

    socket.on('incoming_request', (request) => {
      // Only show if not on leave and not already busy
      if (!isOnLeave) {
        dispatch({ type: 'SET_INCOMING_REQUEST', payload: request });
        navigation.navigate('ForkliftAlert', { request });
      }
    });

    socket.on('request_taken', (data) => {
      // Another forklift accepted - dismiss if showing
      dispatch({ type: 'SET_INCOMING_REQUEST', payload: null });
    });

    socket.on('request_cancelled', (data) => {
      dispatch({ type: 'SET_INCOMING_REQUEST', payload: null });
      dispatch({ type: 'SET_CURRENT_REQUEST', payload: null });
    });

    socket.on('task_timeout', (data) => {
      dispatch({ type: 'CLEAR_REQUEST' });
      Alert.alert(
        'Task Timeout',
        'Your task has timed out and been marked complete. You are now available.'
      );
    });

    socket.on('leave_ended', () => {
      dispatch({ type: 'SET_ON_LEAVE', payload: false });
    });

    socket.on('error', (data) => {
      Alert.alert('Error', data.message);
    });
  }, [forkliftData]);

  const handleGoOnLeave = async () => {
    setLoadingComments(true);
    const result = await getLeaveComments();
    if (result.success) {
      setLeaveComments(result.data);
    }
    setLoadingComments(false);
    setShowLeaveModal(true);
  };

  const handleSelectLeaveReason = (comment) => {
    setShowLeaveModal(false);

    Alert.alert(
      'Confirm Leave',
      'Going on leave: ' + comment.comment,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          onPress: () => {
            dispatch({ type: 'SET_ON_LEAVE', payload: true });
            // Decline any incoming request with this reason
            if (incomingRequest) {
              declineRequest(
                incomingRequest.id,
                forkliftData.id,
                comment.comment
              );
              dispatch({ type: 'SET_INCOMING_REQUEST', payload: null });
            } else {
              // Just emit leave status via socket
              const socket = getSocket();
              if (socket) {
                socket.emit('go_on_leave', {
                  forklift_id: forkliftData.id,
                  reason: comment.comment,
                });
              }
            }
          },
        },
      ]
    );
  };

  const handleReturnFromLeave = () => {
    Alert.alert(
      'Return from Leave',
      'Are you ready to receive requests again?',
      [
        { text: 'Not yet', style: 'cancel' },
        {
          text: 'Yes, Return',
          onPress: () => {
            returnFromLeave(forkliftData.id);
            dispatch({ type: 'SET_ON_LEAVE', payload: false });
          },
        },
      ]
    );
  };

  const getStatusColor = () => {
    if (!isConnected) return COLORS.danger;
    if (isOnLeave) return COLORS.warning;
    if (state.currentRequest) return COLORS.warning;
    return COLORS.success;
  };

  const getStatusText = () => {
    if (!isConnected) return 'Disconnected';
    if (isOnLeave) return 'On Leave';
    if (state.currentRequest) return 'On Task';
    return 'Available';
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.forkliftName}>{forkliftData?.name}</Text>
          <Text style={styles.forkliftType}>{forkliftData?.type_name}</Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: getStatusColor() }]}>
          <Text style={styles.statusText}>{getStatusText()}</Text>
        </View>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>

        {/* Main Status Card */}
        <View style={[styles.statusCard, { borderColor: getStatusColor() }]}>
          <View style={[styles.statusDot, { backgroundColor: getStatusColor() }]} />
          <Text style={[styles.statusCardTitle, { color: getStatusColor() }]}>
            {getStatusText()}
          </Text>
          <Text style={styles.statusCardSub}>
            {!isConnected
              ? 'Check your network connection'
              : isOnLeave
              ? 'You are currently on leave'
              : state.currentRequest
              ? 'Currently handling a task'
              : 'Waiting for incoming requests'}
          </Text>
        </View>

        {/* Active Task Card */}
        {state.currentRequest && !isOnLeave ? (
          <View style={styles.taskCard}>
            <Text style={styles.taskTitle}>Active Task</Text>
            <View style={styles.taskRow}>
              <Text style={styles.taskLabel}>Cell</Text>
              <Text style={styles.taskValue}>
                Cell {state.currentRequest.cell_number}
              </Text>
            </View>
            <View style={styles.taskRow}>
              <Text style={styles.taskLabel}>Type</Text>
              <Text style={styles.taskValue}>
                {state.currentRequest.forklift_type_name}
              </Text>
            </View>
            {state.currentRequest.operator_name ? (
              <View style={styles.taskRow}>
                <Text style={styles.taskLabel}>Operator</Text>
                <Text style={styles.taskValue}>
                  {state.currentRequest.operator_name}
                </Text>
              </View>
            ) : null}
          </View>
        ) : null}

        {/* Action Buttons */}
        <View style={styles.actions}>
          {!isOnLeave ? (
            <TouchableOpacity
              style={[styles.actionButton, { backgroundColor: COLORS.warning }]}
              onPress={handleGoOnLeave}
            >
              <Text style={styles.actionButtonText}>Go On Leave</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[styles.actionButton, { backgroundColor: COLORS.success }]}
              onPress={handleReturnFromLeave}
            >
              <Text style={styles.actionButtonText}>Return from Leave</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Admin Config Button */}
        <TouchableOpacity
          style={styles.adminButton}
          onPress={() => navigation.navigate('AdminConfig')}
        >
          <Text style={styles.adminButtonText}>Admin Settings</Text>
        </TouchableOpacity>

      </ScrollView>

      {/* Leave Reason Modal */}
      <Modal visible={showLeaveModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Select Leave Reason</Text>
            {loadingComments ? (
              <Text style={styles.loadingText}>Loading...</Text>
            ) : leaveComments.length === 0 ? (
              <Text style={styles.emptyText}>No leave reasons configured.</Text>
            ) : (
              <FlatList
                data={leaveComments}
                keyExtractor={(item) => item.id.toString()}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={styles.commentItem}
                    onPress={() => handleSelectLeaveReason(item)}
                  >
                    <Text style={styles.commentText}>{item.comment}</Text>
                  </TouchableOpacity>
                )}
              />
            )}
            <TouchableOpacity
              style={styles.modalCancelBtn}
              onPress={() => setShowLeaveModal(false)}
            >
              <Text style={styles.modalCancelText}>Cancel</Text>
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
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    backgroundColor: COLORS.white,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.lightGray,
  },
  forkliftName: {
    fontSize: 22,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  forkliftType: {
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
  statusCard: {
    backgroundColor: COLORS.white,
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    marginBottom: 20,
    borderWidth: 2,
    elevation: 4,
  },
  statusDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    marginBottom: 12,
  },
  statusCardTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  statusCardSub: {
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
  taskCard: {
    backgroundColor: COLORS.white,
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
    elevation: 2,
    borderLeftWidth: 4,
    borderLeftColor: COLORS.warning,
  },
  taskTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 12,
  },
  taskRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.lightGray,
  },
  taskLabel: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  taskValue: {
    fontSize: 14,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  actions: {
    marginBottom: 16,
    gap: 12,
  },
  actionButton: {
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    elevation: 4,
  },
  actionButtonText: {
    color: COLORS.white,
    fontSize: 16,
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
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalBox: {
    backgroundColor: COLORS.white,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    maxHeight: '60%',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 16,
    textAlign: 'center',
  },
  commentItem: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.lightGray,
  },
  commentText: {
    fontSize: 15,
    color: COLORS.text,
  },
  modalCancelBtn: {
    marginTop: 16,
    padding: 14,
    backgroundColor: COLORS.lightGray,
    borderRadius: 8,
    alignItems: 'center',
  },
  modalCancelText: {
    fontSize: 15,
    fontWeight: 'bold',
    color: COLORS.darkGray,
  },
  loadingText: {
    textAlign: 'center',
    color: COLORS.textSecondary,
    padding: 20,
  },
  emptyText: {
    textAlign: 'center',
    color: COLORS.textSecondary,
    padding: 20,
  },
});