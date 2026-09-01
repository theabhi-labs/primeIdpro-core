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
        url: p.transparentUrl || p.processedUrl,
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
      <div className="bg-[#0f172a] border border-slate-800 rounded-[2.5rem] max-w-4xl w-full max-h-[90vh] overflow-hidden shadow-[0_0_50px_-12px_rgba(6,182,212,0.5)] flex flex-col">

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
          <button onClick={onClose} className="p-2 hover:bg-slate-800 text-slate-400 hover:text-white rounded-full transition-colors">
            <X size={24} />
          </button>
        </div>

        <div className="flex-1 overflow-auto p-8 custom-scrollbar">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">

            {/* Left Side: Photo List */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-slate-400 uppercase mb-4 flex items-center gap-2">
                <LayoutGrid size={16} /> Select Quantities
              </h3>
              <div className="space-y-3 max-h-[360px] overflow-y-auto pr-2 custom-scrollbar">
                {photos.map(photo => (
                  <div key={photo.id} className="flex items-center gap-4 bg-slate-800/30 p-4 rounded-2xl border border-slate-800 hover:border-slate-700 transition-all">
                    <div
                      className="relative rounded-xl overflow-hidden border border-slate-700 shadow-lg"
                      style={{ backgroundColor: photo.bgColor || '#FFFFFF' }}
                    >
                      <img src={photo.transparentUrl || photo.processedUrl} alt="thumb" className="w-16 h-20 object-cover" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-end gap-4">
                        <button
                          onClick={() => updateCopies(photo.id, (copiesPerPhoto[photo.id] || 1) - 1)}
                          className="w-10 h-10 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-300 hover:bg-slate-700 hover:text-white transition-all"
                        >
                          <Minus size={16} />
                        </button>
                        <span className="text-2xl font-mono font-bold text-white w-8 text-center">{copiesPerPhoto[photo.id] || 1}</span>
                        <button
                          onClick={() => updateCopies(photo.id, (copiesPerPhoto[photo.id] || 1) + 1)}
                          className="w-10 h-10 rounded-xl bg-cyan-600 flex items-center justify-center text-white hover:bg-cyan-500 shadow-lg shadow-cyan-900/20 transition-all"
                        >
                          <Plus size={16} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Use Default Settings Checkbox */}
              <label className="flex items-center gap-3 p-3 mt-4 rounded-xl bg-slate-800/50 border border-slate-700 cursor-pointer hover:bg-slate-800 transition-all">
                <input
                  type="checkbox"
                  checked={useDefaultSettings}
                  onChange={e => setUseDefaultSettings(e.target.checked)}
                  className="w-4 h-4 accent-cyan-500"
                />
                <span className="text-sm text-slate-300">Use Default Print Settings</span>
                <Info size={16} className="text-slate-500 ml-auto" />
              </label>
            </div>

            {/* Right Side: Configuration */}
            <div className="bg-slate-900/50 p-6 rounded-3xl border border-slate-800 space-y-5">
              <h3 className="text-sm font-semibold text-slate-400 uppercase flex items-center gap-2">
                <Settings2 size={16} /> Layout Settings
              </h3>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-400 ml-1">Grid Columns</label>
                  <input
                    type="number" min="1" max="10" value={cols}
                    onChange={e => setCols(parseInt(e.target.value) || 1)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2 text-white focus:ring-2 focus:ring-cyan-500 outline-none transition-all font-mono"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-400 ml-1">Grid Rows (Auto=0)</label>
                  <input
                    type="number" min="0" max="10" value={rows}
                    onChange={e => setRows(parseInt(e.target.value) || 0)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2 text-white focus:ring-2 focus:ring-cyan-500 outline-none transition-all font-mono"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-400 ml-1">Photo Dimension</label>
                  <select value={photoSize} onChange={e => setPhotoSize(e.target.value)} className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white focus:ring-2 focus:ring-cyan-500 outline-none cursor-pointer text-sm">
                    <option value="35x45">35 × 45 mm (Standard)</option>
                    <option value="2x2">2 × 2 inch (US)</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-400 ml-1">Paper Format</label>
                  <select
                    value={localPaperSize}
                    onChange={e => setLocalPaperSize(e.target.value)}
                    disabled={useDefaultSettings}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white text-sm focus:ring-2 focus:ring-cyan-500 outline-none cursor-pointer disabled:opacity-40"
                  >
                    <option value="A4">A4 (210 × 297 mm)</option>
                    <option value="4x6">4×6 in (102 × 152 mm)</option>
                    <option value="Letter">Letter (8.5 × 11 in)</option>
                  </select>
                </div>
              </div>

              {/* Guides & Borders */}
              <div className="grid grid-cols-2 gap-3">
                <label className="flex items-center gap-2.5 p-2.5 rounded-xl bg-slate-800/40 border border-slate-700 cursor-pointer hover:border-cyan-500/40 transition-all">
                  <input
                    type="checkbox"
                    checked={cutMarks}
                    onChange={e => setCutMarks(e.target.checked)}
                    className="w-4 h-4 accent-cyan-500"
                  />
                  <span className="text-xs text-slate-300 font-medium flex items-center gap-1">
                    <Scissors size={13} className="text-cyan-400" /> Cutting Guides
                  </span>
                </label>
                <label className="flex items-center gap-2.5 p-2.5 rounded-xl bg-slate-800/40 border border-slate-700 cursor-pointer hover:border-cyan-500/40 transition-all">
                  <input
                    type="checkbox"
                    checked={border}
                    onChange={e => setBorder(e.target.checked)}
                    className="w-4 h-4 accent-cyan-500"
                  />
                  <span className="text-xs text-slate-300 font-medium flex items-center gap-1">
                    <Square size={13} className="text-cyan-400" /> Photo Borders
                  </span>
                </label>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-400 ml-1 flex items-center gap-1">
                  Margins <span className="text-[10px] opacity-50">(mm)</span>
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

              <label className="flex items-center gap-3 p-2.5 rounded-2xl bg-slate-800/50 border border-slate-700/50 cursor-pointer group transition-all hover:bg-slate-800">
                <input
                  type="checkbox"
                  checked={withoutMargins}
                  onChange={e => setWithoutMargins(e.target.checked)}
                  className="w-4 h-4 accent-cyan-500"
                />
                <span className="text-xs text-slate-300">Edge-to-edge printing (No Margins)</span>
              </label>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-6 border-t border-slate-800 bg-slate-900/80 backdrop-blur-xl flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3 text-slate-400 bg-slate-950 px-5 py-2 rounded-2xl border border-slate-800">
            <div className="flex flex-col">
              <span className="text-[10px] uppercase font-bold text-slate-500 leading-none mb-1">Total Output</span>
              <span className="text-lg font-mono font-bold text-cyan-400">{totalCopies} <span className="text-xs font-sans text-slate-500">Copies</span></span>
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