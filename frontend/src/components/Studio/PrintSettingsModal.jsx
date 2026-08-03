import React, { useState, useEffect } from 'react';
import { X, Printer, Save, RotateCcw } from 'lucide-react';

// ये Paper Sizes की पूरी लिस्ट – आपकी image के अनुसार (मैंने कुछ main + custom sizes डाले हैं)
const PAPER_SIZES = [
  'Letter (8.5 × 11 in)',
  'A4 (210 × 297 mm)',
  'A3 (297 × 420 mm)',
  'B (10 × 15 cm)',
  'C (13 × 18 cm)',
  'D (16 × 20 cm)',
  'E (20 × 25 cm)',
  'F (25 × 30 cm)',
  'G (32 × 40 cm)',
  'H (40 × 50 cm)',
  'I (50 × 60 cm)',
  'J (60 × 80 cm)',
  'K (70 × 100 cm)',
  'L (80 × 120 cm)',
  'M (90 × 130 cm)',
  'N (100 × 140 cm)',
  'O (110 × 150 cm)',
  'P (120 × 160 cm)',
  'Q (130 × 170 cm)',
  'R (140 × 180 cm)',
  'S (150 × 190 cm)',
  'T (160 × 200 cm)',
  'U (170 × 210 cm)',
  'V (180 × 220 cm)',
  'W (190 × 230 cm)',
  'X (200 × 240 cm)',
  'Y (210 × 250 cm)',
  'Z (220 × 260 cm)',
  // ... आप चाहें तो और sizes add कर सकते हैं (जितने आपकी image में हैं)
];

const PAPER_SOURCES = ['Rear Paper Feed', 'Front Paper Feed', 'Cassette', 'Manual'];
const PAPER_TYPES = [
  'Plain papers',
  'Epson Ultra Glossy',
  'Epson Premium Glossy',
  'Epson Premium Semigloss',
  'Photo Paper Glossy',
  'Epson Matte',
  'Epson Photo Quality Ink Jet',
  'Epson Photo Stickers'
];
const QUALITY_OPTIONS = ['Draft', 'Normal', 'Best'];
const COLOR_MODES = ['Color', 'Grayscale', 'Black & White'];
const ORIENTATIONS = ['Portrait', 'Landscape'];
const RESOLUTIONS = [150, 300, 600, 1200, 2400];

const PrintSettingsModal = ({ settings, onSave, onClose }) => {
  const [localSettings, setLocalSettings] = useState(settings);

  // जब settings prop बदले तो local state update हो
  useEffect(() => {
    setLocalSettings(settings);
  }, [settings]);

  const handleChange = (key, value) => {
    setLocalSettings(prev => ({ ...prev, [key]: value }));
  };

  const handleSave = () => {
    onSave(localSettings);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-[#020617]/95 backdrop-blur-md z-50 flex items-center justify-center p-4">
      <div className="bg-[#0f172a] border border-slate-800 rounded-[2.5rem] max-w-4xl w-full max-h-[90vh] overflow-hidden shadow-[0_0_50px_-12px_rgba(6,182,212,0.3)] flex flex-col">

        {/* Header */}
        <div className="p-6 border-b border-slate-800 flex justify-between items-center bg-slate-900/50">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-cyan-500/10 rounded-xl border border-cyan-500/20">
              <Printer className="text-cyan-400" size={24} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white tracking-tight">Print Settings</h2>
              <p className="text-[10px] text-slate-500 uppercase font-bold tracking-[0.2em]">Set Defaults for All Print Jobs</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-800 text-slate-400 hover:text-white rounded-full transition-colors">
            <X size={24} />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-auto p-8 custom-scrollbar">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">

            {/* Paper & Layout */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-slate-400 uppercase border-b border-slate-800 pb-2">Paper & Layout</h3>

              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase">Paper Size</label>
                <select
                  value={localSettings.paperSize}
                  onChange={e => handleChange('paperSize', e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-white text-sm focus:ring-2 focus:ring-cyan-500 outline-none"
                >
                  {PAPER_SIZES.map(size => <option key={size}>{size}</option>)}
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase">Paper Source</label>
                <select
                  value={localSettings.paperSource}
                  onChange={e => handleChange('paperSource', e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-white text-sm focus:ring-2 focus:ring-cyan-500 outline-none"
                >
                  {PAPER_SOURCES.map(src => <option key={src}>{src}</option>)}
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase">Paper Type</label>
                <select
                  value={localSettings.paperType}
                  onChange={e => handleChange('paperType', e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-white text-sm focus:ring-2 focus:ring-cyan-500 outline-none"
                >
                  {PAPER_TYPES.map(type => <option key={type}>{type}</option>)}
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase">Orientation</label>
                <select
                  value={localSettings.orientation}
                  onChange={e => handleChange('orientation', e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-white text-sm focus:ring-2 focus:ring-cyan-500 outline-none"
                >
                  {ORIENTATIONS.map(ori => <option key={ori}>{ori}</option>)}
                </select>
              </div>

              <label className="flex items-center gap-3 p-3 rounded-xl bg-slate-900 border border-slate-700 cursor-pointer hover:bg-slate-800 transition-all">
                <input
                  type="checkbox"
                  checked={localSettings.borderless}
                  onChange={e => handleChange('borderless', e.target.checked)}
                  className="w-4 h-4 accent-cyan-500"
                />
                <span className="text-sm text-slate-300">Borderless (No Margins)</span>
              </label>
            </div>

            {/* Quality & Color */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-slate-400 uppercase border-b border-slate-800 pb-2">Quality & Color</h3>

              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase">Print Quality</label>
                <select
                  value={localSettings.quality}
                  onChange={e => handleChange('quality', e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-white text-sm focus:ring-2 focus:ring-cyan-500 outline-none"
                >
                  {QUALITY_OPTIONS.map(q => <option key={q}>{q}</option>)}
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase">Resolution (DPI)</label>
                <select
                  value={localSettings.resolution}
                  onChange={e => handleChange('resolution', parseInt(e.target.value))}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-white text-sm focus:ring-2 focus:ring-cyan-500 outline-none"
                >
                  {RESOLUTIONS.map(dpi => <option key={dpi}>{dpi}</option>)}
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase">Color Mode</label>
                <select
                  value={localSettings.colorMode}
                  onChange={e => handleChange('colorMode', e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-white text-sm focus:ring-2 focus:ring-cyan-500 outline-none"
                >
                  {COLOR_MODES.map(mode => <option key={mode}>{mode}</option>)}
                </select>
              </div>

              <label className="flex items-center gap-3 p-3 rounded-xl bg-slate-900 border border-slate-700 cursor-pointer hover:bg-slate-800 transition-all">
                <input
                  type="checkbox"
                  checked={localSettings.twoSided}
                  onChange={e => handleChange('twoSided', e.target.checked)}
                  className="w-4 h-4 accent-cyan-500"
                />
                <span className="text-sm text-slate-300">2‑Sided Printing</span>
              </label>
            </div>

            {/* Margins (Top, Bottom, Left, Right) */}
            <div className="col-span-1 md:col-span-2 space-y-4">
              <h3 className="text-sm font-semibold text-slate-400 uppercase border-b border-slate-800 pb-2">Margins (mm)</h3>
              <div className="grid grid-cols-4 gap-4">
                {['topMargin', 'bottomMargin', 'leftMargin', 'rightMargin'].map((key) => (
                  <div key={key} className="space-y-2">
                    <label className="text-xs font-bold text-slate-500 uppercase block">{key.replace('Margin','')}</label>
                    <input
                      type="number"
                      min="0"
                      max="50"
                      value={localSettings[key]}
                      onChange={e => handleChange(key, parseFloat(e.target.value) || 0)}
                      disabled={localSettings.borderless}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-white text-sm focus:ring-2 focus:ring-cyan-500 outline-none disabled:opacity-30"
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Center checkboxes */}
            <div className="col-span-1 md:col-span-2 flex gap-6">
              <label className="flex items-center gap-3 p-3 rounded-xl bg-slate-900 border border-slate-700 cursor-pointer hover:bg-slate-800 transition-all">
                <input
                  type="checkbox"
                  checked={localSettings.centerHorizontal}
                  onChange={e => handleChange('centerHorizontal', e.target.checked)}
                  className="w-4 h-4 accent-cyan-500"
                />
                <span className="text-sm text-slate-300">Center Horizontal</span>
              </label>
              <label className="flex items-center gap-3 p-3 rounded-xl bg-slate-900 border border-slate-700 cursor-pointer hover:bg-slate-800 transition-all">
                <input
                  type="checkbox"
                  checked={localSettings.centerVertical}
                  onChange={e => handleChange('centerVertical', e.target.checked)}
                  className="w-4 h-4 accent-cyan-500"
                />
                <span className="text-sm text-slate-300">Center Vertical</span>
              </label>
            </div>

          </div>
        </div>

        {/* Footer */}
        <div className="p-8 border-t border-slate-800 bg-slate-950/50 backdrop-blur-xl flex flex-col sm:flex-row gap-4 justify-end">
          <button
            onClick={handleSave}
            className="px-10 py-3.5 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white rounded-2xl font-bold flex items-center gap-2 shadow-xl shadow-cyan-900/20 transition-all active:scale-95"
          >
            <Save size={18} /> Save Settings
          </button>
          <button
            onClick={() => {
              setLocalSettings(settings => {
                // Reset logic: we need to call parent's reset
                // We'll handle via prop
              });
            }}
            className="px-10 py-3.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-2xl font-bold flex items-center gap-2 border border-slate-700 transition-all"
          >
            <RotateCcw size={18} /> Restore Defaults
          </button>
        </div>
      </div>
    </div>
  );
};

export default PrintSettingsModal;