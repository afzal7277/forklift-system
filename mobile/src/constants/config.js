const SERVER_IP = process.env.EXPO_PUBLIC_SERVER_IP;
const SERVER_PORT = process.env.EXPO_PUBLIC_SERVER_PORT || '3000';

export const CONFIG = {
  SERVER_URL: `http://${SERVER_IP}:${SERVER_PORT}`,
  SOCKET_URL: `http://${SERVER_IP}:${SERVER_PORT}`,
  ADMIN_PIN_LENGTH: 4,
  HEARTBEAT_INTERVAL: 10000,
  RECONNECT_ATTEMPTS: 5,
  RECONNECT_DELAY: 3000,
};

export const FORKLIFT_TYPES = [
  { id: 1, name: '3T' },
  { id: 2, name: '3.5T' },
  { id: 3, name: '7T Prod' },
  { id: 4, name: '7T Galv' },
];

export const REQUEST_STATUS = {
  PENDING: 'pending',
  ACCEPTED: 'accepted',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
};

export const FORKLIFT_STATUS = {
  AVAILABLE: 'available',
  BUSY: 'busy',
  ON_LEAVE: 'on_leave',
};

export const COLORS = {
  primary: '#1A73E8',
  success: '#2E7D32',
  warning: '#F57C00',
  danger: '#C62828',
  background: '#F5F5F5',
  white: '#FFFFFF',
  black: '#000000',
  gray: '#9E9E9E',
  lightGray: '#E0E0E0',
  darkGray: '#424242',
  text: '#212121',
  textSecondary: '#757575',
  border: '#BDBDBD',
  available: '#2E7D32',
  busy: '#F57C00',
  on_leave: '#C62828',
  pending: '#1A73E8',
};

export const TABLET_MODES = {
  CELL: 'cell',
  FORKLIFT: 'forklift',
};