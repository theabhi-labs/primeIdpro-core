import React, { useState, useEffect } from 'react';
import { X, Printer, Plus, Minus, Settings2, LayoutGrid, Info, FileDown, Scissors, Square } from 'lucide-react';
import usePrintSettings from '../../hooks/usePrintSettings';

const BulkCopyModal = ({ photos, onClose, onPrintBulk, onExportPdfBulk, globalSettings }) => {
  const hookSettings = usePrintSettings();
  const settings = globalSettings || hookSettings.settings;

  // Local state for modal UI
  const [copiesPerPhoto, setCopiesPerPhoto] = useState({});
  const [localMargin, setLocalMargin] = useState({ top: 8, right: 8, bottom: 8, left: 8 });
  const [localPaperSize, setLocalPaperSize] = useState('A4');
  const [rows, setRows] = useState(0);
  const [cols, setCols] = useState(5);
  const [photoSize, setPhotoSize] = useState('35x45');
  const [withoutMargins, setWithoutMargins] = useState(false);
  const [cutMarks, setCutMarks] = useState(true);
  const [border, setBorder] = useState(true);
  const [useDefaultSettings, setUseDefaultSettings] = useState(true);

  useEffect(() => {
    const init = {};
    photos.forEach(p => { init[p.id] = 1; });
    setCopiesPerPhoto(init);
  }, [photos]);

  useEffect(() => {
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

  const updateCopies = (id, value) => {
    setCopiesPerPhoto(prev => ({ ...prev, [id]: Math.max(1, value) }));
  };

  const totalCopies = Object.values(copiesPerPhoto).reduce((a, b) => a + b, 0);

  const getPayload = () => {
    const finalMargin = withoutMargins ? { top: 0, right: 0, bottom: 0, left: 0 } : localMargin;
    const finalPaperSize = useDefaultSettings ? settings.paperSize : localPaperSize;
    const finalOrientation = useDefaultSettings ? settings.orientation : 'Portrait';

    return {
      photos: photos.map(p => ({
        url: p.editedVersion ? (p.processedUrl || p.transparentUrl) : (p.transparentUrl || p.processedUrl),
        bgColor: p.bgColor || '#FFFFFF',
        copies: copiesPerPhoto[p.id] || 1,
      })),
      margin: finalMargin,
      paperSize: finalPaperSize,
      rows,
      cols,
      photoSize,
      orientation: finalOrientation,
      cutMarks,
      border
    };
  };

  const handlePrint = () => {
    onPrintBulk(getPayload());
    onClose();
  };

  const handleExport = () => {
    if (onExportPdfBulk) {
      onExportPdfBulk(getPayload());
    } else {
      onPrintBulk(getPayload());
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-[#020617]/90 backdrop-blur-md z-50 flex items-center justify-center p-4">
      <div className="bg-[#0f172a] border border-slate-800 rounded-[2.5rem] max-w-6xl w-full max-h-[90vh] overflow-hidden shadow-[0_0_50px_-12px_rgba(6,182,212,0.5)] flex flex-col">

        {/* Header */}
        <div className="p-6 border-b border-slate-800 flex justify-between items-center bg-slate-900/50">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-cyan-500/10 rounded-lg">
              <Printer className="text-cyan-400" size={24} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white tracking-tight">Bulk Print Studio</h2>
              <p className="text-xs text-cyan-400 font-mono uppercase tracking-widest">300 DPI Multi-Asset Engine</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-800 text-slate-400 hover:text-white rounded-full transition-colors cursor-pointer">
            <X size={24} />
          </button>
        </div>

        <div className="flex-1 overflow-auto p-6 custom-scrollbar">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">

            {/* Column 1: Photo Quantities List */}
            <div className="space-y-4">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                <LayoutGrid size={15} className="text-cyan-400" /> Select Quantities
              </h3>
              <div className="space-y-3 max-h-[380px] overflow-y-auto pr-2 custom-scrollbar">
                {photos.map(photo => (
                  <div key={photo.id} className="flex items-center gap-3.5 bg-slate-800/30 p-3.5 rounded-2xl border border-slate-800 hover:border-slate-700 transition-all">
                    <div
                      className="relative rounded-xl overflow-hidden border border-slate-700 shadow-md shrink-0"
                      style={{ backgroundColor: photo.bgColor || '#FFFFFF' }}
                    >
                      <img src={photo.transparentUrl || photo.processedUrl} alt="thumb" className="w-12 h-16 object-cover" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-slate-300 truncate mb-1.5">Asset #{photo.id.slice(0, 6)}</p>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => updateCopies(photo.id, (copiesPerPhoto[photo.id] || 1) - 1)}
                          className="w-8 h-8 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-300 hover:bg-slate-700 hover:text-white transition-all cursor-pointer"
                        >
                          <Minus size={14} />
                        </button>
                        <span className="text-lg font-mono font-bold text-white w-7 text-center">{copiesPerPhoto[photo.id] || 1}</span>
                        <button
                          onClick={() => updateCopies(photo.id, (copiesPerPhoto[photo.id] || 1) + 1)}
                          className="w-8 h-8 rounded-lg bg-cyan-600 flex items-center justify-center text-white hover:bg-cyan-500 shadow-sm transition-all cursor-pointer"
                        >
                          <Plus size={14} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Use Default Settings Checkbox */}
              <label className="flex items-center gap-3 p-3 rounded-xl bg-slate-800/50 border border-slate-700 cursor-pointer hover:bg-slate-800 transition-all">
                <input
                  type="checkbox"
                  checked={useDefaultSettings}
                  onChange={e => setUseDefaultSettings(e.target.checked)}
                  className="w-4 h-4 accent-cyan-500 cursor-pointer"
                />
                <span className="text-xs text-slate-300">Use Default Print Settings</span>
                <Info size={15} className="text-slate-500 ml-auto" />
              </label>
            </div>

            {/* Column 2: Layout Configuration */}
            <div className="bg-slate-900/50 p-5 rounded-3xl border border-slate-800 space-y-4">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                <Settings2 size={15} className="text-cyan-400" /> Layout Settings
              </h3>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Grid Columns</label>
                  <input
                    type="number" min="1" max="10" value={cols}
                    onChange={e => setCols(parseInt(e.target.value) || 1)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white focus:ring-2 focus:ring-cyan-500 outline-none transition-all font-mono text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Grid Rows (Auto=0)</label>
                  <input
                    type="number" min="0" max="10" value={rows}
                    onChange={e => setRows(parseInt(e.target.value) || 0)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white focus:ring-2 focus:ring-cyan-500 outline-none transition-all font-mono text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Photo Size</label>
                  <select value={photoSize} onChange={e => setPhotoSize(e.target.value)} className="w-full bg-slate-800 border border-slate-700 rounded-xl px-2.5 py-2 text-white focus:ring-2 focus:ring-cyan-500 outline-none cursor-pointer text-xs">
                    <option value="35x45">35 × 45 mm (Standard)</option>
                    <option value="2x2">2 × 2 in (US / Visa)</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Paper Format</label>
                  <select
                    value={localPaperSize}
                    onChange={e => setLocalPaperSize(e.target.value)}
                    disabled={useDefaultSettings}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-2.5 py-2 text-white text-xs focus:ring-2 focus:ring-cyan-500 outline-none cursor-pointer disabled:opacity-40"
                  >
                    <option value="A4">A4 (210 × 297 mm)</option>
                    <option value="4x6">4×6 in (102 × 152 mm)</option>
                    <option value="Letter">Letter (8.5 × 11 in)</option>
                  </select>
                </div>
              </div>

              {/* Guides & Borders */}
              <div className="grid grid-cols-2 gap-2.5">
                <label className="flex items-center gap-2 p-2 rounded-xl bg-slate-800/40 border border-slate-700 cursor-pointer hover:border-cyan-500/40 transition-all">
                  <input
                    type="checkbox"
                    checked={cutMarks}
                    onChange={e => setCutMarks(e.target.checked)}
                    className="w-3.5 h-3.5 accent-cyan-500 cursor-pointer"
                  />
                  <span className="text-[11px] text-slate-300 font-medium flex items-center gap-1">
                    <Scissors size={12} className="text-cyan-400" /> Cutting Guides
                  </span>
                </label>
                <label className="flex items-center gap-2 p-2 rounded-xl bg-slate-800/40 border border-slate-700 cursor-pointer hover:border-cyan-500/40 transition-all">
                  <input
                    type="checkbox"
                    checked={border}
                    onChange={e => setBorder(e.target.checked)}
                    className="w-3.5 h-3.5 accent-cyan-500 cursor-pointer"
                  />
                  <span className="text-[11px] text-slate-300 font-medium flex items-center gap-1">
                    <Square size={12} className="text-cyan-400" /> Photo Borders
                  </span>
                </label>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase ml-1 flex items-center gap-1">
                  Margins <span className="opacity-50">(mm)</span>
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {['top', 'right', 'bottom', 'left'].map(side => (
                    <input
                      key={side} type="number" placeholder={side}
                      value={localMargin[side]}
                      onChange={e => setLocalMargin({...localMargin, [side]: parseInt(e.target.value) || 0})}
                      disabled={withoutMargins || useDefaultSettings}
                      className="bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-center text-white text-xs focus:ring-1 focus:ring-cyan-500 outline-none disabled:opacity-30 transition-all font-mono"
                    />
                  ))}
                </div>
              </div>

              <label className="flex items-center gap-2.5 p-2.5 rounded-2xl bg-slate-800/50 border border-slate-700/50 cursor-pointer group transition-all hover:bg-slate-800">
                <input
                  type="checkbox"
                  checked={withoutMargins}
                  onChange={e => setWithoutMargins(e.target.checked)}
                  className="w-3.5 h-3.5 accent-cyan-500 cursor-pointer"
                />
                <span className="text-xs text-slate-300">Edge-to-edge (No Margins)</span>
              </label>
            </div>

            {/* Column 3: Live Realistic Sheet Preview */}
            <div className="flex flex-col items-center justify-between space-y-3 bg-slate-900/30 p-4 rounded-3xl border border-slate-800/60">
              <div className="w-full flex items-center justify-between px-1">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse"></span>
                  <span className="text-xs font-bold text-slate-200 uppercase tracking-wider">Live Sheet Preview</span>
                </div>
                <span className="text-[10px] font-mono text-cyan-400 bg-cyan-950/80 px-2 py-0.5 rounded-full border border-cyan-800/60 font-bold">
                  {localPaperSize}
                </span>
              </div>

              {/* Realistic White Paper Sheet Container */}
              <div className="w-full flex items-center justify-center p-3 bg-slate-950/80 rounded-2xl border border-slate-800 min-h-[260px]">
                <div
                  className="relative bg-white rounded shadow-[0_10px_30px_rgba(0,0,0,0.6)] border border-slate-300 overflow-hidden flex flex-col justify-start transition-all duration-300"
                  style={{
                    width: '100%',
                    maxWidth: localPaperSize === '4x6' ? '180px' : '210px',
                    aspectRatio: localPaperSize === '4x6' ? '101.6 / 152.4' : '210 / 297',
                    padding: withoutMargins ? '3px' : `${Math.max(3, localMargin.top * 0.5)}px ${Math.max(3, localMargin.right * 0.5)}px ${Math.max(3, localMargin.bottom * 0.5)}px ${Math.max(3, localMargin.left * 0.5)}px`,
                  }}
                >
                  <div
                    className="grid gap-[2px] w-full"
                    style={{
                      gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
                    }}
                  >
                    {photos.flatMap(p => Array(copiesPerPhoto[p.id] || 1).fill(p)).slice(0, cols * (rows || 8)).map((p, idx) => (
                      <div
                        key={idx}
                        className={`relative overflow-hidden ${border ? 'border border-slate-400/80' : ''}`}
                        style={{
                          aspectRatio: photoSize === '2x2' ? '1 / 1' : '35 / 45',
                          backgroundColor: p.bgColor || '#FFFFFF',
                        }}
                      >
                        <img
                          src={p.editedVersion ? (p.processedUrl || p.transparentUrl) : (p.transparentUrl || p.processedUrl)}
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

              {/* 100% Actual Scale Badge */}
              <div className="w-full flex items-center justify-between px-3 py-2 rounded-xl bg-slate-900/90 border border-cyan-500/30 text-xs">
                <span className="text-cyan-400 font-bold flex items-center gap-1 text-[11px]">
                  ✓ 100% Scale
                </span>
                <span className="text-slate-400 font-mono text-[10px] font-semibold">
                  {photoSize === '2x2' ? '50.8×50.8 mm' : '35×45 mm'} • 300 DPI
                </span>
              </div>
            </div>

          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-6 border-t border-slate-800 bg-slate-900/80 backdrop-blur-xl flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-4 text-slate-400 bg-slate-950 px-5 py-2 rounded-2xl border border-slate-800">
            <div className="flex flex-col">
              <span className="text-[10px] uppercase font-bold text-slate-500 leading-none mb-1">Total Output</span>
              <span className="text-lg font-mono font-bold text-cyan-400">{totalCopies} <span className="text-xs font-sans text-slate-500">Copies</span></span>
            </div>
            <div className="h-8 w-px bg-slate-800" />
            <div className="flex flex-col">
              <span className="text-[10px] uppercase font-bold text-slate-500 leading-none mb-1">Order Cost</span>
              <span className="text-lg font-mono font-bold text-amber-400">{photos.length * 2} <span className="text-xs font-sans text-slate-500">Credits ({photos.length} × 2)</span></span>
            </div>
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto">
            <button
              onClick={handlePrint}
              className="flex-1 sm:flex-initial px-6 py-3.5 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white rounded-2xl font-bold flex items-center justify-center gap-2.5 shadow-xl shadow-cyan-900/20 transition-all active:scale-95 text-sm"
            >
              <Printer size={18} /> Print Layout
            </button>
            <button
              onClick={handleExport}
              className="flex-1 sm:flex-initial px-6 py-3.5 bg-slate-800 hover:bg-slate-700 text-cyan-400 hover:text-cyan-300 border border-slate-700 rounded-2xl font-bold flex items-center justify-center gap-2.5 shadow-lg transition-all active:scale-95 text-sm"
            >
              <FileDown size={18} /> Export 300 DPI PDF
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BulkCopyModal;