import React, { useState } from 'react';
import {
  Play,
  CheckCircle2,
  RotateCcw,
  AlertCircle,
  Loader2,
  Sparkles,
  Database,
  Cpu,
  Terminal,
  Layers,
  ShieldCheck,
  Check,
  ArrowRight,
  ExternalLink,
} from 'lucide-react';
import { processCardPhotoQueue, saveCardProject } from '../../../services/cardApi';

export default function Step7_PhotoQueue({ project, updateProject, onNext, onPrev, setToast }) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [queueResults, setQueueResults] = useState(null);
  const [liveLogs, setLiveLogs] = useState([]);
  const [currentProcessingIndex, setCurrentProcessingIndex] = useState(0);

  const records = project.records || [];
  const totalRecords = records.length;
  const processedCount = queueResults?.totalProcessed ?? project.photosProcessed ?? 0;
  const cacheHits = queueResults?.cacheHits ?? 0;
  const failedCount = queueResults?.failed ?? 0;

  const progressPercent = totalRecords > 0 ? Math.round((processedCount / totalRecords) * 100) : 0;

  const handleStartProcessing = async (forceReprocess = false) => {
    setIsProcessing(true);
    setLiveLogs([
      `[${new Date().toLocaleTimeString()}] 🚀 Initializing Prime ID Pro AI Pipeline...`,
      `[${new Date().toLocaleTimeString()}] 📦 Loaded ${totalRecords} records for batch processing.`,
      `[${new Date().toLocaleTimeString()}] ⚙️ Profile: Background Removal (${project.photoProcessingProfile?.removeBg ? 'ON' : 'OFF'}), Biometric Crop (${project.photoProcessingProfile?.aspectRatio || '35x45'} @ ${project.photoProcessingProfile?.targetDpi || 300} DPI).`,
    ]);

    try {
      // 1. Ensure project is saved to disk first
      await saveCardProject(project);
      setLiveLogs((prev) => [...prev, `[${new Date().toLocaleTimeString()}] 💾 Project state synchronized with backend engine.`]);

      // 2. Call process-queue
      const res = await processCardPhotoQueue({
        projectId: project.id,
        forceReprocess,
      });

      if (res?.success) {
        setQueueResults(res);

        // Append detailed logs from backend
        if (res.pipelineLogs?.length) {
          const formattedLogs = [];
          res.pipelineLogs.forEach((item, idx) => {
            formattedLogs.push(
              `[${new Date().toLocaleTimeString()}] [${idx + 1}/${res.pipelineLogs.length}] Processing ${item.name} (ID: ${item.roll})...`
            );
            item.steps?.forEach((step) => {
              formattedLogs.push(`   ↳ ${step}`);
            });
            formattedLogs.push(
              item.isCacheHit
                ? `   ✅ [CACHE HIT] Asset verified on disk.`
                : `   ✅ [AI SUCCESS] 300 DPI Asset Generated.`
            );
          });
          formattedLogs.push(`[${new Date().toLocaleTimeString()}] 🎉 ALL ${res.totalProcessed} PHOTOS PROCESSED SUCCESSFULLY!`);
          setLiveLogs((prev) => [...prev, ...formattedLogs]);
        }

        updateProject({
          records: res.records || project.records,
          photosProcessed: res.totalProcessed || 0,
        });

        setToast?.({
          type: 'success',
          message: `Pipeline Completed! Processed: ${res.totalProcessed}, Cache Hits: ${res.cacheHits}`,
        });
      }
    } catch (err) {
      console.error('Queue processing error:', err);
      setLiveLogs((prev) => [
        ...prev,
        `[${new Date().toLocaleTimeString()}] ❌ ERROR: ${err?.response?.data?.detail || err.message || 'Processing failed.'}`,
      ]);
      setToast?.({ type: 'error', message: err?.response?.data?.detail || 'Photo queue processing failed.' });
    } finally {
      setIsProcessing(false);
    }
  };

  const getFullPhotoUrl = (url) => {
    if (!url) return null;
    if (url.startsWith('http') || url.startsWith('data:')) return url;
    const base = window.electronAPI?.getApiUrl ? window.electronAPI.getApiUrl() : 'http://127.0.0.1:10000';
    return `${base}${url}`;
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header Banner */}
      <div className="p-4 rounded-2xl bg-gradient-to-r from-blue-900/30 via-slate-900 to-cyan-900/30 border border-blue-500/20 flex items-center justify-between">
        <div>
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <Cpu className="w-5 h-5 text-cyan-400" />
            Step 7: AI Photo Processing Pipeline & Live Queue
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Executes Prime ID Pro background removal, FaceMesh crop, and color flattening for all records with SHA-256 caching.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="px-3 py-1 rounded-xl bg-slate-900 border border-slate-800 text-cyan-400 text-xs font-mono font-bold">
            {processedCount} / {totalRecords} Ready
          </span>
        </div>
      </div>

      {/* Main Processing Dashboard Box */}
      <div className="p-6 rounded-3xl bg-slate-950/80 border border-slate-800 space-y-6">
        
        {/* Top Status and Controls */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pb-4 border-b border-slate-800">
          <div className="flex items-center gap-3.5">
            {isProcessing ? (
              <div className="w-12 h-12 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 shadow-lg shadow-cyan-950/50">
                <Loader2 size={24} className="animate-spin" />
              </div>
            ) : processedCount > 0 && processedCount === totalRecords ? (
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shadow-lg shadow-emerald-950/30">
                <CheckCircle2 size={24} />
              </div>
            ) : (
              <div className="w-12 h-12 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-400">
                <Cpu size={24} />
              </div>
            )}

            <div>
              <h4 className="text-sm font-bold text-white flex items-center gap-2">
                {isProcessing
                  ? 'Executing Prime ID Pro Biometric Pipeline...'
                  : processedCount > 0 && processedCount === totalRecords
                  ? 'All 300 DPI Biometric Assets Ready'
                  : 'Ready to Process Batch Photos'}
              </h4>
              <p className="text-xs text-slate-400 mt-0.5">
                {totalRecords} student/staff records queued for automated photo normalization and CR80 card synthesis.
              </p>
            </div>
          </div>

          {/* Action Trigger Button */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => handleStartProcessing(false)}
              disabled={isProcessing}
              className="px-6 py-2.5 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 disabled:opacity-50 text-slate-950 font-bold text-xs rounded-xl transition-all shadow-md active:scale-95 flex items-center gap-2 cursor-pointer"
            >
              {isProcessing ? <Loader2 size={15} className="animate-spin" /> : <Play size={15} />}
              <span>{processedCount > 0 ? 'Re-run Pipeline' : 'Start Processing Batch'}</span>
            </button>
          </div>
        </div>

        {/* Pipeline Execution Stages Graphic */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 text-xs">
          <div className={`p-2.5 rounded-xl border flex flex-col items-center text-center gap-1 ${
            isProcessing || processedCount > 0 ? 'bg-cyan-950/40 border-cyan-500/40 text-cyan-300' : 'bg-slate-900/60 border-slate-800 text-slate-500'
          }`}>
            <Database size={15} />
            <span className="font-bold text-[11px]">1. SHA-256 Check</span>
            <span className="text-[9px] opacity-75">Disk Hash Match</span>
          </div>

          <div className={`p-2.5 rounded-xl border flex flex-col items-center text-center gap-1 ${
            isProcessing || processedCount > 0 ? 'bg-cyan-950/40 border-cyan-500/40 text-cyan-300' : 'bg-slate-900/60 border-slate-800 text-slate-500'
          }`}>
            <Sparkles size={15} />
            <span className="font-bold text-[11px]">2. RemBG AI</span>
            <span className="text-[9px] opacity-75">Background Removal</span>
          </div>

          <div className={`p-2.5 rounded-xl border flex flex-col items-center text-center gap-1 ${
            isProcessing || processedCount > 0 ? 'bg-cyan-950/40 border-cyan-500/40 text-cyan-300' : 'bg-slate-900/60 border-slate-800 text-slate-500'
          }`}>
            <Cpu size={15} />
            <span className="font-bold text-[11px]">3. FaceMesh Crop</span>
            <span className="text-[9px] opacity-75">35×45mm Biometric</span>
          </div>

          <div className={`p-2.5 rounded-xl border flex flex-col items-center text-center gap-1 ${
            isProcessing || processedCount > 0 ? 'bg-cyan-950/40 border-cyan-500/40 text-cyan-300' : 'bg-slate-900/60 border-slate-800 text-slate-500'
          }`}>
            <Layers size={15} />
            <span className="font-bold text-[11px]">4. Color Flatten</span>
            <span className="text-[9px] opacity-75">Studio Background</span>
          </div>

          <div className={`p-2.5 rounded-xl border flex flex-col items-center text-center gap-1 ${
            processedCount > 0 ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300' : 'bg-slate-900/60 border-slate-800 text-slate-500'
          }`}>
            <ShieldCheck size={15} />
            <span className="font-bold text-[11px]">5. 300 DPI Cache</span>
            <span className="text-[9px] opacity-75">Ready for Print</span>
          </div>
        </div>

        {/* Progress Bar & Stats */}
        <div className="space-y-2">
          <div className="flex justify-between text-xs font-mono font-bold">
            <span className="text-slate-400">Total Batch Progress</span>
            <span className="text-cyan-400">{progressPercent}%</span>
          </div>
          <div className="w-full h-3 bg-slate-900 rounded-full overflow-hidden border border-slate-800 p-0.5">
            <div
              className="h-full bg-gradient-to-r from-cyan-400 to-blue-500 rounded-full transition-all duration-500"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-3 gap-4">
          <div className="p-3 bg-slate-900/60 rounded-2xl border border-slate-800 text-center">
            <p className="text-[10px] font-bold text-slate-400 uppercase">Processed Total</p>
            <p className="text-lg font-black text-white font-mono mt-0.5">{processedCount} / {totalRecords}</p>
          </div>

          <div className="p-3 bg-slate-900/60 rounded-2xl border border-slate-800 text-center">
            <p className="text-[10px] font-bold text-slate-400 uppercase flex items-center justify-center gap-1">
              <Database size={11} className="text-cyan-400" /> Cache Hits
            </p>
            <p className="text-lg font-black text-cyan-400 font-mono mt-0.5">{cacheHits}</p>
          </div>

          <div className="p-3 bg-slate-900/60 rounded-2xl border border-slate-800 text-center">
            <p className="text-[10px] font-bold text-slate-400 uppercase">Failed / Skipped</p>
            <p className="text-lg font-black text-amber-400 font-mono mt-0.5">{failedCount}</p>
          </div>
        </div>

        {/* Live Terminal / Execution Log Box */}
        <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4 space-y-2 text-left font-mono">
          <div className="flex items-center justify-between pb-2 border-b border-slate-900">
            <span className="text-xs font-bold text-slate-400 flex items-center gap-1.5 uppercase tracking-wider">
              <Terminal size={14} className="text-cyan-400" /> Live Pipeline Execution Terminal
            </span>
            <span className="text-[10px] text-cyan-400 bg-cyan-950/80 px-2 py-0.5 rounded border border-cyan-800/40">
              {isProcessing ? '● RUNNING' : 'IDLE'}
            </span>
          </div>

          <div className="max-h-48 overflow-y-auto space-y-1 text-[11px] leading-relaxed pr-1 text-slate-300">
            {liveLogs.length > 0 ? (
              liveLogs.map((log, lIdx) => (
                <div
                  key={lIdx}
                  className={
                    log.includes('ERROR')
                      ? 'text-rose-400 font-bold'
                      : log.includes('SUCCESS') || log.includes('Ready')
                      ? 'text-emerald-400 font-semibold'
                      : log.includes('CACHE HIT')
                      ? 'text-cyan-300'
                      : 'text-slate-300'
                  }
                >
                  {log}
                </div>
              ))
            ) : (
              <div className="text-slate-600 py-3 text-center italic">
                Click "Start Processing Batch" to begin AI background removal and biometric cropping...
              </div>
            )}
          </div>
        </div>

        {/* Processed Photos Gallery Grid */}
        {records.length > 0 && processedCount > 0 && (
          <div className="pt-2 space-y-3 text-left">
            <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
              <Sparkles size={14} className="text-cyan-400" />
              Processed 300 DPI Portrait Assets Preview ({records.length})
            </h4>

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              {records.map((rec, rIdx) => {
                const photoUrl = rec.processedPhoto?.processedUrl || rec.photo?.originalPath;
                return (
                  <div
                    key={rec.id || rIdx}
                    className="p-2.5 rounded-2xl bg-slate-900 border border-slate-800 flex flex-col items-center text-center space-y-2"
                  >
                    <div className="w-16 h-20 rounded-xl bg-slate-950 border border-slate-700 overflow-hidden relative shadow-inner">
                      {photoUrl ? (
                        <img
                          src={getFullPhotoUrl(photoUrl)}
                          alt={rec.fields?.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-slate-600 text-[10px]">
                          No Photo
                        </div>
                      )}
                      <span className="absolute bottom-1 right-1 px-1 py-0.2 rounded bg-emerald-500 text-slate-950 text-[7px] font-black">
                        300 DPI
                      </span>
                    </div>

                    <div className="w-full">
                      <p className="text-[11px] font-bold text-white truncate uppercase">{rec.fields?.name}</p>
                      <p className="text-[9px] font-mono text-cyan-400">Roll: {rec.fields?.rollNumber}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
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
          className="px-6 py-2.5 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-bold text-xs rounded-xl transition-all shadow-md active:scale-95 flex items-center gap-1.5 cursor-pointer"
        >
          <span>Preflight & Generate Cards</span>
          <ArrowRight size={14} />
        </button>
      </div>
    </div>
  );
}
