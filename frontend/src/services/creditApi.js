import axios from 'axios';
import { getApiBaseUrl } from './api';

const getClient = () => {
  const base = getApiBaseUrl().replace(/\/api\/v1\/?$/, '');
  return axios.create({
    baseURL: `${base}/api/v1/credits`,
    timeout: 10000,
    headers: { 'Content-Type': 'application/json' },
  });
};

export const fetchCreditStatus = async () => {
  if (window.electronAPI && window.electronAPI.credits) {
    try {
      const res = await window.electronAPI.credits.getStatus();
      if (res.success) {
        return {
          isConnected: true,
          credits: res.balance,
          connectedAccount: 'Local Session',
          tier: res.status === 'DEACTIVATED' ? 'DEACTIVATED' : 'V1',
          rates: { passportPhotoPrint: 2, idCardPrintPerUnit: 5 }
        };
      }
    } catch (e) {
      console.warn('IPC credit status failed, falling back to Python', e);
    }
  }
  const res = await getClient().get('/status');
  return res.data;
};

export const deductCreditsApi = async ({ type, count = 1, description }) => {
  if (window.electronAPI && window.electronAPI.credits) {
    const amount = type === 'passport' ? count * 2 : count * 5;
    const res = await window.electronAPI.credits.reserve({ amount, reason: description, referenceId: Date.now().toString() });
    if (res.success) {
      // For V1, the reservation immediately drops the local balance.
      // We can immediately return the new status.
      const statusRes = await window.electronAPI.credits.getStatus();
      return { success: true, remainingCredits: statusRes.balance };
    }
    throw new Error('Insufficient credits or local debit failed');
  }
  const res = await getClient().post('/deduct', {
    type,
    count,
    description,
  });
  return res.data;
};

export const connectOnlineAccountApi = async ({ accountId, licenseKey }) => {
  const res = await getClient().post('/connect', {
    accountId,
    licenseKey,
  });
  return res.data;
};

export const disconnectOnlineAccountApi = async () => {
  const res = await getClient().post('/disconnect');
  return res.data;
};
