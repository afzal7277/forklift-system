import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, ScrollView, Modal, FlatList } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useApp } from '../../context/AppContext';
import { COLORS } from '../../constants/config';
import { connectSocket, registerAsForklift, acceptRequest, declineRequest, returnFromLeave, getSocket } from '../../services/socket';
import { getLeaveComments } from '../../services/api';
import { getDeviceId } from '../../services/device';

export default function ForkliftHomeScreen({ navigation }) {
  const { state, dispatch } = useApp();
  const { forkliftData, isConnected, isOnLeave } = state;

  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [leaveComments, setLeaveComments] = useState([]);
  const [loadingComments, setLoadingComments] = useState(false);
  const [pendingRequests, setPendingRequests] = useState([]);
  const [acceptingId, setAcceptingId] = useState(null);
  const [showDeclineModal, setShowDeclineModal] = useState(false);
  const [decliningRequest, setDecliningRequest] = useState(null);

  useEffect(() => {
    initSocket();
    return () => {
      const socket = getSocket();
      if (socket) {
        socket.off('registered');
        socket.off('incoming_request');
        socket.off('pending_requests');
        socket.off('request_taken');
        socket.off('request_cancelled');
        socket.off('accept_confirmed');
        socket.off('task_timeout');
        socket.off('leave_ended');
        socket.off('error');
      }
    };
  }, []);

  const handleForceReset = useCallback(async () => {
    await AsyncStorage.removeItem('tablet_mode');
    await AsyncStorage.removeItem('cell_data');
    await AsyncStorage.removeItem('forklift_data');
    dispatch({ type: 'RESET' });
  }, [dispatch]);

  const initSocket = useCallback(async () => {
    const deviceId = await getDeviceId();

    connectSocket(
      () => { dispatch({ type: 'SET_CONNECTED', payload: true }); registerAsForklift(forkliftData.id); },
      () => { dispatch({ type: 'SET_CONNECTED', payload: false }); }
    );

    const socket = getSocket();

    socket.off('force_reset_' + deviceId);
    socket.on('force_reset_' + deviceId, () => handleForceReset());

    socket.on('registered', () => console.log('Forklift registered'));

    // New incoming request — add to list
    socket.on('incoming_request', (request) => {
      if (!isOnLeave) {
        setPendingRequests(prev => {
          const exists = prev.find(r => r.id === request.id);
          if (exists) return prev;
          return [...prev, request];
        });
      }
    });

    // Server sends all pending requests on connect/return from leave
    socket.on('pending_requests', (requests) => {
      if (!isOnLeave) setPendingRequests(requests);
    });

    // A request was accepted (by this or another forklift) — remove from list
    socket.on('request_taken', (data) => {
      setPendingRequests(prev => prev.filter(r => r.id !== data.request_id));
    });

    // Cell cancelled a request — remove from list
    socket.on('request_cancelled', (data) => {
      setPendingRequests(prev => prev.filter(r => r.id !== data.request_id));
      dispatch({ type: 'SET_CURRENT_REQUEST', payload: null });
    });

    // This forklift accepted — navigate to alert screen for task tracking
    socket.on('accept_confirmed', (data) => {
      dispatch({ type: 'SET_CURRENT_REQUEST', payload: data });
      dispatch({ type: 'SET_INCOMING_REQUEST', payload: null });
      setPendingRequests([]);
      navigation.navigate('ForkliftAlert', { request: data, mode: 'accepted' });
    });

    socket.on('task_timeout', () => {
      dispatch({ type: 'CLEAR_REQUEST' });
      Alert.alert('Task Timeout', 'Your task has timed out and been marked complete. You are now available.');
    });

    socket.on('leave_ended', () => dispatch({ type: 'SET_ON_LEAVE', payload: false }));
    socket.on('error', (data) => Alert.alert('Error', data.message));
  }, [forkliftData, handleForceReset]);

  const handleAccept = (request) => {
    setAcceptingId(request.id);
    acceptRequest(request.id, forkliftData.id);
  };

  const handleDeclinePress = async (request) => {
    const result = await getLeaveComments();
    if (result.success) setLeaveComments(result.data);
    setDecliningRequest(request);
    setShowDeclineModal(true);
  };

  const handleDeclineWithReason = (comment) => {
    setShowDeclineModal(false);
    if (!decliningRequest) return;
    Alert.alert('Confirm Decline', 'Decline this request? Reason: ' + comment.comment, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Confirm',
        onPress: () => {
          declineRequest(decliningRequest.id, forkliftData.id, comment.comment);
          dispatch({ type: 'SET_ON_LEAVE', payload: true });
          setPendingRequests(prev => prev.filter(r => r.id !== decliningRequest.id));
          setDecliningRequest(null);
        },
      },
    ]);
  };

  const handleDeclineNoReason = () => {
    setShowDeclineModal(false);
    if (!decliningRequest) return;
    Alert.alert('Confirm Decline', 'Decline without a reason?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Confirm',
        onPress: () => {
          declineRequest(decliningRequest.id, forkliftData.id, null);
          setPendingRequests(prev => prev.filter(r => r.id !== decliningRequest.id));
          setDecliningRequest(null);
        },
      },
    ]);
  };

  const handleGoOnLeave = async () => {
    setLoadingComments(true);
    const result = await getLeaveComments();
    if (result.success) setLeaveComments(result.data);
    setLoadingComments(false);
    setShowLeaveModal(true);
  };

  const handleSelectLeaveReason = (comment) => {
    setShowLeaveModal(false);
    Alert.alert('Confirm Leave', 'Going on leave: ' + comment.comment, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Confirm',
        onPress: () => {
          dispatch({ type: 'SET_ON_LEAVE', payload: true });
          setPendingRequests([]);
          const socket = getSocket();
          if (socket) socket.emit('go_on_leave', { forklift_id: forkliftData.id, reason: comment.comment });
        },
      },
    ]);
  };

  const handleReturnFromLeave = () => {
    Alert.alert('Return from Leave', 'Are you ready to receive requests again?', [
      { text: 'Not yet', style: 'cancel' },
      { text: 'Yes, Return', onPress: () => { returnFromLeave(forkliftData.id); dispatch({ type: 'SET_ON_LEAVE', payload: false }); } },
    ]);
  };

  const getStatusColor = () => !isConnected ? COLORS.danger : isOnLeave ? COLORS.warning : state.currentRequest ? COLORS.warning : COLORS.success;
  const getStatusText = () => !isConnected ? 'Disconnected' : isOnLeave ? 'On Leave' : state.currentRequest ? 'On Task' : pendingRequests.length > 0 ? 'Requests Pending' : 'Available';

  return (
    <SafeAreaView style={styles.container}>
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

        {/* Status Card */}
        <View style={[styles.statusCard, { borderColor: getStatusColor() }]}>
          <View style={[styles.statusDot, { backgroundColor: getStatusColor() }]} />
          <Text style={[styles.statusCardTitle, { color: getStatusColor() }]}>{getStatusText()}</Text>
          <Text style={styles.statusCardSub}>
            {!isConnected ? 'Check your network connection'
              : isOnLeave ? 'You are currently on leave'
              : state.currentRequest ? 'Currently handling a task'
              : pendingRequests.length > 0 ? pendingRequests.length + ' request(s) waiting for response'
              : 'Waiting for incoming requests'}
          </Text>
        </View>

        {/* Pending Requests List (Option A) */}
        {!isOnLeave && !state.currentRequest && pendingRequests.length > 0 ? (
          <View style={styles.requestsSection}>
            <Text style={styles.requestsSectionTitle}>Incoming Requests ({pendingRequests.length})</Text>
            {pendingRequests.map((req) => (
              <View key={req.id} style={styles.requestCard}>
                <View style={styles.requestInfo}>
                  <Text style={styles.requestCell}>Cell {req.cell_number}</Text>
                  {req.operator_name ? <Text style={styles.requestOperator}>{req.operator_name}</Text> : null}
                  <Text style={styles.requestType}>{req.forklift_type_name}</Text>
                </View>
                <View style={styles.requestActions}>
                  <TouchableOpacity
                    style={[styles.requestBtn, { backgroundColor: COLORS.success }]}
                    onPress={() => handleAccept(req)}
                    disabled={acceptingId === req.id}
                  >
                    <Text style={styles.requestBtnText}>{acceptingId === req.id ? '...' : 'Accept'}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.requestBtn, { backgroundColor: COLORS.danger }]}
                    onPress={() => handleDeclinePress(req)}
                  >
                    <Text style={styles.requestBtnText}>Decline</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        ) : null}

        {/* Active Task */}
        {state.currentRequest && !isOnLeave ? (
          <View style={styles.taskCard}>
            <Text style={styles.taskTitle}>Active Task</Text>
            <View style={styles.taskRow}><Text style={styles.taskLabel}>Cell</Text><Text style={styles.taskValue}>Cell {state.currentRequest.cell_number}</Text></View>
            <View style={styles.taskRow}><Text style={styles.taskLabel}>Type</Text><Text style={styles.taskValue}>{state.currentRequest.forklift_type_name}</Text></View>
            {state.currentRequest.operator_name ? <View style={styles.taskRow}><Text style={styles.taskLabel}>Operator</Text><Text style={styles.taskValue}>{state.currentRequest.operator_name}</Text></View> : null}
          </View>
        ) : null}

        {/* Leave Button */}
        <View style={styles.actions}>
          {!isOnLeave ? (
            <TouchableOpacity style={[styles.actionButton, { backgroundColor: COLORS.warning }]} onPress={handleGoOnLeave}>
              <Text style={styles.actionButtonText}>Go On Leave</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={[styles.actionButton, { backgroundColor: COLORS.success }]} onPress={handleReturnFromLeave}>
              <Text style={styles.actionButtonText}>Return from Leave</Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>

      {/* Leave Modal */}
      <Modal visible={showLeaveModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Select Leave Reason</Text>
            {loadingComments ? <Text style={styles.loadingText}>Loading...</Text> :
              leaveComments.length === 0 ? <Text style={styles.emptyText}>No leave reasons configured.</Text> : (
                <FlatList
                  data={leaveComments}
                  keyExtractor={(item) => item.id.toString()}
                  renderItem={({ item }) => (
                    <TouchableOpacity style={styles.commentItem} onPress={() => handleSelectLeaveReason(item)}>
                      <Text style={styles.commentText}>{item.comment}</Text>
                    </TouchableOpacity>
                  )}
                />
              )}
            <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setShowLeaveModal(false)}>
              <Text style={styles.modalCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Decline Reason Modal */}
      <Modal visible={showDeclineModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Reason for Declining</Text>
            {leaveComments.map((item) => (
              <TouchableOpacity key={item.id.toString()} style={styles.commentItem} onPress={() => handleDeclineWithReason(item)}>
                <Text style={styles.commentText}>{item.comment}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={styles.noReasonBtn} onPress={handleDeclineNoReason}>
              <Text style={styles.noReasonText}>Decline without reason</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setShowDeclineModal(false)}>
              <Text style={styles.modalCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, backgroundColor: COLORS.white, borderBottomWidth: 1, borderBottomColor: COLORS.lightGray },
  forkliftName: { fontSize: 22, fontWeight: 'bold', color: COLORS.text },
  forkliftType: { fontSize: 14, color: COLORS.textSecondary, marginTop: 2 },
  statusBadge: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  statusText: { color: COLORS.white, fontSize: 12, fontWeight: 'bold' },
  content: { flex: 1, padding: 20 },
  statusCard: { backgroundColor: COLORS.white, borderRadius: 16, padding: 24, alignItems: 'center', marginBottom: 20, borderWidth: 2, elevation: 4 },
  statusDot: { width: 16, height: 16, borderRadius: 8, marginBottom: 12 },
  statusCardTitle: { fontSize: 24, fontWeight: 'bold', marginBottom: 8 },
  statusCardSub: { fontSize: 14, color: COLORS.textSecondary, textAlign: 'center' },
  requestsSection: { marginBottom: 20 },
  requestsSectionTitle: { fontSize: 16, fontWeight: 'bold', color: COLORS.text, marginBottom: 12 },
  requestCard: { backgroundColor: COLORS.white, borderRadius: 12, padding: 16, marginBottom: 10, borderLeftWidth: 4, borderLeftColor: COLORS.danger, elevation: 3, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  requestInfo: { flex: 1 },
  requestCell: { fontSize: 17, fontWeight: 'bold', color: COLORS.text },
  requestOperator: { fontSize: 13, color: COLORS.textSecondary, marginTop: 2 },
  requestType: { fontSize: 13, color: COLORS.primary, fontWeight: 'bold', marginTop: 4 },
  requestActions: { flexDirection: 'column', gap: 8, marginLeft: 12 },
  requestBtn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8, alignItems: 'center', minWidth: 80 },
  requestBtnText: { color: COLORS.white, fontWeight: 'bold', fontSize: 14 },
  taskCard: { backgroundColor: COLORS.white, borderRadius: 12, padding: 20, marginBottom: 20, elevation: 2, borderLeftWidth: 4, borderLeftColor: COLORS.warning },
  taskTitle: { fontSize: 16, fontWeight: 'bold', color: COLORS.text, marginBottom: 12 },
  taskRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: COLORS.lightGray },
  taskLabel: { fontSize: 14, color: COLORS.textSecondary },
  taskValue: { fontSize: 14, fontWeight: 'bold', color: COLORS.text },
  actions: { marginBottom: 16 },
  actionButton: { borderRadius: 12, padding: 16, alignItems: 'center', elevation: 4 },
  actionButtonText: { color: COLORS.white, fontSize: 16, fontWeight: 'bold' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalBox: { backgroundColor: COLORS.white, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, maxHeight: '60%' },
  modalTitle: { fontSize: 18, fontWeight: 'bold', color: COLORS.text, marginBottom: 16, textAlign: 'center' },
  commentItem: { padding: 16, borderBottomWidth: 1, borderBottomColor: COLORS.lightGray },
  commentText: { fontSize: 15, color: COLORS.text },
  noReasonBtn: { padding: 16, alignItems: 'center' },
  noReasonText: { fontSize: 14, color: COLORS.textSecondary, textDecorationLine: 'underline' },
  modalCancelBtn: { marginTop: 8, padding: 14, backgroundColor: COLORS.lightGray, borderRadius: 8, alignItems: 'center' },
  modalCancelText: { fontSize: 15, fontWeight: 'bold', color: COLORS.darkGray },
  loadingText: { textAlign: 'center', color: COLORS.textSecondary, padding: 20 },
  emptyText: { textAlign: 'center', color: COLORS.textSecondary, padding: 20 },
});