import React, { useState } from 'react';
import { X, Printer, FileDown, Plus, Minus, Grid, Layout, Square, Settings2, Sparkles } from 'lucide-react';
import usePrintSettings from '../../hooks/usePrintSettings';

const PhotoCopyEditor = ({ photo, onClose, onPrint, globalSettings }) => {
  // Use passed globalSettings or fallback to hook
  const hookSettings = usePrintSettings();
  const settings = globalSettings || hookSettings.settings;

  // Local state
  const [copies, setCopies] = useState(12);
  const [localMargin, setLocalMargin] = useState({ top: 5, right: 5, bottom: 5, left: 5 });
  const [localPaperSize, setLocalPaperSize] = useState('A4');
  const [rows, setRows] = useState(0);
  const [cols, setCols] = useState(5);
  const [photoSize, setPhotoSize] = useState('2x2');
  const [withoutMargins, setWithoutMargins] = useState(false);
  const [useDefaultSettings, setUseDefaultSettings] = useState(true);

  // When default toggles, load from global
  useState(() => {
    if (useDefaultSettings) {
      setLocalMargin(settings.borderless ? { top: 0, right: 0, bottom: 0, left: 0 } : {
        top: settings.topMargin || 10,
        right: settings.rightMargin || 10,
        bottom: settings.bottomMargin || 10,
        left: settings.leftMargin || 10,
      });
      setLocalPaperSize(settings.paperSize || 'A4');
    }
  }, [useDefaultSettings, settings]);

  const handlePrint = () => {
    const finalMargin = withoutMargins ? { top: 0, right: 0, bottom: 0, left: 0 } : localMargin;
    const finalPaperSize = useDefaultSettings ? settings.paperSize : localPaperSize;
    const finalOrientation = useDefaultSettings ? settings.orientation : 'Portrait';

    onPrint({
      photoUrl: photo.transparentUrl || photo.processedUrl || photo.preview,
      copies,
      margin: finalMargin,
      paperSize: finalPaperSize,
      rows,
      cols,
      photoSize,
      bgColor: photo.bgColor || '#FFFFFF',
      orientation: finalOrientation,
    });
    onClose();
  };

  const pagesNeeded = rows === 0 ? 'Auto' : Math.ceil(copies / (rows * cols));

  return (
    <div className="fixed inset-0 bg-[#020617]/95 backdrop-blur-md z-50 flex items-center justify-center p-4">
      <div className="bg-[#0f172a] border border-slate-800 rounded-[2.5rem] max-w-5xl w-full max-h-[90vh] overflow-hidden shadow-[0_0_50px_-12px_rgba(6,182,212,0.3)] flex flex-col">

        {/* Header */}
        <div className="p-6 border-b border-slate-800 flex justify-between items-center bg-slate-900/50">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-500/10 rounded-xl border border-blue-500/20">
              <Layout className="text-blue-400" size={22} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white tracking-tight">Print Layout Engine</h2>
              <p className="text-[10px] text-slate-500 uppercase font-bold tracking-[0.2em]">Asset Multiplication Studio</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-800 text-slate-400 hover:text-white rounded-full transition-all">
            <X size={24} />
          </button>
        </div>

        <div className="flex-1 overflow-auto p-8 custom-scrollbar">
          <div className="grid lg:grid-cols-2 gap-12">

            {/* Left side: Live Asset Preview */}
            <div className="space-y-6">
              <div className="relative group">
                <div className="absolute -inset-1 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-3xl blur opacity-20 group-hover:opacity-40 transition duration-1000"></div>
                <div
                  className="relative rounded-3xl p-8 border border-slate-800 flex flex-col items-center justify-center min-h-[350px]"
                  style={{ backgroundColor: photo.bgColor || '#0f172a' }}
                >
                  <div className="absolute top-4 left-4 flex items-center gap-2">
                    <Sparkles size={14} className="text-blue-400" />
                    <span className="text-[10px] font-bold text-slate-500 uppercase">Master Asset</span>
                  </div>
                  <img
                    src={photo.transparentUrl || photo.processedUrl || photo.preview}
                    alt="Selected"
                    className="max-w-[220px] h-auto object-contain rounded-xl shadow-2xl border border-slate-800 ring-8 ring-slate-900/50"
                  />
                  <div className="mt-8 px-4 py-1.5 bg-slate-900 rounded-full border border-slate-800 text-[11px] text-slate-400 font-medium">
                    Pre-cropped to Passport Standard
                  </div>
                </div>
              </div>

              {/* Stats Card */}
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-slate-900/50 p-4 rounded-2xl border border-slate-800 text-center">
                  <span className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Sheet Size</span>
                  <span className="text-sm font-mono font-bold text-white">{localPaperSize}</span>
                </div>
                <div className="bg-slate-900/50 p-4 rounded-2xl border border-slate-800 text-center">
                  <span className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Layout</span>
                  <span className="text-sm font-mono font-bold text-white">{cols} Cols</span>
                </div>
                <div className="bg-slate-900/50 p-4 rounded-2xl border border-slate-800 text-center">
                  <span className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Est. Pages</span>
                  <span className="text-sm font-mono font-bold text-blue-400">{pagesNeeded}</span>
                </div>
              </div>
            </div>

            {/* Right side: Configuration Controls */}
            <div className="space-y-8">

              {/* Use Default Settings Checkbox */}
              <label className="flex items-center gap-3 p-3 rounded-xl bg-slate-800/50 border border-slate-700 cursor-pointer hover:bg-slate-800 transition-all">
                <input
                  type="checkbox"
                  checked={useDefaultSettings}
                  onChange={e => setUseDefaultSettings(e.target.checked)}
                  className="w-4 h-4 accent-blue-500"
                />
                <span className="text-sm text-slate-300">Use Default Print Settings</span>
              </label>

              {/* Copy Quantity Controller */}
              <div className="bg-slate-900/50 p-6 rounded-[2rem] border border-slate-800">
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-4 ml-1">Total Copies Required</label>
                <div className="flex items-center justify-between bg-slate-950 p-2 rounded-2xl border border-slate-800">
                  <button
                    onClick={() => setCopies(Math.max(1, copies - 1))}
                    className="w-12 h-12 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 flex items-center justify-center transition-all border border-slate-800"
                  >
                    <Minus size={20} />
                  </button>
                  <span className="text-4xl font-mono font-black text-white">{copies}</span>
                  <button
                    onClick={() => setCopies(Math.min(200, copies + 1))}
                    className="w-12 h-12 rounded-xl bg-blue-600 hover:bg-blue-500 text-white flex items-center justify-center transition-all shadow-lg shadow-blue-900/20"
                  >
                    <Plus size={20} />
                  </button>
                </div>
              </div>

              {/* Grid & Dimensions */}
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-500 uppercase ml-1 flex items-center gap-1">
                    <Grid size={12} /> Columns
                  </label>
                  <input
                    type="number" min="1" max="10" value={cols}
                    onChange={(e) => setCols(Math.min(10, Math.max(1, parseInt(e.target.value) || 1)))}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-2.5 text-white focus:ring-2 focus:ring-blue-500 outline-none transition-all font-mono"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-500 uppercase ml-1 flex items-center gap-1">
                    <Square size={12} /> Print Size
                  </label>
                  <select
                    value={photoSize}
                    onChange={(e) => setPhotoSize(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2.5 text-white text-sm focus:ring-2 focus:ring-blue-500 outline-none cursor-pointer appearance-none"
                  >
                    <option value="2x2">2×2 in (Standard)</option>
                    <option value="35x45">35×45 mm (EU/UK)</option>
                  </select>
                </div>
              </div>

              {/* Advanced Margins */}
              <div className="p-6 bg-slate-900/30 rounded-3xl border border-slate-800/50 space-y-4">
                <div className="flex justify-between items-center">
                  <label className="text-[10px] font-bold text-slate-500 uppercase flex items-center gap-2">
                    <Settings2 size={14} /> Page Margins <span className="opacity-50 text-[8px]">(mm)</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer group">
                    <span className="text-[10px] text-slate-500 font-bold uppercase group-hover:text-slate-300">Edge-to-Edge</span>
                    <input
                      type="checkbox"
                      checked={withoutMargins}
                      onChange={(e) => setWithoutMargins(e.target.checked)}
                      className="w-4 h-4 accent-blue-500"
                    />
                  </label>
                </div>
                <div className="grid grid-cols-4 gap-3">
                  {['top', 'right', 'bottom', 'left'].map((side) => (
                    <div key={side} className="space-y-1">
                      <input
                        type="number"
                        value={localMargin[side]}
                        onChange={(e) => setLocalMargin({ ...localMargin, [side]: +e.target.value })}
                        disabled={withoutMargins || useDefaultSettings}
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2 py-2 text-center text-white text-xs focus:ring-1 focus:ring-blue-500 outline-none disabled:opacity-20 transition-all font-mono"
                        placeholder={side.toUpperCase()}
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* Paper Selection */}
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-500 uppercase ml-1">Media Format</label>
                <select
                  value={localPaperSize}
                  onChange={(e) => setLocalPaperSize(e.target.value)}
                  disabled={useDefaultSettings}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-white text-sm focus:ring-2 focus:ring-blue-500 outline-none cursor-pointer disabled:opacity-40"
                >
                  <option value="A4 (210 × 297 mm)">A4 (210 × 297 mm)</option>
                  <option value="Letter (8.5 × 11 in)">Letter (8.5 × 11 inch)</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-8 border-t border-slate-800 bg-slate-950/50 backdrop-blur-xl flex flex-col sm:flex-row gap-4">
          <button
            onClick={handlePrint}
            className="flex-1 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white py-4 rounded-2xl font-bold flex items-center justify-center gap-3 shadow-xl shadow-blue-900/20 transition-all active:scale-[0.98]"
          >
            <Printer size={20} /> Initialize Print
          </button>
          <button
            onClick={() => alert('PDF export coming soon')}
            className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-200 py-4 rounded-2xl font-bold flex items-center justify-center gap-3 border border-slate-700 transition-all"
          >
            <FileDown size={20} /> Export as PDF
          </button>
        </div>
      </div>
    </div>
  );
};

export default PhotoCopyEditor;