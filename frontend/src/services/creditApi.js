import axios from 'axios';

const getBaseUrl = () => {
  if (typeof window !== 'undefined' && window.electronAPI?.getApiUrl) {
    return window.electronAPI.getApiUrl();
  }
  return 'http://127.0.0.1:10000';
};

const getClient = () => {
  return axios.create({
    baseURL: `${getBaseUrl()}/api/v1/credits`,
    timeout: 10000,
    headers: { 'Content-Type': 'application/json' },
  });
};

export const fetchCreditStatus = async () => {
  const res = await getClient().get('/status');
  return res.data;
};

export const deductCreditsApi = async ({ type, count = 1, description }) => {
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
