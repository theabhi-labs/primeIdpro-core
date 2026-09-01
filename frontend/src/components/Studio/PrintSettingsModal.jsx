import React, { useState, useEffect } from 'react';
import { X, Printer, Save, RotateCcw, Link2, Unlink, RefreshCw, CheckCircle2, AlertCircle, ShieldAlert, Laptop } from 'lucide-react';

const PAPER_SIZES = [
  'Letter (8.5 × 11 in)',
  'A4 (210 × 297 mm)',
  'A3 (297 × 420 mm)',
  '4x6 (101.6 × 152.4 mm)',
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
  const [activeTab, setActiveTab] = useState('print'); // 'print' | 'csc'
  const [localSettings, setLocalSettings] = useState(settings);

  // CSC Device State
  const [deviceState, setDeviceState] = useState(null);
  const [pairingCode, setPairingCode] = useState('');
  const [deviceName, setDeviceName] = useState('Front Counter PC');
  const [isPairing, setIsPairing] = useState(false);
  const [pairingMsg, setPairingMsg] = useState(null);

  useEffect(() => {
    setLocalSettings(settings);
  }, [settings]);

  // Load Device Status from Electron
  const refreshDeviceStatus = async () => {
    if (window.primeIdPro?.device) {
      try {
        const res = await window.primeIdPro.device.getStatus();
        setDeviceState(res);
      } catch (err) {
        console.error('Failed to get device status:', err);
      }
    }
  };

  useEffect(() => {
    refreshDeviceStatus();
  }, []);

  const handleChange = (key, value) => {
    setLocalSettings(prev => ({ ...prev, [key]: value }));
  };

  const handleSave = () => {
    onSave(localSettings);
    onClose();
  };

  const handlePairDevice = async (e) => {
    e?.preventDefault();
    if (!pairingCode || pairingCode.trim().length !== 6) {
      setPairingMsg({ type: 'error', text: 'Please enter a valid 6-digit pairing code' });
      return;
    }

    setIsPairing(true);
    setPairingMsg(null);

    try {
      if (window.primeIdPro?.device?.pair) {
        const res = await window.primeIdPro.device.pair({
          pairingCode: pairingCode.trim(),
          deviceName: deviceName.trim() || 'Front Counter PC'
        });

        if (res.success) {
          setPairingMsg({ type: 'success', text: `Paired successfully with ${res.device.centerName || 'CSC Center'}!` });
          setDeviceState(res.device);
          setPairingCode('');
        } else {
          const errorMsg = res.error?.message || (typeof res.error === 'string' ? res.error : (res.message || 'Pairing failed'));
          setPairingMsg({ type: 'error', text: errorMsg });
        }
      } else {
        setPairingMsg({ type: 'error', text: 'Device pairing requires the Prime ID Pro desktop client' });
      }
    } catch (err) {
      const errorMsg = err.response?.data?.message || err.message || (typeof err === 'string' ? err : 'Connection failed');
      setPairingMsg({ type: 'error', text: errorMsg });
    } finally {
      setIsPairing(false);
    }
  };

  const handleUnpairDevice = async () => {
    if (!window.confirm('Are you sure you want to unpair this desktop from the current CSC Center?')) return;
    try {
      if (window.primeIdPro?.device?.unpair) {
        const res = await window.primeIdPro.device.unpair();
        if (res.success) {
          setDeviceState(res.device);
          setPairingMsg({ type: 'info', text: 'Device unpaired successfully' });
        } else {
          const errorMsg = res.error?.message || (typeof res.error === 'string' ? res.error : (res.message || 'Failed to unpair'));
          setPairingMsg({ type: 'error', text: errorMsg });
        }
      }
    } catch (err) {
      const errorMsg = err.response?.data?.message || err.message || (typeof err === 'string' ? err : 'Connection failed');
      setPairingMsg({ type: 'error', text: errorMsg });
    }
  };

  const handleTriggerSync = async () => {
    if (window.primeIdPro?.poller?.trigger) {
      try {
        await window.primeIdPro.poller.trigger();
        setPairingMsg({ type: 'success', text: 'Online job poll cycle triggered' });
        refreshDeviceStatus();
      } catch (err) {
        const errorMsg = err.response?.data?.message || err.message || (typeof err === 'string' ? err : 'Connection failed');
        setPairingMsg({ type: 'error', text: errorMsg });
      }
    }
  };

  const isBound = deviceState?.isBound && deviceState?.status === 'ACTIVE';

  return (
    <div className="fixed inset-0 bg-[#020617]/95 backdrop-blur-md z-50 flex items-center justify-center p-4">
      <div className="bg-[#0f172a] border border-slate-800 rounded-[2.5rem] max-w-4xl w-full max-h-[90vh] overflow-hidden shadow-[0_0_50px_-12px_rgba(6,182,212,0.3)] flex flex-col">

        {/* Header with Navigation Tabs */}
        <div className="p-6 border-b border-slate-800 flex justify-between items-center bg-slate-900/50">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-cyan-500/10 rounded-xl border border-cyan-500/20">
                {activeTab === 'print' ? <Printer className="text-cyan-400" size={24} /> : <Link2 className="text-cyan-400" size={24} />}
              </div>
              <div>
                <h2 className="text-xl font-bold text-white tracking-tight">
                  {activeTab === 'print' ? 'Print Settings' : 'CSC Center Connection'}
                </h2>
                <p className="text-[10px] text-slate-500 uppercase font-bold tracking-[0.2em]">
                  {activeTab === 'print' ? 'Hardware & Layout Defaults' : 'Central Platform Pairing'}
                </p>
              </div>
            </div>

            {/* Tab Switcher */}
            <div className="flex items-center bg-slate-950/80 p-1 rounded-xl border border-slate-800">
              <button
                onClick={() => setActiveTab('print')}
                className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${activeTab === 'print' ? 'bg-cyan-500 text-white shadow-lg shadow-cyan-500/20' : 'text-slate-400 hover:text-white'}`}
              >
                Printer Defaults
              </button>
              <button
                onClick={() => setActiveTab('csc')}
                className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${activeTab === 'csc' ? 'bg-cyan-500 text-white shadow-lg shadow-cyan-500/20' : 'text-slate-400 hover:text-white'}`}
              >
                CSC Connection
                {isBound && <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>}
              </button>
            </div>
          </div>

          <button onClick={onClose} className="p-2 hover:bg-slate-800 text-slate-400 hover:text-white rounded-full transition-colors">
            <X size={24} />
          </button>
        </div>

        {/* Content Area */}
        {activeTab === 'print' ? (
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

              {/* Margins */}
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

              {/* Center Checkboxes */}
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
        ) : (
          /* CSC Center Connection Tab */
          <div className="flex-1 overflow-auto p-8 custom-scrollbar space-y-6">

            {/* Notification Banner */}
            {pairingMsg && (
              <div className={`p-4 rounded-2xl flex items-center gap-3 border ${pairingMsg.type === 'success' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' : pairingMsg.type === 'error' ? 'bg-rose-500/10 border-rose-500/30 text-rose-300' : 'bg-cyan-500/10 border-cyan-500/30 text-cyan-300'}`}>
                {pairingMsg.type === 'success' ? <CheckCircle2 size={20} /> : <AlertCircle size={20} />}
                <p className="text-sm font-medium">{pairingMsg.text}</p>
              </div>
            )}

            {/* Status Card */}
            <div className="p-6 rounded-3xl bg-slate-900/60 border border-slate-800 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
              <div className="flex items-center gap-4">
                <div className={`p-3.5 rounded-2xl border ${isBound ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-slate-800 border-slate-700 text-slate-400'}`}>
                  <Laptop size={28} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-bold text-white tracking-tight">
                      {isBound ? (deviceState.centerName || 'CSC Studio Center') : 'Unpaired Terminal'}
                    </h3>
                    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider ${isBound ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-slate-800 text-slate-400 border border-slate-700'}`}>
                      {isBound ? 'Active Online' : 'Standalone Offline'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-1">
                    {isBound ? `Center Code: ${deviceState.centerCode || 'N/A'} • Device ID: ${deviceState.deviceId || 'N/A'}` : 'This desktop is not bound to a Central CSC portal. Offline studio features work normally.'}
                  </p>
                </div>
              </div>

              {isBound && (
                <div className="flex items-center gap-3">
                  <button
                    onClick={handleTriggerSync}
                    className="p-3 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl border border-slate-700 text-xs font-bold flex items-center gap-2 transition-all active:scale-95"
                    title="Poll Central API now"
                  >
                    <RefreshCw size={15} /> Poll Now
                  </button>
                  <button
                    onClick={handleUnpairDevice}
                    className="p-3 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 rounded-xl border border-rose-500/30 text-xs font-bold flex items-center gap-2 transition-all active:scale-95"
                  >
                    <Unlink size={15} /> Disconnect
                  </button>
                </div>
              )}
            </div>

            {/* Pairing Form (if not bound) */}
            {!isBound ? (
              <form onSubmit={handlePairDevice} className="p-6 rounded-3xl bg-slate-900/40 border border-slate-800 space-y-6">
                <div>
                  <h4 className="text-base font-bold text-white tracking-tight">Connect with CSC Portal</h4>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Generate a 6-digit pairing code from your CSC Operator Portal (<span className="text-cyan-400">Settings → Pair Device</span>) and enter it below.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-400 uppercase">6-Digit Pairing PIN</label>
                    <input
                      type="text"
                      maxLength={6}
                      placeholder="e.g. 491823"
                      value={pairingCode}
                      onChange={(e) => setPairingCode(e.target.value.replace(/\D/g, ''))}
                      className="w-full bg-slate-950 border border-slate-700 rounded-2xl px-5 py-3 text-white text-lg font-mono tracking-widest focus:ring-2 focus:ring-cyan-500 outline-none placeholder:text-slate-600"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-400 uppercase">Terminal / PC Label</label>
                    <input
                      type="text"
                      placeholder="Front Counter PC"
                      value={deviceName}
                      onChange={(e) => setDeviceName(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-2xl px-5 py-3 text-white text-sm focus:ring-2 focus:ring-cyan-500 outline-none placeholder:text-slate-600"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isPairing || pairingCode.length !== 6}
                  className="w-full py-4 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-2xl font-bold flex items-center justify-center gap-2 shadow-xl shadow-cyan-900/30 transition-all active:scale-[0.98]"
                >
                  {isPairing ? (
                    <>
                      <RefreshCw size={18} className="animate-spin" /> Verifying with Central Platform...
                    </>
                  ) : (
                    <>
                      <Link2 size={18} /> Pair Device & Enable Online QR Orders
                    </>
                  )}
                </button>
              </form>
            ) : (
              <div className="p-6 rounded-3xl bg-slate-900/30 border border-slate-800 space-y-3">
                <h4 className="text-sm font-bold text-slate-300">Automatic Inbound Order Delivery</h4>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Customer orders submitted via QR code at your desk are automatically delivered to this application within 15 seconds. Photos are safely staged for local 300 DPI processing and physical printing.
                </p>
              </div>
            )}

          </div>
        )}

        {/* Footer */}
        <div className="p-8 border-t border-slate-800 bg-slate-950/50 backdrop-blur-xl flex flex-col sm:flex-row gap-4 justify-end">
          {activeTab === 'print' ? (
            <>
              <button
                onClick={handleSave}
                className="px-10 py-3.5 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white rounded-2xl font-bold flex items-center gap-2 shadow-xl shadow-cyan-900/20 transition-all active:scale-95"
              >
                <Save size={18} /> Save Settings
              </button>
              <button
                onClick={() => {
                  setLocalSettings(settings);
                }}
                className="px-10 py-3.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-2xl font-bold flex items-center gap-2 border border-slate-700 transition-all"
              >
                <RotateCcw size={18} /> Restore Defaults
              </button>
            </>
          ) : (
            <button
              onClick={onClose}
              className="px-10 py-3.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-2xl font-bold flex items-center gap-2 border border-slate-700 transition-all"
            >
              Close
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default PrintSettingsModal;