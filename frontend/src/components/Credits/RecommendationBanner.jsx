import React from 'react';
import { Zap, ExternalLink, X, ShieldCheck, Coins, AlertCircle } from 'lucide-react';
import { useCredits } from '../../context/CreditContext';

export default function RecommendationBanner() {
  const { isConnected, credits, bannerDismissed, dismissBanner, openConnectModal } = useCredits();

  // If already connected or dismissed, don't show the initial recommendation banner
  if (isConnected || bannerDismissed) {
    return null;
  }

  return (
    <div className="relative z-30 bg-gradient-to-r from-amber-950/90 via-slate-900 to-cyan-950/90 border-b border-amber-500/30 px-4 py-2 text-xs shadow-lg backdrop-blur-md">
      <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3">
        {/* Left Info */}
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-amber-500/20 text-amber-400 border border-amber-500/40">
            <Zap size={14} className="animate-pulse" />
          </div>
          <div className="text-slate-200 truncate">
            <span className="font-bold text-amber-300 mr-1.5 uppercase tracking-wider text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/30">
              ⚡ Action Recommended
            </span>
            <span>
              Connect your application with <strong className="text-white font-semibold">PrimeIDPro.online</strong> to sync license & prevent service lockouts.
            </span>
            <span className="ml-2 inline-flex items-center gap-1 font-mono text-cyan-300 font-bold bg-cyan-950/60 px-2 py-0.5 rounded-full border border-cyan-800/50">
              <Coins size={11} className="text-amber-400" />
              {credits} Free Credits Available
            </span>
          </div>
        </div>

        {/* Right Action Buttons */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => openConnectModal('Connect your application with PrimeIDPro.online to sync license and recharge credits.')}
            className="flex items-center gap-1.5 px-3 py-1 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-bold rounded-lg shadow transition-all transform hover:scale-105 text-xs"
          >
            <ShieldCheck size={13} />
            Connect Application
          </button>

          <a
            href="https://primeidpro.online"
            target="_blank"
            rel="noopener noreferrer"
            className="hidden sm:flex items-center gap-1 px-2.5 py-1 bg-slate-800/80 hover:bg-slate-700 text-slate-300 rounded-lg border border-slate-700 text-xs transition-colors"
          >
            <span>Visit Portal</span>
            <ExternalLink size={11} />
          </a>

          <button
            type="button"
            onClick={dismissBanner}
            title="Dismiss notice"
            className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
