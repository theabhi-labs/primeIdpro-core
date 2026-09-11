import React, { useState } from 'react';
import {
  X,
  Printer,
  FileText,
  Layers,
  Download,
  Loader2,
  CheckCircle2,
  Sliders,
  Scissors,
  Check,
  CreditCard,
} from 'lucide-react';
import { generateCardPdfApi } from '../../services/cardApi';

const PRINT_LAYOUTS = [
  {
    id: 'a4_5_folding',
    name: 'A4 Sheet - 5 Cards (Front + Back Folding)',
    description: 'Perfect for Pouch Lamination. Front & Back printed side-by-side with fold mark.',
    outputFormat: 'a4_pdf',
    rows: 5,
    cols: 2,
    duplex: true,
  },
  {
    id: 'a4_8_grid',
    name: 'A4 Sheet - 9/10 Cards (Multi-Up Grid)',
    description: 'Auto-fitted grid (3x3 for Vertical, 2x5 for Horizontal) with alignment cut marks.',
    outputFormat: 'a4_pdf',
    rows: 3,
    cols: 3,
    duplex: false,
  },
  {
    id: 'cr80_single',
    name: 'Direct PVC Thermal Card (CR80 Single)',
    description: '1-by-1 card output for Zebra, Evolis, Magicard & Fargo PVC printers.',
    outputFormat: 'pvc',
    rows: 1,
    cols: 1,
    duplex: true,
  },
];

const PrintSheetModal = ({ isOpen, onClose, project, batch, setToast }) => {
  const [selectedLayoutId, setSelectedLayoutId] = useState('a4_5_folding');
  const [cutMarks, setCutMarks] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);

  if (!isOpen || !project) return null;

  const recordsToPrint = batch?.records || project.records || [];
  const activeLayout = PRINT_LAYOUTS.find((l) => l.id === selectedLayoutId) || PRINT_LAYOUTS[0];

  const handleDownloadPdf = async () => {
    if (recordsToPrint.length === 0) {
      setToast?.({ type: 'error', message: 'No student records available to print.' });
      return;
    }

    try {
      setIsGenerating(true);
      const payload = {
        projectId: project.id,
        outputFormat: activeLayout.outputFormat,
        recordIds: recordsToPrint.map((r) => r.id),
        paperSize: 'A4',
        rows: activeLayout.rows,
        cols: activeLayout.cols,
        cutMarks,
        duplex: activeLayout.duplex,
      };

      const pdfBlob = await generateCardPdfApi(payload);
      const blobUrl = window.URL.createObjectURL(new Blob([pdfBlob], { type: 'application/pdf' }));
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = `${project.name.replace(/\s+/g, '_')}_${batch?.name || 'Cards'}_300DPI.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(blobUrl);

      setToast?.({ type: 'success', message: '🎉 300 DPI Print PDF downloaded successfully!' });
      onClose();
    } catch (err) {
      console.error('PDF generation error:', err);
      setToast?.({ type: 'error', message: 'Failed to generate PDF. Please ensure cards have processed photos.' });
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fadeIn">
      <div className="w-full max-w-xl bg-[#0d1322] border border-slate-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-800 flex items-center justify-between bg-slate-900/50">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
              <Printer size={20} />
            </div>
            <div>
              <h2 className="text-base font-extrabold text-white">Print Batch Layouts (300 DPI)</h2>
              <p className="text-[11px] text-slate-400">
                {project.name} • {recordsToPrint.length} Students Selected
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5 text-xs text-slate-200">
          <div>
            <label className="block text-[11px] font-bold text-slate-300 mb-2">
              Select Output Print Layout
            </label>
            <div className="space-y-2.5">
              {PRINT_LAYOUTS.map((layout) => {
                const isSelected = selectedLayoutId === layout.id;
                return (
                  <div
                    key={layout.id}
                    onClick={() => setSelectedLayoutId(layout.id)}
                    className={`p-3.5 rounded-2xl border flex items-center justify-between gap-3 transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-cyan-500/10 border-cyan-500/50 text-white shadow-md shadow-cyan-950/30'
                        : 'bg-slate-900/80 border-slate-800 text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-9 h-9 rounded-xl border flex items-center justify-center shrink-0 ${
                          isSelected
                            ? 'bg-cyan-500 border-cyan-400 text-slate-950'
                            : 'bg-slate-950 border-slate-800 text-slate-400'
                        }`}
                      >
                        {layout.outputFormat === 'pvc' ? <CreditCard size={18} /> : <FileText size={18} />}
                      </div>
                      <div>
                        <p className="font-bold text-xs text-white">{layout.name}</p>
                        <p className="text-[10px] text-slate-400">{layout.description}</p>
                      </div>
                    </div>
                    <div
                      className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 ${
                        isSelected ? 'bg-cyan-500 border-cyan-400 text-slate-950' : 'border-slate-700 bg-slate-950'
                      }`}
                    >
                      {isSelected && <Check size={12} strokeWidth={3} />}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Cut Marks & Quality Settings */}
          <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-slate-800 text-slate-300">
                <Scissors size={16} />
              </div>
              <div>
                <p className="font-bold text-white text-xs">Include Alignment Cut Marks</p>
                <p className="text-[10px] text-slate-400">Adds corner crop lines for easy paper trimming</p>
              </div>
            </div>
            <input
              type="checkbox"
              checked={cutMarks}
              onChange={(e) => setCutMarks(e.target.checked)}
              className="w-4 h-4 rounded bg-slate-950 border-slate-700 accent-cyan-500 cursor-pointer"
            />
          </div>

          {/* 300 DPI High-Res Badge */}
          <div className="p-3 rounded-xl bg-emerald-950/30 border border-emerald-500/30 flex items-center gap-2 text-emerald-300 text-[11px]">
            <CheckCircle2 size={14} className="text-emerald-400 shrink-0" />
            <span>Ready to render ultra-sharp 300 DPI vector typography & crystal portraits.</span>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-800 flex items-center justify-end gap-3 bg-slate-900/50">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs cursor-pointer"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={handleDownloadPdf}
            disabled={isGenerating}
            className="px-5 py-2.5 bg-gradient-to-r from-cyan-500 via-blue-600 to-indigo-600 hover:from-cyan-400 hover:to-indigo-500 text-slate-950 font-extrabold text-xs rounded-xl shadow-lg shadow-cyan-950/40 transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
          >
            {isGenerating ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
            <span>{isGenerating ? 'Rendering 300 DPI PDF...' : 'Download Print PDF'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default PrintSheetModal;
