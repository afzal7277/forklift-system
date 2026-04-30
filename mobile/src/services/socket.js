import { io } from 'socket.io-client';
import { CONFIG } from '../constants/config';
import { processQueue, addToQueue } from './offlineQueue';

let socket = null;
let heartbeatInterval = null;
let forceResetCallback = null;

export function getSocket() {
  return socket;
}

export function setForceResetCallback(cb) {
  forceResetCallback = cb;
}

export function connectSocket(onConnect, onDisconnect, deviceId) {
  if (socket && socket.connected) {
    return socket;
  }

  socket = io(CONFIG.SOCKET_URL, {
    transports: ['websocket'],
    reconnection: true,
    reconnectionAttempts: CONFIG.RECONNECT_ATTEMPTS,
    reconnectionDelay: CONFIG.RECONNECT_DELAY,
  });

  socket.on('connect', () => {
    console.log('Socket connected: ' + socket.id);
    startHeartbeat();
    processQueue(socket);
    if (onConnect) onConnect();

    // Listen for force reset targeted at this device (fix #1)
    if (deviceId) {
      socket.on('force_reset_' + deviceId, () => {
        console.log('Force reset received for device: ' + deviceId);
        if (forceResetCallback) forceResetCallback();
      });
    }
  });

  socket.on('disconnect', (reason) => {
    console.log('Socket disconnected: ' + reason);
    stopHeartbeat();
    if (onDisconnect) onDisconnect(reason);
  });

  socket.on('connect_error', (error) => {
    console.log('Socket connection error: ' + error.message);
  });

  return socket;
}

export function disconnectSocket() {
  if (socket) {
    stopHeartbeat();
    socket.disconnect();
    socket = null;
  }
}

export function registerAsCell(cell_id) {
  if (socket) socket.emit('register_cell', { cell_id });
}

export function registerAsForklift(forklift_id) {
  if (socket) socket.emit('register_forklift', { forklift_id });
}

export function registerAsSupervisor() {
  if (socket) socket.emit('register_supervisor');
}

export function sendRequest(cell_id, forklift_type_id) {
  if (socket && socket.connected) {
    socket.emit('send_request', { cell_id, forklift_type_id });
  } else {
    addToQueue({ type: 'send_request', data: { cell_id, forklift_type_id } });
  }
}

export function acceptRequest(request_id, forklift_id) {
  if (socket) socket.emit('accept_request', { request_id, forklift_id });
}

export function declineRequest(request_id, forklift_id, reason = null) {
  if (socket) socket.emit('decline_request', { request_id, forklift_id, reason });
}

export function completeRequest(request_id, forklift_id) {
  if (socket && socket.connected) {
    socket.emit('complete_request', { request_id, forklift_id });
  } else {
    addToQueue({ type: 'complete_request', data: { request_id, forklift_id } });
  }
}

export function cancelRequest(request_id) {
  if (socket) socket.emit('cancel_request', { request_id });
}

export function returnFromLeave(forklift_id) {
  if (socket) socket.emit('return_from_leave', { forklift_id });
}

function startHeartbeat() {
  stopHeartbeat();
  heartbeatInterval = setInterval(() => {
    if (socket && socket.connected) {
      socket.emit('heartbeat', { timestamp: new Date().toISOString() });
    }
  }, CONFIG.HEARTBEAT_INTERVAL);
}

function stopHeartbeat() {
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  }
}