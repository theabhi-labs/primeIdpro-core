import React, { useState, useEffect } from 'react';
import { X, RotateCw, Sparkles, CheckCircle2, ShieldCheck, QrCode, Maximize2, ZoomIn, ZoomOut, ArrowRight } from 'lucide-react';
import CardVisualPreview from './CardVisualPreview';

export default function CardDetailModal({ template, isOpen, onClose, onSelectTemplate, initialSide = 'front' }) {
  const isVertical = template?.size?.orientation === 'vertical' || template?.id === 'corporate-id-dark' || template?.id === 'mhrsa-inter-college-vertical';
  const defaultZoom = isVertical ? 1.12 : 1.40;

  const [currentSide, setCurrentSide] = useState(initialSide);
  const [isFlipping, setIsFlipping] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(defaultZoom);

  useEffect(() => {
    if (isOpen) {
      setCurrentSide(initialSide);
      setZoomLevel(defaultZoom);
    }
  }, [isOpen, initialSide, template?.id]);


  // Keyboard support: Escape to close, Space / F to flip
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
      if (e.key === ' ' || e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        handleFlip();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, currentSide]);

  if (!isOpen || !template) return null;

  const handleFlip = () => {
    setIsFlipping(true);
    setTimeout(() => {
      setCurrentSide((prev) => (prev === 'front' ? 'back' : 'front'));
      setIsFlipping(false);
    }, 150);
  };

  return (

    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-in fade-in duration-200">
      
      {/* Overlay backdrop click to close */}
      <div className="absolute inset-0" onClick={onClose} />

      {/* Modal Container */}
      <div className="relative z-10 w-full max-w-4xl bg-slate-950 border border-slate-700/80 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Top Header Bar */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/80">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center text-slate-950 font-black shadow-md">
              <Sparkles size={16} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-extrabold text-white tracking-tight">{template.name}</h3>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-800/60 font-bold">
                  v{template.version || '1.0.0'}
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-semibold uppercase">
                  {template.category || 'Standard'}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">{template.description}</p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white transition-all cursor-pointer border border-slate-700"
            title="Close (Esc)"
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Center Body */}
        <div className="flex-1 overflow-y-auto p-6 flex flex-col items-center justify-center space-y-6 bg-gradient-to-b from-slate-950 via-slate-900/40 to-slate-950">
          
          {/* Controls Bar (Front/Back Selector, 3D Flip Button, Zoom Controls) */}
          <div className="flex flex-wrap items-center justify-between gap-4 w-full max-w-2xl px-2">
            
            {/* Front / Back Toggle Tabs */}
            <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800 shadow-md">
              <button
                type="button"
                onClick={() => setCurrentSide('front')}
                className={`px-4 py-1.5 rounded-lg text-xs font-extrabold transition-all cursor-pointer ${
                  currentSide === 'front'
                    ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-slate-950 shadow-md'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Front Side
              </button>
              <button
                type="button"
                onClick={() => setCurrentSide('back')}
                className={`px-4 py-1.5 rounded-lg text-xs font-extrabold transition-all cursor-pointer ${
                  currentSide === 'back'
                    ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-slate-950 shadow-md'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Back Side
              </button>
            </div>

            {/* Flip 3D Action Button */}
            <button
              type="button"
              onClick={handleFlip}
              className="px-4 py-1.5 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 font-bold text-xs rounded-xl border border-cyan-500/40 flex items-center gap-2 transition-all shadow-sm active:scale-95 cursor-pointer"
            >
              <RotateCw size={14} className="animate-spin-once" />
              <span>3D Flip Card (Space / Click)</span>
            </button>

            {/* Zoom Controls */}
            <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800 text-xs">
              <button
                type="button"
                onClick={() => setZoomLevel((z) => Math.max(1.0, z - 0.2))}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
                title="Zoom Out"
              >
                <ZoomOut size={14} />
              </button>
              <span className="font-mono font-bold text-slate-300 px-1.5">{Math.round(zoomLevel * 100)}%</span>
              <button
                type="button"
                onClick={() => setZoomLevel((z) => Math.min(2.0, z + 0.2))}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
                title="Zoom In"
              >
                <ZoomIn size={14} />
              </button>
            </div>
          </div>

          {/* Large Card Display Frame with 3D Flip Perspective */}
          <div
            onClick={handleFlip}
            className="cursor-pointer flex items-center justify-center p-6 py-10 transition-all duration-300 relative group"
            style={{
              perspective: '1200px',
            }}
            title="Click to Flip Card"
          >
            <div
              className={`transition-all duration-300 ${
                isFlipping ? 'scale-95 opacity-80' : 'scale-100 opacity-100'
              }`}
            >
              <CardVisualPreview
                templateId={template.id}
                side={currentSide}
                scale={zoomLevel}
                isInteractive={false}
              />
            </div>

            {/* Hover Tooltip Indicator */}
            <div className="absolute bottom-2 px-3 py-1 rounded-full bg-slate-900/90 border border-slate-700 text-[11px] text-cyan-400 font-bold opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1.5 shadow-lg pointer-events-none">
              <RotateCw size={12} />
              <span>Click anywhere on card to Flip</span>
            </div>
          </div>

          {/* Specs & Physical Dimension Footer info */}
          <div className="w-full max-w-2xl bg-slate-900/80 rounded-2xl p-4 border border-slate-800 grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
            <div>
              <span className="text-slate-500 block text-[10px] uppercase font-bold">Physical Size</span>
              <strong className="text-slate-200 font-mono">85.60 × 53.98 mm</strong>
            </div>
            <div>
              <span className="text-slate-500 block text-[10px] uppercase font-bold">Standard</span>
              <strong className="text-cyan-400">CR80 PVC Card</strong>
            </div>
            <div>
              <span className="text-slate-500 block text-[10px] uppercase font-bold">Resolution</span>
              <strong className="text-emerald-400">300 DPI Strict</strong>
            </div>
            <div>
              <span className="text-slate-500 block text-[10px] uppercase font-bold">Print Layout</span>
              <strong className="text-slate-200">Duplex (Front+Back)</strong>
            </div>
          </div>
        </div>

        {/* Modal Bottom Footer */}
        <div className="px-6 py-4 border-t border-slate-800 flex items-center justify-between bg-slate-900/80">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs transition-all cursor-pointer border border-slate-700"
          >
            Close Preview
          </button>

          {onSelectTemplate && (
            <button
              type="button"
              onClick={() => {
                onSelectTemplate(template);
                onClose();
              }}
              className="px-6 py-2.5 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-black text-xs rounded-xl shadow-lg shadow-cyan-950/40 flex items-center gap-2 transition-all active:scale-95 cursor-pointer"
            >
              <CheckCircle2 size={15} />
              <span>Select & Use This Template</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
