import React, { useState } from 'react';
import {
  X,
  ShieldCheck,
  Zap,
  Coins,
  ExternalLink,
  CreditCard,
  AlertTriangle,
  Loader2,
  Lock,
  Globe,
  RefreshCw,
  LogOut,
  Sparkles,
  CheckCircle2,
} from 'lucide-react';
import { useCredits } from '../../context/CreditContext';

export default function ConnectOnlineModal() {
  const {
    showConnectModal,
    modalReason,
    closeConnectModal,
    credits,
    isConnected,
    connectedAccount,
    licenseKey,
    connectAccount,
    disconnectAccount,
    rates,
    refreshCredits,
  } = useCredits();

  const [accountId, setAccountId] = useState(connectedAccount || '');
  const [keyInput, setKeyInput] = useState(licenseKey || '');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState(null); // { type: 'success' | 'error', text: '' }

  if (!showConnectModal) return null;

  const handleConnect = async (e) => {
    e.preventDefault();
    if (!accountId.trim() || !keyInput.trim()) {
      setStatusMessage({ type: 'error', text: 'Please enter both Account Email and License Key / Password.' });
      return;
    }
    setIsSubmitting(true);
    setStatusMessage(null);
    try {
      const res = await connectAccount({ accountId: accountId.trim(), licenseKey: keyInput.trim() });
      setStatusMessage({
        type: 'success',
        text: `🎉 Connected successfully to PrimeIDPro.online! Active Balance: ${res.credits} Tokens.`,
      });
    } catch (err) {
      const msg = err.response?.data?.detail || err.message || 'Failed to connect. Please check credentials.';
      setStatusMessage({ type: 'error', text: typeof msg === 'object' ? JSON.stringify(msg) : msg });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDisconnect = async () => {
    if (!window.confirm('Are you sure you want to disconnect your account? All printing will be locked until re-connected.')) return;
    setIsSubmitting(true);
    try {
      await disconnectAccount();
      setStatusMessage({ type: 'success', text: 'Account disconnected successfully.' });
    } catch (err) {
      setStatusMessage({ type: 'error', text: 'Failed to disconnect.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const openWebsite = (url) => {
    if (window.electronAPI?.openExternal) {
      window.electronAPI.openExternal(url);
    } else {
      window.open(url, '_blank');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fade-in">
      <div className="relative w-full max-w-xl rounded-3xl bg-slate-950 border border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-6 bg-gradient-to-r from-blue-950/90 via-slate-900 to-cyan-950/90 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
              <ShieldCheck size={26} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-black text-white tracking-wide">PrimeIDPro.online Web Account</h3>
                <span
                  className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${
                    isConnected
                      ? 'bg-emerald-950 text-emerald-300 border-emerald-800/50'
                      : 'bg-amber-950 text-amber-300 border-amber-800/50'
                  }`}
                >
                  {isConnected ? 'SYNCED & ACTIVE' : 'CONNECTION REQUIRED'}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                {isConnected
                  ? 'Real-time cloud token sync & license active.'
                  : 'Mandatory web account connection required to use the application.'}
              </p>
            </div>
          </div>

          {/* Only allow close if already connected */}
          {isConnected && (
            <button
              type="button"
              onClick={closeConnectModal}
              className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors"
            >
              <X size={18} />
            </button>
          )}
        </div>

        {/* Modal Alert (if opened due to blocked action / insufficient tokens) */}
        {modalReason && (
          <div className="px-6 py-3 bg-amber-950/50 border-b border-amber-500/30 flex items-start gap-2.5 text-xs text-amber-200">
            <AlertTriangle size={16} className="text-amber-400 shrink-0 mt-0.5" />
            <div>
              <strong className="text-amber-300">Action Blocked:</strong> {modalReason}
            </div>
          </div>
        )}

        {/* Status Message */}
        {statusMessage && (
          <div
            className={`px-6 py-3 border-b flex items-center gap-2 text-xs font-medium ${
              statusMessage.type === 'success'
                ? 'bg-emerald-950/60 border-emerald-800 text-emerald-200'
                : 'bg-red-950/60 border-red-800 text-red-200'
            }`}
          >
            {statusMessage.type === 'success' ? (
              <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
            ) : (
              <AlertTriangle size={16} className="text-red-400 shrink-0" />
            )}
            <span>{statusMessage.text}</span>
          </div>
        )}

        {/* Body Content */}
        <div className="p-6 space-y-5 overflow-y-auto">
          {/* If NOT Connected: Mandatory Connect Form */}
          {!isConnected ? (
            <form onSubmit={handleConnect} className="space-y-4">
              <div className="p-4 rounded-2xl bg-cyan-950/30 border border-cyan-800/40 space-y-2 text-xs text-cyan-200/90">
                <div className="flex items-center gap-2 font-bold text-cyan-300">
                  <Sparkles size={16} className="text-amber-400" />
                  <span>First-Time Setup: 20 Free Welcome Tokens</span>
                </div>
                <p className="text-[11px] text-slate-400">
                  Connect your registered <strong className="text-white">PrimeIDPro.online</strong> account to activate your workspace and get 20 Free Tokens.
                </p>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                    Account Email ID
                  </label>
                  <input
                    type="email"
                    required
                    placeholder="user@example.com"
                    value={accountId}
                    onChange={(e) => setAccountId(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-white placeholder-slate-500 text-xs focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-all"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                    License Key / Password
                  </label>
                  <input
                    type="password"
                    required
                    placeholder="Enter your license key or account password"
                    value={keyInput}
                    onChange={(e) => setKeyInput(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-white placeholder-slate-500 text-xs focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-all"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-black text-xs uppercase tracking-wider shadow-lg shadow-cyan-500/20 disabled:opacity-50 flex items-center justify-center gap-2 transition-all"
              >
                {isSubmitting ? <Loader2 size={16} className="animate-spin" /> : <Lock size={16} />}
                <span>Connect & Activate (20 Free Tokens)</span>
              </button>

              <div className="pt-2 text-center text-xs text-slate-400 flex items-center justify-center gap-1">
                <span>Don't have an account?</span>
                <button
                  type="button"
                  onClick={() => openWebsite('https://primeidpro.online/register')}
                  className="text-cyan-400 hover:text-cyan-300 font-bold underline inline-flex items-center gap-0.5"
                >
                  Register on PrimeIDPro.online <ExternalLink size={12} />
                </button>
              </div>
            </form>
          ) : (
            /* If ALREADY Connected: Balance & Web Recharge */
            <div className="space-y-4">
              {/* Wallet Live Card */}
              <div className="p-5 rounded-2xl bg-gradient-to-br from-slate-900 via-slate-900 to-slate-950 border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-400">Live Account Balance</span>
                  <button
                    type="button"
                    onClick={() => refreshCredits()}
                    className="text-[11px] text-cyan-400 hover:text-cyan-300 flex items-center gap-1 font-semibold"
                  >
                    <RefreshCw size={12} /> Refresh
                  </button>
                </div>

                <div className="flex items-baseline gap-2">
                  <Coins size={28} className="text-amber-400 self-center" />
                  <span className="text-3xl font-black text-white font-mono">{credits}</span>
                  <span className="text-sm font-bold text-slate-400 uppercase">Tokens Available</span>
                </div>

                <div className="pt-2 border-t border-slate-800 flex flex-wrap items-center justify-between text-xs text-slate-400">
                  <div>
                    Connected Account: <strong className="text-white">{connectedAccount}</strong>
                  </div>
                  <div className="flex gap-3 text-[11px]">
                    <span>📸 Photo: <strong className="text-white">{rates.passportPhotoPrint} Tokens</strong></span>
                    <span>🪪 Card: <strong className="text-white">{rates.idCardPrintPerUnit} Tokens</strong></span>
                  </div>
                </div>
              </div>

              {/* Recharge Button */}
              <button
                type="button"
                onClick={() => openWebsite('https://primeidpro.online/billing')}
                className="w-full py-3.5 px-4 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-slate-950 font-black text-xs uppercase tracking-wider shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2 transition-all"
              >
                <CreditCard size={16} />
                <span>Buy Tokens / Recharge on Website</span>
                <ExternalLink size={14} />
              </button>

              {/* Disconnect Option */}
              <div className="pt-2 flex justify-between items-center text-xs">
                <button
                  type="button"
                  onClick={handleDisconnect}
                  disabled={isSubmitting}
                  className="text-red-400 hover:text-red-300 font-semibold flex items-center gap-1.5 transition-colors"
                >
                  <LogOut size={14} /> Disconnect Account
                </button>

                <button
                  type="button"
                  onClick={closeConnectModal}
                  className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-semibold transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
