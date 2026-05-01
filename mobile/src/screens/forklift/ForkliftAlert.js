import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, Animated } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Audio } from 'expo-av';
import { useApp } from '../../context/AppContext';
import { COLORS } from '../../constants/config';
import { completeRequest, getSocket } from '../../services/socket';

// This screen is now only for ACCEPTED tasks — tracking elapsed time and completing
export default function ForkliftAlertScreen({ navigation, route }) {
  const { state, dispatch } = useApp();
  const { forkliftData } = state;

  const request = route.params?.request;
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef(null);
  const soundRef = useRef(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    startPulse();
    startElapsedTimer();
    setupSocketListeners();
    playAcceptSound();

    return () => {
      stopTimers();
      stopSound();
      const socket = getSocket();
      if (socket) {
        socket.off('complete_confirmed');
        socket.off('request_cancelled');
        socket.off('task_timeout');
      }
    };
  }, []);

  const playAcceptSound = async () => {
    try {
      await Audio.setAudioModeAsync({ playsInSilentModeIOS: true, staysActiveInBackground: true });
      const { sound } = await Audio.Sound.createAsync(
        require('../../../assets/alert.mp3'),
        { shouldPlay: true, isLooping: false, volume: 1.0 }
      );
      soundRef.current = sound;
    } catch (err) { console.log('Sound error:', err.message); }
  };

  const stopSound = async () => {
    try {
      if (soundRef.current) {
        await soundRef.current.stopAsync();
        await soundRef.current.unloadAsync();
        soundRef.current = null;
      }
    } catch (err) { console.log('Stop sound error:', err.message); }
  };

  const startElapsedTimer = () => {
    timerRef.current = setInterval(() => setElapsed(prev => prev + 1), 1000);
  };

  const startPulse = () => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.05, duration: 800, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
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

    socket.on('complete_confirmed', () => {
      stopSound();
      dispatch({ type: 'CLEAR_REQUEST' });
      navigation.navigate('ForkliftHome');
    });

    socket.on('request_cancelled', () => {
      stopSound();
      dispatch({ type: 'CLEAR_REQUEST' });
      Alert.alert('Request Cancelled', 'The cell cancelled this request.',
        [{ text: 'OK', onPress: () => navigation.navigate('ForkliftHome') }]
      );
    });

    socket.on('task_timeout', () => {
      stopSound();
      dispatch({ type: 'CLEAR_REQUEST' });
      Alert.alert('Task Timeout', 'Task timed out and marked complete. You are now available.',
        [{ text: 'OK', onPress: () => navigation.navigate('ForkliftHome') }]
      );
    });
  };

  const handleComplete = () => {
    Alert.alert('Complete Task', 'Mark this task as complete?', [
      { text: 'Not yet', style: 'cancel' },
      { text: 'Complete', onPress: () => { stopSound(); completeRequest(request.id, forkliftData.id); } },
    ]);
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
          <TouchableOpacity style={styles.backButton} onPress={() => navigation.navigate('ForkliftHome')}>
            <Text style={styles.backButtonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Animated.View style={[styles.acceptedCircle, { transform: [{ scale: pulseAnim }] }]}>
          <Text style={styles.circleText}>TASK</Text>
          <Text style={styles.circleText}>ACCEPTED</Text>
        </Animated.View>

        <View style={styles.infoCard}>
          <View style={styles.infoRow}><Text style={styles.infoLabel}>Cell</Text><Text style={styles.infoValue}>Cell {request.cell_number}</Text></View>
          <View style={styles.infoRow}><Text style={styles.infoLabel}>Type</Text><Text style={styles.infoValue}>{request.forklift_type_name}</Text></View>
          {request.operator_name ? <View style={styles.infoRow}><Text style={styles.infoLabel}>Operator</Text><Text style={styles.infoValue}>{request.operator_name}</Text></View> : null}
          {request.forklift_name ? <View style={styles.infoRow}><Text style={styles.infoLabel}>Forklift</Text><Text style={styles.infoValue}>{request.forklift_name}</Text></View> : null}
          <View style={styles.timerRow}>
            <Text style={styles.timerLabel}>Elapsed</Text>
            <Text style={styles.timerValue}>{formatTime(elapsed)}</Text>
          </View>
        </View>

        <TouchableOpacity style={styles.completeBtn} onPress={handleComplete}>
          <Text style={styles.completeBtnText}>Mark Task Complete</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { flex: 1, padding: 24, alignItems: 'center', justifyContent: 'center' },
  acceptedCircle: { width: 180, height: 180, borderRadius: 90, backgroundColor: COLORS.success, alignItems: 'center', justifyContent: 'center', marginBottom: 32, elevation: 8 },
  circleText: { color: COLORS.white, fontSize: 18, fontWeight: 'bold', letterSpacing: 2 },
  infoCard: { backgroundColor: COLORS.white, borderRadius: 16, padding: 24, width: '100%', elevation: 4, marginBottom: 24 },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: COLORS.lightGray },
  infoLabel: { fontSize: 15, color: COLORS.textSecondary },
  infoValue: { fontSize: 15, fontWeight: 'bold', color: COLORS.text },
  timerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 12 },
  timerLabel: { fontSize: 15, color: COLORS.textSecondary },
  timerValue: { fontSize: 22, fontWeight: 'bold', color: COLORS.primary },
  completeBtn: { width: '100%', backgroundColor: COLORS.success, borderRadius: 12, padding: 18, alignItems: 'center', elevation: 4 },
  completeBtnText: { color: COLORS.white, fontSize: 18, fontWeight: 'bold' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  errorText: { fontSize: 16, color: COLORS.textSecondary, marginBottom: 16 },
  backButton: { backgroundColor: COLORS.primary, borderRadius: 8, padding: 12, paddingHorizontal: 24 },
  backButtonText: { color: COLORS.white, fontWeight: 'bold' },
});