import AsyncStorage from '@react-native-async-storage/async-storage';

const DEVICE_ID_KEY = 'device_id';

function generateId() {
  const timestamp = Date.now().toString(36);
  const random1 = Math.random().toString(36).substring(2, 9);
  const random2 = Math.random().toString(36).substring(2, 9);
  return timestamp + '-' + random1 + '-' + random2;
}

export async function getDeviceId() {
  try {
    let deviceId = await AsyncStorage.getItem(DEVICE_ID_KEY);
    if (!deviceId) {
      deviceId = generateId();
      await AsyncStorage.setItem(DEVICE_ID_KEY, deviceId);
    }
    return deviceId;
  } catch (error) {
    console.log('Device ID error: ' + error.message);
    return generateId();
  }
}