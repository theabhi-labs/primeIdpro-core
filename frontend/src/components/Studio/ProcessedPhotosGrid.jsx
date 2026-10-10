import React, { useState } from 'react';
import {
  Plus,
  Edit2,
  Trash2,
  Check,
  Square,
  MousePointer2,
  Layers,
  Sparkles,
  Loader2,
  AlertTriangle,
  RefreshCw,
  Zap,
  ChevronDown,
  ChevronUp,
  Copy,
  Info,
  UploadCloud,
} from 'lucide-react';

const ERROR_INFO = {
  IMAGE_UNREADABLE: {
    title: 'Photo Format Error',
    message: 'The photo file could not be read or is corrupted.',
    tip: 'Try saving the photo as a standard JPG or PNG and upload again.',
    badge: 'File Error',
  },
  NO_PERSON_FOUND: {
    title: 'No Person Detected',
    message: 'Could not detect a clear face or person in this photo.',
    tip: 'Upload a clear front-facing portrait with face and shoulders visible.',
    badge: 'Face Detection',
  },
  MASK_FAILED: {
    title: 'Background Removal Failed',
    message: 'AI could not cleanly separate the subject from the background.',
    tip: 'Use a photo with better contrast, or retry using HD Cloud AI.',
    badge: 'AI Matting',
  },
  TIMEOUT: {
    title: 'Processing Timed Out',
    message: 'The background removal took too long to complete.',
    tip: 'Try uploading a slightly smaller image or retry processing.',
    badge: 'Timeout',
  },
  UNKNOWN: {
    title: 'Processing Failed',
    message: 'An unexpected error occurred while processing the photo.',
    tip: 'Click Retry to try again, or use HD Cloud AI fallback.',
    badge: 'System Error',
  },
};

const ProcessedPhotosGrid = ({
  photos = [],
  uploads = [],
  onEdit,
  onDelete,
  onClearAll,
  onSelectForCopy,
  onSelectMultiple,
  onRetry,
}) => {
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [selectMode, setSelectMode] = useState(false);
  const [expandedDetails, setExpandedDetails] = useState({});
  const [copiedId, setCopiedId] = useState(null);

  // All items to display: combined active uploads + completed photos
  const displayItems = uploads.length > 0 ? uploads : photos;
  const completedPhotos = displayItems.filter((p) => p.status === 'completed' && p.processedUrl);

  const toggleSelect = (id) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedIds(newSet);
    onSelectMultiple?.(Array.from(newSet));
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === completedPhotos.length) {
      setSelectedIds(new Set());
      onSelectMultiple?.([]);
    } else {
      const allIds = completedPhotos.map((p) => p.id);
      setSelectedIds(new Set(allIds));
      onSelectMultiple?.(allIds);
    }
  };

  const toggleDetails = (id) => {
    setExpandedDetails((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleCopyDetails = async (photo) => {
    const code = photo.errorCode || 'UNKNOWN';
    const detail = photo.rawError || photo.error || 'Unknown error occurred';
    const textToCopy = `Error Code: ${code}\nDetails: ${detail}\nFilename: ${photo.file?.name || photo.filename || 'photo'}`;
    try {
      await navigator.clipboard.writeText(textToCopy);
      setCopiedId(photo.id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch (err) {
      console.error('Failed to copy error details:', err);
    }
  };

  if (displayItems.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 border-2 border-dashed border-slate-800 rounded-3xl bg-slate-900/20">
        <Layers className="w-12 h-12 text-slate-700 mb-4" />
        <p className="text-slate-500 font-medium tracking-wide text-xs">No processed photos in your gallery</p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-6xl mx-auto px-2">
      {/* Control Bar */}
      <div className="mb-6 flex flex-wrap gap-4 justify-between items-center bg-slate-900/60 p-3.5 rounded-2xl border border-slate-800/80 backdrop-blur-sm text-xs">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setSelectMode(!selectMode)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all duration-300 cursor-pointer ${
              selectMode
                ? 'bg-cyan-500 text-slate-950 shadow-[0_0_20px_rgba(6,182,212,0.4)]'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            <MousePointer2 size={14} />
            <span>{selectMode ? 'Cancel Selection' : 'Batch Select'}</span>
          </button>
          
          {!selectMode && completedPhotos.length > 0 && (
            <button
              onClick={onClearAll}
              className="flex items-center gap-2 px-4 py-2 bg-red-950/40 text-red-400 rounded-xl text-xs font-semibold hover:bg-red-900/60 transition-all border border-red-900/50 cursor-pointer"
            >
              <Trash2 size={14} />
              <span>Clear All</span>
            </button>
          )}

          {selectMode && (
            <span className="text-[11px] font-mono text-cyan-400 bg-cyan-950 px-3 py-1 rounded-full border border-cyan-800">
              {selectedIds.size} Selected
            </span>
          )}
        </div>

        {selectMode && (
          <button
            onClick={toggleSelectAll}
            className="flex items-center gap-2 px-4 py-2 bg-slate-800 text-slate-300 rounded-xl text-xs font-semibold hover:bg-slate-700 transition-all border border-slate-700 cursor-pointer"
          >
            {selectedIds.size === completedPhotos.length ? (
              <Check size={14} className="text-cyan-400 font-bold" />
            ) : (
              <Square size={14} />
            )}
            <span>{selectedIds.size === completedPhotos.length ? 'Deselect All' : 'Select All'}</span>
          </button>
        )}
      </div>

      {/* Grid Display */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-5">
        {displayItems.map((photo, idx) => {
          const isSelected = selectedIds.has(photo.id);
          const isProcessing = photo.status === 'processing' || photo.status === 'uploading' || photo.status === 'pending';
          const isFailed = photo.status === 'failed';
          const errInfo = ERROR_INFO[photo.errorCode] || ERROR_INFO.UNKNOWN;
          const isExpanded = !!expandedDetails[photo.id];

          return (
            <div
              key={photo.id || idx}
              className={`group relative rounded-3xl overflow-hidden bg-slate-950 border-2 transition-all duration-300 ${
                isSelected && selectMode
                  ? 'border-cyan-500 scale-[0.98]'
                  : isProcessing
                  ? 'border-cyan-500/50 shadow-lg shadow-cyan-950/40'
                  : isFailed
                  ? 'border-rose-500/50 shadow-lg shadow-rose-950/30'
                  : 'border-slate-800 hover:border-slate-700 shadow-xl'
              }`}
            >
              {/* Selection Checkbox Overlay */}
              {selectMode && !isProcessing && !isFailed && (
                <div className="absolute top-3 left-3 z-30">
                  <div
                    onClick={() => toggleSelect(photo.id)}
                    className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center cursor-pointer transition-all ${
                      isSelected ? 'bg-cyan-500 border-cyan-500' : 'bg-black/60 border-white/40'
                    }`}
                  >
                    {isSelected && <Check size={14} className="text-slate-950 font-bold" />}
                  </div>
                </div>
              )}

              {/* Image Viewport */}
              <div className="relative aspect-[3/4] overflow-hidden bg-slate-900 flex items-center justify-center">
                {/* 1. COMPLETED PHOTO */}
                {!isProcessing && !isFailed && (
                  <img
                    src={photo.processedUrl || photo.preview}
                    alt="Passport ID"
                    className={`w-full h-full object-cover transition-transform duration-500 group-hover:scale-105 ${
                      isSelected && selectMode ? 'opacity-50' : 'opacity-100'
                    }`}
                  />
                )}

                {/* 2. PROCESSING STATE (LIVE VISUAL PIPELINE) */}
                {isProcessing && (
                  <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-sm flex flex-col items-center justify-center p-4 text-center z-20">
                    {photo.preview && (
                      <img
                        src={photo.preview}
                        alt="Original Upload"
                        className="w-16 h-16 rounded-2xl object-cover opacity-40 mb-3 border border-slate-700"
                      />
                    )}

                    <div className="relative mb-3">
                      <Loader2 size={32} className="text-cyan-400 animate-spin" />
                      <div className="absolute inset-0 flex items-center justify-center">
                        <Zap size={13} className="text-amber-400 animate-pulse" />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <p className="text-xs font-bold text-white tracking-wide">
                        {photo.isVintageRestored ? '✨ 4K AI Restoring...' : 'AI Processing...'}
                      </p>
                      <p className="text-[10px] text-cyan-400 font-mono font-semibold">
                        {(photo.progress || 0) < 35
                          ? '🔍 Face & Subject Detection'
                          : (photo.progress || 0) < 70
                          ? '🧼 Background Matting'
                          : '✨ 4K Super-Resolution'}
                      </p>
                    </div>

                    {/* Progress Track */}
                    <div className="w-full max-w-[120px] h-1.5 bg-slate-800 rounded-full overflow-hidden mt-3">
                      <div
                        className="h-full bg-gradient-to-r from-cyan-400 to-blue-500 rounded-full transition-all duration-300"
                        style={{ width: `${Math.max(15, photo.progress || 20)}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* 3. ENHANCED FAILED STATE */}
                {isFailed && (
                  <div className="absolute inset-0 bg-slate-950/95 backdrop-blur-md p-3.5 flex flex-col justify-between text-left text-xs z-20 overflow-y-auto">
                    {/* Header & Status */}
                    <div className="space-y-2">
                      <div className="flex items-start justify-between gap-1.5">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <div className="p-1 rounded-lg bg-rose-500/20 text-rose-400 shrink-0">
                            <AlertTriangle size={15} />
                          </div>
                          <span className="font-bold text-white text-xs truncate">
                            {errInfo.title}
                          </span>
                        </div>
                        <span className="text-[9px] font-mono uppercase px-1.5 py-0.5 rounded bg-rose-950 text-rose-300 border border-rose-800/60 shrink-0">
                          {errInfo.badge}
                        </span>
                      </div>

                      {/* Actionable Tip Callout */}
                      <div className="bg-rose-950/40 border border-rose-900/60 rounded-xl p-2 text-[11px] text-rose-200/90 flex items-start gap-1.5 leading-tight">
                        <Info size={13} className="text-rose-400 shrink-0 mt-0.5" />
                        <div>
                          <span className="font-semibold text-rose-300">Tip: </span>
                          <span>{errInfo.tip}</span>
                        </div>
                      </div>

                      {/* Collapsible Details */}
                      <div className="pt-0.5">
                        <button
                          type="button"
                          onClick={() => toggleDetails(photo.id)}
                          className="flex items-center justify-between w-full text-[10px] text-slate-400 hover:text-slate-200 py-1 transition-colors cursor-pointer"
                        >
                          <span className="font-medium">Technical Details</span>
                          {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                        </button>

                        {isExpanded && (
                          <div className="mt-1 p-2 rounded-lg bg-slate-900/90 border border-slate-800 space-y-1.5">
                            <p className="text-[10px] font-mono text-slate-300 break-words max-h-16 overflow-y-auto select-all leading-tight">
                              {photo.rawError || photo.error || 'No detailed trace available.'}
                            </p>
                            <div className="flex justify-between items-center pt-1 border-t border-slate-800/80">
                              <span className="text-[9px] font-mono text-slate-500">
                                Code: {photo.errorCode || 'UNKNOWN'}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleCopyDetails(photo)}
                                className="flex items-center gap-1 text-[10px] text-cyan-400 hover:text-cyan-300 px-1.5 py-0.5 rounded hover:bg-slate-800 transition-colors cursor-pointer"
                              >
                                {copiedId === photo.id ? (
                                  <>
                                    <Check size={11} className="text-emerald-400" />
                                    <span className="text-emerald-400 font-semibold">Copied</span>
                                  </>
                                ) : (
                                  <>
                                    <Copy size={11} />
                                    <span>Copy details</span>
                                  </>
                                )}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Actions: Retry, HD Cloud, Dismiss */}
                    <div className="pt-2 space-y-1.5 border-t border-slate-800/80 mt-2">
                      <div className="grid grid-cols-2 gap-1.5">
                        {/* Local Fast Retry */}
                        <button
                          type="button"
                          onClick={() => onRetry?.(photo.id, false)}
                          className="flex items-center justify-center gap-1 py-1.5 px-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-[11px] font-bold transition-all border border-slate-700 hover:border-slate-600 cursor-pointer shadow-sm"
                          title="Retry processing with local AI engine"
                        >
                          <RefreshCw size={12} className="text-cyan-400" />
                          <span>Retry</span>
                        </button>

                        {/* Secondary: Retry with HD Cloud */}
                        <button
                          type="button"
                          onClick={() => onRetry?.(photo.id, true)}
                          className="flex items-center justify-center gap-1 py-1.5 px-2 bg-gradient-to-r from-cyan-950/80 to-blue-950/80 hover:from-cyan-900 hover:to-blue-900 text-cyan-300 rounded-xl text-[11px] font-bold transition-all border border-cyan-800/70 hover:border-cyan-600 cursor-pointer shadow-sm"
                          title="Retry using high-precision cloud AI engine"
                        >
                          <Sparkles size={12} className="text-cyan-400" />
                          <span>HD Cloud</span>
                        </button>
                      </div>

                      <div className="flex items-center justify-between pt-0.5">
                        <span className="text-[9px] text-slate-500 flex items-center gap-1">
                          <UploadCloud size={10} className="text-slate-500" />
                          Sends photo to cloud AI
                        </span>
                        <button
                          type="button"
                          onClick={() => onDelete(photo.id)}
                          className="text-[10px] text-slate-400 hover:text-rose-400 transition-colors font-medium cursor-pointer"
                        >
                          Dismiss
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* AI Overlay Badge & 4K Tag */}
                {!isProcessing && !isFailed && (
                  <div className="absolute top-3 right-3 flex items-center gap-1.5 z-20">
                    {photo.isVintageRestored && (
                      <span className="bg-gradient-to-r from-amber-400 to-amber-500 text-slate-950 px-2 py-0.5 rounded-md font-black text-[9px] uppercase tracking-wider shadow-sm flex items-center gap-1">
                        <Sparkles size={10} />
                        4K Restored
                      </span>
                    )}
                    <div className="bg-black/60 backdrop-blur-md text-[10px] text-cyan-400 px-2 py-0.5 rounded-md border border-cyan-400/30 font-mono font-bold">
                      ID #{idx + 1}
                    </div>
                  </div>
                )}

                {/* Hover Action Menu (Hidden in Select Mode & Processing) */}
                {!selectMode && !isProcessing && !isFailed && (
                  <div className="absolute inset-0 bg-gradient-to-t from-[#020617] via-slate-950/40 to-transparent opacity-0 group-hover:opacity-100 transition-all duration-300 flex items-end justify-center pb-5 gap-2 px-3 z-30">
                    <button
                      onClick={() => onSelectForCopy(photo)}
                      className="p-2.5 bg-slate-900/90 backdrop-blur-xl border border-slate-700 rounded-xl hover:bg-cyan-500 hover:text-slate-950 hover:border-cyan-400 transition-all text-slate-200 cursor-pointer"
                      title="Create Copies for Print"
                    >
                      <Plus size={16} />
                    </button>
                    <button
                      onClick={() => onEdit(photo)}
                      className="p-2.5 bg-slate-900/90 backdrop-blur-xl border border-slate-700 rounded-xl hover:bg-cyan-500 hover:text-slate-950 hover:border-cyan-400 transition-all text-slate-200 flex items-center gap-1.5 text-xs font-bold cursor-pointer"
                      title="Edit Photo"
                    >
                      <Edit2 size={15} className="text-cyan-400" />
                      <span>Edit</span>
                    </button>
                    <button
                      onClick={() => onDelete(photo.id)}
                      className="p-2.5 bg-slate-900/90 backdrop-blur-xl border border-slate-700 rounded-xl hover:bg-rose-600 hover:text-white hover:border-rose-400 transition-all text-slate-300 cursor-pointer"
                      title="Delete"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default ProcessedPhotosGrid;