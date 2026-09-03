import React from 'react';
import { Camera, Wand2, ShieldCheck, Palette, Scissors, Sparkles } from 'lucide-react';

const BG_PRESETS = [
  { label: 'Studio White', color: '#FFFFFF', border: '#E2E8F0' },
  { label: 'Light Blue', color: '#E0F2FE', border: '#BAE6FD' },
  { label: 'Passport Cyan', color: '#CFFAFE', border: '#A5F3FC' },
  { label: 'Soft Grey', color: '#F1F5F9', border: '#CBD5E1' },
  { label: 'Warm Ivory', color: '#FEF3C7', border: '#FDE68A' },
  { label: 'Dark Navy', color: '#0F172A', border: '#1E293B' },
];

export default function Step3_PhotoConfig({ project, updateProject, onNext, onPrev }) {
  const profile = project.photoProcessingProfile || {
    removeBg: true,
    bgColor: '#FFFFFF',
    faceDetectCrop: true,
    enhance: true,
    targetDpi: 300,
    aspectRatio: '35x45',
  };

  const handleProfileChange = (field, val) => {
    updateProject({
      photoProcessingProfile: {
        ...profile,
        [field]: val,
      },
    });
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header Banner */}
      <div className="p-4 rounded-2xl bg-gradient-to-r from-blue-900/30 via-slate-900 to-cyan-900/30 border border-blue-500/20 flex items-center justify-between">
        <div>
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <Wand2 className="w-5 h-5 text-cyan-400" />
            Step 3: Prime ID Pro Photo Processing Engine
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Configure how imported photos are automatically cropped, cleaned, and enhanced using Prime ID Pro’s offline AI engine.
          </p>
        </div>
      </div>

      {/* Settings Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        
        {/* Left Column: AI Background Removal & FaceMesh */}
        <div className="space-y-4">
          
          {/* AI Background Removal Toggle */}
          <div className="p-4 rounded-2xl bg-slate-950/70 border border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
                  <Scissors size={18} />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-white">AI Background Removal</h4>
                  <p className="text-[11px] text-slate-400">Automatically isolate subject with anti-halo alpha matting</p>
                </div>
              </div>
              <input
                type="checkbox"
                checked={profile.removeBg}
                onChange={(e) => handleProfileChange('removeBg', e.target.checked)}
                className="w-4 h-4 text-cyan-500 accent-cyan-500 rounded cursor-pointer"
              />
            </div>

            {/* Background Color Picker (If BG removal enabled) */}
            {profile.removeBg && (
              <div className="pt-2 border-t border-slate-800 space-y-2">
                <label className="text-[11px] font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1">
                  <Palette size={12} className="text-cyan-400" /> Card Studio Background Color
                </label>
                <div className="flex items-center gap-2">
                  {BG_PRESETS.map((p) => (
                    <button
                      key={p.color}
                      type="button"
                      onClick={() => handleProfileChange('bgColor', p.color)}
                      className={`w-7 h-7 rounded-lg border flex items-center justify-center transition-all ${
                        profile.bgColor === p.color
                          ? 'ring-2 ring-cyan-400 scale-110 shadow-md'
                          : 'opacity-80 hover:opacity-100'
                      }`}
                      style={{ backgroundColor: p.color, borderColor: p.border }}
                      title={p.label}
                    />
                  ))}
                  {/* Custom Hex input */}
                  <input
                    type="text"
                    value={profile.bgColor || '#FFFFFF'}
                    onChange={(e) => handleProfileChange('bgColor', e.target.value)}
                    className="w-24 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs text-white font-mono uppercase text-center"
                    placeholder="#FFFFFF"
                  />
                </div>
              </div>
            )}
          </div>

          {/* MediaPipe FaceMesh & Biometric Crop */}
          <div className="p-4 rounded-2xl bg-slate-950/70 border border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400">
                  <Camera size={18} />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-white">MediaPipe Face Detection & Alignment</h4>
                  <p className="text-[11px] text-slate-400">Automatic eye-level pupil rotation & biometric crop</p>
                </div>
              </div>
              <input
                type="checkbox"
                checked={profile.faceDetectCrop}
                onChange={(e) => handleProfileChange('faceDetectCrop', e.target.checked)}
                className="w-4 h-4 text-cyan-500 accent-cyan-500 rounded cursor-pointer"
              />
            </div>
          </div>
        </div>

        {/* Right Column: Aspect Ratio, Enhancement, DPI */}
        <div className="space-y-4">
          
          {/* Target Resolution & Aspect Ratio */}
          <div className="p-4 rounded-2xl bg-slate-950/70 border border-slate-800 space-y-3">
            <div className="flex items-center gap-2 pb-2 border-b border-slate-800">
              <ShieldCheck size={16} className="text-emerald-400" />
              <h4 className="text-xs font-bold text-white uppercase tracking-wider">Output Standards</h4>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-slate-400">Aspect Ratio</label>
                <select
                  value={profile.aspectRatio || '35x45'}
                  onChange={(e) => handleProfileChange('aspectRatio', e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white focus:border-cyan-500 outline-none"
                >
                  <option value="35x45">35 × 45 mm (Standard ID)</option>
                  <option value="2x2">2 × 2 Inch (Square)</option>
                  <option value="30x40">30 × 40 mm (Compact)</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-slate-400">DPI Precision</label>
                <div className="px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs font-mono font-bold text-cyan-400 text-center">
                  300 DPI (Strict)
                </div>
              </div>
            </div>

            {/* Photographic Auto-Enhancement */}
            <div className="flex items-center justify-between pt-2">
              <div className="flex items-center gap-2">
                <Sparkles size={14} className="text-amber-400" />
                <span className="text-xs font-semibold text-slate-300">White Balance & Contrast Normalize</span>
              </div>
              <input
                type="checkbox"
                checked={profile.enhance}
                onChange={(e) => handleProfileChange('enhance', e.target.checked)}
                className="w-4 h-4 text-cyan-500 accent-cyan-500 rounded cursor-pointer"
              />
            </div>
          </div>

          {/* Engine Status Note */}
          <div className="p-3.5 rounded-2xl bg-cyan-950/30 border border-cyan-500/20 flex items-start gap-2.5">
            <span className="text-cyan-400 text-sm">💡</span>
            <p className="text-[11px] text-cyan-200/80 leading-relaxed">
              <strong>Zero Redundancy:</strong> Photos processed here are stored in the SHA-256 disk cache. Changing card templates later will reuse existing processed photos instantly without recomputing background removal.
            </p>
          </div>
        </div>
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
          Import Data (Excel / CSV) →
        </button>
      </div>
    </div>
  );
}
