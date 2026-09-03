import axios from 'axios';

const getBaseUrl = () => {
  if (window.electronAPI?.getApiUrl) {
    return window.electronAPI.getApiUrl();
  }
  return 'http://127.0.0.1:10000';
};

const api = axios.create({
  baseURL: `${getBaseUrl()}/api/v1/cards`,
  timeout: 120000,
});

export const getCardTemplates = async () => {
  const res = await api.get('/templates');
  return res.data;
};

export const getTemplateSamplePreview = async (templateId, side = 'front') => {
  const res = await api.get(`/templates/${templateId}/preview?side=${side}`, {
    responseType: 'text',
  });
  return res.data;
};


export const importCardFile = async (file, sheetName = null) => {
  const formData = new FormData();
  formData.append('file', file);
  if (sheetName) formData.append('sheetName', sheetName);

  const res = await api.post('/import-file', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return res.data;
};

export const matchCardPhotos = async (payload) => {
  const res = await api.post('/match-photos', payload);
  return res.data;
};

export const processCardPhotoQueue = async (payload) => {
  const res = await api.post('/process-queue', payload);
  return res.data;
};

export const validateCardProject = async (projectId) => {
  const res = await api.post(`/validate/${projectId}`);
  return res.data;
};

export const renderCardPreviewHtml = async ({ projectId, recordId, side = 'front' }) => {
  const res = await api.post('/render-preview', { projectId, recordId, side }, {
    responseType: 'text',
  });
  return res.data;
};

export const generateCardPdfBlob = async (payload) => {
  const res = await api.post('/generate-pdf', payload, {
    responseType: 'blob',
  });
  return res.data;
};

export const saveCardProject = async (project) => {
  const res = await api.post('/projects/save', project);
  return res.data;
};

export const listCardProjects = async () => {
  const res = await api.get('/projects');
  return res.data;
};

export const getCardProject = async (projectId) => {
  const res = await api.get(`/projects/${projectId}`);
  return res.data;
};

export const deleteCardProject = async (projectId) => {
  const res = await api.delete(`/projects/${projectId}`);
  return res.data;
};
