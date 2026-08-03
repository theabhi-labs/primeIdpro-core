import React from 'react';
import { CheckCircle, Loader, Clock, AlertCircle, Cpu, Zap } from 'lucide-react';

const StatusTracker = ({ photos }) => {
  const total = photos.length;

  if (total === 0) return null;

  const completed = photos.filter(p => p.status === 'completed').length;
  const processing = photos.filter(p => p.status === 'processing' || p.status === 'uploading').length;
  const failed = photos.filter(p => p.status === 'failed').length;
  const pending = total - completed - processing - failed;

  // ✅ LOGIC PRESERVED
  const progress = Math.min(100, Math.round(((completed + processing * 0.5) / total) * 100));

  // ✅ DYNAMIC COLOR LOGIC (Integrated with AI Theme)
  let barColor = 'from-cyan-500 to-blue-600'; // Default Processing
  let glowColor = 'shadow-[0_0_15px_rgba(6,182,212,0.5)]';
  
  if (failed === total) {
    barColor = 'from-red-500 to-rose-600';
    glowColor = 'shadow-[0_0_15px_rgba(244,63,94,0.5)]';
  } else if (completed === total) {
    barColor = 'from-emerald-400 to-green-600';
    glowColor = 'shadow-[0_0_15px_rgba(16,185,129,0.5)]';
  }

  return (
    <div className="w-full max-w-4xl mx-auto mt-8 mb-8 group">
      <div className="relative bg-[#0f172a]/60 backdrop-blur-xl border border-slate-800 rounded-[2rem] p-6 shadow-2xl transition-all duration-500 hover:border-slate-700">
        
        {/* TOP INFO BAR */}
        <div className="flex justify-between items-end mb-4 px-1">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <div className="relative flex h-2 w-2">
                <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${completed === total ? 'bg-emerald-400' : 'bg-cyan-400'}`}></span>
                <span className={`relative inline-flex rounded-full h-2 w-2 ${completed === total ? 'bg-emerald-500' : 'bg-cyan-500'}`}></span>
              </div>
              <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">AI Engine Status</h3>
            </div>
            <div className="flex items-center gap-2">
               <Cpu size={18} className="text-cyan-400" />
               <span className="text-xl font-mono font-bold text-white tracking-tight">
                {completed} <span className="text-slate-500 text-sm font-sans font-normal">/ {total} Assets Ready</span>
               </span>
            </div>
          </div>
          
          <div className="text-right">
            <div className="text-2xl font-mono font-black text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-500">
              {progress}%
            </div>
            <p className="text-[10px] text-slate-500 font-bold uppercase">Processing Load</p>
          </div>
        </div>

        {/* MODERN PROGRESS BAR */}
        <div className="relative h-4 bg-slate-900 rounded-full overflow-hidden border border-slate-800/50 p-[2px]">
          <div
            className={`h-full rounded-full bg-gradient-to-r ${barColor} ${glowColor} transition-all duration-700 ease-out relative`}
            style={{ width: `${progress}%` }}
          >
            {/* Animated Shine Effect */}
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent w-full animate-[shimmer_2s_infinite]" />
          </div>
        </div>

        {/* STATUS BREAKDOWN CHIPS */}
        <div className="flex flex-wrap items-center justify-between mt-6 pt-4 border-t border-slate-800/50 gap-4">
          
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2 group/status">
              <div className="w-8 h-8 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-400 border border-emerald-500/20 group-hover/status:bg-emerald-500 group-hover/status:text-white transition-all">
                <CheckCircle size={16} />
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] text-slate-500 font-bold uppercase leading-none mb-1">Ready</span>
                <span className="text-sm font-mono font-bold text-slate-200 leading-none">{completed}</span>
              </div>
            </div>

            <div className="flex items-center gap-2 group/status">
              <div className="w-8 h-8 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-400 border border-blue-500/20 group-hover/status:bg-blue-500 group-hover/status:text-white transition-all">
                <Loader size={16} className="animate-spin" />
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] text-slate-500 font-bold uppercase leading-none mb-1">Compute</span>
                <span className="text-sm font-mono font-bold text-slate-200 leading-none">{processing}</span>
              </div>
            </div>

            <div className="flex items-center gap-2 group/status">
              <div className="w-8 h-8 rounded-xl bg-slate-800 flex items-center justify-center text-slate-400 border border-slate-700 group-hover/status:bg-slate-700 group-hover/status:text-white transition-all">
                <Clock size={16} />
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] text-slate-500 font-bold uppercase leading-none mb-1">Queue</span>
                <span className="text-sm font-mono font-bold text-slate-200 leading-none">{pending}</span>
              </div>
            </div>
          </div>

          {failed > 0 && (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 animate-pulse">
              <AlertCircle size={14} />
              <span className="text-[10px] font-bold uppercase">{failed} Issues Detected</span>
            </div>
          )}

          <div className="flex items-center gap-2 text-slate-500 italic text-[10px] ml-auto">
            <Zap size={12} className="text-yellow-500/50" />
            PrimeID AI optimization active
          </div>

        </div>
      </div>
    </div>
  );
};

export default StatusTracker;