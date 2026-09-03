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
