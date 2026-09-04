import React, { useState, useEffect, useRef } from 'react';
import ProcessedPhotosGrid from './components/Studio/ProcessedPhotosGrid';
import PhotoCopyEditor from './components/Studio/PhotoCopyEditor';
import PhotoEditor from './components/Studio/PhotoEditor';
import BulkCopyModal from './components/Studio/BulkCopyModal';
import PrintSettingsModal from './components/Studio/PrintSettingsModal';
import usePhotoProcessing from './hooks/usePhotoProcessing';
import usePrintSettings from './hooks/usePrintSettings';
import Toast from './components/Common/Toast';
import LoadingSpinner from './components/Common/LoadingSpinner';
import CardStudioWorkspace from './components/CardStudio/CardStudioWorkspace';
import RecommendationBanner from './components/Credits/RecommendationBanner';
import CreditMeterBadge from './components/Credits/CreditMeterBadge';
import ConnectOnlineModal from './components/Credits/ConnectOnlineModal';
import { useCredits } from './context/CreditContext';
import { getCountries, saveProject, getOrCreateSession, extractErrorMessage, generateSheetPdf, downloadBlob, validateImage } from './services/api';


import {
  Sparkles,
  Layers,
  CheckCircle2,
  Wand2,
  Settings2,
  Save,
  Loader2,
  Camera,
  FileText,
  CreditCard,
  Zap,
  Activity,
  Cpu,
  ChevronDown,
  User,
  ShieldCheck,
  Globe,
  UploadCloud,
  Plus,
  Image as ImageIcon,
  Laptop,
  Link2,
  Smartphone,
  QrCode,
  RefreshCw,
  Clock,
  Phone,
  ExternalLink
} from 'lucide-react';

function App() {
  // -------- Core State (PRESERVED 100%) --------
  const {
    uploads,
    processedPhotos,
    uploadPhotos,
    removePhoto,
    updatePhotoUrl,
  } = usePhotoProcessing();

  const { settings, updateSettings, resetToDefaults } = usePrintSettings();
  const { consumeCredits } = useCredits();
  const [countries, setCountries] = useState([]);
  const [restoreVintageMode, setRestoreVintageMode] = useState(false);


  const [selectedCountry, setSelectedCountry] = useState('india');
  const [editingPhoto, setEditingPhoto] = useState(null);
  const [copyEditingPhoto, setCopyEditingPhoto] = useState(null);
  const [selectedPhotos, setSelectedPhotos] = useState([]);
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [sessionId, setSessionId] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);
  const [toast, setToast] = useState(null);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [deviceState, setDeviceState] = useState(null);
  const [currentWorkspace, setCurrentWorkspace] = useState('passport'); // 'passport' | 'card-studio'


  const fileInputRef = useRef(null);



  // Active compute stats
  const activeProcessing = uploads.filter(u => u.status === 'processing').length;
  const pendingQueue = uploads.filter(u => u.status === 'uploading' || u.status === 'pending').length;
  const isProcessingActive = activeProcessing > 0 || pendingQueue > 0;
  
  const completedUploads = uploads.filter(u => u.status === 'completed').length;
  const totalUploads = uploads.length;
  const progressPercent = totalUploads > 0 
    ? Math.round((completedUploads / totalUploads) * 100) 
    : 0;

  // -------- Device State Polling --------
  useEffect(() => {
    const fetchDeviceStatus = async () => {
      if (window.primeIdPro?.device?.getStatus) {
        try {
          const status = await window.primeIdPro.device.getStatus();
          setDeviceState(status);
        } catch (e) {
          // Ignore
        }
      }
    };
    fetchDeviceStatus();
    const interval = setInterval(fetchDeviceStatus, 10000);
    return () => clearInterval(interval);
  }, []);

  // -------- Online Jobs Poller & Thumbnail Loader --------
  const [onlineJobs, setOnlineJobs] = useState([]);
  const [jobThumbnails, setJobThumbnails] = useState({});
  const [loadingJobId, setLoadingJobId] = useState(null);
  const [isRefreshingQueue, setIsRefreshingQueue] = useState(false);

  const fetchOnlineJobs = async () => {
    if (window.primeIdPro?.jobs?.listOnline) {
      try {
        const res = await window.primeIdPro.jobs.listOnline();
        if (res?.success && Array.isArray(res.jobs)) {
          const pending = res.jobs.filter(j => j.status !== 'PRINTED' && j.status !== 'COMPLETED');
          setOnlineJobs(pending);
        }
      } catch (e) {
        // Ignore
      }
    }
  };

  useEffect(() => {
    fetchOnlineJobs();
    const interval = setInterval(fetchOnlineJobs, 3000);
    return () => clearInterval(interval);
  }, []);

  // Async thumbnail resolver for all active QR orders
  useEffect(() => {
    let isMounted = true;
    const resolveThumbnails = async () => {
      for (const job of onlineJobs) {
        if (!jobThumbnails[job.id]) {
          const rawJob = await window.primeIdPro?.jobs?.get(job.id);
          const items = rawJob?.job?.items || job.items || [];
          const item = items[0];
          const localPath = item?.original_path || item?.originalPath;

          if (localPath && window.primeIdPro?.jobs?.readImageBase64) {
            try {
              const res = await window.primeIdPro.jobs.readImageBase64(localPath);
              if (res?.success && res?.dataUrl && isMounted) {
                setJobThumbnails(prev => ({ ...prev, [job.id]: res.dataUrl }));
                continue;
              }
            } catch (e) {}
          }

          const remoteUrl =
            item?.downloadUrl ||
            item?.photoUrl ||
            job.metadata?.rawCentralJob?.temporaryPhotoUrl ||
            job.metadata?.rawCentralJob?.photoUrl;

          if (remoteUrl && isMounted) {
            setJobThumbnails(prev => ({ ...prev, [job.id]: remoteUrl }));
          }
        }
      }
    };

    if (onlineJobs.length > 0) {
      resolveThumbnails();
    }
  }, [onlineJobs]);

  const handleManualRefreshQueue = async () => {
    setIsRefreshingQueue(true);
    try {
      if (window.primeIdPro?.poller?.trigger) {
        await window.primeIdPro.poller.trigger();
      }
      await fetchOnlineJobs();
    } finally {
      setTimeout(() => setIsRefreshingQueue(false), 600);
    }
  };

  const handleLoadOnlineJob = async (job) => {
    try {
      if (!job) return;
      setLoadingJobId(job.id);
      setToast({ type: 'info', message: `Loading photo for ${job.metadata?.customerName || 'Customer'}...` });

      const rawJob = await window.primeIdPro?.jobs?.get(job.id);
      const items = rawJob?.job?.items || job.items || [];
      const item = items[0];
      let filePath = item?.original_path || item?.originalPath;
      let dataUrl = jobThumbnails[job.id] || null;

      // 1. Try reading from local staged file
      if (filePath && window.primeIdPro?.jobs?.readImageBase64) {
        try {
          const res = await window.primeIdPro.jobs.readImageBase64(filePath);
          if (res?.success && res?.dataUrl) {
            dataUrl = res.dataUrl;
          }
        } catch (e) {
          // fallback
        }
      }

      // 2. Fallback: Fetch directly from remote cloud URL if not yet staged
      if (!dataUrl || !dataUrl.startsWith('data:')) {
        const remoteUrl =
          dataUrl ||
          item?.downloadUrl ||
          item?.photoUrl ||
          job.metadata?.rawCentralJob?.temporaryPhotoUrl ||
          job.metadata?.rawCentralJob?.photoUrl;

        if (!remoteUrl) {
          throw new Error('Photo download URL not available in job metadata');
        }

        const resp = await fetch(remoteUrl);
        if (!resp.ok) {
          throw new Error(`Failed to download photo from cloud (HTTP ${resp.status})`);
        }
        const blob = await resp.blob();
        dataUrl = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result);
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
      }

      if (!dataUrl) {
        throw new Error('Could not load customer photo data');
      }

      // Convert dataUrl to File
      const arr = dataUrl.split(',');
      const mime = arr[0].match(/:(.*?);/)?.[1] || 'image/jpeg';
      const bstr = atob(arr[1]);
      let n = bstr.length;
      const u8arr = new Uint8Array(n);
      while (n--) {
        u8arr[n] = bstr.charCodeAt(n);
      }
      const file = new File([u8arr], `qr_customer_${job.metadata?.jobCode || job.id}.jpg`, { type: mime });

      // STRICTLY NORMAL PHOTO STUDIO MODE (No Vintage / No 4K Restore)
      setRestoreVintageMode(false);
      const targetCountry = job.metadata?.templateId || selectedCountry || 'india';
      uploadPhotos([file], targetCountry, false);

      const targetCopies = Number(job.metadata?.totalCopies || job.metadata?.rawCentralJob?.copies || 8);
      if (targetCopies > 0) {
        updateSettings({ copies: targetCopies });
      }

      if (window.primeIdPro?.jobs?.updateStatus) {
        await window.primeIdPro.jobs.updateStatus({
          jobId: job.id,
          status: 'PROCESSING',
          processingStatus: 'READY',
        });
      }

      setToast({
        type: 'success',
        message: `✨ Loaded ${job.metadata?.customerName || 'Customer'}'s photo (${targetCopies} Passport Photos ready)!`,
      });
    } catch (err) {
      setToast({ type: 'error', message: 'Failed to load online order: ' + err.message });
    } finally {
      setLoadingJobId(null);
    }
  };

  // -------- Session --------
  useEffect(() => {
    getOrCreateSession()
      .then(({ session_id }) => setSessionId(session_id))
      .catch((err) => console.error('Could not create session:', err.message));
  }, []);

  // -------- Fetch Country List --------
  useEffect(() => {
    const fetchCountries = async () => {
      try {
        const response = await getCountries();
        let list = [];
        if (Array.isArray(response?.data)) list = response.data;
        else if (Array.isArray(response?.countries)) list = response.countries;
        else if (Array.isArray(response)) list = response;
        if (list.length > 0) {
          setCountries(list);
          setSelectedCountry(list[0]?.code || 'india');
        } else throw new Error('Empty country list');
      } catch (err) {
        setCountries([
          { code: 'india', name: 'India', standard: '35x45 mm' },
          { code: 'usa', name: 'USA', standard: '2x2 inch' },
          { code: 'uk', name: 'United Kingdom', standard: '35x45 mm' },
        ]);
        setSelectedCountry('india');
      }
    };
    fetchCountries();
  }, []);

  // -------- Handlers --------
  const handleUpload = (files) => {
    if (!files?.length) return;
    uploadPhotos(files, selectedCountry, restoreVintageMode);
  };


  const handleFileInputChange = (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    const validFiles = [];
    files.forEach(file => {
      const validation = validateImage(file);
      if (validation.valid) validFiles.push(file);
      else setToast({ type: 'error', message: `${file.name}: ${validation.error}` });
    });
    if (validFiles.length) {
      handleUpload(validFiles);
    }
    // reset input
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDraggingOver(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDraggingOver(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDraggingOver(false);
    const files = Array.from(e.dataTransfer.files || []);
    if (!files.length) return;
    const validFiles = [];
    files.forEach(file => {
      const validation = validateImage(file);
      if (validation.valid) validFiles.push(file);
      else setToast({ type: 'error', message: `${file.name}: ${validation.error}` });
    });
    if (validFiles.length) handleUpload(validFiles);
  };

  const handleEditPhoto = (photo) => setEditingPhoto(photo);
  const handleSelectForCopy = (photo) => setCopyEditingPhoto(photo);
  const handleSelectMultiple = (ids) => {
    const selected = processedPhotos.filter(p => ids.includes(p.id));
    setSelectedPhotos(selected);
  };

  const handleSaveEdit = (editedPhoto) => {
    if (!editedPhoto?.editedImage) return;
    updatePhotoUrl(editedPhoto.id, editedPhoto.editedImage, editedPhoto.bgColor || null);
    setEditingPhoto(null);
  };

  const handleDeleteFromEditor = (id) => {
    removePhoto(id, true);
    setEditingPhoto(null);
  };

  // -------- Save Project --------
  const handleSaveProject = async () => {
    const imageIds = processedPhotos.map(p => p.serverId).filter(Boolean);
    if (imageIds.length === 0) {
      setToast({ type: 'error', message: 'Add at least one fully processed photo before saving.' });
      return;
    }
    if (!selectedCountry) {
      setToast({ type: 'error', message: 'Choose a country/passport standard before saving.' });
      return;
    }

    setIsSaving(true);
    try {
      const result = await saveProject({
        sessionId,
        imageIds,
        countryCode: selectedCountry,
        paperSize: settings?.paperSize || 'A4',
      });
      setToast({ type: 'success', message: result?.message || 'Project saved successfully.' });
    } catch (err) {
      setToast({ type: 'error', message: extractErrorMessage(err) });
    } finally {
      setIsSaving(false);
    }
  };

  // -------- Print Helpers --------
  const printViaIframe = (html) => {
    const iframe = document.createElement('iframe');
    iframe.style.position = 'absolute';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = 'none';
    document.body.appendChild(iframe);
    const iframeDoc = iframe.contentWindow.document;
    iframeDoc.open();
    iframeDoc.write(html);
    iframeDoc.close();
    iframe.contentWindow.focus();
    iframe.contentWindow.print();
    setTimeout(() => {
      document.body.removeChild(iframe);
    }, 1000);
  };

  const printViaElectron = async (html, { orientation, paperSize } = {}) => {
    setIsPrinting(true);
    try {
      const result = await window.electronAPI.printSheet(html, { orientation, paperSize });
      if (!result?.success) {
        setToast({ type: 'error', message: result?.error || 'Printing failed. Please try again.' });
        return;
      }
      if (result.mode === 'pdf-fallback') {
        setToast({ type: 'info', message: 'Print preview isn’t supported here — opened a PDF instead.' });
      } else if (result.pdfPath) {
        setToast({ type: 'success', message: 'PDF generated and opened.' });
      }
    } catch (err) {
      setToast({ type: 'error', message: err?.message || 'Printing failed unexpectedly. Please try again.' });
    } finally {
      setIsPrinting(false);
    }
  };

  const printLayout = async (photoEntries, margin, paperSize, rows, cols, photoSize, orientation = 'Portrait', cutMarks = true, border = true) => {
    if (!photoEntries.length) return;

    // Check & consume 2 credits for passport sheet print
    const allowed = await consumeCredits({
      type: 'passport',
      count: 1,
      description: `Passport Photo Direct Print (${photoSize || '35x45'})`
    });
    if (!allowed) return;

    const PHOTO_WIDTH_MM = photoSize === '2x2' ? 50.8 : 35;
    const PHOTO_HEIGHT_MM = photoSize === '2x2' ? 50.8 : 45;
    const GAP_MM = 2.0;

    let paper = paperSize === 'A4' ? { w: 210, h: 297 } : (paperSize === '4x6' ? { w: 101.6, h: 152.4 } : { w: 215.9, h: 279.4 });
    if (orientation === 'Landscape') {
      paper = { w: paper.h, h: paper.w };
    }

    const usableHeight = paper.h - margin.top - margin.bottom;

    let rowsPerPage = rows;
    if (rowsPerPage === 0) {
      const maxRowsByHeight = Math.floor((usableHeight + GAP_MM) / (PHOTO_HEIGHT_MM + GAP_MM));
      rowsPerPage = Math.max(1, maxRowsByHeight);
    }
    const perPage = rowsPerPage * cols;
    const pagesNeeded = Math.ceil(photoEntries.length / perPage);

    let allPagesHtml = '';
    for (let page = 0; page < pagesNeeded; page++) {
      const start = page * perPage;
      const end = Math.min(start + perPage, photoEntries.length);
      const countOnPage = end - start;
      let gridItems = '';
      for (let i = start; i < end; i++) {
        const entry = photoEntries[i];
        const bg = entry.bgColor || '#FFFFFF';
        gridItems += `
          <div class="photo-card ${border ? 'has-border' : ''}" style="background:${bg};">
            <img src="${entry.url}" alt="passport" />
          </div>`;
      }
      for (let i = countOnPage; i < perPage; i++) {
        gridItems += `<div class="photo-card empty"></div>`;
      }
      allPagesHtml += `
        <div class="page">
          <div class="grid" style="grid-template-columns: repeat(${cols}, ${PHOTO_WIDTH_MM}mm); grid-template-rows: repeat(${rowsPerPage}, ${PHOTO_HEIGHT_MM}mm);">
            ${gridItems}
          </div>
        </div>
      `;
    }

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Print Passport Photos (300 DPI Standard)</title>
        <style>
          * { margin:0; padding:0; box-sizing:border-box; }
          @page {
            size: ${paper.w}mm ${paper.h}mm;
            margin: 0;
          }
          body { 
            padding: ${margin.top}mm ${margin.right}mm ${margin.bottom}mm ${margin.left}mm; 
            background: white; 
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .page { 
            page-break-after: always; 
            break-after: page; 
            height: auto; 
            min-height: 100vh;
            display: flex;
            justify-content: flex-start;
          }
          .grid {
            display: grid;
            gap: ${GAP_MM}mm;
            width: max-content;
            justify-content: start;
            align-content: start;
          }
          .photo-card {
            width: ${PHOTO_WIDTH_MM}mm;
            height: ${PHOTO_HEIGHT_MM}mm;
            display: flex;
            align-items: center;
            justify-content: center;
            break-inside: avoid;
            overflow: hidden;
            position: relative;
          }
          .photo-card.has-border {
            border: 1px solid #d0d0d0;
          }
          .photo-card img {
            width: 100%;
            height: 100%;
            object-fit: cover;
            display: block;
          }
          .photo-card.empty { 
            border: none;
            visibility: hidden;
          }
          @media print { 
            body { padding: ${margin.top}mm ${margin.right}mm ${margin.bottom}mm ${margin.left}mm; } 
            .photo-card.has-border { border: 1px solid #ccc; } 
          }
        </style>
      </head>
      <body>${allPagesHtml}</body>
      </html>
    `;

    if (window.electronAPI?.isElectron) {
      printViaElectron(html, { orientation, paperSize });
    } else {
      const iframeHtml = html.replace(
        '</body>',
        '<script>window.onload=()=>{window.print();setTimeout(()=>window.close(),500)}<\\/script></body>'
      );
      printViaIframe(iframeHtml);
    }
  };

  // -------- Export PDF Handler (Strict 300 DPI) --------
  const handleExportPdf = async ({ photos: photoList, margin, paperSize, rows, cols, photoSize, orientation, cutMarks = true, border = true }) => {
    // Check & consume 2 credits for passport sheet export
    const allowed = await consumeCredits({
      type: 'passport',
      count: 1,
      description: `Passport Photo Sheet Export (${photoSize || '35x45'})`
    });
    if (!allowed) return;

    setIsPrinting(true);
    try {
      const payload = {
        photos: photoList.map(p => ({
          url: p.url,
          copies: p.copies || 1,
          bgColor: p.bgColor || '#FFFFFF'
        })),
        paper_size: paperSize,
        orientation: orientation || 'Portrait',
        rows: rows || 0,
        cols: cols || 5,
        photo_size: photoSize || '35x45',
        margin_top_mm: margin?.top ?? 8.0,
        margin_right_mm: margin?.right ?? 8.0,
        margin_bottom_mm: margin?.bottom ?? 8.0,
        margin_left_mm: margin?.left ?? 8.0,
        spacing_mm: 2.0,
        cut_marks: cutMarks !== false,
        border: border !== false
      };

      const pdfBlob = await generateSheetPdf(payload);
      downloadBlob(pdfBlob, `Passport_Sheet_${photoSize}_300DPI.pdf`);
      setToast({ type: 'success', message: '✅ 300 DPI PDF Sheet downloaded successfully! (-2 Credits)' });
    } catch (err) {
      console.error('PDF generation failed:', err);
      setToast({ type: 'error', message: extractErrorMessage(err) });
    } finally {
      setIsPrinting(false);
    }
  };

  // -------- Print handlers --------
  const handlePrintFromEditor = async ({ photoUrl, copies, margin, paperSize, rows, cols, photoSize, bgColor, orientation, cutMarks, border }) => {
    const allowed = await consumeCredits({
      type: 'passport',
      count: 1,
      description: `Passport Photo Sheet Print (${photoSize || '35x45'})`
    });
    if (!allowed) return;

    const entries = Array(copies).fill({ url: photoUrl, bgColor });
    printLayout(entries, margin, paperSize, rows, cols, photoSize, orientation, cutMarks, border);
  };

  const handleExportPdfFromEditor = ({ photoUrl, copies, margin, paperSize, rows, cols, photoSize, bgColor, orientation, cutMarks, border }) => {
    const photoList = [{ url: photoUrl, copies, bgColor }];
    handleExportPdf({ photos: photoList, margin, paperSize, rows, cols, photoSize, orientation, cutMarks, border });
  };

  const handlePrintBulk = async ({ photos: photoList, margin, paperSize, rows, cols, photoSize, orientation, cutMarks, border }) => {
    const allowed = await consumeCredits({
      type: 'passport',
      count: 1,
      description: `Passport Photo Bulk Print (${photoSize || '35x45'})`
    });
    if (!allowed) return;

    const allEntries = [];
    photoList.forEach(p => {
      for (let i = 0; i < p.copies; i++) allEntries.push({ url: p.url, bgColor: p.bgColor });
    });
    printLayout(allEntries, margin, paperSize, rows, cols, photoSize, orientation, cutMarks, border);
  };


  const handleExportPdfBulk = ({ photos: photoList, margin, paperSize, rows, cols, photoSize, orientation, cutMarks, border }) => {
    handleExportPdf({ photos: photoList, margin, paperSize, rows, cols, photoSize, orientation, cutMarks, border });
  };

  // Current selected country metadata
  const currentCountryObj = countries.find(c => c.code === selectedCountry) || { name: 'India', standard: '35x45 mm' };

  // -------- Render (Fixed 100vh Single-Page Dashboard Layout) --------
  return (
    <div className="h-screen w-screen overflow-hidden flex flex-col bg-[#111827] text-white font-sans selection:bg-cyan-500/30">
      
      <div className="flex-1 flex flex-row overflow-hidden relative">
      {/* Hidden File Input for Clean Top-Bar & Quick Uploads */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileInputChange}
        multiple
        accept="image/*"
        className="hidden"
      />


      {/* ================= 1. SIDEBAR NAVIGATION (LEFT PANEL) ================= */}
      <aside className="w-64 h-full bg-slate-950 border-r border-slate-800 flex flex-col justify-between p-4 z-20 shrink-0 select-none">
        
        {/* Top: Brand Logo */}
        <div>
          <div className="flex items-center gap-3 px-2 py-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/20 ring-1 ring-white/20">
              <Camera className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-black text-lg tracking-tight text-white">Prime<span className="text-cyan-400">ID</span></span>
                <span className="text-[10px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">PRO</span>
              </div>
              <p className="text-[10px] text-slate-500 font-semibold tracking-wider uppercase">Biometric Suite</p>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="mt-8 space-y-1.5">
            {/* Passport Studio link */}
            <button
              type="button"
              onClick={() => setCurrentWorkspace('passport')}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl font-semibold text-sm border transition-all cursor-pointer ${
                currentWorkspace === 'passport'
                  ? 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20 shadow-sm'
                  : 'text-slate-400 hover:text-white hover:bg-slate-900/40 border-transparent'
              }`}
            >
              <Camera className="w-4 h-4 text-cyan-400" />
              <span>Passport Studio</span>
              {currentWorkspace === 'passport' && (
                <span className="ml-auto w-2 h-2 rounded-full bg-cyan-400 shadow-[0_0_8px_#22d3ee]"></span>
              )}
            </button>

            {/* Inactive links */}
            <div className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-slate-500 hover:text-slate-400 hover:bg-slate-900/40 font-medium text-sm transition-all cursor-not-allowed opacity-60">
              <FileText className="w-4 h-4" />
              <span>ATS Resumes</span>
              <span className="ml-auto text-[9px] px-1.5 py-0.5 bg-slate-900 rounded text-slate-500 border border-slate-800">Soon</span>
            </div>

            {/* Active Universal Card Studio link */}
            <button
              type="button"
              onClick={() => setCurrentWorkspace('card-studio')}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl font-semibold text-sm border transition-all cursor-pointer ${
                currentWorkspace === 'card-studio'
                  ? 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20 shadow-sm'
                  : 'text-slate-400 hover:text-white hover:bg-slate-900/40 border-transparent'
              }`}
            >
              <CreditCard className="w-4 h-4 text-cyan-400" />
              <span>Card Studio</span>
              {currentWorkspace === 'card-studio' ? (
                <span className="ml-auto w-2 h-2 rounded-full bg-cyan-400 shadow-[0_0_8px_#22d3ee]"></span>
              ) : (
                <span className="ml-auto text-[9px] px-1.5 py-0.5 bg-cyan-950/80 rounded text-cyan-400 border border-cyan-800/40 font-bold">New</span>
              )}
            </button>
          </nav>

        </div>

        {/* Sidebar Bottom: Settings & User Profile */}
        <div className="space-y-3 pt-4 border-t border-slate-900">
          <button
            onClick={() => setShowSettingsModal(true)}
            className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-900 font-medium text-sm transition-all border border-slate-800/80 group"
          >
            <Settings2 className="w-4 h-4 text-slate-400 group-hover:text-cyan-400 transition-colors" />
            <span>Print Settings</span>
          </button>

          {/* User badge */}
          <div className="flex items-center gap-3 px-3 py-2 rounded-xl bg-slate-900/50 border border-slate-800/60">
            <div className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center text-slate-300 font-bold text-xs border border-slate-700">
              <User size={14} className="text-cyan-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-slate-200 truncate">Studio Workspace</p>
              <p className="text-[10px] text-slate-500 truncate font-mono">300 DPI Engine</p>
            </div>
            <ShieldCheck size={14} className="text-emerald-400 shrink-0" />
          </div>
        </div>
      </aside>

      {/* ================= 2. MAIN CONTENT AREA (RIGHT SIDE) ================= */}
      {currentWorkspace === 'card-studio' ? (
        <main className="flex-1 flex flex-col h-full overflow-hidden relative">
          <CardStudioWorkspace setToast={setToast} />
        </main>
      ) : (
        <main className="flex-1 flex flex-col h-full overflow-hidden bg-slate-900/40 relative">


        {/* Background glow effects */}
        <div className="absolute top-0 right-0 w-[500px] h-[300px] bg-cyan-500/5 rounded-full blur-[140px] pointer-events-none" />
        <div className="absolute bottom-0 left-1/3 w-[400px] h-[250px] bg-blue-600/5 rounded-full blur-[120px] pointer-events-none" />

        {/* --- Top Control & Header Bar --- */}
        <header className="h-14 px-6 border-b border-slate-800/80 flex items-center justify-between bg-slate-950/60 backdrop-blur-md shrink-0 z-10">
          
          {/* Left: Passport Country Standard Dropdown & AI Mode */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-400 uppercase tracking-wider">
              <Globe size={14} className="text-cyan-400" />
              <span>Country:</span>
            </div>
            <div className="relative inline-block">
              <select
                value={selectedCountry}
                onChange={(e) => setSelectedCountry(e.target.value)}
                className="bg-slate-950 border border-slate-700/80 hover:border-cyan-500/50 rounded-xl px-3.5 py-1.5 text-white text-xs font-medium focus:ring-2 focus:ring-cyan-500 outline-none cursor-pointer pr-8 transition-all"
              >
                {countries.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.name} ({c.standard || '35x45 mm'})
                  </option>
                ))}
              </select>
              <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            </div>
            <span className="text-[11px] font-mono text-cyan-400/90 px-2.5 py-0.5 rounded-md bg-cyan-950/60 border border-cyan-800/40 font-semibold">
              300 DPI • {currentCountryObj.standard || '35x45 mm'}
            </span>

            {/* AI Mode Selector: Normal vs 4K Old Photo Restore */}
            <div className="flex items-center gap-1 bg-slate-900/90 p-1 rounded-xl border border-slate-800 text-xs ml-2">
              <button
                type="button"
                onClick={() => {
                  setRestoreVintageMode(false);
                  setToast({ type: 'info', message: '📷 Normal Photo Studio Mode Active' });
                }}
                className={`px-3 py-1.5 rounded-lg font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                  !restoreVintageMode
                    ? 'bg-cyan-500 text-slate-950 shadow'
                    : 'text-slate-400 hover:text-white'
                }`}
                title="Standard Digital Camera / Phone Portrait"
              >
                <Camera size={13} />
                <span>Normal Photo</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setRestoreVintageMode(true);
                  setToast({ type: 'success', message: '✨ AI 4K Old Photo Restoration Mode Active!' });
                }}
                className={`px-3 py-1.5 rounded-lg font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                  restoreVintageMode
                    ? 'bg-gradient-to-r from-amber-400 to-amber-500 text-slate-950 shadow-md shadow-amber-500/20 font-black ring-1 ring-amber-300'
                    : 'text-slate-400 hover:text-amber-300'
                }`}
                title="AI 4K Restoration for Old Printed Photos, Handheld Snaps & Scans"
              >
                <Sparkles size={13} className={restoreVintageMode ? 'text-slate-950' : 'text-amber-400'} />
                <span>✨ 4K Old Photo Restore</span>
              </button>
            </div>
          </div>



          {/* Center/Right: Dynamic Processing Bar (ONLY when processing) + Quick Action Buttons */}
          <div className="flex items-center gap-3">
            
            {/* Real-time Dynamic Progress Bar (Shown ONLY when processing) */}
            {isProcessingActive && (
              <div className="flex items-center gap-2.5 bg-slate-900/90 border border-cyan-500/30 px-3.5 py-1.5 rounded-xl shadow-lg shadow-cyan-950/30 animate-pulse">
                <Loader2 size={14} className="animate-spin text-cyan-400" />
                <span className="text-xs font-semibold text-slate-200">
                  Processing ({activeProcessing} active, {completedUploads}/{totalUploads})
                </span>
                <div className="w-24 h-2 bg-slate-800 rounded-full overflow-hidden ml-1">
                  <div
                    className="h-full bg-gradient-to-r from-cyan-400 to-blue-500 transition-all duration-300 rounded-full"
                    style={{ width: `${Math.max(15, progressPercent)}%` }}
                  />
                </div>
                <span className="text-[11px] font-mono font-bold text-cyan-400">{progressPercent}%</span>
              </div>
            )}

            {/* Credit Wallet Badge */}
            <CreditMeterBadge />

            {/* Quick Upload Button */}
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-2 px-3.5 py-2 bg-slate-800 hover:bg-slate-700 active:scale-95 text-white font-semibold text-xs rounded-xl transition-all border border-slate-700 hover:border-slate-600 shadow-sm"
              title="Upload Photos"
            >
              <UploadCloud size={15} className="text-cyan-400" />
              <span>Upload Photos</span>
            </button>


            {/* Save Project Button */}
            <button
              onClick={handleSaveProject}
              disabled={isSaving || processedPhotos.length === 0}
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 disabled:from-slate-800 disabled:to-slate-800 disabled:text-slate-600 disabled:cursor-not-allowed rounded-xl text-black font-bold text-xs transition-all shadow-md shadow-cyan-900/20 disabled:shadow-none border border-cyan-400/40 disabled:border-slate-800"
              title="Save Project"
            >
              {isSaving ? <Loader2 size={14} className="animate-spin text-white" /> : <Save size={14} className="text-slate-950" />}
              <span className={isSaving ? "text-white" : "text-slate-950 font-extrabold"}>{isSaving ? 'Saving…' : 'Save Project'}</span>
            </button>
          </div>
        </header>

        {/* --- Main Full-Width Workspace --- */}
        <div 
          className="flex-1 overflow-hidden p-6 flex flex-col min-h-0"
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          
          {/* Incoming QR Code Counter Orders Gallery */}
          {onlineJobs.length > 0 && (
            <div className="mb-4 p-3.5 rounded-2xl bg-slate-900/95 border border-cyan-500/40 shadow-[0_0_35px_rgba(6,182,212,0.18)] flex flex-col gap-3 shrink-0 backdrop-blur-xl transition-all">
              {/* Header Bar */}
              <div className="flex items-center justify-between px-1">
                <div className="flex items-center gap-2.5">
                  <div className="relative flex items-center justify-center">
                    <div className="w-3 h-3 rounded-full bg-cyan-400 animate-ping absolute opacity-75" />
                    <div className="w-2.5 h-2.5 rounded-full bg-cyan-400" />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-black text-white tracking-wide uppercase flex items-center gap-1.5">
                      <QrCode className="w-4 h-4 text-cyan-400" />
                      Live QR Code Counter Orders
                    </span>
                    <span className="px-2 py-0.5 bg-gradient-to-r from-cyan-500 to-blue-600 text-slate-950 text-[10px] font-black rounded-full uppercase shadow-sm">
                      {onlineJobs.length} {onlineJobs.length === 1 ? 'Order' : 'Orders'} Waiting
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={handleManualRefreshQueue}
                    disabled={isRefreshingQueue}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800/80 hover:bg-slate-700/80 text-[11px] font-medium text-slate-300 hover:text-white border border-slate-700/60 transition-all active:scale-95"
                    title="Refresh online orders queue"
                  >
                    <RefreshCw className={`w-3 h-3 text-cyan-400 ${isRefreshingQueue ? 'animate-spin' : ''}`} />
                    <span>Refresh</span>
                  </button>
                </div>
              </div>

              {/* Horizontal Scrollable Orders Cards with Photo Previews */}
              <div className="flex items-stretch gap-3 overflow-x-auto pb-1.5 custom-scrollbar">
                {onlineJobs.map((job) => {
                  const jobMeta = job.metadata || {};
                  const customerName = jobMeta.customerName || 'Walk-in Customer';
                  const customerPhone = jobMeta.customerPhone || '';
                  const totalCopies = jobMeta.totalCopies || jobMeta.rawCentralJob?.copies || 8;
                  const templateName = jobMeta.templateName || 'Indian Passport (35×45mm)';
                  const orderCode = String(jobMeta.jobCode || job.order_id || job.id).slice(-6).toUpperCase();
                  const photoThumbnail = jobThumbnails[job.id];
                  const isLoadingThis = loadingJobId === job.id;

                  return (
                    <div
                      key={job.id}
                      onClick={() => !isLoadingThis && handleLoadOnlineJob(job)}
                      className="group relative flex items-center gap-3.5 p-2.5 rounded-xl bg-slate-950/80 hover:bg-slate-950 border border-slate-800 hover:border-cyan-400/80 hover:shadow-[0_0_20px_rgba(6,182,212,0.25)] transition-all cursor-pointer shrink-0 min-w-[320px] max-w-[380px]"
                    >
                      {/* Photo Thumbnail */}
                      <div className="relative w-14 h-16 rounded-lg overflow-hidden bg-slate-900 border border-cyan-500/30 group-hover:border-cyan-400 flex items-center justify-center shrink-0 shadow-inner">
                        {photoThumbnail ? (
                          <img
                            src={photoThumbnail}
                            alt={customerName}
                            className="w-full h-full object-cover transition-transform group-hover:scale-105"
                          />
                        ) : (
                          <div className="flex flex-col items-center justify-center gap-1 text-slate-500">
                            <ImageIcon className="w-5 h-5 text-cyan-400/60" />
                            <span className="text-[8px] text-cyan-400/70 font-mono">LOADING</span>
                          </div>
                        )}
                        <span className="absolute bottom-0 inset-x-0 bg-slate-950/90 text-cyan-300 text-[9px] font-black text-center py-0.5 border-t border-cyan-500/20">
                          {totalCopies} Pcs
                        </span>
                      </div>

                      {/* Order & Customer Details */}
                      <div className="flex-1 min-w-0 flex flex-col justify-between py-0.5">
                        <div className="flex items-center justify-between gap-1">
                          <h4 className="text-xs font-bold text-white truncate max-w-[150px] group-hover:text-cyan-300 transition-colors">
                            {customerName}
                          </h4>
                          <span className="px-1.5 py-0.5 bg-cyan-950 border border-cyan-500/40 text-cyan-300 font-mono text-[10px] font-bold rounded">
                            #{orderCode}
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5 text-[11px] text-slate-400 my-0.5 truncate">
                          {customerPhone && <span>{customerPhone} •</span>}
                          <span className="text-slate-300 truncate">{templateName}</span>
                        </div>

                        {/* Action Row */}
                        <div className="flex items-center justify-between mt-1 pt-1 border-t border-slate-800/60">
                          <span className="text-[10px] text-emerald-400 font-bold">
                            {totalCopies} Passport Photos
                          </span>

                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleLoadOnlineJob(job);
                            }}
                            disabled={isLoadingThis}
                            className="px-2.5 py-1 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-black text-[11px] rounded-lg shadow-sm active:scale-95 transition-all flex items-center gap-1 border border-cyan-300/40"
                          >
                            {isLoadingThis ? (
                              <>
                                <Loader2 className="w-3 h-3 animate-spin text-slate-950" />
                                <span>Loading...</span>
                              </>
                            ) : (
                              <>
                                <Sparkles className="w-3 h-3" />
                                <span>⚡ Load Photo</span>
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Workspace Subheader: Ready Assets + Bulk Actions */}
          <div className="flex items-center justify-between pb-3 shrink-0">
            <div className="flex items-center gap-3">
              <div className="p-1.5 bg-emerald-500/10 rounded-lg border border-emerald-500/20">
                <CheckCircle2 className="text-emerald-400 w-4 h-4" />
              </div>
              <div className="flex items-baseline gap-2">
                <h2 className="text-base font-bold text-white tracking-tight">Studio Assets</h2>
                <span className="text-xs text-slate-400 font-mono">
                  ({processedPhotos.length} ready{activeProcessing > 0 ? `, ${activeProcessing} processing...` : ''})
                </span>
              </div>
            </div>

            {/* Bulk Actions Button */}
            {processedPhotos.length > 0 && (
              <button
                onClick={() => setShowBulkModal(true)}
                className="flex items-center gap-2 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 px-4 py-1.5 rounded-xl font-bold text-xs transition-all shadow-md shadow-cyan-900/20 active:scale-95 border border-cyan-300/40"
              >
                <Layers className="w-3.5 h-3.5" />
                <span>Bulk Sheet Actions {selectedPhotos.length > 0 ? `(${selectedPhotos.length})` : ''}</span>
                <Wand2 className="w-3 h-3 ml-0.5 opacity-70" />
              </button>
            )}
          </div>

          {/* Full-width Photo Grid Container */}
          <div className="flex-1 overflow-y-auto custom-scrollbar pr-1 min-h-0 mt-1">
            {uploads.length === 0 ? (
              <div 
                onClick={() => fileInputRef.current?.click()}
                className={`h-full min-h-[320px] flex flex-col items-center justify-center border-2 border-dashed rounded-3xl p-10 text-center cursor-pointer transition-all ${
                  isDraggingOver 
                    ? 'border-cyan-400 bg-cyan-500/10 shadow-[0_0_40px_rgba(6,182,212,0.2)]' 
                    : 'border-slate-800/90 bg-slate-950/40 hover:border-slate-700 hover:bg-slate-950/70'
                }`}
              >
                <div className="w-16 h-16 bg-slate-900/90 rounded-2xl flex items-center justify-center mb-4 border border-slate-800 shadow-inner group">
                  {restoreVintageMode ? (
                    <Sparkles className="text-amber-400 w-8 h-8 animate-pulse" />
                  ) : (
                    <UploadCloud className="text-cyan-400 w-8 h-8" />
                  )}
                </div>
                <h3 className="text-base font-bold text-slate-200 mb-1.5">
                  {restoreVintageMode
                    ? 'Drop your old / vintage / scanned photo here'
                    : 'Drop your portrait photo here or '}{' '}
                  <span className="text-cyan-400 underline underline-offset-4">browse files</span>
                </h3>
                <p className="text-xs text-slate-400 max-w-md mb-4 leading-relaxed">
                  {restoreVintageMode
                    ? '✨ AI 4K Mode: Automatically detects inner photo, removes hands/borders, de-ages yellowed hues, and boosts 4K clarity at 300 DPI.'
                    : 'Automatic AI background removal, MediaPipe face alignment, and 300 DPI biometric framing will be applied instantly.'}
                </p>

                {/* Mode Selector Cards in Dropzone */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-lg w-full mb-6 text-left">
                  <div
                    onClick={(e) => {
                      e.stopPropagation();
                      setRestoreVintageMode(false);
                      setToast({ type: 'info', message: '📷 Normal Photo Mode Selected' });
                    }}
                    className={`p-3.5 rounded-2xl border-2 cursor-pointer transition-all ${
                      !restoreVintageMode
                        ? 'bg-cyan-950/40 border-cyan-500 shadow-md ring-2 ring-cyan-500/20'
                        : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-2 font-bold text-xs text-white">
                      <Camera size={15} className={!restoreVintageMode ? 'text-cyan-400' : 'text-slate-400'} />
                      <span>Normal Photo Studio</span>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1">
                      Digital camera or mobile portraits with 300 DPI biometric framing.
                    </p>
                  </div>

                  <div
                    onClick={(e) => {
                      e.stopPropagation();
                      setRestoreVintageMode(true);
                      setToast({ type: 'success', message: '✨ AI 4K Old Photo Restoration Mode Selected!' });
                    }}
                    className={`p-3.5 rounded-2xl border-2 cursor-pointer transition-all ${
                      restoreVintageMode
                        ? 'bg-amber-950/40 border-amber-500 shadow-md ring-2 ring-amber-500/20'
                        : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-2 font-bold text-xs text-amber-300">
                      <Sparkles size={15} className="text-amber-400" />
                      <span>✨ 4K Old Photo Restore</span>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1">
                      Auto-detects paper prints, removes fingers/borders, & de-ages to 4K.
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    fileInputRef.current?.click();
                  }}
                  className={`px-8 py-3 rounded-2xl font-black text-xs shadow-xl transition-all flex items-center gap-2 cursor-pointer transform hover:scale-105 active:scale-95 ${
                    restoreVintageMode
                      ? 'bg-gradient-to-r from-amber-400 to-amber-500 text-slate-950 hover:from-amber-300 hover:to-amber-400 shadow-amber-500/20'
                      : 'bg-gradient-to-r from-cyan-400 to-blue-500 text-slate-950 hover:from-cyan-300 hover:to-blue-400 shadow-cyan-500/20'
                  }`}
                >
                  <Plus size={16} className="text-slate-950 font-bold" />
                  <span>{restoreVintageMode ? 'Select Old Photo for 4K Restore' : 'Select Photos to Upload'}</span>
                </button>


              </div>
            ) : (
              <ProcessedPhotosGrid
                photos={processedPhotos}
                uploads={uploads}
                onEdit={handleEditPhoto}
                onDelete={(id) => removePhoto(id, true)}
                onSelectForCopy={handleSelectForCopy}
                onSelectMultiple={handleSelectMultiple}
              />
            )}
          </div>

        </div>

        {/* --- Bottom Status Bar (Fixed Pill-Shaped Footer) --- */}
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 pointer-events-auto">
          <div className="px-5 py-2 rounded-full bg-slate-950/90 border border-slate-700/80 shadow-[0_10px_30px_rgba(0,0,0,0.5)] backdrop-blur-md flex items-center gap-5 text-xs text-slate-300 select-none">
            {/* Ready counter */}
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_6px_#34d399]"></span>
              <span className="font-medium text-slate-400">Ready:</span>
              <span className="font-mono font-bold text-white">{processedPhotos.length}</span>
            </div>

            <div className="w-[1px] h-3.5 bg-slate-800" />

            {/* Compute counter */}
            <div className="flex items-center gap-2">
              <Cpu size={13} className="text-cyan-400" />
              <span className="font-medium text-slate-400">Compute:</span>
              <span className="font-mono font-bold text-cyan-400">{activeProcessing}</span>
            </div>

            <div className="w-[1px] h-3.5 bg-slate-800" />

            {/* Queue counter */}
            <div className="flex items-center gap-2">
              <Activity size={13} className="text-amber-400" />
              <span className="font-medium text-slate-400">Queue:</span>
              <span className="font-mono font-bold text-amber-400">{pendingQueue}</span>
            </div>

            <div className="w-[1px] h-3.5 bg-slate-800" />

            {/* AI Optimization Text */}
            <div className="flex items-center gap-1.5 text-slate-400 font-medium">
              <Zap size={13} className="text-cyan-400 fill-cyan-400" />
              <span className="text-[11px] text-slate-300">PrimeID AI 300 DPI Active</span>
            </div>
          </div>
        </div>

      </main>
      )}


      {/* ================= MODALS & OVERLAYS (PRESERVED) ================= */}
      {editingPhoto && (
        <PhotoEditor
          photo={editingPhoto}
          onSave={handleSaveEdit}
          onClose={() => setEditingPhoto(null)}
          onDelete={handleDeleteFromEditor}
        />
      )}

      {copyEditingPhoto && (
        <PhotoCopyEditor
          photo={copyEditingPhoto}
          onClose={() => setCopyEditingPhoto(null)}
          onPrint={handlePrintFromEditor}
          onExportPdf={handleExportPdfFromEditor}
          globalSettings={settings}
        />
      )}

      {showBulkModal && (
        <BulkCopyModal
          photos={selectedPhotos.length > 0 ? selectedPhotos : processedPhotos}
          onClose={() => setShowBulkModal(false)}
          onPrintBulk={handlePrintBulk}
          onExportPdfBulk={handleExportPdfBulk}
          globalSettings={settings}
        />
      )}

      {showSettingsModal && (
        <PrintSettingsModal
          settings={settings}
          onSave={updateSettings}
          onClose={() => setShowSettingsModal(false)}
          onReset={resetToDefaults}
        />
      )}

      {isPrinting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700 rounded-3xl px-10 py-8 text-center">
            <LoadingSpinner size="large" />
            <p className="mt-4 text-slate-300 text-sm font-medium">Preparing your passport sheet for printing…</p>
          </div>
        </div>
      )}

      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}

      {/* Cloud & Credit Management Modal */}
      <ConnectOnlineModal />
    </div>
  </div>
  );
}

export default App;