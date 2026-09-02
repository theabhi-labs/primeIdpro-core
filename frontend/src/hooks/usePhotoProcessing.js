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
        img.src = url + '?t=' + Date.now();
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

    const uploadPhotos = async (files, countryCode = 'IN') => {
        const newUploads = files.map(file => ({
            id: crypto.randomUUID(),
            file,
            preview: URL.createObjectURL(file),
            status: 'uploading',
            progress: 0,
            error: null,
            processedUrl: null,
            transparentUrl: null,   // NEW: background-free reusable asset
            bgColor: null,          // NEW: last color the user chose, for print
            serverId: null,
        }));
        setUploads(prev => [...prev, ...newUploads]);

        for (const upload of newUploads) {
            try {
                updateStatus(upload.id, { status: 'uploading', progress: 10 });
                const uploadRes = await uploadImage(upload.file, countryCode);

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
                    // Different backend versions have used different field
                    // names for the final image — check the ones we know of.
                    const rawProcessed =
                        statusData.processed_url || statusData.passport_url;
                    if (!rawProcessed) throw new Error('No processed/passport url in response');

                    // NEW: the reusable, background-free asset. Also check
                    // both field names that have been used across backend
                    // versions so this doesn't silently stay null.
                    const rawTransparent =
                        statusData.transparent_url || statusData.bg_removed_transparent_url;

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
                if (err.message.includes('Failed to load image')) {
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

    // NEW: now also accepts bgColor so the chosen studio color survives
    // from the editor all the way through to printing.
    const updatePhotoUrl = (id, newUrl, bgColor = null) => {
        setUploads(prev => prev.map(p =>
            p.id === id ? { ...p, processedUrl: newUrl, bgColor, editedVersion: true } : p
        ));
    };

    useEffect(() => {
        const completed = uploads.filter(u => u.status === 'completed' && u.processedUrl);
        setProcessedPhotos(completed);
    }, [uploads]);

    
    // AUTO_INBOUND_CLOUD_SYNC: Listen to Inbound Online Jobs from Central Cloud
    useEffect(() => {
        if (!window.primeIdPro?.jobs?.listOnline) return;

        const checkOnlineJobs = async () => {
            try {
                const res = await window.primeIdPro.jobs.listOnline();
                if (res?.success && Array.isArray(res.jobs) && res.jobs.length > 0) {
                    for (const job of res.jobs) {
                        const items = job.items || job.stagedItems || [];
                        for (let idx = 0; idx < items.length; idx++) {
                            const item = items[idx];
                            const rawPath = item.originalPath || item.localPath || item.stagedPath || item.photoUrl;
                            if (!rawPath) continue;

                            const photoId = `online_${job.id}_${idx}`;

                            let dataUrl = rawPath;
                            if (window.primeIdPro?.jobs?.readImageBase64 && !rawPath.startsWith('http') && !rawPath.startsWith('data:')) {
                                try {
                                    const imgRes = await window.primeIdPro.jobs.readImageBase64(rawPath);
                                    if (imgRes.success && imgRes.dataUrl) {
                                        dataUrl = imgRes.dataUrl;
                                    }
                                } catch {}
                            }

                            setUploads(prev => {
                                if (prev.some(u => u.id === photoId || u.jobCode === (job.metadata?.jobCode || job.jobCode))) {
                                    return prev;
                                }

                                const onlineUpload = {
                                    id: photoId,
                                    jobCode: job.metadata?.jobCode || job.jobCode || 'ONLINE-JOB',
                                    file: null,
                                    preview: dataUrl,
                                    status: 'completed',
                                    progress: 100,
                                    error: null,
                                    processedUrl: dataUrl,
                                    transparentUrl: dataUrl,
                                    bgColor: item.bgColor || job.metadata?.backgroundColor || '#FFFFFF',
                                    serverId: job.serverJobId || job.id,
                                    isOnline: true,
                                    customerName: job.metadata?.customerName || 'Online Customer',
                                    copies: job.metadata?.copies || job.metadata?.totalCopies || 8
                                };

                                return [...prev, onlineUpload];
                            });
                        }
                    }
                }
            } catch (err) {
                // Ignore silent poll error
            }
        };

        checkOnlineJobs();
        const interval = setInterval(checkOnlineJobs, 3000);
        return () => clearInterval(interval);
    }, []);

    return { uploads, processedPhotos, uploadPhotos, removePhoto, updatePhotoUrl };
}