import { CONFIG } from '../constants/config';

const BASE_URL = CONFIG.SERVER_URL;

async function request(method, endpoint, body = null) {
  const options = {
    method,
    headers: {
      'Content-Type': 'application/json',
    },
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  try {
    const response = await fetch(`${BASE_URL}${endpoint}`, options);
    const data = await response.json();
    return data;
  } catch (error) {
    console.log('API error: ' + error.message);
    return { success: false, message: 'Network error - check connection' };
  }
}

// Auth
export const verifyPin = (pin) => request('POST', '/api/auth/verify-pin', { pin });
export const changePin = (current_pin, new_pin) =>
  request('POST', '/api/auth/change-pin', { current_pin, new_pin });

// Forklifts
export const getForklifts = () => request('GET', '/api/forklifts');
export const getForkliftTypes = () => request('GET', '/api/forklifts/types');
export const createForklift = (data) => request('POST', '/api/forklifts', data);
export const deleteForklift = (id) => request('DELETE', `/api/forklifts/${id}`);

// Cells
export const getCells = () => request('GET', '/api/cells');
export const createCell = (data) => request('POST', '/api/cells', data);
export const updateCell = (id, data) => request('PUT', `/api/cells/${id}`, data);
export const deleteCell = (id) => request('DELETE', `/api/cells/${id}`);

// Requests
export const getRequests = (params = {}) => {
  const query = new URLSearchParams(params).toString();
  return request('GET', `/api/requests${query ? '?' + query : ''}`);
};
export const getKpiSummary = () => request('GET', '/api/requests/kpi/summary');

// Config
export const getConfig = () => request('GET', '/api/config');
export const updateConfig = (key, value) =>
  request('PUT', `/api/config/${key}`, { value });
export const getLeaveComments = () => request('GET', '/api/config/leave-comments');
export const addLeaveComment = (comment) =>
  request('POST', '/api/config/leave-comments', { comment });
export const deleteLeaveComment = (id) =>
  request('DELETE', `/api/config/leave-comments/${id}`);

// Devices
export const registerDevice = (data) =>
  request('POST', '/api/devices/register', data);
export const getDevices = () => request('GET', '/api/devices');
export const deleteDevice = (device_id) =>
  request('DELETE', `/api/devices/${device_id}`);
export const pingDevice = (device_id) =>
  request('PUT', `/api/devices/${device_id}/ping`, {});