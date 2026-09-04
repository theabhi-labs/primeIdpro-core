import React, { useState } from 'react';
import {
  X,
  KeyRound,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  ExternalLink,
  Laptop,
  Unlink,
  RefreshCw,
  Zap,
} from 'lucide-react';

export default function QuickPairModal({ isOpen, onClose, deviceState, onPairSuccess }) {
  const [pairingCode, setPairingCode] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState(null); // { type: 'success' | 'error', text: '' }

  if (!isOpen) return null;

  const isBound = deviceState?.isBound || deviceState?.status === 'ACTIVE';
  const centerCode = deviceState?.centerCode || 'Not Bound';
  const centerName = deviceState?.centerName || 'Digital Studio';
  const deviceId = deviceState?.deviceId || 'Unknown';

  const handlePair = async (e) => {
    e.preventDefault();
    const code = pairingCode.trim().toUpperCase();
    if (code.length !== 6) {
      setStatusMessage({ type: 'error', text: 'Please enter a valid 6-character / 6-digit pairing code.' });
      return;
    }

    setIsSubmitting(true);
    setStatusMessage(null);

    try {
      if (window.primeIdPro?.device?.pair) {
        const res = await window.primeIdPro.device.pair({ pairingCode: code });
        if (res?.success) {
          setStatusMessage({
            type: 'success',
            text: `🎉 Successfully paired! Connected to Center: ${res.device?.centerCode || 'Central Hub'} (${res.device?.centerName || 'Active'}).`,
          });
          setPairingCode('');
          if (onPairSuccess) onPairSuccess();
          setTimeout(() => {
            onClose();
          }, 1500);
        } else {
          setStatusMessage({
            type: 'error',
            text: res?.error || 'Failed to pair device. Please verify your code.',
          });
        }
      } else {
        setStatusMessage({
          type: 'error',
          text: 'Device pairing API is not available in browser mode. Please use the Desktop App.',
        });
      }
    } catch (err) {
      setStatusMessage({
        type: 'error',
        text: err.message || 'Pairing failed. Please check internet connection.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUnpair = async () => {
    if (!window.confirm('Are you sure you want to unpair this desktop from the center? Online QR orders will stop arriving until re-paired.')) return;
    setIsSubmitting(true);
    try {
      if (window.primeIdPro?.device?.unpair) {
        await window.primeIdPro.device.unpair();
        setStatusMessage({ type: 'success', text: 'Desktop device unbound successfully.' });
        if (onPairSuccess) onPairSuccess();
      }
    } catch (err) {
      setStatusMessage({ type: 'error', text: 'Failed to unpair device.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const openDevicesPage = () => {
    const url = 'https://primeidpro.online/csc/devices';
    if (window.electronAPI?.openExternal) {
      window.electronAPI.openExternal(url);
    } else {
      window.open(url, '_blank');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fade-in">
      <div className="relative w-full max-w-md rounded-3xl bg-slate-950 border border-slate-800 shadow-[0_0_50px_rgba(6,182,212,0.25)] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-5 bg-gradient-to-r from-blue-950/90 via-slate-900 to-cyan-950/90 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
              <KeyRound size={22} />
            </div>
            <div>
              <h3 className="text-base font-black text-white tracking-wide">
                Pair Desktop Application
              </h3>
              <p className="text-xs text-slate-400">
                Connect your PC to receive live QR Counter Orders
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 flex flex-col gap-4">
          {/* Current Device Binding Status Card */}
          <div className={`p-3.5 rounded-2xl border ${isBound ? 'bg-emerald-950/20 border-emerald-500/30' : 'bg-amber-950/20 border-amber-500/30'}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Laptop className={`w-4 h-4 ${isBound ? 'text-emerald-400' : 'text-amber-400'}`} />
                <span className="text-xs font-bold text-white">Device Status:</span>
              </div>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase border ${
                isBound ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' : 'bg-amber-500/20 text-amber-300 border-amber-500/30'
              }`}>
                {isBound ? 'Active & Paired' : 'Not Paired'}
              </span>
            </div>

            {isBound && (
              <div className="mt-2.5 pt-2 border-t border-slate-800/60 text-xs text-slate-300 space-y-1">
                <div className="flex justify-between">
                  <span className="text-slate-400">Bound Center:</span>
                  <span className="font-mono font-bold text-cyan-400">{centerCode}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Center Name:</span>
                  <span className="font-semibold text-slate-200">{centerName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Device ID:</span>
                  <span className="font-mono text-[11px] text-slate-400">{deviceId}</span>
                </div>
              </div>
            )}
          </div>

          {/* Pairing Code Form */}
          <form onSubmit={handlePair} className="flex flex-col gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1.5">
                Enter 6-Digit Pairing Code from Website:
              </label>
              <div className="relative">
                <input
                  type="text"
                  maxLength={6}
                  value={pairingCode}
                  onChange={(e) => setPairingCode(e.target.value.toUpperCase())}
                  placeholder="e.g. 784920"
                  className="w-full text-center text-2xl tracking-[0.4em] font-mono font-black py-3 px-4 rounded-xl bg-slate-900 border border-slate-700 text-white placeholder:text-slate-600 focus:outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-500/20"
                />
              </div>
              <p className="text-[11px] text-slate-400 mt-1.5">
                Generate this code in your CSC Portal under <b>Desktop Clients</b> / <b>Add Device</b>.
              </p>
            </div>

            {/* Status Alert */}
            {statusMessage && (
              <div
                className={`p-3 rounded-xl text-xs flex items-start gap-2 ${
                  statusMessage.type === 'success'
                    ? 'bg-emerald-950/40 border border-emerald-500/30 text-emerald-300'
                    : 'bg-red-950/40 border border-red-500/30 text-red-300'
                }`}
              >
                {statusMessage.type === 'success' ? (
                  <CheckCircle2 size={16} className="shrink-0 mt-0.5" />
                ) : (
                  <AlertTriangle size={16} className="shrink-0 mt-0.5" />
                )}
                <span>{statusMessage.text}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmitting || pairingCode.trim().length !== 6}
              className="w-full py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 disabled:from-slate-800 disabled:to-slate-800 disabled:text-slate-600 font-extrabold text-xs text-slate-950 transition-all active:scale-95 shadow-md shadow-cyan-950/40 flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <>
                  <Loader2 size={15} className="animate-spin text-slate-950" />
                  <span>Pairing Device...</span>
                </>
              ) : (
                <>
                  <Zap size={15} />
                  <span>Pair Desktop Now</span>
                </>
              )}
            </button>
          </form>

          {/* Helper Links */}
          <div className="flex items-center justify-between pt-2 border-t border-slate-800 text-xs">
            <button
              type="button"
              onClick={openDevicesPage}
              className="text-cyan-400 hover:text-cyan-300 flex items-center gap-1 font-semibold"
            >
              <span>Get Pairing Code on Web</span>
              <ExternalLink size={12} />
            </button>

            {isBound && (
              <button
                type="button"
                onClick={handleUnpair}
                disabled={isSubmitting}
                className="text-red-400 hover:text-red-300 flex items-center gap-1 text-[11px] font-semibold"
              >
                <Unlink size={12} />
                <span>Unpair / Re-bind</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
