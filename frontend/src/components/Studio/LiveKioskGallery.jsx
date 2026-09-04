import React from 'react';
import {
  QrCode,
  KeyRound,
  RefreshCw,
  Trash2,
  Sparkles,
  Loader2,
  X,
  Smartphone,
  CheckCircle2,
  Clock,
  User,
  ExternalLink,
  ChevronRight,
  Camera,
} from 'lucide-react';

export default function LiveKioskGallery({
  onlineJobs = [],
  jobThumbnails = {},
  loadingJobId = null,
  isRefreshingQueue = false,
  deviceState = null,
  onLoadJob,
  onDismissJob,
  onClearQueue,
  onRefresh,
  onOpenQrModal,
  onOpenPairModal,
}) {
  const isBound = deviceState?.isBound || deviceState?.status === 'ACTIVE';
  const centerCode = deviceState?.centerCode || 'CSC-GR-6112';
  const centerName = deviceState?.centerName || 'Front Desk';

  return (
    <div className="mb-4 rounded-2xl bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950 border border-cyan-500/40 shadow-[0_0_35px_rgba(6,182,212,0.15)] flex flex-col shrink-0 backdrop-blur-xl transition-all overflow-hidden">
      
      {/* Top Controls & Status Bar */}
      <div className="px-4 py-2.5 bg-slate-900/90 border-b border-slate-800/80 flex items-center justify-between gap-3 select-none">
        
        {/* Left: Status & Center info */}
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex items-center gap-2">
            <div className="relative flex items-center justify-center">
              <div className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-ping absolute opacity-75" />
              <div className="w-2 h-2 rounded-full bg-cyan-400" />
            </div>
            <span className="text-xs font-black text-white tracking-wide uppercase flex items-center gap-1.5">
              <QrCode className="w-3.5 h-3.5 text-cyan-400" />
              Counter QR Orders Gallery
            </span>
          </div>

          <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-slate-950 border border-slate-800 text-[11px] text-slate-300">
            <span className="text-slate-500">Center:</span>
            <span className="font-mono font-bold text-cyan-400">{centerCode}</span>
            <span className="text-slate-600">•</span>
            <span className="text-slate-300 truncate max-w-[120px]">{centerName}</span>
          </div>

          {onlineJobs.length > 0 ? (
            <span className="px-2.5 py-0.5 bg-gradient-to-r from-cyan-500 to-blue-600 text-slate-950 text-[10px] font-black rounded-full uppercase shadow-sm">
              {onlineJobs.length} {onlineJobs.length === 1 ? 'Order' : 'Orders'} Waiting
            </span>
          ) : (
            <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] font-bold rounded-full">
              🟢 Live & Ready
            </span>
          )}
        </div>

        {/* Right: Action Buttons */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Show Counter QR Modal button */}
          <button
            type="button"
            onClick={onOpenQrModal}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 hover:text-white font-bold text-xs border border-cyan-500/30 transition-all active:scale-95 shadow-sm"
            title="Display QR code for customers to scan"
          >
            <Smartphone className="w-3.5 h-3.5 text-cyan-400" />
            <span>📱 Show Counter QR</span>
          </button>

          {/* Pair Desktop Button */}
          <button
            type="button"
            onClick={onOpenPairModal}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 text-slate-300 hover:text-white font-medium text-xs border border-slate-700/60 transition-all active:scale-95"
            title="Pair or re-bind desktop with 6-digit code"
          >
            <KeyRound className="w-3.5 h-3.5 text-cyan-400" />
            <span className="hidden md:inline">Pair Desktop</span>
          </button>

          {/* Clear Queue (if orders exist) */}
          {onlineJobs.length > 0 && (
            <button
              type="button"
              onClick={onClearQueue}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-slate-800/80 hover:bg-red-950/60 text-xs font-medium text-slate-400 hover:text-red-300 border border-slate-700/60 hover:border-red-500/30 transition-all active:scale-95"
              title="Clear all waiting orders"
            >
              <Trash2 className="w-3.5 h-3.5 text-red-400" />
              <span className="hidden sm:inline">Clear</span>
            </button>
          )}

          {/* Refresh Poller */}
          <button
            type="button"
            onClick={onRefresh}
            disabled={isRefreshingQueue}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 text-xs font-medium text-slate-300 hover:text-white border border-slate-700/60 transition-all active:scale-95 cursor-pointer disabled:opacity-50"
            title="Sync online orders now"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-cyan-400 ${isRefreshingQueue ? 'animate-spin' : ''}`} />
            <span className="hidden lg:inline">Refresh</span>
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="p-3">
        {onlineJobs.length > 0 ? (
          /* Scrollable Orders List with Photo Cards */
          <div className="flex items-stretch gap-3 overflow-x-auto pb-1 custom-scrollbar">
            {onlineJobs.map((job) => {
              const jobMeta = job.metadata || {};
              const customerName = jobMeta.customerName || 'Walk-in Customer';
              const customerPhone = jobMeta.customerPhone || '';
              const totalCopies = jobMeta.totalCopies || jobMeta.rawCentralJob?.copies || 8;
              const templateName = jobMeta.templateName || 'Indian Passport (35×45mm)';
              const orderCode = String(jobMeta.jobCode || job.order_id || job.id).slice(-6).toUpperCase();
              const photoThumbnail = jobThumbnails[job.id];
              const isLoadingThis = loadingJobId === job.id;

              return (
                <div
                  key={job.id}
                  onClick={() => !isLoadingThis && onLoadJob(job)}
                  className="group relative flex items-center gap-3.5 p-3 rounded-2xl bg-slate-950/90 hover:bg-slate-950 border border-slate-800 hover:border-cyan-400/80 hover:shadow-[0_0_25px_rgba(6,182,212,0.25)] transition-all cursor-pointer shrink-0 min-w-[340px] max-w-[400px]"
                >
                  {/* Photo Thumbnail */}
                  <div className="relative w-16 h-20 rounded-xl overflow-hidden bg-slate-900 border border-cyan-500/30 group-hover:border-cyan-400 flex items-center justify-center shrink-0 shadow-inner">
                    {photoThumbnail ? (
                      <img
                        src={photoThumbnail}
                        alt={customerName}
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                          const fallback = e.currentTarget.parentElement?.querySelector('.avatar-fallback');
                          if (fallback) fallback.classList.remove('hidden');
                        }}
                        className="w-full h-full object-cover transition-transform group-hover:scale-105"
                      />
                    ) : null}
                    <div className={`avatar-fallback flex flex-col items-center justify-center gap-1 text-cyan-400 ${photoThumbnail ? 'hidden' : ''}`}>
                      <div className="w-8 h-8 rounded-full bg-cyan-950/80 border border-cyan-500/40 flex items-center justify-center text-xs font-bold text-cyan-300 uppercase">
                        {customerName ? customerName.slice(0, 2) : 'QR'}
                      </div>
                      <span className="text-[8px] text-slate-400 font-mono uppercase tracking-wider">PHOTO</span>
                    </div>
                    <span className="absolute bottom-0 inset-x-0 bg-slate-950/90 text-cyan-300 text-[10px] font-black text-center py-0.5 border-t border-cyan-500/20">
                      {totalCopies} Pcs
                    </span>
                  </div>

                  {/* Order & Customer Details */}
                  <div className="flex-1 min-w-0 flex flex-col justify-between py-0.5">
                    <div className="flex items-center justify-between gap-1.5">
                      <h4 className="text-xs font-bold text-white truncate max-w-[150px] group-hover:text-cyan-300 transition-colors">
                        {customerName}
                      </h4>
                      <div className="flex items-center gap-1">
                        <span className="px-1.5 py-0.5 bg-cyan-950 border border-cyan-500/40 text-cyan-300 font-mono text-[10px] font-bold rounded">
                          #{orderCode}
                        </span>
                        <button
                          type="button"
                          onClick={(e) => onDismissJob(job.id, e)}
                          className="p-1 rounded-md text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-colors opacity-70 group-hover:opacity-100"
                          title="Dismiss order"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 text-[11px] text-slate-400 my-1 truncate">
                      {customerPhone && <span>{customerPhone} •</span>}
                      <span className="text-slate-300 truncate">{templateName}</span>
                    </div>

                    {/* Action Row */}
                    <div className="flex items-center justify-between mt-1 pt-1.5 border-t border-slate-800/60">
                      <span className="text-[11px] text-emerald-400 font-bold">
                        {totalCopies} Passport Copies
                      </span>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onLoadJob(job);
                        }}
                        disabled={isLoadingThis}
                        className="px-3 py-1.5 bg-gradient-to-r from-cyan-400 to-blue-500 hover:from-cyan-300 hover:to-blue-400 text-slate-950 font-black text-xs rounded-xl shadow-md active:scale-95 transition-all flex items-center gap-1.5 border border-cyan-200/50 cursor-pointer disabled:cursor-not-allowed"
                      >
                        {isLoadingThis ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-950" />
                            <span>Loading...</span>
                          </>
                        ) : (
                          <>
                            <Sparkles className="w-3.5 h-3.5 text-slate-950" />
                            <span>⚡ Load Photo</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* Empty / Idle Waiting Kiosk Banner */
          <div className="flex items-center justify-between px-3 py-2 text-xs">
            <div className="flex items-center gap-3 text-slate-300">
              <div className="p-2 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
                <Camera className="w-4 h-4" />
              </div>
              <div>
                <span className="font-bold text-white">Live Kiosk Active</span>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Customers scan your counter QR code on their phones ➔ their portrait photos appear here directly ready for 1-click loading & 300 DPI printing.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onOpenQrModal}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-extrabold text-xs transition-all active:scale-95 shadow-md shadow-cyan-950/40 shrink-0 cursor-pointer"
            >
              <QrCode size={14} />
              <span>Show Counter QR</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
