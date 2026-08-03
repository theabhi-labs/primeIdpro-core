import React, { useState } from 'react';
import { Plus, Edit2, Trash2, Check, Square, MousePointer2, Layers } from 'lucide-react';

const ProcessedPhotosGrid = ({ photos, onEdit, onDelete, onSelectForCopy, onSelectMultiple }) => {
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [selectMode, setSelectMode] = useState(false);

  // LOGIC PRESERVED: Same as your original code
  const toggleSelect = (id) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedIds(newSet);
    onSelectMultiple?.(Array.from(newSet));
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === photos.length) {
      setSelectedIds(new Set());
      onSelectMultiple?.([]);
    } else {
      const allIds = photos.map(p => p.id);
      setSelectedIds(new Set(allIds));
      onSelectMultiple?.(allIds);
    }
  };

  if (photos.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 border-2 border-dashed border-slate-800 rounded-[2rem] bg-slate-900/20">
        <Layers className="w-12 h-12 text-slate-700 mb-4" />
        <p className="text-slate-500 font-medium tracking-wide">No processed photos in your gallery</p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-6xl mx-auto px-4">
      {/* Control Bar */}
      <div className="mb-8 flex flex-wrap gap-4 justify-between items-center bg-slate-900/40 p-4 rounded-2xl border border-slate-800/50 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setSelectMode(!selectMode)}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-300 ${
              selectMode 
                ? 'bg-cyan-500 text-white shadow-[0_0_20px_rgba(6,182,212,0.4)]' 
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            <MousePointer2 size={16} />
            {selectMode ? 'Cancel Selection' : 'Batch Select'}
          </button>
          
          {selectMode && (
            <span className="text-xs font-mono text-cyan-400 bg-cyan-400/10 px-3 py-1 rounded-full border border-cyan-400/20">
              {selectedIds.size} Selected
            </span>
          )}
        </div>

        {selectMode && (
          <button
            onClick={toggleSelectAll}
            className="flex items-center gap-2 px-5 py-2.5 bg-slate-800/50 text-slate-300 rounded-xl text-sm font-semibold hover:bg-slate-700 transition-all border border-slate-700"
          >
            {selectedIds.size === photos.length ? <Check size={16} className="text-cyan-400" /> : <Square size={16} />}
            {selectedIds.size === photos.length ? 'Deselect All' : 'Select All'}
          </button>
        )}
      </div>

      {/* Grid Display */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-6">
        {photos.map((photo, idx) => {
          const isSelected = selectedIds.has(photo.id);
          return (
            <div 
              key={photo.id} 
              className={`group relative rounded-3xl overflow-hidden bg-slate-900 border-2 transition-all duration-500 ${
                isSelected && selectMode ? 'border-cyan-500 scale-[0.98]' : 'border-slate-800 hover:border-slate-600 shadow-2xl'
              }`}
            >
              {/* Selection Checkbox Overlay */}
              {selectMode && (
                <div className="absolute top-3 left-3 z-30">
                  <div 
                    onClick={() => toggleSelect(photo.id)}
                    className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center cursor-pointer transition-all ${
                      isSelected ? 'bg-cyan-500 border-cyan-500' : 'bg-black/40 border-white/30'
                    }`}
                  >
                    {isSelected && <Check size={14} className="text-white font-bold" />}
                  </div>
                </div>
              )}

              {/* Image Container */}
              <div className="relative aspect-[3/4] overflow-hidden">
                <img
                  src={photo.processedUrl}
                  alt="Passport ID"
                  className={`w-full h-full object-cover transition-transform duration-700 group-hover:scale-110 ${
                    isSelected && selectMode ? 'opacity-50' : 'opacity-100'
                  }`}
                />
                
                {/* AI Overlay Badge */}
                <div className="absolute top-3 right-3 bg-black/40 backdrop-blur-md text-[10px] text-cyan-400 px-2 py-1 rounded-md border border-cyan-400/20 font-mono">
                  ID #{idx + 1}
                </div>

                {/* Hover Action Menu (Hidden in Select Mode) */}
                {!selectMode && (
                  <div className="absolute inset-0 bg-gradient-to-t from-[#020617] via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-all duration-300 flex items-end justify-center pb-6 gap-3">
                    <button
                      onClick={() => onSelectForCopy(photo)}
                      className="p-3 bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl hover:bg-cyan-500 hover:text-white hover:border-cyan-400 transition-all text-slate-200"
                      title="Create Copies"
                    >
                      <Plus size={18} />
                    </button>
                    <button
                      onClick={() => onEdit(photo)}
                      className="p-3 bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl hover:bg-blue-600 hover:text-white hover:border-blue-400 transition-all text-slate-200"
                      title="Fine Tune"
                    >
                      <Edit2 size={18} />
                    </button>
                    <button
                      onClick={() => onDelete(photo.id)}
                      className="p-3 bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl hover:bg-red-500/80 hover:text-white hover:border-red-400 transition-all text-slate-200"
                      title="Discard"
                    >
                      <Trash2 size={18} />
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