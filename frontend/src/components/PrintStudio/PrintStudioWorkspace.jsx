import React, { useState, useRef, useEffect } from 'react';
import { 
  UploadCloud, Printer, Settings2, Trash2, FileText, Image as ImageIcon, 
  Layout, CheckCircle, AlertTriangle, XCircle, Eye, RefreshCw, ZoomIn, 
  Layers, Sliders, ChevronRight, Check, Sparkles, FileCheck, Info, Download
} from 'lucide-react';
import api from '../../services/api';
import PrintStudioQrGallery from './PrintStudioQrGallery';

const PrintStudioWorkspace = ({
  isSidebarCollapsed,
  onlineJobs = [],
  jobThumbnails = {},
  deviceState = null,
  onRefreshOnlineJobs,
  onOpenConnectModal,
  onOpenQrModal,
  onDismissOnlineJob,
  onClearOnlineQueue,
  onJobStatusUpdated,
}) => {
  const [jobs, setJobs] = useState([]);
  const [isUploading, setIsUploading] = useState(false);
  const [expandedJobs, setExpandedJobs] = useState({});
  const [actionLoading, setActionLoading] = useState({});
  const [toastMessage, setToastMessage] = useState(null);
  const [loadingOnlineJobId, setLoadingOnlineJobId] = useState(null);
  const [isRefreshingQueue, setIsRefreshingQueue] = useState(false);
  
  // Settings State
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settings, setSettings] = useState(null);
  const [printers, setPrinters] = useState([]);
  const [defaultPrinter, setDefaultPrinter] = useState("");
  const [savingSettings, setSavingSettings] = useState(false);

  // Pairing State
  const [pairingDoc, setPairingDoc] = useState(null); // { jobId, docId }
  const [pairingTarget, setPairingTarget] = useState("");
  const [isPairing, setIsPairing] = useState(false);

  // Force Invert Prompt State
  const [forceInvertPrompt, setForceInvertPrompt] = useState(null); // { jobId, docId, message }

  // Preview / Review Modal State
  const [previewModal, setPreviewModal] = useState(null); // { job, previews: [], loading: boolean, combineMode: 'single-page'|'two-page', selectedPrinter: '' }

  // Lightbox Zoom State
  const [lightboxDoc, setLightboxDoc] = useState(null); // { url, title, side, extractedCode }

  const fileInputRef = useRef(null);

  // Toast auto-hide
  useEffect(() => {
    if (toastMessage) {
      const timer = setTimeout(() => setToastMessage(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [toastMessage]);

  const showToast = (msg, type = "info") => {
    setToastMessage({ text: msg, type });
  };

  // Fetch jobs
  const fetchJobs = async () => {
    try {
      const res = await api.get('/print-studio/jobs');
      if (res.data?.success) {
        setJobs(res.data.jobs);
      }
    } catch (err) {
      console.error("Failed to fetch print jobs:", err);
    }
  };

  // Fetch printers & settings
  const fetchSettingsAndPrinters = async () => {
    try {
      const [settingsRes, printersRes] = await Promise.all([
        api.get('/print-studio/settings'),
        api.get('/print-studio/printers')
      ]);
      if (settingsRes.data?.success) setSettings(settingsRes.data.settings);
      if (printersRes.data?.success) {
        setPrinters(printersRes.data.printers || []);
        setDefaultPrinter(printersRes.data.defaultPrinter || "");
      }
    } catch (err) {
      console.error("Failed to load settings/printers:", err);
    }
  };

  useEffect(() => {
    fetchJobs();
    fetchSettingsAndPrinters();
    const interval = setInterval(fetchJobs, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleManualUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    
    setIsUploading(true);
    const formData = new FormData();
    files.forEach(file => formData.append('files', file));
    
    try {
      const res = await api.post('/print-studio/upload-manual', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      if (res.data?.success) {
        showToast("Documents uploaded and analyzed successfully!", "success");
        await fetchJobs();
      } else {
        showToast(res.data?.detail || "Upload failed", "error");
      }
    } catch (err) {
      console.error("Upload failed", err);
      const errMsg = err.response?.data?.detail || err.message || "Upload failed";
      showToast(`Upload error: ${errMsg}`, "error");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const toggleJob = (jobId) => {
    setExpandedJobs(prev => ({...prev, [jobId]: !prev[jobId]}));
  };

  const withLoading = async (key, actionFn) => {
    setActionLoading(prev => ({...prev, [key]: true}));
    try {
      await actionFn();
    } catch(err) {
      console.error(err);
      showToast(`Action failed: ${err.response?.data?.detail || err.message}`, "error");
    } finally {
      setActionLoading(prev => ({...prev, [key]: false}));
      fetchJobs();
    }
  };

  const handlePrint = (jobId, targetPrinter = null) => {
    withLoading(`print-${jobId}`, async () => {
      const url = targetPrinter 
        ? `/print-studio/jobs/${jobId}/print?printer_name=${encodeURIComponent(targetPrinter)}` 
        : `/print-studio/jobs/${jobId}/print`;
      await api.post(url);
      showToast("Job sent to printer successfully!", "success");
      if (previewModal?.job?.id === jobId) {
        setPreviewModal(null);
      }
    });
  };

  const handlePrintBacks = (jobId) => {
    withLoading(`print-backs-${jobId}`, async () => {
      await api.post(`/print-studio/jobs/${jobId}/print-backs`);
      showToast("Back pages printed successfully!", "success");
    });
  };

  const handleDeleteJob = (jobId) => {
    withLoading(`delete-${jobId}`, async () => {
      await api.delete(`/print-studio/jobs/${jobId}`);
      showToast("Job removed from queue", "info");
      if (previewModal?.job?.id === jobId) {
        setPreviewModal(null);
      }
    });
  };

  const handleInvert = (jobId, docId, force = false) => {
    withLoading(`invert-${docId}`, async () => {
      try {
        const url = force 
          ? `/print-studio/jobs/${jobId}/documents/${docId}/invert?force=true` 
          : `/print-studio/jobs/${jobId}/documents/${docId}/invert`;
        const res = await api.post(url);
        if (res.data?.success) {
          showToast("Colors inverted successfully", "success");
          setForceInvertPrompt(null);
          if (previewModal?.job?.id === jobId) {
            openReviewModal(previewModal.job);
          }
        }
      } catch (err) {
        if (err.response?.data?.requires_force) {
          setForceInvertPrompt({
            jobId,
            docId,
            message: err.response.data.message || "This page may contain photos or stamps. Inverting colors might alter facial appearance."
          });
        } else {
          showToast(`Invert failed: ${err.response?.data?.detail || err.message}`, "error");
        }
      }
    });
  };

  const handlePairSubmit = async () => {
    if (!pairingDoc || !pairingTarget) return;
    setIsPairing(true);
    try {
      await api.put(`/print-studio/jobs/${pairingDoc.jobId}/documents/${pairingDoc.docId}/pair`, {
        target_group_id: pairingTarget
      });
      showToast("Document paired successfully", "success");
      setPairingDoc(null);
      setPairingTarget("");
      fetchJobs();
    } catch (err) {
      showToast("Failed to pair document", "error");
    } finally {
      setIsPairing(false);
    }
  };

  const handlePrintAllValid = async () => {
    const validJobs = jobs.filter(j => 
      (j.status === 'pending-review' || j.status === 'uploading') && 
      !j.documents.some(d => d.status === 'unmatched')
    );
    
    if (validJobs.length === 0) {
      showToast("No ready jobs to print. Unmatched documents require pairing first.", "info");
      return;
    }

    withLoading('print-all', async () => {
      let successCount = 0;
      for (const job of validJobs) {
        try {
          await api.post(`/print-studio/jobs/${job.id}/print`);
          successCount++;
        } catch(e) {
          console.error(`Failed to print job ${job.id}`, e);
        }
      }
      showToast(`Successfully sent ${successCount} of ${validJobs.length} jobs to printer.`, "success");
    });
  };

  const openReviewModal = async (job, overrideMode = null) => {
    const mode = overrideMode || job.combineMode || settings?.defaultCombineMode || 'side-by-side';
    setPreviewModal({
      job,
      previews: [],
      loading: true,
      combineMode: mode,
      selectedPrinter: settings?.printerName || defaultPrinter || ""
    });

    try {
      const res = await api.get(`/print-studio/jobs/${job.id}/preview?combine_mode=${mode}`);
      if (res.data?.success) {
        setPreviewModal(prev => prev ? ({
          ...prev,
          previews: res.data.previews || [],
          loading: false,
          combineMode: res.data.combineMode || mode
        }) : null);
      } else {
        setPreviewModal(prev => prev ? ({ ...prev, loading: false }) : null);
      }
    } catch (err) {
      console.error("Failed to load preview:", err);
      setPreviewModal(prev => prev ? ({ ...prev, loading: false }) : null);
    }
  };

  const resolveCloudPhotoUrl = (url) => {
    if (!url || typeof url !== 'string') return null;
    const trimmed = url.trim();
    if (trimmed.startsWith('data:') || trimmed.startsWith('blob:') || trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      return trimmed;
    }
    const base = 'https://primeidpro-central-platform.onrender.com';
    if (trimmed.startsWith('/')) {
      return `${base}${trimmed}`;
    }
    return `${base}/${trimmed}`;
  };

  const handleRefreshQueue = async () => {
    setIsRefreshingQueue(true);
    try {
      if (onRefreshOnlineJobs) {
        await onRefreshOnlineJobs();
      }
    } finally {
      setTimeout(() => setIsRefreshingQueue(false), 600);
    }
  };

  const handleLoadOnlineJob = async (job) => {
    if (!job) return;
    setLoadingOnlineJobId(job.id);
    const jobMeta = job.metadata || {};
    const rawCentral = jobMeta.rawCentralJob || {};
    const customerName = jobMeta.customerName || rawCentral.customerName || 'Customer';
    const orderCode = String(jobMeta.jobCode || job.order_id || job.id).slice(-6).toUpperCase();

    showToast(`⚡ Loading & analyzing documents for ${customerName}...`, 'info');

    try {
      const filesToUpload = [];

      // 1. Try loading via Electron IPC jobs:loadFiles
      if (window.primeIdPro?.jobs?.loadFiles) {
        try {
          const res = await window.primeIdPro.jobs.loadFiles(job.id);
          if (res?.success && Array.isArray(res.files) && res.files.length > 0) {
            for (const f of res.files) {
              const dataUrl = f.dataUrl;
              if (dataUrl && dataUrl.startsWith('data:')) {
                const arr = dataUrl.split(',');
                const mime = arr[0].match(/:(.*?);/)?.[1] || f.mimeType || 'image/jpeg';
                const bstr = atob(arr[1]);
                let n = bstr.length;
                const u8arr = new Uint8Array(n);
                while (n--) {
                  u8arr[n] = bstr.charCodeAt(n);
                }
                const ext = mime.includes('pdf') ? 'pdf' : mime.includes('png') ? 'png' : 'jpg';
                const filename = f.filename || `qr_doc_${orderCode}_${filesToUpload.length + 1}.${ext}`;
                filesToUpload.push(new File([u8arr], filename, { type: mime }));
              }
            }
          }
        } catch (e) {
          console.warn('loadFiles failed, falling back:', e);
        }
      }

      // 2. Fallback: Try jobs:loadPhoto if no files yet
      if (filesToUpload.length === 0 && window.primeIdPro?.jobs?.loadPhoto) {
        try {
          const res = await window.primeIdPro.jobs.loadPhoto(job.id);
          if (res?.success && res.dataUrl) {
            const arr = res.dataUrl.split(',');
            const mime = arr[0].match(/:(.*?);/)?.[1] || 'image/jpeg';
            const bstr = atob(arr[1]);
            let n = bstr.length;
            const u8arr = new Uint8Array(n);
            while (n--) {
              u8arr[n] = bstr.charCodeAt(n);
            }
            filesToUpload.push(new File([u8arr], `qr_doc_${orderCode}.jpg`, { type: mime }));
          }
        } catch (e) {}
      }

      // 3. Fallback: Fetch directly from cloud URL if local IPC staging didn't provide files
      if (filesToUpload.length === 0) {
        const rawJob = await window.primeIdPro?.jobs?.get(job.id);
        const items = rawJob?.job?.items || job.items || [];
        const rawItems = Array.isArray(rawCentral.items) && rawCentral.items.length > 0
          ? rawCentral.items
          : (Array.isArray(rawCentral.photos) && rawCentral.photos.length > 0 ? rawCentral.photos : []);

        const urlsToFetch = [];
        if (rawItems.length > 0) {
          rawItems.forEach(it => {
            const u = it.downloadUrl || it.photoUrl || it.url;
            if (u) urlsToFetch.push(u);
          });
        } else if (items.length > 0) {
          items.forEach(it => {
            const u = it.downloadUrl || it.photoUrl;
            if (u) urlsToFetch.push(u);
          });
        }
        if (urlsToFetch.length === 0) {
          const fallbackUrl = jobThumbnails[job.id] || jobMeta.temporaryPhotoUrl || rawCentral.temporaryPhotoUrl || rawCentral.photoUrl;
          if (fallbackUrl) urlsToFetch.push(fallbackUrl);
        }

        for (let i = 0; i < urlsToFetch.length; i++) {
          const rawUrl = urlsToFetch[i];
          const remoteUrl = resolveCloudPhotoUrl(rawUrl);
          if (remoteUrl) {
            const resp = await fetch(remoteUrl);
            if (resp.ok) {
              const blob = await resp.blob();
              const ext = blob.type.includes('pdf') ? 'pdf' : blob.type.includes('png') ? 'png' : 'jpg';
              filesToUpload.push(new File([blob], `qr_doc_${orderCode}_${i + 1}.${ext}`, { type: blob.type }));
            }
          }
        }
      }

      if (filesToUpload.length === 0) {
        throw new Error('No valid documents found to load from this order');
      }

      // 4. Send files to Python backend /print-studio/upload-manual
      const formData = new FormData();
      filesToUpload.forEach(f => formData.append('files', f));
      formData.append('customer_label', `${customerName} (QR #${orderCode})`);

      const res = await api.post('/print-studio/upload-manual', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      if (res.data?.success) {
        showToast(`✨ Auto-processed ${customerName}'s documents (300 DPI layout ready)!`, 'success');
        await fetchJobs();

        // Automatically open the Review / Print Modal for this newly processed job!
        if (res.data.job) {
          openReviewModal(res.data.job);
        }

        // Update online job status
        if (window.primeIdPro?.jobs?.updateStatus) {
          await window.primeIdPro.jobs.updateStatus({
            jobId: job.id,
            status: 'PROCESSING',
            processingStatus: 'READY'
          });
        }
        if (onJobStatusUpdated) {
          onJobStatusUpdated();
        }
      } else {
        showToast(res.data?.detail || 'Failed to process documents', 'error');
      }
    } catch (err) {
      console.error('Failed to load & process QR job:', err);
      showToast('Failed to load online order: ' + (err.response?.data?.detail || err.message), 'error');
    } finally {
      setLoadingOnlineJobId(null);
    }
  };

  const handleCombineModeToggle = async (newMode) => {
    if (!previewModal) return;
    setPreviewModal(prev => ({ ...prev, combineMode: newMode, loading: true }));
    try {
      await api.put(`/print-studio/jobs/${previewModal.job.id}/combine-mode`, { combineMode: newMode });
      const res = await api.get(`/print-studio/jobs/${previewModal.job.id}/preview?combine_mode=${newMode}`);
      if (res.data?.success) {
        setPreviewModal(prev => prev ? ({
          ...prev,
          previews: res.data.previews || [],
          loading: false,
          combineMode: newMode
        }) : null);
      }
      fetchJobs();
    } catch (err) {
      console.error("Failed to update combine mode:", err);
      setPreviewModal(prev => prev ? ({ ...prev, loading: false }) : null);
    }
  };

  const saveSettings = async (e) => {
    e.preventDefault();
    setSavingSettings(true);
    try {
      await api.put('/print-studio/settings', settings);
      showToast("Print settings saved successfully", "success");
      setIsSettingsOpen(false);
    } catch (err) {
      showToast("Failed to save settings", "error");
    } finally {
      setSavingSettings(false);
    }
  };

  const getStatusColor = (status, docs = []) => {
    const hasUnmatched = docs.some(d => d.status === 'unmatched');
    if (hasUnmatched) {
      return 'bg-amber-500/10 text-amber-400 border-amber-500/30';
    }
    switch (status) {
      case 'pending-review':
      case 'uploading':
        return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30';
      case 'waiting-flip':
        return 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30';
      case 'printing':
        return 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30 animate-pulse';
      case 'printed':
        return 'bg-green-500/10 text-green-400 border-green-500/30';
      case 'failed':
        return 'bg-red-500/10 text-red-400 border-red-500/30';
      default:
        return 'bg-slate-500/10 text-slate-400 border-slate-500/30';
    }
  };

  const getStatusLabel = (status, docs = []) => {
    const hasUnmatched = docs.some(d => d.status === 'unmatched');
    if (hasUnmatched) return 'NEEDS PAIRING';
    switch (status) {
      case 'pending-review':
      case 'uploading':
        return 'READY TO PRINT';
      case 'waiting-flip':
        return 'WAITING FLIP';
      case 'printing':
        return 'PRINTING...';
      case 'printed':
        return 'PRINTED';
      case 'failed':
        return 'FAILED';
      default:
        return status.toUpperCase();
    }
  };

  const getFrontsForJob = (jobId) => {
    const job = jobs.find(j => j.id === jobId);
    if (!job) return [];
    return job.documents.filter(d => d.side === 'front');
  };

  const pendingCount = jobs.filter(j => 
    (j.status === 'pending-review' || j.status === 'uploading') && 
    !j.documents.some(d => d.status === 'unmatched')
  ).length;

  return (
    <div className="flex-1 flex flex-col bg-slate-900 h-full overflow-hidden p-6 gap-6 relative select-none">
      
      {/* Toast Notification */}
      {toastMessage && (
        <div className={`absolute top-4 right-6 px-4 py-2.5 rounded-xl border shadow-2xl z-50 flex items-center gap-3 backdrop-blur-md transition-all ${
          toastMessage.type === 'error' 
            ? 'bg-red-950/90 text-red-200 border-red-700/50' 
            : toastMessage.type === 'success' 
            ? 'bg-emerald-950/90 text-emerald-200 border-emerald-700/50' 
            : 'bg-slate-800/90 text-slate-200 border-slate-700/50'
        }`}>
          {toastMessage.type === 'error' ? (
            <AlertTriangle size={18} className="text-red-400 shrink-0" />
          ) : toastMessage.type === 'success' ? (
            <CheckCircle size={18} className="text-emerald-400 shrink-0" />
          ) : (
            <Info size={18} className="text-cyan-400 shrink-0" />
          )}
          <span className="text-sm font-semibold">{toastMessage.text}</span>
          <button onClick={() => setToastMessage(null)} className="ml-2 text-slate-400 hover:text-white">
            <XCircle size={16} />
          </button>
        </div>
      )}

      {/* Header */}
      <header className="flex flex-wrap items-center justify-between gap-4 shrink-0 bg-slate-950/50 p-4 rounded-2xl border border-slate-800/80 backdrop-blur">
        <div>
          <h1 className="text-2xl font-black text-white flex items-center gap-3 tracking-tight">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/20">
              <Printer className="text-white" size={22} />
            </div>
            Print Studio
            {jobs.length > 0 && (
              <span className="text-xs px-2.5 py-1 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 font-bold">
                {jobs.length} {jobs.length === 1 ? 'Job' : 'Jobs'}
              </span>
            )}
          </h1>
          <p className="text-xs text-slate-400 mt-1">Manage documents, review 300 DPI layouts, and dispatch high-speed prints.</p>
        </div>

        <div className="flex items-center gap-3">
          {/* Refresh Button */}
          <button 
            onClick={fetchJobs}
            title="Refresh queue"
            className="p-2.5 rounded-xl bg-slate-800 text-slate-400 hover:text-white border border-slate-700/70 hover:bg-slate-700 transition-all cursor-pointer"
          >
            <RefreshCw size={17} />
          </button>

          {/* Print All Valid Button */}
          <button 
            onClick={handlePrintAllValid}
            disabled={actionLoading['print-all'] || pendingCount === 0}
            className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600/20 text-emerald-300 border border-emerald-500/40 rounded-xl font-bold text-sm hover:bg-emerald-500/30 transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-emerald-950/30 cursor-pointer"
          >
            <Printer size={16} />
            {actionLoading['print-all'] ? 'Printing...' : `Print All Ready (${pendingCount})`}
          </button>
          
          {/* Manual Upload Button */}
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleManualUpload}
            multiple
            className="hidden"
            accept="image/*,application/pdf"
          />
          <button 
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-blue-600 to-cyan-500 hover:from-blue-500 hover:to-cyan-400 rounded-xl font-bold text-sm text-white shadow-lg shadow-cyan-900/30 hover:shadow-cyan-900/50 transition-all cursor-pointer disabled:opacity-50"
          >
            <UploadCloud size={17} className={isUploading ? "animate-bounce" : ""} />
            {isUploading ? 'Analyzing Files...' : 'Manual Upload'}
          </button>
          
          {/* Settings Button */}
          <button 
            onClick={() => setIsSettingsOpen(true)}
            title="Printer & Layout Settings"
            className="p-2.5 rounded-xl bg-slate-800 text-slate-300 hover:text-white border border-slate-700/70 hover:bg-slate-700 transition-all cursor-pointer"
          >
            <Settings2 size={18} />
          </button>
        </div>
      </header>

      {/* Incoming Mobile QR Orders & Uploads Ribbon Gallery */}
      <PrintStudioQrGallery
        onlineJobs={onlineJobs}
        jobThumbnails={jobThumbnails}
        loadingJobId={loadingOnlineJobId}
        isRefreshingQueue={isRefreshingQueue}
        deviceState={deviceState}
        onLoadJob={handleLoadOnlineJob}
        onDismissJob={onDismissOnlineJob}
        onClearQueue={onClearOnlineQueue}
        onRefresh={handleRefreshQueue}
        onOpenQrModal={onOpenQrModal}
        onOpenConnectModal={onOpenConnectModal}
      />

      {/* Main Content Area: Jobs Queue */}
      <div className="flex-1 overflow-y-auto rounded-2xl bg-slate-950 border border-slate-800/80 p-5 space-y-4 custom-scrollbar">
        {jobs.length === 0 ? (
          <div className="h-full min-h-[380px] flex flex-col items-center justify-center text-slate-500 gap-3 border-2 border-dashed border-slate-800/60 rounded-2xl p-8">
            <div className="w-16 h-16 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-600 shadow-inner">
              <Printer size={32} />
            </div>
            <h3 className="text-base font-bold text-slate-300">Print Queue is Empty</h3>
            <p className="text-xs max-w-sm text-center text-slate-400">
              Click <span className="text-cyan-400 font-semibold">Manual Upload</span> above to select ID cards (Aadhaar, PAN, Voter) or PDF documents for automatic layout and printing.
            </p>
            <button 
              onClick={() => fileInputRef.current?.click()}
              className="mt-2 flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-cyan-400 rounded-xl border border-cyan-500/30 text-xs font-bold transition-all cursor-pointer"
            >
              <UploadCloud size={15} /> Upload Documents Now
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {jobs.map(job => {
              const hasUnmatched = job.documents.some(d => d.status === 'unmatched');
              const isPrinting = actionLoading[`print-${job.id}`];
              const isDeleting = actionLoading[`delete-${job.id}`];

              return (
                <div 
                  key={job.id} 
                  className="bg-slate-900/90 border border-slate-800 hover:border-slate-700/80 rounded-2xl p-4 flex flex-col gap-4 shadow-xl transition-all"
                >
                  {/* Job Card Header */}
                  <div 
                    className="flex flex-wrap justify-between items-center gap-3 cursor-pointer select-none"
                    onClick={() => toggleJob(job.id)}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center text-cyan-400 font-bold text-sm">
                        <Layout size={18} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2.5">
                          <h4 className="font-bold text-white text-sm tracking-tight">
                            {job.customerLabel}
                          </h4>
                          <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold border uppercase tracking-wider ${getStatusColor(job.status, job.documents)}`}>
                            {getStatusLabel(job.status, job.documents)}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-slate-400 mt-0.5">
                          <span>{new Date(job.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                          <span>•</span>
                          <span>{job.documents.length} {job.documents.length === 1 ? 'document' : 'documents'}</span>
                          <span>•</span>
                          <span className="text-cyan-400/80 font-mono text-[11px]">
                            {job.combineMode === 'two-page' ? 'Duplex (2-Page)' : 'Composite (Single-Page)'}
                          </span>
                        </div>
                      </div>
                    </div>
                    
                    {/* Top Action Buttons on the Job Card */}
                    <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                      {/* Review & Preview Layout Button */}
                      <button 
                        onClick={() => openReviewModal(job)}
                        title="Open interactive print layout review"
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-sm"
                      >
                        <Eye size={14} />
                        <span>Review Layout</span>
                      </button>

                      {/* Print Button (Always Available for Pending/Ready Jobs) */}
                      {(job.status === 'pending-review' || job.status === 'uploading' || job.status === 'failed') && (
                        <button 
                          onClick={() => handlePrint(job.id)}
                          disabled={isPrinting}
                          className="flex items-center gap-1.5 px-3.5 py-1.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-xl text-xs font-extrabold shadow-lg shadow-emerald-950/40 transition-all cursor-pointer disabled:opacity-50"
                        >
                          <Printer size={14} />
                          {isPrinting ? 'Printing...' : 'Print Now'}
                        </button>
                      )}

                      {/* Flip Paper Button for Duplex Mode */}
                      {job.status === 'waiting-flip' && (
                        <button 
                          onClick={() => handlePrintBacks(job.id)}
                          disabled={actionLoading[`print-backs-${job.id}`]}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 rounded-xl text-xs font-bold transition-all cursor-pointer disabled:opacity-50"
                        >
                          <AlertTriangle size={14} />
                          {actionLoading[`print-backs-${job.id}`] ? 'Printing...' : 'Flip Paper & Print Backs'}
                        </button>
                      )}

                      {/* Delete Job Button */}
                      <button 
                        onClick={() => handleDeleteJob(job.id)}
                        disabled={isDeleting}
                        title="Delete job from queue"
                        className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/10 border border-transparent hover:border-red-500/20 transition-all cursor-pointer"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                  
                  {/* Document Grid for this Job */}
                  {(expandedJobs[job.id] || expandedJobs[job.id] === undefined) && (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 pt-3 border-t border-slate-800/80">
                      {job.documents.map((doc, idx) => {
                        const fileUrl = doc.fileUrl 
                          ? (doc.fileUrl.startsWith('http') ? doc.fileUrl : api.defaults.baseURL.replace('/api/v1', '') + doc.fileUrl)
                          : null;

                        return (
                          <div 
                            key={doc.id || idx} 
                            className="bg-slate-950/80 rounded-xl overflow-hidden border border-slate-800 hover:border-slate-700 flex flex-col relative group transition-all"
                          >
                            {/* Document Image / Thumbnail */}
                            <div className="h-32 bg-slate-950 flex items-center justify-center p-2 relative overflow-hidden">
                              {doc.fileType === 'pdf' ? (
                                <div className="flex flex-col items-center gap-2 text-slate-500">
                                  <FileText size={36} className="text-red-400/80" />
                                  <span className="text-[10px] font-mono font-bold text-slate-400">PDF Document</span>
                                </div>
                              ) : fileUrl ? (
                                <img 
                                  src={fileUrl} 
                                  alt="doc thumbnail" 
                                  className="max-h-full max-w-full object-contain rounded transition-transform group-hover:scale-105 duration-200" 
                                />
                              ) : (
                                <span className="text-xs text-slate-500 italic">File Auto-Deleted</span>
                              )}
                              
                              {/* Top Badges */}
                              <div className="absolute top-1.5 left-1.5 flex flex-col gap-1 z-10">
                                {doc.side && (
                                  <span className={`text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded shadow ${
                                    doc.side === 'front' ? 'bg-cyan-500 text-cyan-950' : 'bg-purple-500 text-purple-950'
                                  }`}>
                                    {doc.side}
                                  </span>
                                )}
                                {doc.lowConfidenceCrop && (
                                  <span 
                                    className="bg-amber-500 text-slate-950 text-[9px] font-black px-1.5 py-0.5 rounded shadow flex items-center gap-0.5"
                                    title="Contour detection used heuristic crop. Please inspect layout before printing."
                                  >
                                    ⚠️ Review Crop
                                  </span>
                                )}
                              </div>

                              <div className="absolute top-1.5 right-1.5 flex flex-col gap-1 z-10">
                                {doc.isDarkPage && (
                                  <div className="bg-amber-500/90 text-amber-950 text-[9px] font-black px-1.5 py-0.5 rounded shadow">
                                    Dark Page
                                  </div>
                                )}
                                {doc.status === 'unmatched' && (
                                  <div className="bg-red-500 text-white text-[9px] font-black px-1.5 py-0.5 rounded shadow animate-bounce">
                                    Unmatched
                                  </div>
                                )}
                              </div>
                              
                              {/* Hover Overlay Actions */}
                              <div className="absolute inset-0 bg-slate-950/85 backdrop-blur-[2px] opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center p-2 gap-1.5 z-20">
                                {fileUrl && doc.fileType !== 'pdf' && (
                                  <button 
                                    onClick={() => setLightboxDoc({ 
                                      url: fileUrl, 
                                      title: doc.docTypeLabel || 'Document Preview',
                                      side: doc.side,
                                      extractedCode: doc.extractedCode,
                                      lowConfidenceCrop: doc.lowConfidenceCrop
                                    })}
                                    className="w-full flex items-center justify-center gap-1 text-[11px] font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 py-1 px-2 rounded-lg transition-colors cursor-pointer border border-slate-700"
                                  >
                                    <ZoomIn size={12} /> Inspect
                                  </button>
                                )}

                                {doc.isDarkPage && (
                                  <button 
                                    onClick={() => handleInvert(job.id, doc.id)}
                                    disabled={actionLoading[`invert-${doc.id}`]}
                                    className="w-full text-[11px] font-bold bg-amber-500 hover:bg-amber-400 text-amber-950 py-1 px-2 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                                  >
                                    {actionLoading[`invert-${doc.id}`] ? 'Inverting...' : 'Invert Colors'}
                                  </button>
                                )}

                                {doc.status === 'unmatched' && (
                                  <button 
                                    onClick={() => setPairingDoc({ jobId: job.id, docId: doc.id })}
                                    className="w-full text-[11px] font-bold bg-cyan-500 hover:bg-cyan-400 text-cyan-950 py-1 px-2 rounded-lg transition-colors cursor-pointer"
                                  >
                                    Pair Manually
                                  </button>
                                )}
                              </div>
                            </div>
                            
                            {/* Card Details Footer */}
                            <div className="p-2.5 bg-slate-900 border-t border-slate-800 text-[11px] text-slate-400 flex flex-col gap-1">
                              <span className="font-bold text-slate-200 truncate">
                                {doc.docTypeLabel || 'Document'}
                              </span>
                              <div className="flex justify-between items-center text-[10px] text-slate-400">
                                {doc.groupId ? (
                                  <span className="font-mono opacity-70">Grp: {doc.groupId}</span>
                                ) : (
                                  <span>Single</span>
                                )}
                                {doc.extractedCode && (
                                  <span className="font-mono text-cyan-400 text-[9px] truncate max-w-[60px]" title={doc.extractedCode}>
                                    {doc.extractedCode}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* PRINT PREVIEW & LAYOUT REVIEW MODAL (Interactive A4 Sheet Inspection) */}
      {/* ========================================================================= */}
      {previewModal && (
        <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-md z-50 flex items-center justify-center p-4 sm:p-6 overflow-hidden animate-in fade-in duration-150">
          <div className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-5xl h-[90vh] max-h-[850px] overflow-hidden flex flex-col shadow-2xl">
            
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-800/40 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-cyan-500/20 text-cyan-400 flex items-center justify-center border border-cyan-500/30">
                  <Eye size={18} />
                </div>
                <div>
                  <h2 className="text-base font-bold text-white flex items-center gap-2">
                    Print Layout Preview & Review
                  </h2>
                  <p className="text-xs text-slate-400">
                    Verify 300 DPI print placement on A4 Sheet before sending to printer.
                  </p>
                </div>
              </div>
              <button 
                onClick={() => setPreviewModal(null)} 
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
              >
                <XCircle size={22} />
              </button>
            </div>

            {/* Modal Body: Left Canvas Preview, Right Controls */}
            <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
              
              {/* Left Column: A4 Paper Preview Canvas */}
              <div className="flex-1 bg-slate-950 p-6 overflow-y-auto flex flex-col items-center relative custom-scrollbar">
                {previewModal.loading ? (
                  <div className="flex flex-col items-center justify-center my-auto gap-3 text-cyan-400">
                    <RefreshCw className="animate-spin" size={28} />
                    <span className="text-xs font-semibold text-slate-400">Compositing 300 DPI Layout...</span>
                  </div>
                ) : previewModal.previews.length === 0 ? (
                  <div className="text-center text-slate-500 my-auto p-6">
                    <Layout size={40} className="mx-auto mb-2 opacity-50" />
                    <p className="text-sm font-semibold text-slate-400">No layout preview available for this job.</p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-4 w-full max-w-lg my-auto">
                    
                    {/* Multi-Sheet Selector Tabs (When multiple documents/cards exist in a job) */}
                    {previewModal.previews.length > 1 && (
                      <div className="flex items-center justify-between w-full bg-slate-900/90 border border-slate-800 p-2 rounded-xl backdrop-blur-sm gap-2">
                        <button
                          onClick={() => {
                            const cur = previewModal.activeSheetIndex ?? 0;
                            const prev = cur > 0 ? cur - 1 : previewModal.previews.length - 1;
                            setPreviewModal({ ...previewModal, activeSheetIndex: prev });
                          }}
                          className="px-2.5 py-1 text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition-colors cursor-pointer"
                        >
                          ◀ Prev Sheet
                        </button>

                        <div className="flex items-center gap-1.5 overflow-x-auto custom-scrollbar px-1 py-0.5">
                          {previewModal.previews.map((sheet, sIdx) => {
                            const isActive = (previewModal.activeSheetIndex ?? 0) === sIdx;
                            return (
                              <button
                                key={sIdx}
                                onClick={() => setPreviewModal({ ...previewModal, activeSheetIndex: sIdx })}
                                className={`px-2.5 py-1 text-[11px] font-bold rounded-lg transition-all cursor-pointer whitespace-nowrap ${
                                  isActive
                                    ? 'bg-cyan-500 text-slate-950 shadow-md font-extrabold'
                                    : 'bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700'
                                }`}
                              >
                                Sheet {sIdx + 1}: {sheet.docTypeLabel || 'Document'}
                              </button>
                            );
                          })}
                        </div>

                        <button
                          onClick={() => {
                            const cur = previewModal.activeSheetIndex ?? 0;
                            const next = cur < previewModal.previews.length - 1 ? cur + 1 : 0;
                            setPreviewModal({ ...previewModal, activeSheetIndex: next });
                          }}
                          className="px-2.5 py-1 text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition-colors cursor-pointer"
                        >
                          Next Sheet ▶
                        </button>
                      </div>
                    )}

                    {/* Active Sheet Display */}
                    {(() => {
                      const activeIdx = previewModal.activeSheetIndex ?? 0;
                      const activePreview = previewModal.previews[activeIdx] || previewModal.previews[0];
                      if (!activePreview) return null;

                      const prevUrl = activePreview.previewUrl.startsWith('http')
                        ? activePreview.previewUrl
                        : api.defaults.baseURL.replace('/api/v1', '') + activePreview.previewUrl;

                      return (
                        <div className="flex flex-col items-center gap-2 w-full">
                          <div className="flex items-center justify-between w-full text-xs text-slate-400 px-1">
                            <span className="font-bold text-slate-300 flex items-center gap-1.5">
                              <Sparkles size={13} className="text-cyan-400" />
                              {activePreview.docTypeLabel || 'Document'} (Group: {activePreview.groupId})
                            </span>
                            <span className="font-mono text-[11px] text-cyan-400 bg-cyan-950/50 px-2 py-0.5 rounded border border-cyan-800/50">
                              Sheet {(activeIdx + 1)} of {previewModal.previews.length} (300 DPI A4)
                            </span>
                          </div>

                          {/* Simulated Paper Sheet (White A4 Canvas) */}
                          <div className="w-full bg-white rounded-lg shadow-2xl p-4 border border-slate-300 relative group overflow-hidden transition-transform duration-200 hover:scale-[1.01]">
                            <img 
                              src={prevUrl} 
                              alt="A4 print layout" 
                              className="w-full h-auto object-contain rounded block"
                            />

                            {/* Dimension Overlay Badge */}
                            <div className="absolute bottom-2 right-2 bg-slate-900/90 backdrop-blur text-white text-[10px] font-mono px-2.5 py-1 rounded-lg border border-slate-700/80 flex items-center gap-2 shadow-lg">
                              <span className="text-cyan-400 font-semibold">CR80: 85.6 × 54.0 mm</span>
                              <span className="text-slate-500">|</span>
                              <span className="text-emerald-400">300 DPI Scanner Crisp</span>
                              <span className="text-slate-500">|</span>
                              <span className="text-amber-300">Natural Colors</span>
                            </div>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>

              {/* Right Column: Print Controls & Info */}
              <div className="w-full lg:w-80 bg-slate-900 border-t lg:border-t-0 lg:border-l border-slate-800 p-5 flex flex-col justify-between overflow-y-auto shrink-0 gap-5">
                <div className="flex flex-col gap-4">
                  
                  {/* Combine Mode Switcher */}
                  <div className="flex flex-col gap-2">
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                      <Layers size={14} className="text-cyan-400" /> Combine Layout Mode
                    </label>
                    <div className="grid grid-cols-3 gap-1.5 bg-slate-950 p-1.5 rounded-xl border border-slate-800">
                      <button
                        type="button"
                        onClick={() => handleCombineModeToggle('side-by-side')}
                        className={`py-2 px-1 text-[11px] font-bold rounded-lg transition-all cursor-pointer text-center ${
                          (previewModal.combineMode === 'side-by-side' || previewModal.combineMode === 'single-page')
                            ? 'bg-cyan-600 text-white shadow-md' 
                            : 'text-slate-400 hover:text-white'
                        }`}
                        title="Front & Back placed side-by-side horizontally (Standard PVC / Paper Card Size)"
                      >
                        Side by Side
                      </button>
                      <button
                        type="button"
                        onClick={() => handleCombineModeToggle('stacked')}
                        className={`py-2 px-1 text-[11px] font-bold rounded-lg transition-all cursor-pointer text-center ${
                          previewModal.combineMode === 'stacked' 
                            ? 'bg-cyan-600 text-white shadow-md' 
                            : 'text-slate-400 hover:text-white'
                        }`}
                        title="Front on top, Back on bottom in center"
                      >
                        Stacked
                      </button>
                      <button
                        type="button"
                        onClick={() => handleCombineModeToggle('two-page')}
                        className={`py-2 px-1 text-[11px] font-bold rounded-lg transition-all cursor-pointer text-center ${
                          previewModal.combineMode === 'two-page' 
                            ? 'bg-cyan-600 text-white shadow-md' 
                            : 'text-slate-400 hover:text-white'
                        }`}
                        title="Page 1 Front, Page 2 Back for Duplex printing"
                      >
                        Duplex (2-Pg)
                      </button>
                    </div>
                  </div>

                  {/* Target Printer Selection */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                      <Printer size={14} className="text-cyan-400" /> Target Printer
                    </label>
                    <select 
                      className="bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-xs text-white focus:outline-none focus:border-cyan-500 cursor-pointer"
                      value={previewModal.selectedPrinter}
                      onChange={e => setPreviewModal({ ...previewModal, selectedPrinter: e.target.value })}
                    >
                      {defaultPrinter && (
                        <option value={defaultPrinter}>Default: {defaultPrinter}</option>
                      )}
                      {printers.filter(p => p !== defaultPrinter).map(p => (
                        <option key={p} value={p}>{p}</option>
                      ))}
                      {printers.length === 0 && !defaultPrinter && (
                        <option value="">-- No OS Printer Detected --</option>
                      )}
                    </select>
                  </div>

                  {/* Job Details Summary */}
                  <div className="bg-slate-950/60 rounded-xl p-3 border border-slate-800/80 flex flex-col gap-2 text-xs">
                    <div className="flex justify-between text-slate-400">
                      <span>Customer:</span>
                      <span className="font-semibold text-slate-200">{previewModal.job.customerLabel}</span>
                    </div>
                    <div className="flex justify-between text-slate-400">
                      <span>Total Documents:</span>
                      <span className="font-semibold text-slate-200">{previewModal.job.documents.length}</span>
                    </div>
                    <div className="flex justify-between text-slate-400">
                      <span>Canvas Resolution:</span>
                      <span className="font-semibold text-emerald-400">300 DPI Crisp</span>
                    </div>
                    <div className="flex justify-between text-slate-400">
                      <span>Dimensions:</span>
                      <span className="font-semibold text-slate-200">A4 (210 × 297 mm)</span>
                    </div>
                  </div>

                </div>

                {/* Print Action Buttons */}
                <div className="flex flex-col gap-2 pt-4 border-t border-slate-800">
                  <button 
                    onClick={() => handlePrint(previewModal.job.id, previewModal.selectedPrinter)}
                    disabled={actionLoading[`print-${previewModal.job.id}`]}
                    className="w-full flex items-center justify-center gap-2 py-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-xl font-extrabold text-sm shadow-xl shadow-emerald-950/50 transition-all cursor-pointer disabled:opacity-50"
                  >
                    <Printer size={18} />
                    {actionLoading[`print-${previewModal.job.id}`] ? 'Dispatching Print...' : 'Print This Job Now'}
                  </button>

                  <button 
                    onClick={() => setPreviewModal(null)}
                    className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                  >
                    Close Preview
                  </button>
                </div>

              </div>

            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* DOCUMENT LIGHTBOX MODAL (Full Resolution Source Inspection) */}
      {/* ========================================================================= */}
      {lightboxDoc && (
        <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-md z-50 flex items-center justify-center p-6 animate-in fade-in duration-150">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-3xl max-h-[85vh] overflow-hidden flex flex-col shadow-2xl">
            <div className="px-5 py-3 border-b border-slate-800 flex items-center justify-between bg-slate-800/40">
              <div className="flex items-center gap-2">
                <ZoomIn size={16} className="text-cyan-400" />
                <h3 className="text-sm font-bold text-white">{lightboxDoc.title}</h3>
                {lightboxDoc.side && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 uppercase">
                    {lightboxDoc.side}
                  </span>
                )}
              </div>
              <button onClick={() => setLightboxDoc(null)} className="text-slate-400 hover:text-white">
                <XCircle size={20} />
              </button>
            </div>
            <div className="p-4 bg-slate-950 flex items-center justify-center overflow-auto max-h-[70vh]">
              <img src={lightboxDoc.url} alt="full document" className="max-h-full max-w-full object-contain rounded" />
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SETTINGS MODAL */}
      {/* ========================================================================= */}
      {isSettingsOpen && settings && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg overflow-hidden flex flex-col shadow-2xl">
            <div className="p-5 border-b border-slate-800 flex justify-between items-center bg-slate-800/50">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <Settings2 size={18} className="text-cyan-400" /> Print Studio Settings
              </h2>
              <button onClick={() => setIsSettingsOpen(false)} className="text-slate-400 hover:text-white">
                <XCircle size={20} />
              </button>
            </div>
            
            <form onSubmit={saveSettings} className="p-5 flex flex-col gap-4 overflow-y-auto">
              
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Default Target Printer</label>
                <select 
                  className="bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:border-cyan-500"
                  value={settings.printerName || defaultPrinter || ""}
                  onChange={e => setSettings({...settings, printerName: e.target.value})}
                >
                  <option value="">-- Use OS Default Printer --</option>
                  {printers.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4 border-t border-slate-800 pt-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Default Layout</label>
                  <select 
                    className="bg-slate-950 border border-slate-700 rounded-lg p-2 text-xs text-white"
                    value={settings.defaultCombineMode || 'side-by-side'}
                    onChange={e => setSettings({...settings, defaultCombineMode: e.target.value})}
                  >
                    <option value="side-by-side">Side by Side (Front & Back)</option>
                    <option value="stacked">Stacked (Top & Bottom)</option>
                    <option value="two-page">Duplex (Two Page)</option>
                  </select>
                </div>
                
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Print Trigger</label>
                  <select 
                    className="bg-slate-950 border border-slate-700 rounded-lg p-2 text-xs text-white"
                    value={settings.printMode}
                    onChange={e => setSettings({...settings, printMode: e.target.value})}
                  >
                    <option value="manual-approve">Manual Review & Approve</option>
                    <option value="auto">Instant Auto-Print</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-between border-t border-slate-800 pt-4">
                <div>
                  <div className="text-xs font-bold text-white">Duplex Hardware Supported</div>
                  <div className="text-[11px] text-slate-400">Can printer print both sides automatically?</div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" className="sr-only peer" checked={settings.duplexSupported} onChange={e => setSettings({...settings, duplexSupported: e.target.checked})} />
                  <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-cyan-500"></div>
                </label>
              </div>

              <div className="flex items-center justify-between border-t border-slate-800 pt-4">
                <div>
                  <div className="text-xs font-bold text-white">Auto-Invert Dark Pages</div>
                  <div className="text-[11px] text-slate-400">Automatically optimize black/dark background cards?</div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" className="sr-only peer" checked={settings.autoInvertDarkPages} onChange={e => setSettings({...settings, autoInvertDarkPages: e.target.checked})} />
                  <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-cyan-500"></div>
                </label>
              </div>
              
              <div className="flex justify-end gap-2 pt-4 border-t border-slate-800">
                <button 
                  type="button" 
                  onClick={() => setIsSettingsOpen(false)}
                  className="px-4 py-2 bg-slate-800 text-slate-300 rounded-xl font-bold text-xs hover:bg-slate-700 transition-colors"
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  disabled={savingSettings}
                  className="px-5 py-2 bg-cyan-600 text-white rounded-xl font-bold text-xs hover:bg-cyan-500 transition-colors disabled:opacity-50 cursor-pointer"
                >
                  {savingSettings ? 'Saving...' : 'Save Settings'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* PAIRING MODAL */}
      {/* ========================================================================= */}
      {pairingDoc && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-sm overflow-hidden flex flex-col shadow-2xl p-5 gap-4">
            <h3 className="text-base font-bold text-white border-b border-slate-800 pb-2">Manual Front/Back Pairing</h3>
            <p className="text-xs text-slate-400">Select the front document you want to pair this back page with.</p>
            
            <select 
              className="bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs text-white"
              value={pairingTarget}
              onChange={e => setPairingTarget(e.target.value)}
            >
              <option value="">-- Select Front Document --</option>
              {getFrontsForJob(pairingDoc.jobId).map(f => (
                <option key={f.id} value={f.groupId}>Group: {f.groupId} ({f.docTypeLabel})</option>
              ))}
            </select>
            
            <div className="flex justify-end gap-2 pt-2">
              <button 
                onClick={() => { setPairingDoc(null); setPairingTarget(""); }}
                className="px-4 py-2 bg-slate-800 text-white rounded-lg text-xs hover:bg-slate-700 transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={handlePairSubmit}
                disabled={!pairingTarget || isPairing}
                className="px-4 py-2 bg-cyan-600 text-white rounded-lg font-bold text-xs hover:bg-cyan-500 transition-colors disabled:opacity-50 cursor-pointer"
              >
                {isPairing ? 'Pairing...' : 'Pair Documents'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* FORCE INVERT CONFIRMATION MODAL */}
      {/* ========================================================================= */}
      {forceInvertPrompt && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-amber-500/50 rounded-2xl w-full max-w-md overflow-hidden flex flex-col shadow-2xl p-5 gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center shrink-0 border border-amber-500/30">
                <AlertTriangle size={20} />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Heuristic Safety Warning</h3>
                <p className="text-xs text-slate-400">Photo / Stamp Detected on Dark Page</p>
              </div>
            </div>
            
            <p className="text-xs text-slate-300 leading-relaxed bg-slate-950/60 p-3 rounded-xl border border-slate-800">
              {forceInvertPrompt.message || "This page may contain photos, logos, or colored stamps. Inverting colors might alter facial appearance or stamp contrast."}
            </p>
            
            <p className="text-xs text-amber-300 font-semibold">
              Are you sure you want to force color inversion on this document?
            </p>
            
            <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
              <button 
                onClick={() => setForceInvertPrompt(null)}
                className="px-4 py-2 bg-slate-800 text-slate-300 hover:text-white rounded-xl text-xs font-bold hover:bg-slate-700 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button 
                onClick={() => handleInvert(forceInvertPrompt.jobId, forceInvertPrompt.docId, true)}
                className="px-4 py-2 bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-slate-950 rounded-xl font-extrabold text-xs shadow-lg transition-all cursor-pointer"
              >
                Force Invert
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* LIGHTBOX INSPECTION MODAL */}
      {/* ========================================================================= */}
      {lightboxDoc && (
        <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-md z-50 flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-3xl overflow-hidden flex flex-col shadow-2xl">
            <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-800/60">
              <div className="flex items-center gap-2">
                <ZoomIn size={18} className="text-cyan-400" />
                <span className="font-bold text-sm text-white">{lightboxDoc.title}</span>
                {lightboxDoc.side && (
                  <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/40">
                    {lightboxDoc.side}
                  </span>
                )}
                {lightboxDoc.lowConfidenceCrop && (
                  <span className="text-[10px] font-extrabold px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40">
                    ⚠️ Heuristic Fallback Crop
                  </span>
                )}
              </div>
              <button onClick={() => setLightboxDoc(null)} className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer">
                <XCircle size={20} />
              </button>
            </div>
            <div className="p-6 bg-slate-950 flex items-center justify-center max-h-[70vh] overflow-auto">
              <img src={lightboxDoc.url} alt="Inspect full" className="max-w-full max-h-[65vh] object-contain rounded-lg shadow-xl border border-slate-800" />
            </div>
            {lightboxDoc.lowConfidenceCrop && (
              <div className="px-5 py-2.5 bg-amber-500/10 border-t border-amber-500/20 text-amber-300 text-xs flex items-center gap-2">
                <AlertTriangle size={15} className="shrink-0" />
                <span>Notice: This card used fallback edge trimming. If background borders are visible, use the rotate/crop controls before printing.</span>
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  );
};

export default PrintStudioWorkspace;
