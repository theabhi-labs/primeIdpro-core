import React, { useState } from 'react';
import {
  X,
  QrCode,
  Copy,
  Check,
  Printer,
  ExternalLink,
  Smartphone,
  Sparkles,
  ShieldCheck,
  Zap,
  ArrowRight,
} from 'lucide-react';

export default function CounterQrModal({ isOpen, onClose, deviceState }) {
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const centerCode = deviceState?.centerCode || 'CSC-GR-6112';
  const centerName = deviceState?.centerName || 'Digital Photo Studio';
  const kioskUrl = `https://primeidpro.online/kiosk?center=${encodeURIComponent(centerCode)}`;
  const qrCodeImgUrl = `https://api.qrserver.com/v1/create-qr-code/?size=350x350&data=${encodeURIComponent(kioskUrl)}&bgcolor=ffffff&color=0f172a&margin=10`;

  const handleCopy = () => {
    navigator.clipboard?.writeText(kioskUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleOpenExternal = () => {
    if (window.electronAPI?.openExternal) {
      window.electronAPI.openExternal(kioskUrl);
    } else {
      window.open(kioskUrl, '_blank');
    }
  };

  const handlePrintStandee = () => {
    const printHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Counter Kiosk QR Standee - ${centerName}</title>
        <style>
          @page { size: A4 portrait; margin: 12mm; }
          * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Segoe UI', Roboto, Helvetica, sans-serif; }
          body { background: #f8fafc; display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 20px; }
          .poster { width: 180mm; background: white; border: 4px solid #0284c7; border-radius: 24px; padding: 32px; text-align: center; box-shadow: 0 20px 40px rgba(0,0,0,0.08); }
          .badge { display: inline-block; background: #e0f2fe; color: #0369a1; font-weight: 800; font-size: 14px; padding: 6px 18px; border-radius: 999px; letter-spacing: 1px; text-transform: uppercase; margin-bottom: 12px; }
          h1 { color: #0f172a; font-size: 28px; font-weight: 900; margin-bottom: 6px; }
          p.sub { color: #475569; font-size: 15px; margin-bottom: 24px; }
          .qr-box { background: white; border: 3px dashed #0284c7; border-radius: 20px; padding: 20px; display: inline-block; margin-bottom: 24px; }
          .qr-box img { width: 220px; height: 220px; display: block; }
          .steps { display: flex; justify-content: space-between; gap: 12px; margin-top: 16px; text-align: left; background: #f0f9ff; padding: 18px; border-radius: 16px; border: 1px solid #bae6fd; }
          .step-item { flex: 1; }
          .step-num { font-size: 12px; font-weight: 900; color: #0284c7; text-transform: uppercase; margin-bottom: 4px; }
          .step-txt { font-size: 13px; font-weight: 700; color: #1e293b; line-height: 1.3; }
          .center-info { margin-top: 24px; font-size: 14px; font-weight: 800; color: #0369a1; }
          @media print { body { background: white; padding: 0; } .poster { box-shadow: none; width: 100%; border-width: 3px; } }
        </style>
      </head>
      <body>
        <div class="poster">
          <div class="badge">📷 Instant Passport Photo</div>
          <h1>Scan to Send Your Photo</h1>
          <p class="sub">Scan with your mobile camera, take or pick photo, and get instant 300 DPI prints at the counter!</p>
          <div class="qr-box">
            <img src="${qrCodeImgUrl}" alt="Counter QR Code" />
          </div>
          <div class="steps">
            <div class="step-item">
              <div class="step-num">Step 1</div>
              <div class="step-txt">📱 Scan QR with Camera / Google Lens</div>
            </div>
            <div class="step-item">
              <div class="step-num">Step 2</div>
              <div class="step-txt">📸 Select portrait & photo copies</div>
            </div>
            <div class="step-item">
              <div class="step-num">Step 3</div>
              <div class="step-txt">⚡ Receive your print in seconds!</div>
            </div>
          </div>
          <div class="center-info">
            Center: ${centerName} • Code: ${centerCode}
          </div>
        </div>
        <script>
          window.onload = () => { setTimeout(() => { window.print(); }, 400); };
        </script>
      </body>
      </html>
    `;

    const printWin = window.open('', '_blank', 'width=800,height=900');
    if (printWin) {
      printWin.document.write(printHtml);
      printWin.document.close();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fade-in">
      <div className="relative w-full max-w-lg rounded-3xl bg-slate-950 border border-slate-800 shadow-[0_0_50px_rgba(6,182,212,0.25)] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-5 bg-gradient-to-r from-blue-950/90 via-slate-900 to-cyan-950/90 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 shadow-inner">
              <QrCode size={22} />
            </div>
            <div>
              <h3 className="text-base font-black text-white tracking-wide flex items-center gap-2">
                Counter Kiosk QR Code
                <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  LIVE
                </span>
              </h3>
              <p className="text-xs text-slate-400">
                Center: <span className="text-cyan-400 font-bold">{centerCode}</span> ({centerName})
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 flex flex-col items-center text-center">
          <p className="text-xs text-slate-300 max-w-sm mb-4">
            Customers can scan this QR code with their mobile phone camera to upload their passport photos directly to this desk!
          </p>

          {/* QR Code Container */}
          <div className="p-4 bg-white rounded-2xl shadow-xl shadow-cyan-950/50 border-4 border-cyan-400/40 relative group">
            <img
              src={qrCodeImgUrl}
              alt="Counter Kiosk QR Code"
              className="w-56 h-56 object-contain"
            />
            <div className="absolute inset-x-0 bottom-1 flex justify-center pointer-events-none">
              <span className="text-[10px] font-black text-slate-900 uppercase tracking-widest bg-cyan-200/90 px-2 py-0.5 rounded">
                {centerCode}
              </span>
            </div>
          </div>

          {/* Steps Indicator */}
          <div className="grid grid-cols-3 gap-2 w-full mt-5 text-left">
            <div className="p-2.5 rounded-xl bg-slate-900/90 border border-slate-800">
              <div className="text-[10px] font-extrabold text-cyan-400 uppercase">1. Scan QR</div>
              <div className="text-[11px] text-slate-300 font-medium leading-tight mt-0.5">
                Customer scans with phone
              </div>
            </div>
            <div className="p-2.5 rounded-xl bg-slate-900/90 border border-slate-800">
              <div className="text-[10px] font-extrabold text-cyan-400 uppercase">2. Upload Photo</div>
              <div className="text-[11px] text-slate-300 font-medium leading-tight mt-0.5">
                Takes selfie or picks photo
              </div>
            </div>
            <div className="p-2.5 rounded-xl bg-slate-900/90 border border-slate-800">
              <div className="text-[10px] font-extrabold text-cyan-400 uppercase">3. Print Desk</div>
              <div className="text-[11px] text-slate-300 font-medium leading-tight mt-0.5">
                Order lands here in top bar!
              </div>
            </div>
          </div>

          {/* Direct Link Box */}
          <div className="w-full mt-4 flex items-center gap-2 p-2 rounded-xl bg-slate-900 border border-slate-800 text-xs">
            <span className="text-slate-400 truncate flex-1 text-left font-mono text-[11px] select-all pl-1">
              {kioskUrl}
            </span>
            <button
              onClick={handleCopy}
              className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-cyan-400 font-semibold text-[11px] flex items-center gap-1 transition-all active:scale-95"
            >
              {copied ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
              <span>{copied ? 'Copied!' : 'Copy'}</span>
            </button>
            <button
              onClick={handleOpenExternal}
              className="p-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-all"
              title="Open customer upload link in browser"
            >
              <ExternalLink size={14} />
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-900/80 border-t border-slate-800 flex items-center justify-between">
          <button
            onClick={handlePrintStandee}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs border border-slate-700 transition-all active:scale-95 shadow-sm"
          >
            <Printer size={15} className="text-cyan-400" />
            <span>Print Counter QR Standee</span>
          </button>

          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-extrabold text-xs transition-all active:scale-95 shadow-md shadow-cyan-950/40"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
