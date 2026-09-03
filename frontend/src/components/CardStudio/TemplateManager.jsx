import React, { useState } from 'react';
import { LayoutTemplate, Eye, Layers, QrCode, Tag, CheckCircle2, RefreshCw, Maximize2 } from 'lucide-react';
import CardVisualPreview from './CardVisualPreview';
import CardDetailModal from './CardDetailModal';

export default function TemplateManager({ templates = [], onSelectTemplate }) {
  const [activeCategory, setActiveCategory] = useState('all');
  const [templateSides, setTemplateSides] = useState({});
  const [modalTemplate, setModalTemplate] = useState(null);

  const categories = ['all', 'school', 'college', 'employee', 'membership'];

  const filtered = templates.filter((t) => {
    if (activeCategory === 'all') return true;
    return t.category === activeCategory;
  });

  const handleToggleSide = (e, tmplId) => {
    e.stopPropagation();
    setTemplateSides((prev) => ({
      ...prev,
      [tmplId]: prev[tmplId] === 'back' ? 'front' : 'back',
    }));
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between p-5 bg-gradient-to-r from-blue-950/40 via-slate-950 to-cyan-950/40 border border-blue-500/20 rounded-3xl">
        <div>
          <h3 className="text-lg font-black text-white tracking-tight flex items-center gap-2">
            <LayoutTemplate className="w-6 h-6 text-cyan-400" />
            Template Explorer (Live Dual-Side Previews)
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Production-grade self-contained templates for CR80 PVC plastic cards with high-resolution Front and Back designs.
          </p>
        </div>
      </div>

      {/* Categories */}
      <div className="flex gap-2">
        {categories.map((c) => (
          <button
            key={c}
            onClick={() => setActiveCategory(c)}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold capitalize transition-all cursor-pointer ${
              activeCategory === c
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                : 'bg-slate-950 text-slate-400 border border-slate-800 hover:text-white'
            }`}
          >
            {c}
          </button>
        ))}
      </div>

      {/* Templates Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {filtered.map((tmpl) => {
          const side = templateSides[tmpl.id] || 'front';
          return (
            <div
              key={tmpl.id}
              className="p-5 rounded-3xl bg-slate-950/80 border border-slate-800 space-y-4 hover:border-slate-700 transition-all flex flex-col justify-between group"
            >
              <div>
                {/* Live Card Preview Box (Click to open Large 3D Modal) */}
                <div
                  onClick={() => setModalTemplate(tmpl)}
                  className="w-full h-48 rounded-2xl bg-slate-900 border border-slate-800 overflow-hidden flex flex-col items-center justify-center mb-3 relative p-2 cursor-pointer group-hover:border-cyan-500/40 transition-all"
                  title="Click to Enlarge & 3D Flip"
                >
                  <div className="transform scale-[0.72] origin-center group-hover:scale-[0.76] transition-transform duration-300">
                    <CardVisualPreview
                      templateId={tmpl.id}
                      side={side}
                      scale={1.0}
                      isInteractive={false}
                    />
                  </div>

                  {/* Enlarge Overlay Indicator */}
                  <div className="absolute inset-0 bg-slate-950/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity pointer-events-none">
                    <div className="px-3 py-1.5 rounded-xl bg-slate-900/95 border border-cyan-500/60 text-cyan-400 text-xs font-bold flex items-center gap-1.5 shadow-xl">
                      <Maximize2 size={13} />
                      <span>Click to Enlarge & 3D Flip</span>
                    </div>
                  </div>

                  {/* Flip Button */}
                  <button
                    type="button"
                    onClick={(e) => handleToggleSide(e, tmpl.id)}
                    className="absolute bottom-2 right-2 px-2.5 py-1 rounded-lg bg-slate-950/90 hover:bg-slate-800 text-cyan-400 border border-slate-700 text-[10px] font-bold flex items-center gap-1 shadow-md z-10 cursor-pointer"
                  >
                    <RefreshCw size={11} />
                    <span>Flip to {side === 'front' ? 'Back' : 'Front'}</span>
                  </button>
                </div>

                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-bold text-white group-hover:text-cyan-400 transition-colors">{tmpl.name}</h4>
                  <span className="text-[10px] font-mono text-cyan-400 px-2 py-0.5 rounded bg-cyan-950 border border-cyan-800/40 font-bold">
                    v{tmpl.version}
                  </span>
                </div>

                <p className="text-xs text-slate-400 mt-1 line-clamp-2">
                  {tmpl.description}
                </p>

                <div className="flex flex-wrap gap-1.5 pt-3 border-t border-slate-800/80 mt-3">
                  <span className="text-[10px] px-2 py-0.5 rounded bg-slate-900 text-slate-300 font-semibold">
                    {tmpl.size?.width} × {tmpl.size?.height} mm (CR80)
                  </span>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-slate-900 text-slate-300 font-semibold">
                    Front + Back
                  </span>
                  {tmpl.qr?.enabled && (
                    <span className="text-[10px] px-2 py-0.5 rounded bg-blue-950 text-blue-300 border border-blue-800/40">
                      QR Enabled
                    </span>
                  )}
                </div>
              </div>

              <button
                type="button"
                onClick={() => onSelectTemplate?.(tmpl)}
                className="w-full py-2.5 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 text-xs font-bold rounded-xl transition-all shadow-md active:scale-95 cursor-pointer"
              >
                Use This Template in Project
              </button>
            </div>
          );
        })}
      </div>

      {/* ================= LARGE 3D FLIP CARD VIEWER MODAL ================= */}
      <CardDetailModal
        template={modalTemplate}
        isOpen={Boolean(modalTemplate)}
        onClose={() => setModalTemplate(null)}
        onSelectTemplate={onSelectTemplate}
      />
    </div>
  );
}

