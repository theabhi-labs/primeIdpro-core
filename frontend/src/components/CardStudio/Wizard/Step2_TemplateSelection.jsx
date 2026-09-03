import React, { useState } from 'react';
import { LayoutTemplate, CheckCircle2, QrCode, Layers, Info, Eye, Sparkles, ShieldCheck, RefreshCw, Maximize2 } from 'lucide-react';
import CardVisualPreview from '../CardVisualPreview';
import CardDetailModal from '../CardDetailModal';

export default function Step2_TemplateSelection({ templates, project, updateProject, onNext, onPrev }) {
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [masterPreviewSide, setMasterPreviewSide] = useState('front');
  const [cardGridSides, setCardGridSides] = useState({}); // { [templateId]: 'front' | 'back' }
  const [modalTemplate, setModalTemplate] = useState(null);


  const categories = ['all', 'school', 'college', 'employee', 'membership'];

  const filteredTemplates = templates.filter((t) => {
    if (selectedCategory === 'all') return true;
    return t.category === selectedCategory;
  });

  const currentTemplate = templates.find((t) => t.id === project.templateId) || templates[0] || {
    id: 'school-modern-blue',
    name: 'School Modern Blue',
    description: 'Modern high-contrast blue & cyan ID card for schools with front/back, QR code, and blood group.',
  };

  const handleSelectTemplate = (tmpl) => {
    updateProject({
      templateId: tmpl.id,
      templateVersion: tmpl.version,
    });
  };

  const handleToggleCardSide = (e, tmplId) => {
    e.stopPropagation();
    setCardGridSides((prev) => ({
      ...prev,
      [tmplId]: prev[tmplId] === 'back' ? 'front' : 'back',
    }));
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header Banner */}
      <div className="p-4 rounded-2xl bg-gradient-to-r from-blue-900/30 via-slate-900 to-cyan-900/30 border border-blue-500/20 flex items-center justify-between">
        <div>
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <LayoutTemplate className="w-5 h-5 text-cyan-400" />
            Step 2: Choose Card Template (Live Front & Back Preview)
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Inspect the exact physical design, front and back layout, and biometric field alignments before proceeding.
          </p>
        </div>
      </div>

      {/* ================= MASTER LIVE CARD SHOWCASE (FRONT & BACK) ================= */}
      {currentTemplate && (
        <div className="p-6 rounded-3xl bg-slate-950/90 border-2 border-cyan-500/40 shadow-2xl shadow-cyan-950/50 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800">
            <div className="flex items-center gap-2.5">
              <span className="w-3 h-3 rounded-full bg-cyan-400 animate-pulse"></span>
              <div>
                <h4 className="text-sm font-extrabold text-white flex items-center gap-2">
                  <span>Active Template: <span className="text-cyan-400">{currentTemplate.name}</span></span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-800 font-bold">
                    v{currentTemplate.version || '1.0.0'}
                  </span>
                </h4>
                <p className="text-xs text-slate-400 mt-0.5">{currentTemplate.description}</p>
              </div>
            </div>

            {/* Front / Back Toggle Buttons */}
            <div className="flex items-center gap-1.5 bg-slate-900 p-1 rounded-xl border border-slate-700 shadow-md">
              <button
                type="button"
                onClick={() => setMasterPreviewSide('front')}
                className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  masterPreviewSide === 'front'
                    ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-slate-950 shadow-md'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Front Side
              </button>
              <button
                type="button"
                onClick={() => setMasterPreviewSide('back')}
                className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  masterPreviewSide === 'back'
                    ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-slate-950 shadow-md'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Back Side
              </button>
            </div>
          </div>

          {/* Master Live Preview Box */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center pt-2">
            {/* Visual Card Display Area */}
            <div
              onClick={() => setModalTemplate(currentTemplate)}
              className="lg:col-span-7 flex flex-col items-center justify-center p-6 bg-slate-900/50 rounded-2xl border border-slate-800/80 cursor-pointer hover:border-cyan-500/60 hover:bg-slate-900/80 transition-all group relative"
              title="Click to Enlarge & 3D Flip"
            >
              <div className="group-hover:scale-105 transition-transform duration-300">
                <CardVisualPreview
                  templateId={currentTemplate.id}
                  side={masterPreviewSide}
                  scale={1.05}
                  isInteractive={false}
                />
              </div>

              {/* Hover Badge */}
              <div className="absolute top-3 right-3 px-2.5 py-1 rounded-lg bg-slate-900/90 border border-slate-700 text-cyan-400 text-[10px] font-bold flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity shadow-lg">
                <Maximize2 size={12} />
                <span>Click to Enlarge & Flip</span>
              </div>

              <div className="mt-4 flex items-center gap-2 text-slate-400 text-xs">
                <ShieldCheck size={14} className="text-emerald-400" />
                <span>Rendered at <strong>300 DPI CR80 Standard (85.60 × 53.98 mm)</strong> • Click to expand</span>
              </div>
            </div>

            {/* Right Specs & Field Mapping Checklist */}
            <div className="lg:col-span-5 space-y-3 text-xs">
              <div className="p-3.5 bg-slate-900/80 rounded-xl border border-slate-800 space-y-2">
                <p className="font-bold text-slate-200 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                  <Sparkles size={13} className="text-cyan-400" /> Template Specifications
                </p>
                <div className="grid grid-cols-2 gap-2 text-[11px] pt-1">
                  <div>
                    <span className="text-slate-500 block">Dimensions:</span>
                    <strong className="text-slate-200 font-mono">85.6 × 54.0 mm</strong>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Orientation:</span>
                    <strong className="text-slate-200 capitalize">{currentTemplate.size?.orientation || 'Horizontal'}</strong>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Sides:</span>
                    <strong className="text-emerald-400">Front + Back Included</strong>
                  </div>
                  <div>
                    <span className="text-slate-500 block">QR / Barcode:</span>
                    <strong className="text-cyan-400">Dynamic Base64</strong>
                  </div>
                </div>
              </div>

              <div className="p-3.5 bg-slate-900/80 rounded-xl border border-slate-800 space-y-2">
                <p className="font-bold text-slate-200 uppercase tracking-wider text-[11px]">Required Fields</p>
                <div className="flex flex-wrap gap-1.5">
                  {(currentTemplate.fields || [
                    { label: 'Student Name' },
                    { label: 'Roll Number' },
                    { label: 'Class / Grade' },
                    { label: 'Blood Group' },
                  ]).map((f, fIdx) => (
                    <span
                      key={fIdx}
                      className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-medium text-[10px] border border-slate-700"
                    >
                      {f.label}
                    </span>
                  ))}
                </div>
              </div>

              {/* Large View Trigger Button */}
              <button
                type="button"
                onClick={() => setModalTemplate(currentTemplate)}
                className="w-full py-2 bg-slate-900 hover:bg-slate-800 text-cyan-400 font-bold text-xs rounded-xl border border-cyan-500/30 flex items-center justify-center gap-1.5 transition-all shadow-sm cursor-pointer"
              >
                <Maximize2 size={13} />
                <span>Open Full-Screen 3D Card Inspector</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Category Filter Pills */}
      <div className="flex items-center gap-2 pt-2">
        <span className="text-xs font-bold text-slate-400 uppercase tracking-wider mr-2">Filter Catalog:</span>
        {categories.map((cat) => (
          <button
            key={cat}
            type="button"
            onClick={() => setSelectedCategory(cat)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold capitalize transition-all cursor-pointer ${
              selectedCategory === cat
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
                : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Template Grid with Live Visual Mini Previews */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {filteredTemplates.map((tmpl) => {
          const isSelected = project.templateId === tmpl.id;
          const currentCardSide = cardGridSides[tmpl.id] || 'front';

          return (
            <div
              key={tmpl.id}
              onClick={() => handleSelectTemplate(tmpl)}
              className={`rounded-2xl border p-4 cursor-pointer transition-all flex flex-col justify-between relative overflow-hidden group ${
                isSelected
                  ? 'bg-slate-900/90 border-cyan-500 shadow-xl shadow-cyan-950/50 ring-2 ring-cyan-500/50'
                  : 'bg-slate-950/70 border-slate-800 hover:border-slate-700 hover:bg-slate-900/50'
              }`}
            >
              {/* Selected Badge */}
              {isSelected && (
                <div className="absolute top-3 right-3 z-10 flex items-center gap-1 px-2 py-0.5 rounded-full bg-cyan-500 text-slate-950 text-[10px] font-extrabold shadow-md">
                  <CheckCircle2 size={12} />
                  SELECTED
                </div>
              )}

              {/* Mini Card Preview Frame (Click to open Large 3D Modal) */}
              <div
                onClick={(e) => {
                  e.stopPropagation();
                  setModalTemplate(tmpl);
                }}
                className="w-full h-44 rounded-xl bg-slate-950 border border-slate-800 flex flex-col items-center justify-center overflow-hidden mb-3 relative p-2 group-hover:border-cyan-500/40 transition-colors"
                title="Click to Enlarge & 3D Flip"
              >
                <div className="transform scale-[0.68] origin-center group-hover:scale-[0.72] transition-transform duration-300">
                  <CardVisualPreview
                    templateId={tmpl.id}
                    side={currentCardSide}
                    scale={1.0}
                    isInteractive={false}
                  />
                </div>

                {/* Enlarge Overlay Indicator */}
                <div className="absolute inset-0 bg-slate-950/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity pointer-events-none">
                  <div className="px-3 py-1 rounded-lg bg-slate-900/90 border border-cyan-500/60 text-cyan-400 text-[10px] font-bold flex items-center gap-1.5 shadow-xl">
                    <Maximize2 size={12} />
                    <span>Click to Enlarge</span>
                  </div>
                </div>

                {/* Mini Front/Back Toggle on Card */}
                <button
                  type="button"
                  onClick={(e) => handleToggleCardSide(e, tmpl.id)}
                  className="absolute bottom-2 right-2 px-2 py-1 rounded bg-slate-900/90 hover:bg-slate-800 text-cyan-400 border border-slate-700 text-[9px] font-bold flex items-center gap-1 shadow-md z-10 cursor-pointer"
                  title="Flip card side"
                >
                  <RefreshCw size={10} />
                  <span>{currentCardSide === 'front' ? 'Front' : 'Back'}</span>
                </button>
              </div>

              {/* Template Meta Info */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-white group-hover:text-cyan-400 transition-colors">
                    {tmpl.name}
                  </h4>
                  <span className="text-[9px] font-mono text-cyan-400 px-1.5 py-0.5 rounded bg-cyan-950 border border-cyan-800/40">
                    v{tmpl.version}
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 line-clamp-2 leading-relaxed">
                  {tmpl.description || 'Standard high-resolution ID card template.'}
                </p>

                {/* Specs Pill */}
                <div className="flex flex-wrap gap-1.5 pt-2 border-t border-slate-800/80">
                  <span className="text-[9px] px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-semibold">
                    {tmpl.size?.orientation === 'vertical' ? '54×86mm (V)' : '86×54mm (H)'}
                  </span>
                  <span className="text-[9px] px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-semibold">
                    Dual Sided
                  </span>
                  {tmpl.qr?.enabled && (
                    <span className="text-[9px] px-2 py-0.5 rounded bg-blue-950/80 text-blue-300 border border-blue-800/40 flex items-center gap-0.5">
                      <QrCode size={10} /> QR
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Navigation Buttons */}
      <div className="flex justify-between pt-2">
        <button
          type="button"
          onClick={onPrev}
          className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-slate-300 font-semibold text-xs rounded-xl border border-slate-800 transition-all cursor-pointer"
        >
          ← Back
        </button>
        <button
          type="button"
          onClick={onNext}
          className="px-6 py-2.5 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-bold text-xs rounded-xl transition-all shadow-md active:scale-95 cursor-pointer"
        >
          Configure Photo Processing →
        </button>
      </div>

      {/* ================= LARGE 3D FLIP CARD VIEWER MODAL ================= */}
      <CardDetailModal
        template={modalTemplate}
        isOpen={Boolean(modalTemplate)}
        onClose={() => setModalTemplate(null)}
        onSelectTemplate={handleSelectTemplate}
      />
    </div>
  );
}

