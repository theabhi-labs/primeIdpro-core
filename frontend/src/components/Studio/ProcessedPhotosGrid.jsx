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
} from 'lucide-react';

const ProcessedPhotosGrid = ({
  photos = [],
  uploads = [],
  onEdit,
  onDelete,
  onSelectForCopy,
  onSelectMultiple,
}) => {
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [selectMode, setSelectMode] = useState(false);

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

          return (
            <div
              key={photo.id || idx}
              className={`group relative rounded-3xl overflow-hidden bg-slate-950 border-2 transition-all duration-300 ${
                isSelected && selectMode
                  ? 'border-cyan-500 scale-[0.98]'
                  : isProcessing
                  ? 'border-cyan-500/50 shadow-lg shadow-cyan-950/40'
                  : isFailed
                  ? 'border-rose-500/50'
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

                {/* 3. FAILED STATE */}
                {isFailed && (
                  <div className="absolute inset-0 bg-rose-950/60 p-4 flex flex-col items-center justify-center text-center text-xs text-rose-200 z-20">
                    <AlertTriangle size={28} className="text-rose-400 mb-2" />
                    <p className="font-bold text-white mb-1">Processing Failed</p>
                    <p className="text-[10px] text-rose-300/80 mb-3 line-clamp-2">
                      {photo.error || 'Could not detect face.'}
                    </p>
                    <button
                      type="button"
                      onClick={() => onDelete(photo.id)}
                      className="px-3 py-1 bg-slate-900 hover:bg-slate-800 text-slate-300 rounded-lg text-[11px] font-bold transition-colors"
                    >
                      Dismiss
                    </button>
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
                      className="p-2.5 bg-slate-900/90 backdrop-blur-xl border border-slate-700 rounded-xl hover:bg-cyan-500 hover:text-slate-950 hover:border-cyan-400 transition-all text-slate-200 flex items-center gap-1 text-xs font-bold cursor-pointer"
                      title="4K AI Restore & Fine Tune"
                    >
                      <Sparkles size={15} className="text-amber-400" />
                      <span>4K Edit</span>
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