// src/hooks/usePhotoProcessing.js
import { useState, useEffect } from 'react';
import { getApiBaseUrl, uploadImage, getStatus } from '../services/api';

const API_BASE = getApiBaseUrl();
const STATIC_BASE = API_BASE.replace('/api/v1', '');

const verifyImageLoad = (url, timeout = 10000) => {
    return new Promise((resolve, reject) => {
        if (url.startsWith('data:image')) {
            return resolve(true);
        }
        const img = new Image();
        const timer = setTimeout(() => {
            img.src = '';
            reject(new Error(`Image load timeout: ${url}`));
        }, timeout);
        img.onload = () => {
            clearTimeout(timer);
            resolve(true);
        };
        img.onerror = () => {
            clearTimeout(timer);
            reject(new Error(`Failed to load image: ${url}`));
        };
        img.src = url + (url.includes('?') ? '&' : '?') + 't=' + Date.now();
    });
};

// Turns a possibly-relative backend path into a full URL the browser can load.
const toFullUrl = (path) => {
    if (!path) return null;
    if (path.startsWith('data:image') || path.startsWith('http')) return path;
    return `${STATIC_BASE}${path}`;
};

export default function usePhotoProcessing() {
    const [uploads, setUploads] = useState([]);
    const [processedPhotos, setProcessedPhotos] = useState([]);

    const uploadPhotos = async (files, countryCode = 'IN', restoreVintage = false) => {
        const newUploads = files.map(file => ({
            id: crypto.randomUUID(),
            file,
            preview: URL.createObjectURL(file),
            status: 'uploading',
            progress: 0,
            error: null,
            processedUrl: null,
            transparentUrl: null,
            bgColor: null,
            serverId: null,
            isVintageRestored: restoreVintage,
        }));
        setUploads(prev => [...prev, ...newUploads]);

        for (const upload of newUploads) {
            try {
                updateStatus(upload.id, { status: 'uploading', progress: 10 });
                const uploadRes = await uploadImage(upload.file, countryCode, 'white', restoreVintage);

                const imageId = uploadRes.data?.image_id || uploadRes.image_id;
                if (!imageId) throw new Error('No image ID in upload response');
                updateStatus(upload.id, { serverId: imageId, progress: 30 });

                updateStatus(upload.id, { status: 'processing', progress: 40 });
                const { finalUrl, transparentUrl } = await pollProcessing(upload.id, imageId);

                updateStatus(upload.id, {
                    status: 'completed',
                    progress: 100,
                    processedUrl: finalUrl,
                    transparentUrl: transparentUrl,
                    isVintageRestored: restoreVintage,
                });
            } catch (err) {
                updateStatus(upload.id, {
                    status: 'failed',
                    error: err.message,
                });
            }
        }
    };

    const pollProcessing = async (uploadId, imageId) => {
        let attempts = 0;
        let lastProgress = 0;
        while (attempts < 90) {
            await new Promise(r => setTimeout(r, 1000));
            try {
                const statusRes = await getStatus(imageId);
                const statusData = statusRes.data || statusRes;

                if (statusData.progress && statusData.progress > lastProgress) {
                    lastProgress = statusData.progress;
                    updateStatus(uploadId, { progress: 30 + statusData.progress * 0.7 });
                }

                if (statusData.status === 'completed') {
                    const rawProcessed = statusData.processed_url || statusData.passport_url;
                    if (!rawProcessed) throw new Error('No processed/passport url in response');

                    const rawTransparent = statusData.transparent_url || statusData.bg_removed_transparent_url;

                    const fullUrl = rawProcessed.startsWith('data:image')
                        ? rawProcessed
                        : toFullUrl(rawProcessed);
                    const fullTransparentUrl = toFullUrl(rawTransparent);

                    await verifyImageLoad(fullUrl);
                    return { finalUrl: fullUrl, transparentUrl: fullTransparentUrl };
                } else if (statusData.status === 'failed') {
                    throw new Error(statusData.error || 'Processing failed');
                }
            } catch (err) {
                if (err.message.includes('Failed to load image') || err.message.includes('Processing failed') || (err.message && !err.message.includes('Network Error'))) {
                    throw err;
                }
            }
            attempts++;
        }
        throw new Error('Processing timeout after 90 seconds');
    };

    const updateStatus = (id, updates) => {
        setUploads(prev => prev.map(p => p.id === id ? { ...p, ...updates } : p));
    };

    const removePhoto = (id, isProcessed = false) => {
        if (isProcessed) {
            setProcessedPhotos(prev => prev.filter(p => p.id !== id));
        }
        setUploads(prev => prev.filter(p => p.id !== id));
        const photo = uploads.find(p => p.id === id);
        if (photo?.preview) URL.revokeObjectURL(photo.preview);
    };

    const updatePhotoUrl = (id, newUrl, bgColor = null) => {
        setUploads(prev => prev.map(p =>
            p.id === id ? { ...p, processedUrl: newUrl, bgColor, editedVersion: true } : p
        ));
    };

    useEffect(() => {
        const completed = uploads.filter(u => u.status === 'completed' && u.processedUrl);
        setProcessedPhotos(completed);
    }, [uploads]);

    return {
        uploads,
        processedPhotos,
        uploadPhotos,
        removePhoto,
        updatePhotoUrl,
    };
}