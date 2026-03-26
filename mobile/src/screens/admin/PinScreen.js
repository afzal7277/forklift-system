import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS } from '../../constants/config';
import { changePin } from '../../services/api';

export default function PinScreen({ navigation }) {
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [loading, setLoading] = useState(false);

  const handleChangePin = async () => {
    if (!currentPin || !newPin || !confirmPin) {
      Alert.alert('Error', 'All fields are required');
      return;
    }
    if (newPin !== confirmPin) {
      Alert.alert('Error', 'New PINs do not match');
      return;
    }
    if (newPin.length < 4) {
      Alert.alert('Error', 'PIN must be at least 4 digits');
      return;
    }
    setLoading(true);
    const result = await changePin(currentPin, newPin);
    if (result.success) {
      Alert.alert('Success', 'PIN changed successfully', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
      setCurrentPin('');
      setNewPin('');
      setConfirmPin('');
    } else {
      Alert.alert('Error', result.message);
    }
    setLoading(false);
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
        <Text style={styles.title}>Change PIN</Text>
        <View style={{ width: 60 }} />
      </View>

      <View style={styles.content}>
        <Text style={styles.label}>Current PIN</Text>
        <TextInput
          style={styles.input}
          value={currentPin}
          onChangeText={setCurrentPin}
          keyboardType="numeric"
          secureTextEntry
          maxLength={6}
          placeholder="Enter current PIN"
          placeholderTextColor={COLORS.gray}
        />
        <Text style={styles.label}>New PIN</Text>
        <TextInput
          style={styles.input}
          value={newPin}
          onChangeText={setNewPin}
          keyboardType="numeric"
          secureTextEntry
          maxLength={6}
          placeholder="Enter new PIN"
          placeholderTextColor={COLORS.gray}
        />
        <Text style={styles.label}>Confirm New PIN</Text>
        <TextInput
          style={styles.input}
          value={confirmPin}
          onChangeText={setConfirmPin}
          keyboardType="numeric"
          secureTextEntry
          maxLength={6}
          placeholder="Confirm new PIN"
          placeholderTextColor={COLORS.gray}
        />
        <TouchableOpacity
          style={styles.button}
          onPress={handleChangePin}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color={COLORS.white} />
          ) : (
            <Text style={styles.buttonText}>Change PIN</Text>
          )}
        </TouchableOpacity>
      </View>
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
  content: { flex: 1, padding: 24 },
  label: { fontSize: 13, color: COLORS.textSecondary, marginBottom: 6 },
  input: {
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    padding: 12,
    fontSize: 18,
    color: COLORS.text,
    marginBottom: 16,
    textAlign: 'center',
    letterSpacing: 4,
  },
  button: {
    backgroundColor: COLORS.primary,
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonText: { color: COLORS.white, fontSize: 15, fontWeight: 'bold' },
});