import React, { useState, useRef, useEffect } from 'react';
import api from '../../services/api';
import { X, RotateCw, FlipHorizontal, FlipVertical, Sun, Contrast, Save, Trash2, RefreshCw, Palette, Settings2, Sparkles } from 'lucide-react';

const PhotoEditor = ({ photo, onSave, onClose, onDelete }) => {
  const [brightness, setBrightness] = useState(100);
  const [contrast, setContrast] = useState(100);
  const [rotation, setRotation] = useState(0);
  const [flipX, setFlipX] = useState(false);
  const [flipY, setFlipY] = useState(false);
  const [replaceBg, setReplaceBg] = useState(false);
  const [bgReplaceColor, setBgReplaceColor] = useState('#3498db');
  const canvasRef = useRef(null);
  const imgRef = useRef(null);
  const [isSaving, setIsSaving] = useState(false);

  // FIX: load the TRANSPARENT asset (photo.transparentUrl), not the
  // already-white-flattened processedUrl. Without real transparency the
  // canvas can only ever draw a colored frame AROUND the old white photo
  // — it can never actually replace the background. transparentUrl comes
  // from the backend's new /processed/{id}_transparent.png output.
  useEffect(() => {
    const src = photo?.transparentUrl || photo?.processedUrl;
    if (!src) return;
    const img = new Image();
    img.crossOrigin = "Anonymous";
    img.src = src;
    img.onload = () => {
      imgRef.current = img;
      drawPreview();
    };
  }, [photo]);

  useEffect(() => {
    if (imgRef.current) drawPreview();
  }, [brightness, contrast, rotation, flipX, flipY, replaceBg, bgReplaceColor]);

  const drawPreview = () => {
    if (!canvasRef.current || !imgRef.current) return;
    const img = imgRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    canvas.width = 500;
    canvas.height = 500;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // FIX: always fill a background — either the chosen studio color, or
    // white as the sane default — BEFORE drawing the transparent subject.
    // Previously this fill only ran when replaceBg was true, and the
    // subject image (which already had white baked in) was drawn at 80%
    // scale on top, creating the "colored frame around a smaller white
    // photo" look. Now the fill is the ACTUAL background of the photo,
    // sized to fill the frame — no separate white layer underneath.
    ctx.fillStyle = replaceBg ? bgReplaceColor : '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate(rotation * Math.PI / 180);
    ctx.scale(flipX ? -1 : 1, flipY ? -1 : 1);
    // FIX: fill the frame (no artificial 0.8 shrink) — the transparent
    // asset is already correctly cropped/padded by the backend, so it
    // should occupy the full preview like the final output will.
    const scale = Math.min(canvas.width / img.width, canvas.height / img.height);
    const w = img.width * scale;
    const h = img.height * scale;
    ctx.filter = `brightness(${brightness}%) contrast(${contrast}%)`;
    ctx.drawImage(img, -w / 2, -h / 2, w, h);
    ctx.restore();
  };

  const handleSave = async () => {
    if (isSaving || !imgRef.current) return;
    setIsSaving(true);
    try {
      // FIX: if the background was changed, tell the backend so the
      // actual saved/print-ready file (processed_url) matches what the
      // user sees — not just this local canvas preview. This is a fast
      // recolor call (no face-detection rerun).
      if (replaceBg && photo?.id) {
        const form = new FormData();
        form.append('bg_color', bgReplaceColor);
        await api.post(`/process/recolor/${photo.id}`, form);
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

      offCanvas.toBlob((blob) => {
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
      }, 'image/jpeg', 0.9);
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
    setBgReplaceColor('#3498db');
  };

  return (
    <div className="fixed inset-0 bg-[#020617]/95 backdrop-blur-md z-50 flex items-center justify-center p-4">
      <div className="bg-[#0f172a] border border-slate-800 rounded-[2.5rem] max-w-5xl w-full max-h-[95vh] overflow-hidden shadow-2xl flex flex-col md:flex-row">

        {/* Left Side: Live Preview Area */}
        <div className="flex-1 bg-slate-950/50 p-8 flex flex-col items-center justify-center relative border-b md:border-b-0 md:border-r border-slate-800">
          <div className="absolute top-6 left-8 flex items-center gap-2">
            <Sparkles className="text-cyan-400 w-5 h-5" />
            <span className="text-xs font-bold tracking-widest text-slate-500 uppercase">AI Studio Preview</span>
          </div>

          <div className="relative group">
            <div className="absolute -inset-4 bg-cyan-500/10 rounded-[2rem] blur-xl opacity-0 group-hover:opacity-100 transition duration-700"></div>
            <canvas
              ref={canvasRef}
              className="relative z-10 max-w-full rounded-2xl shadow-[0_0_50px_-12px_rgba(0,0,0,0.5)] border border-slate-700/50"
            />
          </div>

          <div className="mt-8 flex gap-3">
             <button onClick={() => setRotation(r => (r+90)%360)} className="p-3 bg-slate-800/50 hover:bg-cyan-500 hover:text-white rounded-xl transition-all text-slate-400 border border-slate-700/50"><RotateCw size={20}/></button>
             <button onClick={() => setFlipX(!flipX)} className="p-3 bg-slate-800/50 hover:bg-cyan-500 hover:text-white rounded-xl transition-all text-slate-400 border border-slate-700/50"><FlipHorizontal size={20}/></button>
             <button onClick={() => setFlipY(!flipY)} className="p-3 bg-slate-800/50 hover:bg-cyan-500 hover:text-white rounded-xl transition-all text-slate-400 border border-slate-700/50"><FlipVertical size={20}/></button>
             <button onClick={resetEdits} className="p-3 bg-slate-800/50 hover:bg-red-500 hover:text-white rounded-xl transition-all text-slate-400 border border-slate-700/50"><RefreshCw size={20}/></button>
          </div>
        </div>

        {/* Right Side: Control Panel */}
        <div className="w-full md:w-[380px] p-8 flex flex-col bg-[#0f172a]">
          <div className="flex justify-between items-center mb-8">
            <h3 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
              <Settings2 className="text-cyan-400" size={20}/> Fine Tune
            </h3>
            <button onClick={onClose} className="p-2 hover:bg-slate-800 rounded-full text-slate-400 transition-colors"><X size={24}/></button>
          </div>

          <div className="space-y-8 flex-1 overflow-y-auto custom-scrollbar pr-2">

            {/* AI Background Tool */}
            <div className="space-y-4">
               <label className="flex items-center justify-between p-4 bg-slate-900 border border-slate-800 rounded-2xl cursor-pointer group hover:border-cyan-500/50 transition-all">
                  <div className="flex items-center gap-3">
                    <Palette className="text-cyan-400" size={18}/>
                    <span className="text-sm font-medium text-slate-200 tracking-wide">Replace Background</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={replaceBg}
                    onChange={e => setReplaceBg(e.target.checked)}
                    className="w-5 h-5 accent-cyan-500"
                  />
               </label>

               {replaceBg && (
                 <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl animate-in fade-in slide-in-from-top-2">
                    <label className="text-[10px] uppercase font-bold text-slate-500 tracking-widest mb-3 block">Studio Color Palette</label>
                    <div className="flex items-center gap-4">
                      <input
                        type="color"
                        value={bgReplaceColor}
                        onChange={e => setBgReplaceColor(e.target.value)}
                        className="w-12 h-12 rounded-xl cursor-pointer bg-transparent border-none overflow-hidden"
                      />
                      <span className="text-xs font-mono text-slate-400 uppercase">{bgReplaceColor}</span>
                    </div>
                 </div>
               )}
            </div>

            {/* Adjustment Sliders */}
            <div className="space-y-6">
              <div className="space-y-3">
                <div className="flex justify-between">
                  <label className="text-xs font-bold text-slate-500 uppercase flex items-center gap-2"><Sun size={14}/> Brightness</label>
                  <span className="text-xs font-mono text-cyan-400">{brightness}%</span>
                </div>
                <input type="range" min="0" max="200" value={brightness} onChange={e => setBrightness(+e.target.value)} className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-500" />
              </div>

              <div className="space-y-3">
                <div className="flex justify-between">
                  <label className="text-xs font-bold text-slate-500 uppercase flex items-center gap-2"><Contrast size={14}/> Contrast</label>
                  <span className="text-xs font-mono text-cyan-400">{contrast}%</span>
                </div>
                <input type="range" min="0" max="200" value={contrast} onChange={e => setContrast(+e.target.value)} className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-500" />
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="mt-8 pt-6 border-t border-slate-800 space-y-3">
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="w-full py-4 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white rounded-2xl font-bold flex items-center justify-center gap-2 shadow-lg shadow-cyan-900/20 transition-all active:scale-[0.98] disabled:opacity-50"
            >
              <Save size={18}/> {isSaving ? 'Processing...' : 'Save AI Enhancement'}
            </button>

            <button
              onClick={() => onDelete(photo.id)}
              className="w-full py-4 bg-slate-900 text-red-400 hover:bg-red-500/10 rounded-2xl font-bold flex items-center justify-center gap-2 border border-slate-800 transition-all"
            >
              <Trash2 size={18}/> Delete Asset
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PhotoEditor;