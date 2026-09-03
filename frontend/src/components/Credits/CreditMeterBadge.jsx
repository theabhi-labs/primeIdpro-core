import React from 'react';
import { Coins, ShieldCheck, Zap, PlusCircle } from 'lucide-react';
import { useCredits } from '../../context/CreditContext';

export default function CreditMeterBadge() {
  const { credits, isConnected, connectedAccount, openConnectModal } = useCredits();

  const isLow = credits <= 5;
  const isZero = credits === 0;

  return (
    <button
      type="button"
      onClick={() => openConnectModal()}
      className={`group flex items-center gap-2 px-3 py-1.5 rounded-xl border transition-all shadow-sm ${
        isZero
          ? 'bg-rose-950/60 border-rose-500/50 text-rose-300 hover:bg-rose-900/60 animate-pulse'
          : isLow
          ? 'bg-amber-950/60 border-amber-500/50 text-amber-300 hover:bg-amber-900/60'
          : isConnected
          ? 'bg-emerald-950/60 border-emerald-500/50 text-emerald-300 hover:bg-emerald-900/60'
          : 'bg-slate-900/80 border-slate-700/80 text-cyan-300 hover:bg-slate-800'
      }`}
      title={
        isConnected
          ? `Connected to PrimeIDPro.online (${connectedAccount || 'Account'}). Balance: ${credits} credits.`
          : `Free Trial: ${credits} Credits available. Click to connect or recharge.`
      }
    >
      <div className="flex items-center gap-1.5 font-bold text-xs">
        <Coins
          size={14}
          className={`${
            isZero
              ? 'text-rose-400'
              : isLow
              ? 'text-amber-400'
              : 'text-amber-300 group-hover:rotate-12 transition-transform'
          }`}
        />
        <span className="font-mono text-[13px]">{credits}</span>
        <span className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Credits</span>
      </div>

      <div className="h-3.5 w-px bg-slate-700/60" />

      <div className="flex items-center gap-1 text-[11px] font-semibold">
        {isConnected ? (
          <span className="flex items-center gap-1 text-emerald-400 text-[10px]">
            <ShieldCheck size={12} />
            SYNCED
          </span>
        ) : (
          <span className="flex items-center gap-1 text-amber-400 text-[10px]">
            <PlusCircle size={11} className="group-hover:scale-110 transition-transform" />
            CONNECT
          </span>
        )}
      </div>
    </button>
  );
}
