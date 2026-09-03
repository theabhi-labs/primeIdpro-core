import React, { useState, useRef, useEffect } from 'react';
import api, { restore4kEnhance } from '../../services/api';
import {
  X,
  RotateCw,
  FlipHorizontal,
  FlipVertical,
  Sun,
  Contrast,
  Save,
  Trash2,
  RefreshCw,
  Palette,
  Settings2,
  Sparkles,
  Wand2,
  Sliders,
  SplitSquareVertical,
  CheckCircle2,
  Loader2,
  Zap,
} from 'lucide-react';

const PhotoEditor = ({ photo, onSave, onClose, onDelete }) => {
  const [brightness, setBrightness] = useState(100);
  const [contrast, setContrast] = useState(100);
  const [rotation, setRotation] = useState(0);
  const [flipX, setFlipX] = useState(false);
  const [flipY, setFlipY] = useState(false);

  // AI Background Replacement - default to photo's current bgColor or passport blue
  const initialBg = photo?.bgColor || '#3b82f6';
  const [replaceBg, setReplaceBg] = useState(Boolean(photo?.bgColor));
  const [bgReplaceColor, setBgReplaceColor] = useState(initialBg);


  // AI 4K Restoration Tuning State
  const [clarityBoost, setClarityBoost] = useState(1.45);
  const [denoiseLevel, setDenoiseLevel] = useState(0.65);
  const [colorVibrance, setColorVibrance] = useState(1.15);
  const [autoDeage, setAutoDeage] = useState(true);
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [compareSplit, setCompareSplit] = useState(50); // 0 - 100% split slider
  const [showCompare, setShowCompare] = useState(false);

  const canvasRef = useRef(null);
  const imgRef = useRef(null);
  const origImgRef = useRef(null);
  const [isSaving, setIsSaving] = useState(false);

  // Load transparent processed asset
  useEffect(() => {
    const src = photo?.transparentUrl || photo?.processedUrl;
    if (!src) return;
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.src = src;
    img.onload = () => {
      imgRef.current = img;
      drawPreview();
    };

    // Load original preview for before/after comparison
    if (photo?.preview || photo?.originalUrl) {
      const orig = new Image();
      orig.crossOrigin = 'Anonymous';
      orig.src = photo.preview || photo.originalUrl;
      orig.onload = () => {
        origImgRef.current = orig;
      };
    }
  }, [photo]);

  useEffect(() => {
    if (imgRef.current) drawPreview();
  }, [brightness, contrast, rotation, flipX, flipY, replaceBg, bgReplaceColor, showCompare, compareSplit]);

  const drawPreview = () => {
    if (!canvasRef.current || !imgRef.current) return;
    const img = imgRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    canvas.width = 500;
    canvas.height = 500;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // If Before/After split comparison is enabled
    if (showCompare && origImgRef.current) {
      const orig = origImgRef.current;
      const splitX = (compareSplit / 100) * canvas.width;

      // 1. Draw Original Left Side
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, splitX, canvas.height);
      ctx.clip();
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const scaleOrig = Math.min(canvas.width / orig.width, canvas.height / orig.height);
      const wOrig = orig.width * scaleOrig;
      const hOrig = orig.height * scaleOrig;
      ctx.drawImage(orig, (canvas.width - wOrig) / 2, (canvas.height - hOrig) / 2, wOrig, hOrig);

      // Label Original
      ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
      ctx.fillRect(10, 10, 80, 24);
      ctx.fillStyle = '#f87171';
      ctx.font = 'bold 11px sans-serif';
      ctx.fillText('BEFORE', 24, 26);
      ctx.restore();

      // 2. Draw Enhanced Right Side
      ctx.save();
      ctx.beginPath();
      ctx.rect(splitX, 0, canvas.width - splitX, canvas.height);
      ctx.clip();

      ctx.fillStyle = replaceBg ? bgReplaceColor : '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate((rotation * Math.PI) / 180);
      ctx.scale(flipX ? -1 : 1, flipY ? -1 : 1);

      const scale = Math.min(canvas.width / img.width, canvas.height / img.height);
      const w = img.width * scale;
      const h = img.height * scale;
      ctx.filter = `brightness(${brightness}%) contrast(${contrast}%)`;
      ctx.drawImage(img, -w / 2, -h / 2, w, h);

      ctx.restore();

      // Label Enhanced
      ctx.save();
      ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
      ctx.fillRect(canvas.width - 90, 10, 80, 24);
      ctx.fillStyle = '#22d3ee';
      ctx.font = 'bold 11px sans-serif';
      ctx.fillText('✨ 4K AI', canvas.width - 78, 26);
      ctx.restore();

      // Draw Split Line
      ctx.strokeStyle = '#22d3ee';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(splitX, 0);
      ctx.lineTo(splitX, canvas.height);
      ctx.stroke();

      return;
    }

    // Normal Single View
    ctx.fillStyle = replaceBg ? bgReplaceColor : '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.scale(flipX ? -1 : 1, flipY ? -1 : 1);

    const scale = Math.min(canvas.width / img.width, canvas.height / img.height);
    const w = img.width * scale;
    const h = img.height * scale;
    ctx.filter = `brightness(${brightness}%) contrast(${contrast}%)`;
    ctx.drawImage(img, -w / 2, -h / 2, w, h);
    ctx.restore();
  };

  // Run Real-time 4K AI Restoration
  const handleApply4kRestoration = async () => {
    const targetId = photo?.serverId || photo?.id;
    if (!targetId) return;

    setIsEnhancing(true);
    try {
      const res = await restore4kEnhance(targetId, {
        bgColor: replaceBg ? bgReplaceColor : '#FFFFFF',
        clarityBoost,
        denoiseLevel,
        colorVibrance,
        autoDeage,
      });

      if (res?.data?.processed_url) {
        // Reload transparent/processed asset
        const newImg = new Image();
        newImg.crossOrigin = 'Anonymous';
        newImg.src = res.data.processed_url;
        newImg.onload = () => {
          imgRef.current = newImg;
          drawPreview();
        };
      }
    } catch (err) {
      console.error('Failed to apply 4K restoration:', err);
    } finally {
      setIsEnhancing(false);
    }
  };

  const handleSave = async () => {
    if (isSaving || !imgRef.current) return;
    setIsSaving(true);
    try {
      const targetId = photo?.serverId || photo?.id;
      if (replaceBg && targetId) {
        const form = new FormData();
        form.append('bg_color', bgReplaceColor);
        await api.post(`/process/recolor/${targetId}`, form);
      }

      const img = imgRef.current;
      let w = img.width;
      let h = img.height;
      const maxDim = 600;
      if (w > maxDim || h > maxDim) {
        const scale = maxDim / Math.max(w, h);
        w = Math.floor(w * scale);
        h = Math.floor(h * scale);
      }
      const offCanvas = document.createElement('canvas');
      offCanvas.width = w;
      offCanvas.height = h;
      const offCtx = offCanvas.getContext('2d');
      offCtx.fillStyle = replaceBg ? bgReplaceColor : '#ffffff';
      offCtx.fillRect(0, 0, w, h);
      offCtx.filter = `brightness(${brightness}%) contrast(${contrast}%)`;
      offCtx.drawImage(img, 0, 0, w, h);

      offCanvas.toBlob(
        (blob) => {
          if (!blob) {
            setIsSaving(false);
            return;
          }
          const reader = new FileReader();
          reader.onloadend = () => {
            const dataUrl = reader.result;
            if (dataUrl && dataUrl.startsWith('data:image/jpeg;base64,')) {
              onSave({ ...photo, editedImage: dataUrl, bgColor: replaceBg ? bgReplaceColor : null });
            }
            setIsSaving(false);
          };
          reader.readAsDataURL(blob);
        },
        'image/jpeg',
        0.95
      );
    } catch (err) {
      console.error('Save failed:', err);
      setIsSaving(false);
    }
  };

  const resetEdits = () => {
    setBrightness(100);
    setContrast(100);
    setRotation(0);
    setFlipX(false);
    setFlipY(false);
    setReplaceBg(false);
    setBgReplaceColor('#ffffff');
    setClarityBoost(1.45);
    setDenoiseLevel(0.65);
    setColorVibrance(1.15);
    setShowCompare(false);
  };

  return (
    <div className="fixed inset-0 bg-[#020617]/95 backdrop-blur-md z-50 flex items-center justify-center p-4 select-none animate-fade-in">
      <div className="bg-[#0f172a] border border-slate-800 rounded-3xl max-w-5xl w-full max-h-[92vh] overflow-hidden shadow-2xl flex flex-col md:flex-row">
        {/* Left Side: Live Preview & Before/After Comparison */}
        <div className="flex-1 bg-slate-950/60 p-6 flex flex-col items-center justify-center relative border-b md:border-b-0 md:border-r border-slate-800">
          <div className="absolute top-5 left-6 flex items-center gap-2">
            <Sparkles className="text-cyan-400 w-4 h-4" />
            <span className="text-xs font-bold tracking-widest text-slate-400 uppercase">
              {showCompare ? 'Interactive Before/After Split' : '300 DPI Studio Output'}
            </span>
          </div>

          {/* Before/After Toggle Button */}
          {origImgRef.current && (
            <div className="absolute top-4 right-6">
              <button
                type="button"
                onClick={() => setShowCompare(!showCompare)}
                className={`px-3 py-1.5 rounded-xl font-bold text-xs flex items-center gap-1.5 transition-all border ${
                  showCompare
                    ? 'bg-cyan-500 text-slate-950 border-cyan-400 shadow-md shadow-cyan-500/20'
                    : 'bg-slate-900 text-slate-300 border-slate-700 hover:text-white'
                }`}
              >
                <SplitSquareVertical size={14} />
                <span>{showCompare ? 'Exit Split View' : 'Compare Before / After'}</span>
              </button>
            </div>
          )}

          {/* Canvas Viewport */}
          <div className="relative group my-auto">
            <div className="absolute -inset-4 bg-cyan-500/10 rounded-3xl blur-xl opacity-0 group-hover:opacity-100 transition duration-700"></div>
            <canvas
              ref={canvasRef}
              className="relative z-10 max-w-full rounded-2xl shadow-2xl border border-slate-700/80 cursor-ew-resize"
            />
          </div>

          {/* Split Slider Bar (when comparing) */}
          {showCompare && (
            <div className="w-full max-w-sm mt-3 px-4 py-2 bg-slate-900/90 rounded-2xl border border-slate-800 flex items-center gap-3">
              <span className="text-[11px] font-bold text-rose-400">Before</span>
              <input
                type="range"
                min="0"
                max="100"
                value={compareSplit}
                onChange={(e) => setCompareSplit(+e.target.value)}
                className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-ew-resize accent-cyan-400"
              />
              <span className="text-[11px] font-bold text-cyan-400">4K After</span>
            </div>
          )}

          {/* Transform Toolbar */}
          <div className="mt-4 flex gap-2">
            <button
              onClick={() => setRotation((r) => (r + 90) % 360)}
              title="Rotate 90°"
              className="p-2.5 bg-slate-900/80 hover:bg-cyan-500 hover:text-slate-950 rounded-xl transition-all text-slate-400 border border-slate-800"
            >
              <RotateCw size={17} />
            </button>
            <button
              onClick={() => setFlipX(!flipX)}
              title="Flip Horizontal"
              className="p-2.5 bg-slate-900/80 hover:bg-cyan-500 hover:text-slate-950 rounded-xl transition-all text-slate-400 border border-slate-800"
            >
              <FlipHorizontal size={17} />
            </button>
            <button
              onClick={() => setFlipY(!flipY)}
              title="Flip Vertical"
              className="p-2.5 bg-slate-900/80 hover:bg-cyan-500 hover:text-slate-950 rounded-xl transition-all text-slate-400 border border-slate-800"
            >
              <FlipVertical size={17} />
            </button>
            <button
              onClick={resetEdits}
              title="Reset All Adjustments"
              className="p-2.5 bg-slate-900/80 hover:bg-rose-500 hover:text-white rounded-xl transition-all text-slate-400 border border-slate-800"
            >
              <RefreshCw size={17} />
            </button>
          </div>
        </div>

        {/* Right Side: 4K AI Restoration & Fine Tune Controls */}
        <div className="w-full md:w-[400px] p-6 flex flex-col bg-[#0f172a] overflow-y-auto max-h-[92vh]">
          <div className="flex justify-between items-center mb-6">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
                <Wand2 size={18} />
              </div>
              <div>
                <h3 className="text-base font-extrabold text-white tracking-wide">4K AI Restoration</h3>
                <p className="text-[10px] text-slate-400">Vintage De-Aging & Super-Clarity</p>
              </div>
            </div>
            <button onClick={onClose} className="p-1.5 hover:bg-slate-800 rounded-xl text-slate-400 transition-colors">
              <X size={20} />
            </button>
          </div>

          <div className="space-y-5 flex-1 pr-1 text-xs">
            {/* 1-Click 4K Restoration Action */}
            <div className="p-4 rounded-2xl bg-gradient-to-r from-cyan-950/40 via-slate-900 to-blue-950/40 border border-cyan-500/40 space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-extrabold text-cyan-300 flex items-center gap-1.5">
                  <Sparkles size={14} />
                  AI 4K Super-Resolution
                </span>
                <span className="px-2 py-0.5 rounded bg-cyan-500 text-slate-950 font-black text-[9px]">4K CLARITY</span>
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Removes paper scratches, grain noise, and yellow vintage hues while boosting eye and hair sharpness.
              </p>
              <button
                type="button"
                onClick={handleApply4kRestoration}
                disabled={isEnhancing}
                className="w-full py-2.5 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-extrabold rounded-xl shadow-md transition-all flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
              >
                {isEnhancing ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
                <span>{isEnhancing ? 'Restoring in 4K...' : '⚡ Re-Apply 4K Super-Enhance'}</span>
              </button>
            </div>

            {/* AI Restoration Sliders */}
            <div className="space-y-4 p-4 bg-slate-900/70 border border-slate-800 rounded-2xl">
              <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block">
                Restoration Sliders
              </label>

              {/* Clarity Boost */}
              <div className="space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-slate-300 font-semibold">🔍 4K Clarity & Sharpness</span>
                  <span className="font-mono text-cyan-400 font-bold">{Math.round(clarityBoost * 100)}%</span>
                </div>
                <input
                  type="range"
                  min="1.0"
                  max="2.0"
                  step="0.05"
                  value={clarityBoost}
                  onChange={(e) => setClarityBoost(+e.target.value)}
                  className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-500"
                />
              </div>

              {/* Denoise */}
              <div className="space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-slate-300 font-semibold">🧼 Grain & Scratch Denoise</span>
                  <span className="font-mono text-cyan-400 font-bold">{Math.round(denoiseLevel * 100)}%</span>
                </div>
                <input
                  type="range"
                  min="0.1"
                  max="1.0"
                  step="0.05"
                  value={denoiseLevel}
                  onChange={(e) => setDenoiseLevel(+e.target.value)}
                  className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-500"
                />
              </div>

              {/* Vibrance */}
              <div className="space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-slate-300 font-semibold">🎨 Vintage Color Vibrancy</span>
                  <span className="font-mono text-cyan-400 font-bold">{Math.round(colorVibrance * 100)}%</span>
                </div>
                <input
                  type="range"
                  min="1.0"
                  max="1.5"
                  step="0.05"
                  value={colorVibrance}
                  onChange={(e) => setColorVibrance(+e.target.value)}
                  className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-500"
                />
              </div>
            </div>

            {/* Studio Background Color Palette */}
            <div className="space-y-3 p-4 bg-slate-900/70 border border-slate-800 rounded-2xl">
              <div className="flex items-center justify-between">
                <span className="text-slate-300 font-bold flex items-center gap-1.5">
                  <Palette size={14} className="text-cyan-400" />
                  Background Studio Color
                </span>
                <input
                  type="checkbox"
                  checked={replaceBg}
                  onChange={(e) => setReplaceBg(e.target.checked)}
                  className="w-4 h-4 accent-cyan-500 rounded cursor-pointer"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                {['#FFFFFF', '#3b82f6', '#38bdf8', '#e2e8f0', '#ef4444', '#10b981'].map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => {
                      setBgReplaceColor(c);
                      setReplaceBg(true);
                    }}
                    style={{ backgroundColor: c }}
                    className={`w-7 h-7 rounded-lg border transition-all ${
                      bgReplaceColor.toLowerCase() === c.toLowerCase() && replaceBg
                        ? 'border-cyan-400 scale-110 shadow-md ring-2 ring-cyan-500/40'
                        : 'border-slate-700 hover:scale-105'
                    }`}
                  />
                ))}
                <input
                  type="color"
                  value={bgReplaceColor}
                  onChange={(e) => {
                    setBgReplaceColor(e.target.value);
                    setReplaceBg(true);
                  }}
                  className="w-7 h-7 rounded-lg cursor-pointer bg-transparent border border-slate-700 overflow-hidden"
                  title="Custom Color"
                />
              </div>
            </div>

            {/* Basic Exposure Adjustments */}
            <div className="space-y-3 p-4 bg-slate-900/50 border border-slate-800/80 rounded-2xl">
              <div className="space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-slate-400 font-medium flex items-center gap-1.5">
                    <Sun size={13} /> Brightness
                  </span>
                  <span className="font-mono text-slate-400">{brightness}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="200"
                  value={brightness}
                  onChange={(e) => setBrightness(+e.target.value)}
                  className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-500"
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-slate-400 font-medium flex items-center gap-1.5">
                    <Contrast size={13} /> Contrast
                  </span>
                  <span className="font-mono text-slate-400">{contrast}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="200"
                  value={contrast}
                  onChange={(e) => setContrast(+e.target.value)}
                  className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-500"
                />
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="mt-4 pt-4 border-t border-slate-800 space-y-2">
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="w-full py-3 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-extrabold rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-cyan-900/20 transition-all active:scale-[0.98] disabled:opacity-50 text-xs cursor-pointer"
            >
              <Save size={15} />
              <span>{isSaving ? 'Saving Master Asset...' : 'Save 4K Master Asset'}</span>
            </button>

            <button
              onClick={() => onDelete(photo.id)}
              className="w-full py-2.5 bg-slate-900 text-rose-400 hover:bg-rose-950/40 rounded-xl font-bold flex items-center justify-center gap-2 border border-slate-800 text-xs transition-all cursor-pointer"
            >
              <Trash2 size={14} />
              <span>Delete Asset</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PhotoEditor;