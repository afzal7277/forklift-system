import AsyncStorage from '@react-native-async-storage/async-storage';

const QUEUE_KEY = 'offline_queue';

export async function addToQueue(action) {
  try {
    const existing = await getQueue();
    const updated = [
      ...existing,
      {
        id: Date.now().toString(),
        action,
        timestamp: new Date().toISOString(),
        retries: 0,
      },
    ];
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(updated));
    console.log('Added to offline queue: ' + action.type);
  } catch (error) {
    console.log('Queue add error: ' + error.message);
  }
}

export async function getQueue() {
  try {
    const data = await AsyncStorage.getItem(QUEUE_KEY);
    return data ? JSON.parse(data) : [];
  } catch (error) {
    console.log('Queue get error: ' + error.message);
    return [];
  }
}

export async function removeFromQueue(id) {
  try {
    const existing = await getQueue();
    const updated = existing.filter((item) => item.id !== id);
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(updated));
  } catch (error) {
    console.log('Queue remove error: ' + error.message);
  }
}

export async function clearQueue() {
  try {
    await AsyncStorage.removeItem(QUEUE_KEY);
  } catch (error) {
    console.log('Queue clear error: ' + error.message);
  }
}

export async function processQueue(socket) {
  const queue = await getQueue();

  if (queue.length === 0) return;

  console.log('Processing offline queue: ' + queue.length + ' items');

  for (const item of queue) {
    try {
      if (!socket || !socket.connected) {
        console.log('Socket not connected, stopping queue processing');
        break;
      }

      const { action } = item;

      switch (action.type) {
        case 'send_request':
          socket.emit('send_request', action.data);
          break;
        case 'accept_request':
          socket.emit('accept_request', action.data);
          break;
        case 'decline_request':
          socket.emit('decline_request', action.data);
          break;
        case 'complete_request':
          socket.emit('complete_request', action.data);
          break;
        case 'cancel_request':
          socket.emit('cancel_request', action.data);
          break;
        default:
          console.log('Unknown queue action: ' + action.type);
      }

      await removeFromQueue(item.id);
      console.log('Processed queue item: ' + action.type);

    } catch (error) {
      console.log('Queue process error: ' + error.message);
    }
  }
}