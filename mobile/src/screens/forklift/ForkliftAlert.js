import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { Audio } from 'expo-av';
import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Animated,
  Modal,
  FlatList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useApp } from '../../context/AppContext';
import { COLORS } from '../../constants/config';
import {
  acceptRequest,
  declineRequest,
  completeRequest,
  getSocket,
} from '../../services/socket';
import { getLeaveComments } from '../../services/api';

export default function ForkliftAlertScreen({ navigation, route }) {
  const { state, dispatch } = useApp();
  const { forkliftData } = state;

  const request = route.params?.request;

  const [taskAccepted, setTaskAccepted] = useState(false);
  const [timeoutSeconds, setTimeoutSeconds] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [leaveComments, setLeaveComments] = useState([]);

  const pulseAnim = useRef(new Animated.Value(1)).current;
  const timerRef = useRef(null);

  useEffect(() => {
    activateKeepAwakeAsync();
    playAlertSound();
    startPulse();
    setupSocketListeners();

    const playAlertSound = async () => {
        try {
            const { sound } = await Audio.Sound.createAsync(
            { uri: 'https://www.soundjay.com/buttons/sounds/beep-01a.mp3' },
            { shouldPlay: true, isLooping: true }
            );
            return sound;
        } catch (error) {
            console.log('Sound error: ' + error.message);
        }
    };

    return () => {
      deactivateKeepAwake();
      stopTimers();
      const socket = getSocket();
      if (socket) {
        socket.off('accept_confirmed');
        socket.off('complete_confirmed');
        socket.off('request_taken');
        socket.off('request_cancelled');
        socket.off('task_timeout');
      }
    };
  }, []);

  // Elapsed timer when task is accepted
  useEffect(() => {
    if (taskAccepted) {
      timerRef.current = setInterval(() => {
        setElapsed((prev) => prev + 1);
      }, 1000);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [taskAccepted]);

  const startPulse = () => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.08,
          duration: 600,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 600,
          useNativeDriver: true,
        }),
      ])
    ).start();
  };

  const stopTimers = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    pulseAnim.stopAnimation();
  };

  const setupSocketListeners = () => {
    const socket = getSocket();
    if (!socket) return;

    socket.on('accept_confirmed', (data) => {
      setTaskAccepted(true);
      dispatch({ type: 'SET_CURRENT_REQUEST', payload: data });
      dispatch({ type: 'SET_INCOMING_REQUEST', payload: null });

      // Calculate timeout display
      if (data.timeout_at) {
        const remaining = Math.floor(
          (new Date(data.timeout_at) - Date.now()) / 1000
        );
        setTimeoutSeconds(remaining > 0 ? remaining : 0);
      }
    });

    socket.on('complete_confirmed', () => {
      dispatch({ type: 'CLEAR_REQUEST' });
      navigation.navigate('ForkliftHome');
    });

    socket.on('request_taken', () => {
      // Another forklift took it
      if (!taskAccepted) {
        dispatch({ type: 'SET_INCOMING_REQUEST', payload: null });
        Alert.alert(
          'Request Taken',
          'This request was accepted by another forklift.',
          [{ text: 'OK', onPress: () => navigation.navigate('ForkliftHome') }]
        );
      }
    });

    socket.on('request_cancelled', () => {
      dispatch({ type: 'CLEAR_REQUEST' });
      Alert.alert(
        'Request Cancelled',
        'The cell cancelled this request.',
        [{ text: 'OK', onPress: () => navigation.navigate('ForkliftHome') }]
      );
    });

    socket.on('task_timeout', () => {
      dispatch({ type: 'CLEAR_REQUEST' });
      Alert.alert(
        'Task Timeout',
        'Task timed out and marked complete. You are now available.',
        [{ text: 'OK', onPress: () => navigation.navigate('ForkliftHome') }]
      );
    });
  };

  const handleAccept = () => {
    if (!request) return;
    acceptRequest(request.id, forkliftData.id);
  };

  const handleDecline = async () => {
    const result = await getLeaveComments();
    if (result.success) setLeaveComments(result.data);
    setShowLeaveModal(true);
  };

  const handleDeclineWithReason = (comment) => {
    setShowLeaveModal(false);
    if (!request) return;

    Alert.alert(
      'Confirm Decline',
      'Decline this request? Reason: ' + comment.comment,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          onPress: () => {
            declineRequest(request.id, forkliftData.id, comment.comment);
            dispatch({ type: 'SET_ON_LEAVE', payload: true });
            dispatch({ type: 'SET_INCOMING_REQUEST', payload: null });
            navigation.navigate('ForkliftHome');
          },
        },
      ]
    );
  };

  const handleDeclineNoReason = () => {
    setShowLeaveModal(false);
    if (!request) return;

    Alert.alert(
      'Confirm Decline',
      'Decline this request without a reason?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          onPress: () => {
            declineRequest(request.id, forkliftData.id, null);
            dispatch({ type: 'SET_INCOMING_REQUEST', payload: null });
            navigation.navigate('ForkliftHome');
          },
        },
      ]
    );
  };

  const handleComplete = () => {
    Alert.alert(
      'Complete Task',
      'Mark this task as complete?',
      [
        { text: 'Not yet', style: 'cancel' },
        {
          text: 'Complete',
          onPress: () => {
            completeRequest(request.id, forkliftData.id);
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
          <Text style={styles.errorText}>No request data found.</Text>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.navigate('ForkliftHome')}
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

        {/* Alert / Task header */}
        {!taskAccepted ? (
          <Animated.View
            style={[
              styles.alertCircle,
              { transform: [{ scale: pulseAnim }] },
            ]}
          >
            <Text style={styles.alertCircleText}>INCOMING</Text>
            <Text style={styles.alertCircleText}>REQUEST</Text>
          </Animated.View>
        ) : (
          <View style={[styles.alertCircle, { backgroundColor: COLORS.success }]}>
            <Text style={styles.alertCircleText}>TASK</Text>
            <Text style={styles.alertCircleText}>ACCEPTED</Text>
          </View>
        )}

        {/* Request Info Card */}
        <View style={styles.infoCard}>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Cell</Text>
            <Text style={styles.infoValue}>Cell {request.cell_number}</Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Type Required</Text>
            <Text style={styles.infoValue}>{request.forklift_type_name}</Text>
          </View>

          {request.operator_name ? (
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Operator</Text>
              <Text style={styles.infoValue}>{request.operator_name}</Text>
            </View>
          ) : null}

          {taskAccepted ? (
            <View style={styles.timerRow}>
              <Text style={styles.timerLabel}>Elapsed</Text>
              <Text style={styles.timerValue}>{formatTime(elapsed)}</Text>
            </View>
          ) : null}
        </View>

        {/* Action Buttons */}
        {!taskAccepted ? (
          <View style={styles.buttonRow}>
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: COLORS.danger }]}
              onPress={handleDecline}
            >
              <Text style={styles.actionBtnText}>Decline</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: COLORS.success }]}
              onPress={handleAccept}
            >
              <Text style={styles.actionBtnText}>Accept</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity
            style={styles.completeBtn}
            onPress={handleComplete}
          >
            <Text style={styles.completeBtnText}>Mark Task Complete</Text>
          </TouchableOpacity>
        )}

      </View>

      {/* Leave Reason Modal */}
      <Modal visible={showLeaveModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Reason for Declining</Text>

            {leaveComments.map((item) => (
              <TouchableOpacity
                key={item.id.toString()}
                style={styles.commentItem}
                onPress={() => handleDeclineWithReason(item)}
              >
                <Text style={styles.commentText}>{item.comment}</Text>
              </TouchableOpacity>
            ))}

            <TouchableOpacity
              style={styles.noReasonBtn}
              onPress={handleDeclineNoReason}
            >
              <Text style={styles.noReasonText}>Decline without reason</Text>
            </TouchableOpacity>

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
  content: {
    flex: 1,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  alertCircle: {
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: COLORS.danger,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 32,
    elevation: 8,
  },
  alertCircleText: {
    color: COLORS.white,
    fontSize: 18,
    fontWeight: 'bold',
    letterSpacing: 2,
  },
  infoCard: {
    backgroundColor: COLORS.white,
    borderRadius: 16,
    padding: 24,
    width: '100%',
    elevation: 4,
    marginBottom: 24,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 12,
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
  timerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 12,
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
  buttonRow: {
    flexDirection: 'row',
    gap: 16,
    width: '100%',
  },
  actionBtn: {
    flex: 1,
    borderRadius: 12,
    padding: 18,
    alignItems: 'center',
    elevation: 4,
  },
  actionBtnText: {
    color: COLORS.white,
    fontSize: 18,
    fontWeight: 'bold',
  },
  completeBtn: {
    width: '100%',
    backgroundColor: COLORS.success,
    borderRadius: 12,
    padding: 18,
    alignItems: 'center',
    elevation: 4,
  },
  completeBtnText: {
    color: COLORS.white,
    fontSize: 18,
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
  noReasonBtn: {
    padding: 16,
    alignItems: 'center',
  },
  noReasonText: {
    fontSize: 14,
    color: COLORS.textSecondary,
    textDecorationLine: 'underline',
  },
  modalCancelBtn: {
    marginTop: 8,
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
});