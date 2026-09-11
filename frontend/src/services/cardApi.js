import axios from 'axios';
import { getApiBaseUrl } from './api';

const getBaseUrl = () => {
  const base = getApiBaseUrl().replace(/\/api\/v1\/?$/, '');
  return `${base}/api/v1/cards`;
};

const getClient = () => {
  return axios.create({
    baseURL: getBaseUrl(),
    timeout: 120000,
  });
};

// ---------------- TEMPLATES ----------------
export const getCardTemplates = async () => {
  const res = await getClient().get('/templates');
  return res.data;
};
export const getCardTemplatesApi = getCardTemplates;

export const getTemplateSamplePreview = async (templateId, side = 'front') => {
  const res = await getClient().get(`/templates/${templateId}/preview?side=${side}`, {
    responseType: 'text',
  });
  return res.data;
};

export const uploadCustomTemplateApi = async (formData) => {
  const res = await getClient().post('/templates/custom-upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return res.data;
};

// ---------------- PROJECTS CRUD ----------------
export const listCardProjects = async () => {
  const res = await getClient().get('/projects');
  return res.data;
};
export const listCardProjectsApi = listCardProjects;

export const getCardProject = async (projectId) => {
  const res = await getClient().get(`/projects/${projectId}`);
  return res.data;
};
export const getCardProjectApi = getCardProject;

export const saveCardProject = async (projectData) => {
  const res = await getClient().post('/projects/save', projectData);
  return res.data;
};
export const saveCardProjectApi = saveCardProject;
export const createCardProjectApi = saveCardProject;

export const deleteCardProject = async (projectId) => {
  const res = await getClient().delete(`/projects/${projectId}`);
  return res.data;
};
export const deleteCardProjectApi = deleteCardProject;

// ---------------- BATCHES & SESSIONS ----------------
export const lockBatchApi = async (projectId, batchId) => {
  const res = await getClient().post(`/projects/${projectId}/batches/${batchId}/lock`);
  return res.data;
};

export const createNewBatchApi = async (projectId, name = null) => {
  const res = await getClient().post(`/projects/${projectId}/batches/new`, null, {
    params: { name },
  });
  return res.data;
};

export const importCardFile = async (formDataOrFile, sheetName = null) => {
  let fd;
  if (formDataOrFile instanceof FormData) {
    fd = formDataOrFile;
  } else {
    fd = new FormData();
    fd.append('file', formDataOrFile);
    if (sheetName) fd.append('sheetName', sheetName);
  }
  const res = await getClient().post('/import-file', fd, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return res.data;
};
export const parseDataFileApi = importCardFile;

export const matchCardPhotos = async (payload) => {
  const res = await getClient().post('/match-photos', payload, {
    timeout: 300000,
  });
  return res.data;
};
export const matchPhotosApi = matchCardPhotos;

export const processCardPhotoQueue = async (payload) => {
  const res = await getClient().post('/process-queue', payload, {
    timeout: 600000,
  });
  return res.data;
};

export const processSinglePhotoApi = async ({ projectId, photoDataUrl, recordName, bgColor, forceReprocess }) => {
  const res = await getClient().post('/process-single-photo', {
    projectId,
    photoDataUrl,
    recordName,
    bgColor,
    forceReprocess: Boolean(forceReprocess),
  }, {
    timeout: 60000,
  });
  return res.data;
};

// ---------------- RENDER PREVIEW ----------------
export const renderPreviewApi = async ({ projectId, recordId, side = 'front' }) => {
  const res = await getClient().post(
    '/render-preview',
    { projectId, recordId, side },
    { responseType: 'text' }
  );
  return res.data;
};
export const getTemplatePreviewWithData = renderPreviewApi;

export const renderLiveSampleApi = async ({ templateId, side = 'front', org = null }) => {
  const res = await getClient().post(
    `/render-live-sample?templateId=${templateId}&side=${side}`,
    org || {},
    { responseType: 'text' }
  );
  return res.data;
};

// ---------------- PDF GENERATION ----------------
export const generateCardPdfBlob = async (payload) => {
  const res = await getClient().post('/generate-pdf', payload, {
    responseType: 'blob',
    timeout: 600000,
  });
  return res.data;
};
export const generateCardPdfApi = generateCardPdfBlob;
