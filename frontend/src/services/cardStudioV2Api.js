import axios from 'axios';
import { getApiBaseUrl } from './api';

const getBaseUrl = () => {
  const base = getApiBaseUrl().replace(/\/api\/v1\/?$/, '');
  return `${base}/api/v2/cards`;
};

const getClient = () => {
  // Use existing token if any auth mechanism is standard. 
  // For the test/development setup Phase 1 uses Bearer token, we pass it.
  const token = localStorage.getItem('auth_token') || 'usera:orga'; // Fallback for dev

  return axios.create({
    baseURL: getBaseUrl(),
    timeout: 120000,
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });
};

// ---------------- TEMPLATES ----------------

export const listTemplatesV2 = async () => {
  const res = await getClient().get('/templates');
  return res.data;
};

export const getTemplateV2 = async (templateId) => {
  const res = await getClient().get(`/templates/${templateId}`);
  return res.data;
};

export const createTemplateV2 = async (templateData) => {
  const res = await getClient().post('/templates', templateData);
  return res.data;
};

export const updateTemplateV2 = async (templateId, templateData) => {
  const res = await getClient().put(`/templates/${templateId}`, templateData);
  return res.data;
};

export const duplicateTemplateV2 = async (templateId) => {
  const res = await getClient().post(`/templates/${templateId}/duplicate`);
  return res.data;
};

export const archiveTemplateV2 = async (templateId) => {
  const res = await getClient().post(`/templates/${templateId}/archive`);
  return res.data;
};

// ---------------- PROJECTS ----------------

export const createProjectV2 = async (projectData) => {
  const res = await getClient().post('/projects', projectData);
  return res.data;
};

export const getProjectV2 = async (projectId) => {
  const res = await getClient().get(`/projects/${projectId}`);
  return res.data;
};

export const listProjectsV2 = async () => {
  const res = await getClient().get('/projects');
  return res.data;
};

export const getProjectSummaryV2 = async (projectId) => {
  const res = await getClient().get(`/projects/${projectId}/summary`);
  return res.data;
};

// ---------------- RECORDS ----------------

export const listRecordsV2 = async (projectId, params) => {
  const res = await getClient().get(`/projects/${projectId}/records`, { params });
  return res.data;
};

export const getRecordV2 = async (projectId, recordId) => {
  const res = await getClient().get(`/projects/${projectId}/records/${recordId}`);
  return res.data;
};

export const createRecordV2 = async (projectId, recordData) => {
  const res = await getClient().post(`/projects/${projectId}/records`, recordData);
  return res.data;
};

export const updateRecordV2 = async (projectId, recordId, recordData) => {
  const res = await getClient().put(`/projects/${projectId}/records/${recordId}`, recordData);
  return res.data;
};

export const deleteRecordV2 = async (projectId, recordId) => {
  const res = await getClient().delete(`/projects/${projectId}/records/${recordId}`);
  return res.data;
};

export const toggleRecordImportantV2 = async (projectId, recordId, important) => {
  const res = await getClient().patch(`/projects/${projectId}/records/${recordId}/important`, { important });
  return res.data;
};

export const updateRecordStatusV2 = async (projectId, recordId, status) => {
  const res = await getClient().patch(`/projects/${projectId}/records/${recordId}/status`, { status });
  return res.data;
};


// ---------------- COLLECTION LINKS ----------------

export const createCollectionLinkV2 = async (projectId, data) => {
  const res = await getClient().post(`/projects/${projectId}/collection-links`, data);
  return res.data;
};

export const listCollectionLinksV2 = async (projectId) => {
  const res = await getClient().get(`/projects/${projectId}/collection-links`);
  return res.data;
};

export const revokeCollectionLinkV2 = async (projectId, linkId) => {
  const res = await getClient().post(`/projects/${projectId}/collection-links/${linkId}/revoke`);
  return res.data;
};

export const regenerateCollectionLinkV2 = async (projectId, linkId) => {
  const res = await getClient().post(`/projects/${projectId}/collection-links/${linkId}/regenerate`);
  return res.data;
};

// ---------------- PUBLIC COLLECTION (UNAUTHENTICATED) ----------------

const publicClient = axios.create({
  baseURL: getBaseUrl(),
  timeout: 120000
});


// (Duplicated lines removed)

export const publicGetCollectionSchemaV2 = async (token) => {
  const res = await publicClient.get(`/collection/${token}`);
  return res.data;
};

export const publicSubmitCollectionV2 = async (token, data) => {
  const res = await publicClient.post(`/collection/${token}`, data);
  return res.data;
};

// ---------------- PRIVATE PHOTOS (PHASE 3C) ----------------

export const uploadPrivatePhotoV2 = async (projectId, file) => {
  const formData = new FormData();
  formData.append('file', file);
  const res = await getClient().post(`/projects/${projectId}/photos`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  });
  return res.data;
};

export const getPrivatePhotoUrlV2 = (projectId, photoId) => {
  // Return the URL that can be used directly if passed with Auth headers
  // For standard <img> tags, we typically fetch it and createObjectURL in the component
  return `${getBaseUrl()}/projects/${projectId}/photos/${photoId}`;
};

export const fetchPrivatePhotoBlobV2 = async (projectId, photoId) => {
  const res = await getClient().get(`/projects/${projectId}/photos/${photoId}`, {
    responseType: 'blob'
  });
  return res.data;
};

// ---------------- BULK RECORDS (PHASE 3C) ----------------

export const bulkCreateRecordsV2 = async (projectId, batchId, records) => {
  const res = await getClient().post(`/projects/${projectId}/records/bulk`, {
    batch_id: batchId,
    records: records
  });
  return res.data;
};

// ---------------- GENERATION & PRINTING (PHASE 4) ----------------

export const createGenerationJobV2 = async (projectId, recordIds, layoutConfig) => {
  const res = await getClient().post(`/projects/${projectId}/generation-jobs`, {
    record_ids: recordIds,
    layout: layoutConfig
  });
  return res.data;
};

export const getGenerationJobV2 = async (jobId) => {
  const res = await getClient().get(`/generation-jobs/${jobId}`);
  return res.data;
};

export const getGenerationPdfUrlV2 = (jobId) => {
  // Returns the URL for direct download or iframe display (requires auth if not using cookie, but since we use token, it's better to fetch as blob)
  return `${getBaseUrl()}/generation-jobs/${jobId}/pdf`;
};

export const downloadGenerationPdfV2 = async (jobId) => {
  const res = await getClient().get(`/generation-jobs/${jobId}/pdf`, {
    responseType: 'blob'
  });
  return res.data;
};
