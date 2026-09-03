import React, { useState, useEffect } from 'react';
import { ShieldCheck, AlertTriangle, XCircle, Printer, Download, Eye, RefreshCw, FileText, CheckCircle2, Loader2, Sparkles, ZoomIn, ZoomOut, Maximize2, Coins } from 'lucide-react';
import { validateCardProject, renderCardPreviewHtml, generateCardPdfBlob } from '../../../services/cardApi';
import { useCredits } from '../../../context/CreditContext';

export default function Step8_PreflightAndGenerate({ project, updateProject, onPrev, setToast }) {
  const { consumeCredits } = useCredits();
  const [isValidating, setIsValidating] = useState(false);

  const [preflightSummary, setPreflightSummary] = useState(null);
  const [previewSide, setPreviewSide] = useState('front');
  const [previewHtml, setPreviewHtml] = useState('');
  const [selectedRecordIndex, setSelectedRecordIndex] = useState(0);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [zoom, setZoom] = useState(1.35); // 135% comfortable default zoom

  const [outputFormat, setOutputFormat] = useState('pvc'); // pvc or a4_pdf
  const [cutMarks, setCutMarks] = useState(true);
  const [duplex, setDuplex] = useState(true);


  // Run Preflight Validation on mount
  useEffect(() => {
    const runValidation = async () => {
      setIsValidating(true);
      try {
        const summary = await validateCardProject(project.id);
        setPreflightSummary(summary);
      } catch (err) {
        console.error('Validation error:', err);
      } finally {
        setIsValidating(false);
      }
    };
    if (project.id) runValidation();
  }, [project.id]);

  // Load Preview HTML for selected record & side
  useEffect(() => {
    const loadPreview = async () => {
      if (!project.records?.length) return;
      const rec = project.records[selectedRecordIndex] || project.records[0];
      try {
        const html = await renderCardPreviewHtml({
          projectId: project.id,
          recordId: rec.id,
          side: previewSide,
        });
        setPreviewHtml(html);
      } catch (err) {
        console.error('Preview error:', err);
      }
    };
    loadPreview();
  }, [project.id, selectedRecordIndex, previewSide, project.records]);

  // Download PDF Handler
  const handleDownloadPdf = async () => {
    const cardCount = records.length || 1;
    const allowed = await consumeCredits({
      type: 'card',
      count: cardCount,
      description: `Card Studio 300 DPI PDF (${cardCount} ID Card${cardCount > 1 ? 's' : ''})`,
    });
    if (!allowed) return;

    setIsGeneratingPdf(true);
    try {
      const payload = {
        projectId: project.id,
        outputFormat,
        paperSize: 'A4',
        duplex,
        cutMarks,
      };
      const blob = await generateCardPdfBlob(payload);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Cards_${project.name?.replace(/\s+/g, '_') || 'Batch'}_300DPI.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      setToast?.({ type: 'success', message: `✅ 300 DPI PDF downloaded successfully! (-${cardCount * 5} Credits)` });
    } catch (err) {
      console.error('PDF error:', err);
      setToast?.({ type: 'error', message: 'Failed to generate PDF.' });
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  // Print via Native Electron Printing
  const handleNativePrint = async () => {
    if (!previewHtml) return;
    const cardCount = records.length || 1;
    const allowed = await consumeCredits({
      type: 'card',
      count: cardCount,
      description: `Card Studio Native Print (${cardCount} ID Card${cardCount > 1 ? 's' : ''})`,
    });
    if (!allowed) return;

    try {
      if (window.electronAPI?.printSheet) {
        const res = await window.electronAPI.printSheet(previewHtml, {
          orientation: 'Portrait',
          paperSize: outputFormat === 'pvc' ? 'CR80' : 'A4',
        });
        if (res?.success) {
          setToast?.({ type: 'success', message: `Sent batch to native Windows printer. (-${cardCount * 5} Credits)` });
        } else {
          setToast?.({ type: 'info', message: 'Print preview opened.' });
        }
      } else {
        // Browser fallback
        const iframe = document.createElement('iframe');
        iframe.style.position = 'absolute';
        iframe.style.width = '0';
        iframe.style.height = '0';
        document.body.appendChild(iframe);
        iframe.contentWindow.document.open();
        iframe.contentWindow.document.write(previewHtml);
        iframe.contentWindow.document.close();
        iframe.contentWindow.focus();
        iframe.contentWindow.print();
        setTimeout(() => document.body.removeChild(iframe), 1000);
      }
    } catch (err) {
      console.error('Print error:', err);
      setToast?.({ type: 'error', message: 'Failed to trigger printing.' });
    }
  };


  const records = project.records || [];
  const currentRecord = records[selectedRecordIndex] || records[0];

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header Banner */}
      <div className="p-4 rounded-2xl bg-gradient-to-r from-blue-900/30 via-slate-900 to-cyan-900/30 border border-blue-500/20 flex items-center justify-between">
        <div>
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-cyan-400" />
            Step 8: Preflight Validation & Live Production Output
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Verify layout design, check for missing fields or photos, and generate 300 DPI print-ready PDFs or print directly.
          </p>
        </div>
      </div>

      {/* Preflight Summary Banner */}
      {preflightSummary && (
        <div className={`p-4 rounded-2xl border flex items-center justify-between ${
          preflightSummary.canGenerate
            ? 'bg-emerald-950/30 border-emerald-500/30 text-emerald-300'
            : 'bg-amber-950/30 border-amber-500/30 text-amber-300'
        }`}>
          <div className="flex items-center gap-3">
            {preflightSummary.canGenerate ? (
              <div className="p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
                <CheckCircle2 size={20} />
              </div>
            ) : (
              <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400">
                <AlertTriangle size={20} />
              </div>
            )}
            <div>
              <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                {preflightSummary.canGenerate ? 'Preflight Passed: Ready for Production' : 'Preflight Warnings Detected'}
              </h4>
              <p className="text-xs text-slate-400">
                Valid: {preflightSummary.validRecords} • Warnings: {preflightSummary.warningRecords} • Errors: {preflightSummary.errorRecords}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Main Workspace: Left Side Preview / Right Side Output Controls */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Side (Col 7): Live Card Preview */}
        <div className="lg:col-span-7 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
              <Eye size={14} className="text-cyan-400" /> Interactive Card Preview
            </h4>

            <div className="flex items-center gap-2">
              {/* Zoom Controls */}
              <div className="flex items-center gap-1 bg-slate-900 px-2 py-0.5 rounded-lg border border-slate-800 text-xs">
                <button
                  type="button"
                  onClick={() => setZoom(prev => Math.max(0.8, Number((prev - 0.15).toFixed(2))))}
                  className="p-1 text-slate-400 hover:text-white rounded hover:bg-slate-800"
                  title="Zoom Out"
                >
                  <ZoomOut size={13} />
                </button>
                <span className="text-[11px] font-mono font-bold text-cyan-400 px-1 min-w-[38px] text-center">
                  {Math.round(zoom * 100)}%
                </span>
                <button
                  type="button"
                  onClick={() => setZoom(prev => Math.min(2.2, Number((prev + 0.15).toFixed(2))))}
                  className="p-1 text-slate-400 hover:text-white rounded hover:bg-slate-800"
                  title="Zoom In"
                >
                  <ZoomIn size={13} />
                </button>
                <button
                  type="button"
                  onClick={() => setZoom(1.35)}
                  className="p-1 text-slate-500 hover:text-cyan-400 rounded hover:bg-slate-800 ml-1"
                  title="Reset Zoom"
                >
                  <Maximize2 size={12} />
                </button>
              </div>

              {/* Front / Back Toggle Buttons */}
              <div className="flex rounded-lg bg-slate-900 p-0.5 border border-slate-800">
                <button
                  type="button"
                  onClick={() => setPreviewSide('front')}
                  className={`px-3 py-1 rounded-md text-xs font-bold transition-all ${
                    previewSide === 'front'
                      ? 'bg-cyan-500 text-slate-950 shadow'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Front Side
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewSide('back')}
                  className={`px-3 py-1 rounded-md text-xs font-bold transition-all ${
                    previewSide === 'back'
                      ? 'bg-cyan-500 text-slate-950 shadow'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Back Side
                </button>
              </div>
            </div>
          </div>

          {/* Rendered HTML Iframe Preview Frame */}
          <div className="w-full h-[470px] rounded-2xl bg-gradient-to-b from-slate-950 via-slate-900/60 to-slate-950 border border-slate-800 overflow-hidden flex items-center justify-center p-4 shadow-2xl relative">
            {previewHtml ? (
              <div
                style={{
                  transform: `scale(${zoom})`,
                  transformOrigin: 'center center',
                  transition: 'transform 0.15s ease-out',
                }}
                className="w-full h-full flex items-center justify-center pointer-events-auto"
              >
                <iframe
                  srcDoc={previewHtml}
                  title="Card Preview"
                  className="w-full h-full border-none pointer-events-auto rounded-xl"
                />
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2 text-slate-500">
                <Loader2 size={24} className="animate-spin text-cyan-400" />
                <span className="text-xs">Rendering 300 DPI preview...</span>
              </div>
            )}
          </div>


          {/* Record Switcher */}
          {records.length > 1 && (
            <div className="flex items-center justify-between p-2.5 bg-slate-950/70 border border-slate-800 rounded-xl text-xs">
              <span className="text-slate-400">
                Previewing Card <strong>{selectedRecordIndex + 1}</strong> of {records.length}:{' '}
                <span className="text-cyan-400 font-bold">{currentRecord?.fields?.name || 'Student'}</span>
              </span>

              <div className="flex gap-1.5">
                <button
                  type="button"
                  disabled={selectedRecordIndex <= 0}
                  onClick={() => setSelectedRecordIndex(prev => Math.max(0, prev - 1))}
                  className="px-2.5 py-1 bg-slate-900 hover:bg-slate-800 disabled:opacity-40 text-slate-300 rounded border border-slate-800 font-bold"
                >
                  ◀ Prev
                </button>
                <button
                  type="button"
                  disabled={selectedRecordIndex >= records.length - 1}
                  onClick={() => setSelectedRecordIndex(prev => Math.min(records.length - 1, prev + 1))}
                  className="px-2.5 py-1 bg-slate-900 hover:bg-slate-800 disabled:opacity-40 text-slate-300 rounded border border-slate-800 font-bold"
                >
                  Next ▶
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Right Side (Col 5): Production Output Options */}
        <div className="lg:col-span-5 space-y-4">
          <div className="p-5 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-4">
            <h4 className="text-xs font-bold text-white uppercase tracking-wider pb-2 border-b border-slate-800">
              Output Configuration
            </h4>

            {/* Output Format Picker */}
            <div className="space-y-2">
              <label className="text-[11px] font-semibold text-slate-400">Layout Format</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setOutputFormat('pvc')}
                  className={`p-3 rounded-xl border text-left transition-all ${
                    outputFormat === 'pvc'
                      ? 'bg-cyan-500/10 border-cyan-500 text-cyan-300 ring-1 ring-cyan-500/40'
                      : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  <p className="text-xs font-bold">PVC CR80 Card</p>
                  <p className="text-[10px] text-slate-500">85.6 × 54 mm (Individual)</p>
                </button>

                <button
                  type="button"
                  onClick={() => setOutputFormat('a4_pdf')}
                  className={`p-3 rounded-xl border text-left transition-all ${
                    outputFormat === 'a4_pdf'
                      ? 'bg-cyan-500/10 border-cyan-500 text-cyan-300 ring-1 ring-cyan-500/40'
                      : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  <p className="text-xs font-bold">A4 Sheet Layout</p>
                  <p className="text-[10px] text-slate-500">10 Cards / Sheet (5x2 Grid)</p>
                </button>
              </div>
            </div>

            {/* Options Toggles */}
            <div className="space-y-2.5 pt-2 border-t border-slate-800 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-300">Front + Back Duplex Output</span>
                <input
                  type="checkbox"
                  checked={duplex}
                  onChange={(e) => setDuplex(e.target.checked)}
                  className="w-4 h-4 text-cyan-500 accent-cyan-500 rounded cursor-pointer"
                />
              </div>

              <div className="flex items-center justify-between">
                <span className="text-slate-300">Print Cut / Registration Guides</span>
                <input
                  type="checkbox"
                  checked={cutMarks}
                  onChange={(e) => setCutMarks(e.target.checked)}
                  className="w-4 h-4 text-cyan-500 accent-cyan-500 rounded cursor-pointer"
                />
              </div>
            </div>

            {/* Action Buttons */}
            <div className="space-y-2.5 pt-4 border-t border-slate-800">
              <button
                type="button"
                onClick={handleDownloadPdf}
                disabled={isGeneratingPdf || !records.length}
                className="w-full py-2.5 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 disabled:opacity-50 text-slate-950 font-bold text-xs rounded-xl transition-all shadow-md active:scale-95 flex items-center justify-between px-4 cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  {isGeneratingPdf ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
                  <span>Download 300 DPI PDF ({outputFormat.toUpperCase()})</span>
                </div>
                <span className="flex items-center gap-1 font-mono text-[11px] bg-slate-950/40 text-slate-950 font-black px-2 py-0.5 rounded-md">
                  <Coins size={12} className="text-amber-900" />
                  -{(records.length || 1) * 5} Cr
                </span>
              </button>

              <button
                type="button"
                onClick={handleNativePrint}
                disabled={!records.length}
                className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl border border-slate-700 flex items-center justify-between px-4 transition-all cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <Printer size={15} className="text-cyan-400" />
                  <span>Print via Windows Native Printer</span>
                </div>
                <span className="flex items-center gap-1 font-mono text-[11px] bg-slate-800 text-cyan-300 font-bold px-2 py-0.5 rounded-md border border-slate-700">
                  <Coins size={12} className="text-amber-400" />
                  -{(records.length || 1) * 5} Cr
                </span>
              </button>
            </div>

          </div>
        </div>
      </div>

      {/* Footer Navigation */}
      <div className="flex justify-between pt-2">
        <button
          type="button"
          onClick={onPrev}
          className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-slate-300 font-semibold text-xs rounded-xl border border-slate-800 transition-all cursor-pointer"
        >
          ← Back to Photo Queue
        </button>
      </div>
    </div>
  );
}
