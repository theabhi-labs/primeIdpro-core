import React, { useState } from 'react';
import { X, Printer, FileDown, Plus, Minus, Grid, Layout, Square, Settings2, Sparkles, Scissors, Check } from 'lucide-react';
import usePrintSettings from '../../hooks/usePrintSettings';

const PhotoCopyEditor = ({ photo, onClose, onPrint, onExportPdf, globalSettings }) => {
  const hookSettings = usePrintSettings();
  const settings = globalSettings || hookSettings.settings;

  // Local state
  const [copies, setCopies] = useState(12);
  const [localMargin, setLocalMargin] = useState({ top: 8, right: 8, bottom: 8, left: 8 });
  const [localPaperSize, setLocalPaperSize] = useState('A4');
  const [rows, setRows] = useState(0);
  const [cols, setCols] = useState(5);
  const [photoSize, setPhotoSize] = useState('35x45');
  const [withoutMargins, setWithoutMargins] = useState(false);
  const [cutMarks, setCutMarks] = useState(true);
  const [border, setBorder] = useState(true);
  const [useDefaultSettings, setUseDefaultSettings] = useState(true);

  useState(() => {
    if (useDefaultSettings) {
      setLocalMargin(settings.borderless ? { top: 0, right: 0, bottom: 0, left: 0 } : {
        top: settings.topMargin || 8,
        right: settings.rightMargin || 8,
        bottom: settings.bottomMargin || 8,
        left: settings.leftMargin || 8,
      });
      setLocalPaperSize(settings.paperSize || 'A4');
    }
  }, [useDefaultSettings, settings]);

  const getPayload = () => {
    const finalMargin = withoutMargins ? { top: 0, right: 0, bottom: 0, left: 0 } : localMargin;
    const finalPaperSize = useDefaultSettings ? settings.paperSize : localPaperSize;
    const finalOrientation = useDefaultSettings ? settings.orientation : 'Portrait';

    const photoUrl = photo.editedVersion
      ? (photo.processedUrl || photo.transparentUrl || photo.preview)
      : (photo.transparentUrl || photo.processedUrl || photo.preview);

    return {
      photoUrl,
      copies,
      margin: finalMargin,
      paperSize: finalPaperSize,
      rows,
      cols,
      photoSize,
      bgColor: photo.bgColor || '#FFFFFF',
      orientation: finalOrientation,
      cutMarks,
      border
    };
  };

  const handlePrint = () => {
    onPrint(getPayload());
    onClose();
  };

  const handleExport = () => {
    if (onExportPdf) {
      onExportPdf(getPayload());
    } else {
      onPrint(getPayload());
    }
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
              <p className="text-[10px] text-cyan-400 font-mono font-bold tracking-[0.2em]">300 DPI High-Precision Output</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-800 text-slate-400 hover:text-white rounded-full transition-all">
            <X size={24} />
          </button>
        </div>

        <div className="flex-1 overflow-auto p-8 custom-scrollbar">
          <div className="grid lg:grid-cols-2 gap-12">

            {/* Left side: Live Realistic Sheet Preview */}
            <div className="flex flex-col items-center justify-between space-y-4">
              <div className="w-full flex items-center justify-between px-2">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse"></span>
                  <span className="text-xs font-bold text-slate-200 uppercase tracking-wider">Live Paper Sheet Preview</span>
                </div>
                <span className="text-[11px] font-mono text-cyan-400 bg-cyan-950/80 px-2.5 py-0.5 rounded-full border border-cyan-800/60 font-bold">
                  {localPaperSize} ({localPaperSize === '4x6' ? '102×152 mm' : '210×297 mm'})
                </span>
              </div>

              {/* Realistic White Paper Sheet Container */}
              <div className="w-full flex items-center justify-center p-4 bg-slate-950/60 rounded-3xl border border-slate-800/80 min-h-[380px]">
                <div
                  className="relative bg-white rounded shadow-[0_15px_35px_rgba(0,0,0,0.6)] border border-slate-300 overflow-hidden flex flex-col justify-start transition-all duration-300"
                  style={{
                    width: '100%',
                    maxWidth: localPaperSize === '4x6' ? '240px' : '280px',
                    aspectRatio: localPaperSize === '4x6' ? '101.6 / 152.4' : '210 / 297',
                    padding: withoutMargins ? '4px' : `${Math.max(4, localMargin.top * 0.75)}px ${Math.max(4, localMargin.right * 0.75)}px ${Math.max(4, localMargin.bottom * 0.75)}px ${Math.max(4, localMargin.left * 0.75)}px`,
                  }}
                >
                  {/* Photo Grid on Paper */}
                  <div
                    className="grid gap-[2px] w-full"
                    style={{
                      gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
                    }}
                  >
                    {Array.from({ length: Math.min(copies, cols * (rows || 8)) }).map((_, idx) => (
                      <div
                        key={idx}
                        className={`relative overflow-hidden ${border ? 'border border-slate-400/80' : ''}`}
                        style={{
                          aspectRatio: photoSize === '2x2' ? '1 / 1' : '35 / 45',
                          backgroundColor: photo.bgColor || '#FFFFFF',
                        }}
                      >
                        <img
                          src={photo.editedVersion ? (photo.processedUrl || photo.transparentUrl || photo.preview) : (photo.transparentUrl || photo.processedUrl || photo.preview)}
                          alt="passport"
                          className="w-full h-full object-cover"
                        />
                        {cutMarks && (
                          <div className="absolute inset-0 pointer-events-none border border-dashed border-slate-500/50" />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* 100% Actual Scale & 300 DPI Guarantee Badge */}
              <div className="w-full flex items-center justify-between px-3.5 py-2 rounded-xl bg-slate-900/90 border border-cyan-500/30 text-xs">
                <div className="flex items-center gap-1.5 text-cyan-400 font-extrabold">
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span>100% Actual Scale</span>
                </div>
                <span className="text-slate-400 font-mono text-[11px] font-semibold">
                  {photoSize === '2x2' ? '50.8×50.8 mm' : '35×45 mm'} • 300 DPI
                </span>
              </div>

              {/* Stats Card */}
              <div className="grid grid-cols-3 gap-3 w-full">
                <div className="bg-slate-900/50 p-3 rounded-2xl border border-slate-800 text-center">
                  <span className="block text-[9px] font-bold text-slate-500 uppercase mb-0.5">Sheet Format</span>
                  <span className="text-xs font-mono font-bold text-white">{localPaperSize}</span>
                </div>
                <div className="bg-slate-900/50 p-3 rounded-2xl border border-slate-800 text-center">
                  <span className="block text-[9px] font-bold text-slate-500 uppercase mb-0.5">Grid Columns</span>
                  <span className="text-xs font-mono font-bold text-white">{cols} Cols</span>
                </div>
                <div className="bg-slate-900/50 p-3 rounded-2xl border border-slate-800 text-center">
                  <span className="block text-[9px] font-bold text-slate-500 uppercase mb-0.5">Est. Pages</span>
                  <span className="text-xs font-mono font-bold text-cyan-400">{pagesNeeded}</span>
                </div>
              </div>
            </div>

            {/* Right side: Configuration Controls */}
            <div className="space-y-6">

              {/* Use Default Settings Checkbox */}
              <label className="flex items-center gap-3 p-3 rounded-xl bg-slate-800/50 border border-slate-700 cursor-pointer hover:bg-slate-800 transition-all">
                <input
                  type="checkbox"
                  checked={useDefaultSettings}
                  onChange={e => setUseDefaultSettings(e.target.checked)}
                  className="w-4 h-4 accent-cyan-500"
                />
                <span className="text-sm text-slate-300">Use Default Print Settings</span>
              </label>

              {/* Copy Quantity Controller */}
              <div className="bg-slate-900/50 p-6 rounded-[2rem] border border-slate-800">
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-3 ml-1">Total Copies Required</label>
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
                    className="w-12 h-12 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white flex items-center justify-center transition-all shadow-lg shadow-cyan-900/20"
                  >
                    <Plus size={20} />
                  </button>
                </div>
              </div>

              {/* Grid & Dimensions */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-500 uppercase ml-1 flex items-center gap-1">
                    <Grid size={12} /> Columns
                  </label>
                  <input
                    type="number" min="1" max="10" value={cols}
                    onChange={(e) => setCols(Math.min(10, Math.max(1, parseInt(e.target.value) || 1)))}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-2.5 text-white focus:ring-2 focus:ring-cyan-500 outline-none transition-all font-mono"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-500 uppercase ml-1 flex items-center gap-1">
                    <Square size={12} /> Standard Size
                  </label>
                  <select
                    value={photoSize}
                    onChange={(e) => setPhotoSize(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2.5 text-white text-sm focus:ring-2 focus:ring-cyan-500 outline-none cursor-pointer"
                  >
                    <option value="35x45">35 × 45 mm (Standard Passport)</option>
                    <option value="2x2">2 × 2 in (US / Visa)</option>
                  </select>
                </div>
              </div>

              {/* Guides & Borders */}
              <div className="grid grid-cols-2 gap-4">
                <label className="flex items-center gap-3 p-3 rounded-xl bg-slate-900/60 border border-slate-800 cursor-pointer hover:border-cyan-500/40 transition-all">
                  <input
                    type="checkbox"
                    checked={cutMarks}
                    onChange={e => setCutMarks(e.target.checked)}
                    className="w-4 h-4 accent-cyan-500"
                  />
                  <span className="text-xs text-slate-300 font-medium flex items-center gap-1.5">
                    <Scissors size={14} className="text-cyan-400" /> Cutting Guides
                  </span>
                </label>
                <label className="flex items-center gap-3 p-3 rounded-xl bg-slate-900/60 border border-slate-800 cursor-pointer hover:border-cyan-500/40 transition-all">
                  <input
                    type="checkbox"
                    checked={border}
                    onChange={e => setBorder(e.target.checked)}
                    className="w-4 h-4 accent-cyan-500"
                  />
                  <span className="text-xs text-slate-300 font-medium flex items-center gap-1.5">
                    <Square size={14} className="text-cyan-400" /> Photo Borders
                  </span>
                </label>
              </div>

              {/* Advanced Margins */}
              <div className="p-5 bg-slate-900/30 rounded-3xl border border-slate-800/50 space-y-3">
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
                      className="w-4 h-4 accent-cyan-500"
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
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2 py-2 text-center text-white text-xs focus:ring-1 focus:ring-cyan-500 outline-none disabled:opacity-20 transition-all font-mono"
                        placeholder={side.toUpperCase()}
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* Paper Selection */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-500 uppercase ml-1">Media Format</label>
                <select
                  value={localPaperSize}
                  onChange={(e) => setLocalPaperSize(e.target.value)}
                  disabled={useDefaultSettings}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-2.5 text-white text-sm focus:ring-2 focus:ring-cyan-500 outline-none cursor-pointer disabled:opacity-40"
                >
                  <option value="A4">A4 (210 × 297 mm)</option>
                  <option value="4x6">4×6 in Photo Paper (102 × 152 mm)</option>
                  <option value="Letter">Letter (8.5 × 11 inch)</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-6 border-t border-slate-800 bg-slate-950/50 backdrop-blur-xl flex flex-col sm:flex-row gap-4">
          <button
            onClick={handlePrint}
            className="flex-1 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white py-3.5 rounded-2xl font-bold flex items-center justify-center gap-3 shadow-xl shadow-blue-900/20 transition-all active:scale-[0.98]"
          >
            <Printer size={20} /> Print Layout
          </button>
          <button
            onClick={handleExport}
            className="flex-1 bg-slate-800 hover:bg-slate-700 text-cyan-400 hover:text-cyan-300 py-3.5 rounded-2xl font-bold flex items-center justify-center gap-3 border border-slate-700 shadow-lg transition-all active:scale-[0.98]"
          >
            <FileDown size={20} /> Export as 300 DPI PDF
          </button>
        </div>
      </div>
    </div>
  );
};

export default PhotoCopyEditor;