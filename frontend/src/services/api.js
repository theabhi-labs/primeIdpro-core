// frontend/src/services/service.js
import axios from 'axios';

export const getApiBaseUrl = () => {
    if (window.electronAPI && typeof window.electronAPI.getApiUrl === 'function') {
        try {
            return window.electronAPI.getApiUrl();
        } catch (e) {
            console.error('Failed to get API URL from Electron:', e);
        }
    }
    const envUrl = import.meta.env.VITE_API_URL;
    if (envUrl && envUrl.startsWith('http')) {
        return envUrl;
    }
    if (window.location.protocol === 'file:') {
        return 'http://127.0.0.1:10000/api/v1';
    }
    return `${window.location.origin}/api/v1`;
};

const API_BASE_URL = getApiBaseUrl();
console.log(' Service initialized with API_BASE_URL:', API_BASE_URL);

const api = axios.create({
    baseURL: API_BASE_URL,
    headers: {
        'Content-Type': 'application/json',
    },
    timeout: 30000,
});

console.log(' Axios instance created:', api.defaults.baseURL);
console.log("API BASE:", api.defaults.baseURL);

// Request interceptor for adding session ID
api.interceptors.request.use((config) => {
    const sessionId = localStorage.getItem('photo_session_id');
    if (sessionId && !config.headers['X-Session-ID']) {
        config.headers['X-Session-ID'] = sessionId;
        console.log(`🆔 Session ID added to request: ${config.url}`);
    }
    return config;
});

// Response interceptor for error handling
api.interceptors.response.use(
    (response) => response,
    (error) => {
        if (error.response?.status === 429) {
            console.warn(' Rate limit exceeded (429)');
        } else if (error.response?.status === 500) {
            console.error(' Server error (500)');
        } else if (error.response?.status === 404) {
            console.error(' Endpoint not found (404):', error.config?.url);
        } else if (!error.response) {
            console.error(' Network error / no response (Failed to fetch):', error.message);
        }
        return Promise.reject(error);
    }
);

// Pull the most specific, human-readable message out of an axios/fetch error.
// Backend now always returns JSON with a `detail` or `error` field (see
// main.py's exception handlers), so we surface that verbatim to the UI
// instead of a generic "Request failed with status code 500".
export const extractErrorMessage = (error) => {
    if (!error) return 'Unknown error';
    if (!error.response) {
        // No response at all reached the browser: server down, CORS
        // rejection, DNS/network failure, wrong VITE_API_URL, etc.
        return `Network error: ${error.message || 'Failed to fetch'}. Check your connection and that the server is running.`;
    }
    const data = error.response.data;
    if (typeof data === 'string') return data;
    if (data?.detail) {
        if (typeof data.detail === 'string') return data.detail;
        try { return JSON.stringify(data.detail); } catch { /* fall through */ }
    }
    if (data?.error) return data.error;
    return error.message || `Request failed with status ${error.response.status}`;
};

// Retry wrapper for transient failures (network drop, 502/503/504, or a
// database hiccup surfaced as 500). Does NOT retry 4xx errors, since those
// mean the request itself was invalid and retrying won't help.
const RETRYABLE_STATUS = new Set([500, 502, 503, 504]);
export const withRetry = async (fn, { retries = 2, baseDelayMs = 800 } = {}) => {
    let lastError;
    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            return await fn();
        } catch (error) {
            lastError = error;
            const status = error?.response?.status;
            const isNetworkError = !error?.response;
            const retryable = isNetworkError || RETRYABLE_STATUS.has(status);
            if (!retryable || attempt === retries) throw error;
            const delay = baseDelayMs * Math.pow(2, attempt);
            console.warn(`Retrying request (attempt ${attempt + 1}/${retries}) after ${delay}ms...`);
            await new Promise(r => setTimeout(r, delay));
        }
    }
    throw lastError;
};

// ============================================
// UPLOAD ENDPOINTS
// ============================================

// Upload single image
export const uploadImage = async (file, countryCode = 'india') => {
    console.log(` Uploading single file: ${file.name} (${file.size} bytes) for country: ${countryCode}`);
    const formData = new FormData();
    formData.append('file', file);
    formData.append('country_code', countryCode);
    const response = await api.post('/upload/single', formData, {
        headers: {
            'Content-Type': 'multipart/form-data',
        },
        timeout: 60000,
    });
    console.log(` Upload successful, image_id: ${response.data?.data?.image_id}`);
    return response.data;
};

// Upload multiple images
export const uploadBatch = async (files, countryCode = 'india') => {
    console.log(` Uploading batch of ${files.length} files for country: ${countryCode}`);
    const formData = new FormData();
    files.forEach(file => {
        formData.append('files', file);
    });
    formData.append('country_code', countryCode);
    const response = await api.post('/upload/batch', formData, {
        headers: {
            'Content-Type': 'multipart/form-data',
        },
        timeout: 120000,
    });
    console.log(` Batch upload successful, ${response.data?.data?.count} images queued`);
    return response.data;
};

// Upload from URL
export const uploadFromUrl = async (url) => {
    console.log(` Uploading from URL: ${url}`);
    const response = await api.post('/upload/url', { url });
    return response.data;
};

// ============================================
// PROCESS ENDPOINTS
// ============================================

// Process single image
export const processImage = async (imageId, options = {}) => {
    console.log(` Processing image ${imageId} with options:`, options);
    const params = new URLSearchParams({
        background_color: options.bgColor || '#FFFFFF',
        passport_standard: options.standard || '35x45',
        enhance: options.enhance || 'true',
        dpi: options.dpi || '300'
    });
    const response = await api.post(`/process/single/${imageId}?${params}`);
    console.log(` Processing request sent for ${imageId}`);
    return response.data;
};

// Process multiple images
export const processBatch = async (imageIds, options = {}) => {
    console.log(` Processing batch of ${imageIds.length} images`);
    const response = await api.post('/process/batch', {
        image_ids: imageIds,
        options: options
    });
    return response.data;
};

// Check processing status
export const getStatus = async (imageId) => {
    console.log(` Checking status for ${imageId}`);
    const response = await api.get(`/process/status/${imageId}`);
    return response.data;
};

// Get processing queue status
export const getQueueStatus = async () => {
    const response = await api.get('/process/queue');
    return response.data;
};

// Cancel processing
export const cancelProcessing = async (imageId) => {
    console.log(`⏹ Cancelling processing for ${imageId}`);
    const response = await api.delete(`/process/${imageId}`);
    return response.data;
};

// ============================================
// PASSPORT STANDARDS ENDPOINTS
// ============================================

// Get all countries/passport standards
export const getCountries = async () => {
    console.log(' Fetching countries list');
    const response = await api.get('/process/countries');
    console.log(` Received ${response.data?.data?.length} countries`);
    return response.data;
};

// Get specific country standard
export const getCountryStandard = async (countryCode) => {
    console.log(`📍 Fetching standard for country: ${countryCode}`);
    const response = await api.get(`/process/countries/${countryCode}`);
    return response.data;
};

// Get all passport standards
export const getPassportStandards = async () => {
    const response = await api.get('/process/standards');
    return response.data;
};

// ============================================
// SHEET ENDPOINTS
// ============================================

// Generate simple sheet
export const generateSheet = async (sessionId, imageIds, countryCode = 'india', paperSize = 'A4') => {
    console.log(` Generating sheet: session=${sessionId}, images=${imageIds.length}, country=${countryCode}`);
    const response = await api.post('/sheet/generate-simple', {
        session_id: sessionId,
        image_ids: imageIds,
        country_code: countryCode,
        paper_size: paperSize,
    });
    return response.data;
};

// ============================================
// SAVE PROJECT
// ============================================

// Validates the payload client-side before ever hitting the network, so a
// missing/incomplete selection never turns into a wasted round trip or a
// confusing backend error.
export const validateSaveProjectPayload = ({ imageIds, countryCode, paperSize }) => {
    const missing = [];
    if (!imageIds || imageIds.length === 0) missing.push('at least one processed photo');
    if (!countryCode || !String(countryCode).trim()) missing.push('country/passport standard');
    if (!paperSize || !String(paperSize).trim()) missing.push('paper size');
    return { valid: missing.length === 0, missing };
};

// Save (persist) the current project/sheet to the backend.
// Retries automatically on network errors or 500/502/503/504, since those
// are typically transient (e.g. a momentary MongoDB hiccup) - never retries
// 4xx, since that means the request itself needs to change.
export const saveProject = async ({ sessionId, imageIds, countryCode = 'india', paperSize = 'A4', projectName } = {}) => {
    const { valid, missing } = validateSaveProjectPayload({ imageIds, countryCode, paperSize });
    if (!valid) {
        throw new Error(`Cannot save project — missing: ${missing.join(', ')}`);
    }

    console.log(` Saving project: session=${sessionId}, images=${imageIds.length}, country=${countryCode}`);

    return withRetry(async () => {
        const response = await api.post('/project/save', {
            session_id: sessionId,
            image_ids: imageIds,
            country_code: countryCode,
            paper_size: paperSize,
            project_name: projectName,
        });
        console.log(` Project saved: ${response.data?.project_id}`);
        return response.data;
    });
};

// Generate advanced sheet with full options
export const generateAdvancedSheet = async (sessionId, imageIds, options = {}) => {
    const {
        countryCode = 'india',
        paperSize = 'A4',
        rows = 3,
        cols = 3,
        background = 'white',
        spacing = 0.05,
        margin = 0.05,
        addCutLines = true,
        addLabels = false,
        dpi = 300,
        photoSize = '2x2'
    } = options;

    const response = await api.post('/sheet/generate', {
        session_id: sessionId,
        image_ids: imageIds,
        settings: {
            country_code: countryCode,
            paper_size: paperSize,
            rows: rows,
            cols: cols,
            background_color: background,
            spacing: spacing,
            margin: margin,
            add_cut_lines: addCutLines,
            add_labels: addLabels,
            dpi: dpi,
            photo_size: photoSize
        }
    });
    return response.data;
};

// Generate sheet preview
export const generateSheetPreview = async (sessionId, imageIds, options = {}) => {
    const response = await api.post('/sheet/preview', {
        session_id: sessionId,
        image_ids: imageIds,
        ...options
    }, {
        responseType: 'blob'
    });
    return response.data;
};

// Get sheet details
export const getSheet = async (sheetId) => {
    const response = await api.get(`/sheet/${sheetId}`);
    return response.data;
};

// Get shared sheet
export const getSharedSheet = async (shareId) => {
    const response = await api.get(`/sheet/share/${shareId}`);
    return response.data;
};

// Get recent public sheets
export const getRecentSheets = async (limit = 12) => {
    const response = await api.get(`/sheet/recent?limit=${limit}`);
    return response.data;
};

// Delete sheet
export const deleteSheet = async (sheetId) => {
    console.log(`Deleting sheet ${sheetId}`);
    const response = await api.delete(`/sheet/${sheetId}`);
    return response.data;
};

// ============================================
// PDF/EXPORT ENDPOINTS
// ============================================

// Export to PDF
export const exportToPDF = async (sheetId, paperSize = 'A4') => {
    console.log(`📑 Exporting sheet ${sheetId} to PDF (${paperSize})`);
    const response = await api.post(`/sheet/${sheetId}/export-pdf`, null, {
        params: { paper_size: paperSize },
        responseType: 'blob'
    });
    return response.data;
};

// Export to Image
export const exportToImage = async (sheetId, format = 'png', dpi = 300) => {
    console.log(`🖼️ Exporting sheet ${sheetId} to ${format} at ${dpi} DPI`);
    const response = await api.post(`/sheet/${sheetId}/export-image`, null, {
        params: { format, dpi },
        responseType: 'blob'
    });
    return response.data;
};

// ============================================
// STATS ENDPOINTS
// ============================================

// Get application stats
export const getStats = async () => {
    console.log('📊 Fetching app stats');
    const response = await api.get('/stats');
    return response.data;
};

// Get user dashboard stats
export const getUserStats = async () => {
    const response = await api.get('/user/stats');
    return response.data;
};

// Get session stats
export const getSessionStats = async (sessionId) => {
    const response = await api.get(`/session/${sessionId}/stats`);
    return response.data;
};

// ============================================
// SESSION MANAGEMENT
// ============================================

// Create or get session
export const getOrCreateSession = async () => {
    let sessionId = localStorage.getItem('photo_session_id');
    
    if (!sessionId) {
        console.log('🆕 Creating new session');
        const response = await api.post('/session/create');
        sessionId = response.data.session_id;
        localStorage.setItem('photo_session_id', sessionId);
        console.log(`✅ Session created: ${sessionId}`);
    } else {
        console.log(`♻️ Using existing session: ${sessionId}`);
    }
    
    return { session_id: sessionId };
};

// Clear session
export const clearSession = async () => {
    const sessionId = localStorage.getItem('photo_session_id');
    if (sessionId) {
        console.log(`🧹 Clearing session ${sessionId}`);
        await api.delete(`/session/${sessionId}`);
        localStorage.removeItem('photo_session_id');
        console.log('✅ Session cleared');
    }
};

// ============================================
// SHARE ENDPOINTS
// ============================================

// Create share link
export const createShareLink = async (sheetId, expiresIn = 86400) => {
    console.log(`🔗 Creating share link for sheet ${sheetId}, expires in ${expiresIn}s`);
    const response = await api.post(`/sheet/${sheetId}/share`, {
        expires_in: expiresIn
    });
    return response.data;
};

// Get share details
export const getShareDetails = async (shareId) => {
    const response = await api.get(`/share/${shareId}`);
    return response.data;
};

// ============================================
// HELPER FUNCTIONS
// ============================================

// Download blob as file
export const downloadBlob = (blob, filename) => {
    console.log(` Downloading file: ${filename}`);
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
    console.log(' Download triggered');
};

// Convert base64 to blob
export const base64ToBlob = (base64, mimeType = 'image/png') => {
    const byteCharacters = atob(base64.split(',')[1]);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    return new Blob([byteArray], { type: mimeType });
};

// Validate image file
export const validateImage = (file) => {
    const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/bmp'];
    const maxSize = 10 * 1024 * 1024; // 10MB
    
    if (!validTypes.includes(file.type)) {
        console.warn(` Invalid file type: ${file.type}`);
        return { valid: false, error: 'Invalid file type. Please upload JPEG, PNG, or WEBP images.' };
    }
    
    if (file.size > maxSize) {
        console.warn(` File too large: ${file.size} bytes > ${maxSize} bytes`);
        return { valid: false, error: 'File too large. Maximum size is 10MB.' };
    }
    
    console.log(` File validation passed: ${file.name} (${file.type}, ${file.size} bytes)`);
    return { valid: true };
};

export default api;