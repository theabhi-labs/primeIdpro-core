// src/hooks/usePhotoProcessing.js
import { useState, useEffect, useRef } from 'react';
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
    const uploadsRef = useRef(uploads);

    useEffect(() => {
        uploadsRef.current = uploads;
    }, [uploads]);

    const updateStatus = (id, updates) => {
        setUploads(prev => prev.map(p => p.id === id ? { ...p, ...updates } : p));
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
                    const err = new Error(statusData.error || 'Processing failed');
                    err.errorCode = statusData.error_code || 'UNKNOWN';
                    err.rawError = statusData.error || 'Processing failed';
                    throw err;
                }
            } catch (err) {
                if (err.errorCode || err.message.includes('Failed to load image') || err.message.includes('Processing failed') || (err.message && !err.message.includes('Network Error'))) {
                    throw err;
                }
            }
            attempts++;
        }
        const timeoutErr = new Error('Processing timeout after 90 seconds');
        timeoutErr.errorCode = 'TIMEOUT';
        timeoutErr.rawError = 'Processing timeout after 90 seconds';
        throw timeoutErr;
    };

    const processSingleUpload = async (upload, countryCode = 'india', restoreVintage = false, allowCloud = false) => {
        try {
            updateStatus(upload.id, {
                status: 'uploading',
                progress: 10,
                error: null,
                errorCode: null,
                rawError: null,
                allowCloud: allowCloud,
            });

            const uploadRes = await uploadImage(
                upload.file,
                upload.countryCode || countryCode,
                'white',
                upload.isVintageRestored ?? restoreVintage,
                allowCloud
            );

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
                isVintageRestored: upload.isVintageRestored ?? restoreVintage,
                error: null,
                errorCode: null,
                rawError: null,
            });

            if (window.electronAPI?.analytics?.trackEvent) {
                window.electronAPI.analytics.trackEvent("AI_PROCESSED", { imageId, type: 'passport' }).catch(console.error);
            }
        } catch (err) {
            updateStatus(upload.id, {
                status: 'failed',
                error: err.message || 'Processing failed',
                errorCode: err.errorCode || 'UNKNOWN',
                rawError: err.rawError || err.message || 'Unknown processing error',
                allowCloud: allowCloud,
            });
        }
    };

    const uploadPhotos = async (files, countryCode = 'IN', restoreVintage = false) => {
        const newUploads = files.map(file => ({
            id: crypto.randomUUID(),
            file,
            preview: URL.createObjectURL(file),
            status: 'uploading',
            progress: 0,
            error: null,
            errorCode: null,
            rawError: null,
            allowCloud: false,
            processedUrl: null,
            transparentUrl: null,
            bgColor: null,
            serverId: null,
            countryCode: countryCode,
            isVintageRestored: restoreVintage,
        }));
        setUploads(prev => [...prev, ...newUploads]);

        const MAX_CONCURRENT = 1; // Process ONE BY ONE strictly
        let index = 0;
        const executeNext = async () => {
            if (index >= newUploads.length) return;
            const current = newUploads[index++];
            await processSingleUpload(current, countryCode, restoreVintage, false);
            await executeNext();
        };

        const workers = [];
        for (let i = 0; i < Math.min(MAX_CONCURRENT, newUploads.length); i++) {
            workers.push(executeNext());
        }
        await Promise.all(workers);
    };

    const retryPhoto = async (id, allowCloud = false) => {
        const currentUploads = uploadsRef.current || uploads;
        const target = currentUploads.find(p => p.id === id);
        if (!target) {
            console.warn(`Cannot retry photo ${id}: photo not found`);
            return;
        }
        if (!target.file) {
            console.warn(`Cannot retry photo ${id}: original file not found in memory`);
            return;
        }
        await processSingleUpload(
            target,
            target.countryCode || 'india',
            target.isVintageRestored || false,
            allowCloud
        );
    };

    const removePhoto = (id, isProcessed = false) => {
        if (isProcessed) {
            setProcessedPhotos(prev => prev.filter(p => p.id !== id));
        }
        setUploads(prev => prev.filter(p => p.id !== id));
        const photo = (uploadsRef.current || uploads).find(p => p.id === id);
        if (photo?.preview) URL.revokeObjectURL(photo.preview);
    };

    const updatePhotoUrl = (id, newUrl, bgColor = null) => {
        setUploads(prev => prev.map(p =>
            p.id === id ? { ...p, processedUrl: newUrl, bgColor, editedVersion: true } : p
        ));
    };

    const clearAllPhotos = () => {
        (uploadsRef.current || uploads).forEach(photo => {
            if (photo?.preview) URL.revokeObjectURL(photo.preview);
        });
        setUploads([]);
        setProcessedPhotos([]);
    };

    useEffect(() => {
        const completed = uploads.filter(u => u.status === 'completed' && u.processedUrl);
        setProcessedPhotos(completed);
    }, [uploads]);

    return {
        uploads,
        processedPhotos,
        uploadPhotos,
        retryPhoto,
        removePhoto,
        updatePhotoUrl,
        clearAllPhotos,
        setUploads,
        setProcessedPhotos,
    };
}