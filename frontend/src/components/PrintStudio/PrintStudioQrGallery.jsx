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
  Phone,
  ExternalLink,
  ChevronRight,
  FileText,
  CreditCard,
  Layers,
  ArrowRight,
} from 'lucide-react';

export default function PrintStudioQrGallery({
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
  onOpenConnectModal,
}) {
  const isConnected = Boolean(deviceState?.centerCode || (deviceState?.isBound && deviceState?.status === 'ACTIVE'));
  const centerCode = deviceState?.centerCode || 'UNCONNECTED';
  const centerName = deviceState?.centerName || 'Counter Desk';

  return (
    <div className="rounded-2xl bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950 border border-cyan-500/40 shadow-[0_0_35px_rgba(6,182,212,0.15)] flex flex-col shrink-0 backdrop-blur-xl transition-all overflow-hidden select-none">
      
      {/* Top Status & Controls Header */}
      <div className="px-4 py-2.5 bg-slate-900/90 border-b border-slate-800/80 flex items-center justify-between gap-3">
        
        {/* Left: Status & Center info */}
        <div className="flex items-center gap-3 min-w-0 flex-wrap">
          <div className="flex items-center gap-2">
            <div className="relative flex items-center justify-center">
              <div className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-ping absolute opacity-75" />
              <div className="w-2 h-2 rounded-full bg-cyan-400" />
            </div>
            <span className="text-xs font-black text-white tracking-wide uppercase flex items-center gap-1.5">
              <QrCode className="w-4 h-4 text-cyan-400" />
              Mobile QR Orders & Uploads
            </span>
          </div>

          <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-slate-950 border border-slate-800 text-[11px] text-slate-300">
            <span className="text-slate-500">Center:</span>
            <span className={`font-mono font-bold ${isConnected && centerCode !== 'UNCONNECTED' ? 'text-cyan-400' : 'text-amber-400'}`}>
              {centerCode}
            </span>
            {isConnected && centerName && (
              <>
                <span className="text-slate-600">•</span>
                <span className="text-slate-300 truncate max-w-[140px]">{centerName}</span>
              </>
            )}
          </div>

          {onlineJobs.length > 0 ? (
            <span className="px-2.5 py-0.5 bg-gradient-to-r from-cyan-400 to-blue-500 text-slate-950 text-[10px] font-black rounded-full uppercase shadow-sm animate-pulse">
              {onlineJobs.length} {onlineJobs.length === 1 ? 'Order' : 'Orders'} Waiting
            </span>
          ) : isConnected && centerCode !== 'UNCONNECTED' ? (
            <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] font-bold rounded-full flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              Live QR Feed Active
            </span>
          ) : (
            <button
              type="button"
              onClick={onOpenConnectModal}
              className="px-2.5 py-0.5 bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/40 text-[10px] font-bold rounded-full cursor-pointer transition-colors"
              title="Click to connect your PrimeIDPro.online account"
            >
              🔑 Connect Account
            </button>
          )}
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Show QR Standee Button */}
          {onOpenQrModal && (
            <button
              type="button"
              onClick={onOpenQrModal}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 text-xs font-bold transition-all active:scale-95 cursor-pointer shadow-sm"
              title="Display or Print Counter QR Standee"
            >
              <QrCode size={14} className="text-cyan-400" />
              <span className="hidden sm:inline">QR Standee</span>
            </button>
          )}

          {/* Clear Queue (if orders exist) */}
          {onlineJobs.length > 0 && (
            <button
              type="button"
              onClick={onClearQueue}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-slate-800/80 hover:bg-red-950/60 text-xs font-medium text-slate-400 hover:text-red-300 border border-slate-700/60 hover:border-red-500/30 transition-all active:scale-95 cursor-pointer"
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

      {/* Main Gallery Area */}
      <div className="p-3">
        {onlineJobs.length > 0 ? (
          /* Scrollable Orders List with Photo/Card Preview Cards */
          <div className="flex items-stretch gap-3 overflow-x-auto pb-1 custom-scrollbar">
            {onlineJobs.map((job) => {
              const jobMeta = job.metadata || {};
              const rawCentral = jobMeta.rawCentralJob || {};
              const customerName = jobMeta.customerName || rawCentral.customerName || 'Walk-in Customer';
              const customerPhone = jobMeta.customerPhone || rawCentral.customerPhone || '';
              const serviceType = jobMeta.serviceType || rawCentral.serviceType || 'ID_CARD';
              const orderCode = String(jobMeta.jobCode || job.order_id || job.id).slice(-6).toUpperCase();
              const photoThumbnail = jobThumbnails[job.id];
              const isLoadingThis = loadingJobId === job.id;

              const itemsCount = 
                (Array.isArray(job.items) && job.items.length > 0)
                  ? job.items.length
                  : (Array.isArray(rawCentral.items) && rawCentral.items.length > 0)
                  ? rawCentral.items.length
                  : (Array.isArray(rawCentral.photos) && rawCentral.photos.length > 0)
                  ? rawCentral.photos.length
                  : 1;

              const isIdCard = serviceType === 'PRINT_DOCUMENT' || serviceType === 'ID_CARD';

              return (
                <div
                  key={job.id}
                  onClick={() => !isLoadingThis && onLoadJob(job)}
                  className="group relative flex items-center gap-3.5 p-3.5 rounded-2xl bg-slate-950/90 hover:bg-slate-950 border border-slate-800 hover:border-cyan-400/80 hover:shadow-[0_0_30px_rgba(6,182,212,0.25)] transition-all cursor-pointer shrink-0 min-w-[360px] max-w-[420px]"
                >
                  {/* Document / Card Thumbnail */}
                  <div className="relative w-18 h-22 rounded-xl overflow-hidden bg-slate-900 border border-cyan-500/30 group-hover:border-cyan-400 flex items-center justify-center shrink-0 shadow-inner">
                    {photoThumbnail ? (
                      <img
                        src={photoThumbnail}
                        alt={customerName}
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                          const fallback = e.currentTarget.parentElement?.querySelector('.doc-fallback');
                          if (fallback) fallback.classList.remove('hidden');
                        }}
                        className="w-full h-full object-cover transition-transform group-hover:scale-105"
                      />
                    ) : null}
                    <div className={`doc-fallback flex flex-col items-center justify-center gap-1.5 text-cyan-400 p-2 text-center ${photoThumbnail ? 'hidden' : ''}`}>
                      <div className="w-9 h-9 rounded-xl bg-cyan-950/80 border border-cyan-500/40 flex items-center justify-center text-xs font-bold text-cyan-300 uppercase shadow-inner">
                        {isIdCard ? <CreditCard size={18} /> : <FileText size={18} />}
                      </div>
                      <span className="text-[9px] font-mono font-bold text-slate-400">#{orderCode}</span>
                    </div>

                    {/* File count pill overlay */}
                    {itemsCount > 1 && (
                      <div className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded-md bg-slate-950/90 text-[9px] font-mono font-bold text-cyan-300 border border-cyan-500/30 shadow">
                        {itemsCount} files
                      </div>
                    )}
                  </div>

                  {/* Customer & Order Details */}
                  <div className="flex-1 min-w-0 flex flex-col justify-between py-0.5">
                    <div className="flex items-center justify-between gap-1.5">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <User className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                        <span className="font-bold text-white text-sm truncate">{customerName}</span>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => onDismissJob(job.id, e)}
                        className="p-1 text-slate-500 hover:text-slate-300 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
                        title="Dismiss order"
                      >
                        <X size={14} />
                      </button>
                    </div>

                    {/* Service & Phone info */}
                    <div className="flex items-center gap-1.5 text-[11px] text-slate-400 font-medium truncate mt-1">
                      {customerPhone && (
                        <span className="flex items-center gap-1 text-slate-300">
                          <Phone size={11} className="text-cyan-400" />
                          {customerPhone}
                        </span>
                      )}
                      {customerPhone && <span className="text-slate-600">•</span>}
                      <span className={`font-semibold px-2 py-0.5 rounded-full text-[10px] uppercase border ${
                        isIdCard 
                          ? 'bg-cyan-500/10 text-cyan-300 border-cyan-500/30' 
                          : 'bg-purple-500/10 text-purple-300 border-purple-500/30'
                      }`}>
                        {isIdCard ? '🪪 ID Card / Print' : '📸 Passport Photo'}
                      </span>
                    </div>

                    {/* Action Row */}
                    <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-800/80">
                      <span className="text-[11px] text-slate-300 font-medium flex items-center gap-1">
                        <Layers size={12} className="text-cyan-400" />
                        {itemsCount > 1 ? `${itemsCount} Documents` : '1 Document / Card'}
                      </span>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onLoadJob(job);
                        }}
                        disabled={isLoadingThis}
                        className="px-3.5 py-1.5 bg-gradient-to-r from-cyan-400 via-teal-400 to-blue-500 hover:from-cyan-300 hover:to-blue-400 text-slate-950 font-black text-xs rounded-xl shadow-md active:scale-95 transition-all flex items-center gap-1.5 border border-cyan-200/50 cursor-pointer disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {isLoadingThis ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-950" />
                            <span>Processing...</span>
                          </>
                        ) : (
                          <>
                            <Sparkles className="w-3.5 h-3.5 text-slate-950 fill-slate-950" />
                            <span>⚡ Load & Process</span>
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
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-3 py-2 text-xs">
            <div className="flex items-center gap-3 text-slate-300">
              <div className="p-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 shrink-0">
                <Smartphone className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-white text-sm">Live Mobile QR Orders Active</span>
                  {(!isConnected || centerCode === 'UNCONNECTED') && (
                    <span className="px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-300 border border-amber-500/30 text-[10px] font-bold">
                      🔑 Connect Account for Live QR
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Customers scan your shop's counter QR code to upload Aadhaar, PAN, Voter card or PDFs ➔ their documents appear here instantly for 1-click auto-split, enhancement & 300 DPI printing.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {(!isConnected || centerCode === 'UNCONNECTED') && onOpenConnectModal ? (
                <button
                  type="button"
                  onClick={onOpenConnectModal}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-xs transition-all active:scale-95 shadow-md shadow-amber-950/40 shrink-0 cursor-pointer"
                >
                  <KeyRound size={14} />
                  <span>🔑 Connect Account</span>
                </button>
              ) : onOpenQrModal ? (
                <button
                  type="button"
                  onClick={onOpenQrModal}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-extrabold text-xs transition-all active:scale-95 shadow-md shadow-cyan-950/40 shrink-0 cursor-pointer"
                >
                  <QrCode size={14} />
                  <span>Show Counter QR</span>
                </button>
              ) : null}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
