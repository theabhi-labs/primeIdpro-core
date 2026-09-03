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

// Templates
export const getCardTemplates = async () => {
  const res = await getClient().get('/templates');
  return res.data;
};

export const getTemplateSamplePreview = async (templateId, side = 'front') => {
  const res = await getClient().get(`/templates/${templateId}/preview?side=${side}`, {
    responseType: 'text',
  });
  return res.data;
};

export const renderCardPreviewHtml = async (templateId, record, side = 'front') => {
  const res = await getClient().post(`/templates/${templateId}/render-preview?side=${side}`, record, {
    responseType: 'text',
  });
  return res.data;
};

export const getTemplatePreviewWithData = renderCardPreviewHtml;

// Data import & matching
export const importCardFile = async (formData) => {
  const res = await getClient().post('/parse-file', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return res.data;
};
export const parseDataFileApi = importCardFile;

export const matchCardPhotos = async (formData) => {
  const res = await getClient().post('/match-photos', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 300000,
  });
  return res.data;
};
export const matchPhotosApi = matchCardPhotos;

export const processCardPhotoQueue = async (payload) => {
  const res = await getClient().post('/process-photos', payload, {
    timeout: 600000,
  });
  return res.data;
};

// Projects CRUD
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
  const res = await getClient().post('/projects', projectData);
  return res.data;
};
export const createCardProjectApi = saveCardProject;

export const deleteCardProject = async (projectId) => {
  const res = await getClient().delete(`/projects/${projectId}`);
  return res.data;
};

export const updateCardRecordApi = async (projectId, recordId, updatedData) => {
  const res = await getClient().put(`/projects/${projectId}/records/${recordId}`, updatedData);
  return res.data;
};

export const deleteCardRecordApi = async (projectId, recordId) => {
  const res = await getClient().delete(`/projects/${projectId}/records/${recordId}`);
  return res.data;
};

export const validateCardProject = async (project) => {
  const errors = [];
  if (!project.records || project.records.length === 0) {
    errors.push('No student/employee data records imported.');
  }
  if (!project.templateId) {
    errors.push('No card template selected.');
  }
  return { valid: errors.length === 0, errors };
};

// PDF Generation
export const generateCardPdfBlob = async (payload) => {
  const res = await getClient().post('/generate-pdf', payload, {
    responseType: 'blob',
    timeout: 600000,
  });
  return res.data;
};
export const generateCardPdfApi = generateCardPdfBlob;
