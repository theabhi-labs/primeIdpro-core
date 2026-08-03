import React, { useState, useEffect } from 'react';
import PhotoUploader from './components/Studio/PhotoUploader';
import ProcessedPhotosGrid from './components/Studio/ProcessedPhotosGrid';
import PhotoCopyEditor from './components/Studio/PhotoCopyEditor';
import PhotoEditor from './components/Studio/PhotoEditor';
import BulkCopyModal from './components/Studio/BulkCopyModal';
import StatusTracker from './components/Studio/StatusTracker';
import CountrySelector from './components/Studio/CountrySelector';
import PrintSettingsModal from './components/Studio/PrintSettingsModal';
import usePhotoProcessing from './hooks/usePhotoProcessing';
import usePrintSettings from './hooks/usePrintSettings';
import Toast from './components/Common/Toast';
import LoadingSpinner from './components/Common/LoadingSpinner';
import { getCountries, saveProject, getOrCreateSession, extractErrorMessage } from './services/api';
import { Sparkles, Layers, CheckCircle2, Wand2, Settings2, Save, Loader2 } from 'lucide-react';

function App() {
  // -------- Core State --------
  const {
    uploads,
    processedPhotos,
    uploadPhotos,
    removePhoto,
    updatePhotoUrl,
  } = usePhotoProcessing();

  const { settings, updateSettings, resetToDefaults } = usePrintSettings();
  const [countries, setCountries] = useState([]);
  const [selectedCountry, setSelectedCountry] = useState('india');
  const [editingPhoto, setEditingPhoto] = useState(null);
  const [copyEditingPhoto, setCopyEditingPhoto] = useState(null);
  const [selectedPhotos, setSelectedPhotos] = useState([]);
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [sessionId, setSessionId] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);
  const [toast, setToast] = useState(null); // { type: 'success' | 'error' | 'info', message }

  // -------- Session (needed so "save project" can be tied back to this browser) --------
  useEffect(() => {
    getOrCreateSession()
      .then(({ session_id }) => setSessionId(session_id))
      .catch((err) => console.error('Could not create session:', err.message));
  }, []);

  // -------- Fetch Country List (same as before) --------
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
    uploadPhotos(files, selectedCountry);
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

  // -------- Save Project (persists the current sheet/selection to MongoDB) --------
  const handleSaveProject = async () => {
    // Prevent the request entirely if required fields are missing —
    // don't even hit the network for an incomplete selection.
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
      // Show the exact backend error (validation detail, "database
      // unavailable", etc.) rather than a generic failure message.
      setToast({ type: 'error', message: extractErrorMessage(err) });
    } finally {
      setIsSaving(false);
    }
  };

  // -------- Print Helpers (same logic, now using global settings) --------
  // Browser/dev fallback: prints via a hidden iframe. This is ONLY used
  // when the app isn't running inside Electron — inside Electron, calling
  // window.print()/iframe.print() on a page that was never shown on screen
  // is exactly what produces "This app doesn't support print preview".
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

  // Inside Electron: hand the sheet HTML off to the main process, which
  // prints it from a proper hidden BrowserWindow (see electron/main.js).
  // Falls back to generating + opening a PDF automatically if the native
  // print dialog can't produce a preview, and always shows the user a
  // friendly toast instead of a blank preview on failure.
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

  // Enhanced printLayout with orientation support and dynamic paper size
  const printLayout = (photoEntries, margin, paperSize, rows, cols, photoSize, orientation = 'Portrait') => {
    if (!photoEntries.length) return;

    const PHOTO_WIDTH_MM = photoSize === '2x2' ? 50.8 : 35;
    const PHOTO_HEIGHT_MM = photoSize === '2x2' ? 50.8 : 45;
    const GAP_MM = 1.5;

    // Paper dimensions in mm – swap for Landscape
    let paper = paperSize === 'A4' ? { w: 210, h: 297 } : { w: 215.9, h: 279.4 };
    if (orientation === 'Landscape') {
      paper = { w: paper.h, h: paper.w };
    }

    const usableHeight = paper.h - margin.top - margin.bottom;

    let rowsPerPage = rows;
    if (rowsPerPage === 0) {
      const maxRowsByHeight = Math.floor((usableHeight + GAP_MM) / (PHOTO_HEIGHT_MM + GAP_MM));
      rowsPerPage = Math.min(maxRowsByHeight, 6);
      if (rowsPerPage < 1) rowsPerPage = 1;
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
        gridItems += `<div class="photo-card" style="background:${bg};"><img src="${entry.url}" alt="passport" /></div>`;
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
        <title>Print Passport Photos</title>
        <style>
          * { margin:0; padding:0; box-sizing:border-box; }
          body { margin: ${margin.top}mm ${margin.right}mm ${margin.bottom}mm ${margin.left}mm; background: white; }
          .page { page-break-after: always; break-after: page; height: auto; min-height: 100vh; }
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
            border: 1px solid #ddd;
            overflow: hidden;
          }
          .photo-card img {
            width: 100%;
            height: 100%;
            object-fit: cover;
            display: block;
          }
          .photo-card.empty { border: none; }
          @media print { body { margin:0; } .photo-card { border: 1px solid #eee; } }
        </style>
      </head>
      <body>${allPagesHtml}</body>
      </html>
    `;

    if (window.electronAPI?.isElectron) {
      printViaElectron(html, { orientation, paperSize });
    } else {
      // Web/dev build: keep the old iframe approach, which needs the
      // window.print()-and-close script inline since there's no IPC main
      // process to drive printing from.
      const iframeHtml = html.replace(
        '</body>',
        '<script>window.onload=()=>{window.print();setTimeout(()=>window.close(),500)}<\\/script></body>'
      );
      printViaIframe(iframeHtml);
    }
  };

  // -------- Print handlers that now pass orientation --------
  const handlePrintFromEditor = ({ photoUrl, copies, margin, paperSize, rows, cols, photoSize, bgColor, orientation }) => {
    const entries = Array(copies).fill({ url: photoUrl, bgColor });
    printLayout(entries, margin, paperSize, rows, cols, photoSize, orientation);
  };

  const handlePrintBulk = ({ photos: photoList, margin, paperSize, rows, cols, photoSize, orientation }) => {
    const allEntries = [];
    photoList.forEach(p => {
      for (let i = 0; i < p.copies; i++) allEntries.push({ url: p.url, bgColor: p.bgColor });
    });
    printLayout(allEntries, margin, paperSize, rows, cols, photoSize, orientation);
  };

  // -------- Render --------
  return (
    <div className="min-h-screen bg-[#020617] text-slate-200 selection:bg-cyan-500/30">
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-[10%] -left-[10%] w-[40%] h-[40%] bg-cyan-500/5 rounded-full blur-[120px]" />
        <div className="absolute top-[20%] -right-[10%] w-[30%] h-[30%] bg-blue-600/5 rounded-full blur-[100px]" />
      </div>

      <div className="relative container mx-auto px-4 py-12 max-w-6xl">
        {/* Header with Settings Button */}
        <header className="flex flex-col items-center text-center mb-16 relative">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-slate-900 border border-slate-800 mb-6">
            <Sparkles className="w-4 h-4 text-cyan-400" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Next-Gen ID Processing</span>
          </div>

          <h1 className="text-5xl md:text-6xl font-black tracking-tighter text-white mb-4">
            Prime<span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-600">ID</span>Pro
          </h1>

          <p className="max-w-2xl text-slate-400 text-lg leading-relaxed">
            Professional AI studio for passport photos.
            <span className="text-slate-200"> Upload, enhance, and generate print-ready layouts</span> in seconds.
          </p>

          {/* Settings + Save buttons (top-right) */}
          <div className="absolute top-0 right-0 flex items-center gap-3">
            <button
              onClick={handleSaveProject}
              disabled={isSaving || processedPhotos.length === 0}
              className="flex items-center gap-2 px-4 py-3 bg-cyan-500 hover:bg-cyan-400 disabled:bg-slate-800 disabled:text-slate-600 disabled:cursor-not-allowed rounded-2xl text-black font-bold transition-all border border-cyan-400/50 disabled:border-slate-700"
              title="Save Project"
            >
              {isSaving ? <Loader2 size={20} className="animate-spin" /> : <Save size={20} />}
              {isSaving ? 'Saving…' : 'Save Project'}
            </button>
            <button
              onClick={() => setShowSettingsModal(true)}
              className="p-3 bg-slate-800 hover:bg-slate-700 rounded-2xl text-slate-400 hover:text-white transition-all border border-slate-700"
              title="Print Settings"
            >
              <Settings2 size={22} />
            </button>
          </div>
        </header>

        <div className="space-y-8">
          <CountrySelector countries={countries} selectedCountry={selectedCountry} onChange={setSelectedCountry} />

          <div className="grid grid-cols-1 gap-8">
            <PhotoUploader onUpload={handleUpload} />
            <StatusTracker photos={uploads} />
          </div>
        </div>

        <div className="mt-20">
          <div className="flex flex-col md:flex-row justify-between items-center gap-6 mb-10 pb-6 border-b border-slate-800/50">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-emerald-500/10 rounded-2xl border border-emerald-500/20">
                <CheckCircle2 className="text-emerald-400 w-6 h-6" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-white tracking-tight">Ready Assets</h2>
                <p className="text-sm text-slate-500 font-medium">Processed Photos: {processedPhotos.length}</p>
              </div>
            </div>

            {selectedPhotos.length > 0 && (
              <button
                onClick={() => setShowBulkModal(true)}
                className="group flex items-center gap-3 bg-white text-black px-8 py-3.5 rounded-2xl font-bold hover:bg-cyan-400 transition-all shadow-[0_20px_40px_-15px_rgba(255,255,255,0.1)] active:scale-95"
              >
                <Layers className="w-5 h-5" />
                Bulk Actions ({selectedPhotos.length})
                <Wand2 className="w-4 h-4 ml-1 opacity-50 group-hover:opacity-100" />
              </button>
            )}
          </div>

          {processedPhotos.length === 0 ? (
            <div className="bg-slate-900/30 border-2 border-dashed border-slate-800 rounded-[3rem] py-24 text-center">
              <div className="mx-auto w-16 h-16 bg-slate-800/50 rounded-2xl flex items-center justify-center mb-4 border border-slate-700">
                <Layers className="text-slate-500 w-8 h-8" />
              </div>
              <p className="text-slate-500 font-medium italic">Your studio is empty. Upload images to begin AI processing.</p>
            </div>
          ) : (
            <ProcessedPhotosGrid
              photos={processedPhotos}
              onEdit={handleEditPhoto}
              onDelete={(id) => removePhoto(id, true)}
              onSelectForCopy={handleSelectForCopy}
              onSelectMultiple={handleSelectMultiple}
            />
          )}
        </div>
      </div>

      {/* ---------- Modals ---------- */}
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
          globalSettings={settings}   // pass global settings
        />
      )}

      {showBulkModal && (
        <BulkCopyModal
          photos={selectedPhotos}
          onClose={() => setShowBulkModal(false)}
          onPrintBulk={handlePrintBulk}
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
          <div className="bg-slate-900 border border-slate-700 rounded-3xl px-10 py-8">
            <LoadingSpinner size="large" />
            <p className="mt-4 text-slate-300 text-sm text-center">Preparing your passport sheet for printing…</p>
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

      <footer className="py-12 border-t border-slate-900 mt-20">
        <div className="text-center text-slate-600 text-xs uppercase tracking-[0.3em]">
          Powered by PrimeID Pro AI Engine © 2026
        </div>
      </footer>
    </div>
  );
}

export default App;