import React from 'react';
import { Coins, ShieldCheck, Zap, PlusCircle } from 'lucide-react';
import { useCredits } from '../../context/CreditContext';

export default function CreditMeterBadge({ className = '' }) {
  const { credits, isConnected, connectedAccount, openConnectModal } = useCredits();

  const isLow = credits <= 5;
  const isZero = credits === 0;

  return (
    <button
      type="button"
      onClick={() => openConnectModal()}
      className={`group flex items-center justify-between px-3.5 py-2.5 rounded-xl border transition-all shadow-sm cursor-pointer ${
        isZero
          ? 'bg-rose-950/40 border-rose-500/40 text-rose-300 hover:bg-rose-900/40 animate-pulse'
          : isLow
          ? 'bg-amber-950/40 border-amber-500/40 text-amber-300 hover:bg-amber-900/40'
          : isConnected
          ? 'bg-emerald-950/30 border-emerald-500/30 text-emerald-300 hover:bg-emerald-900/40'
          : 'bg-slate-900/80 border-slate-800 hover:border-slate-700 text-cyan-300 hover:bg-slate-900'
      } ${className}`}
      title={
        isConnected
          ? `Connected to PrimeIDPro.online (${connectedAccount || 'Account'}). Balance: ${credits} credits.`
          : `Free Trial: ${credits} Credits available. Click to connect or recharge.`
      }
    >
      <div className="flex items-center gap-2.5 font-bold text-xs">
        <div className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center border border-slate-700">
          <Coins
            size={15}
            className={`${
              isZero
                ? 'text-rose-400'
                : isLow
                ? 'text-amber-400'
                : 'text-amber-400 group-hover:rotate-12 transition-transform'
            }`}
          />
        </div>
        <div className="text-left">
          <div className="flex items-baseline gap-1">
            <span className="font-mono text-sm font-black text-white">{credits}</span>
            <span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">Credits</span>
          </div>
          <p className="text-[10px] text-slate-500 font-medium truncate max-w-[90px]">
            {isConnected ? (connectedAccount || 'Cloud Sync') : 'Free Trial'}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-1.5 text-[11px] font-semibold shrink-0">
        {isConnected ? (
          <span className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-400 text-[10px] border border-emerald-500/20 font-bold">
            <ShieldCheck size={12} />
            SYNCED
          </span>
        ) : (
          <span className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-400 text-[10px] border border-amber-500/20 font-bold">
            <PlusCircle size={11} className="group-hover:scale-110 transition-transform" />
            CONNECT
          </span>
        )}
      </div>
    </button>
  );
}
