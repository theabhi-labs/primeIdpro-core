import React, { useState } from 'react';
import { RotateCw, QrCode, ShieldCheck, Sparkles, CheckCircle2 } from 'lucide-react';

export default function CardVisualPreview({ templateId = 'school-modern-blue', side = 'front', scale = 1.0, isInteractive = false }) {
  const [currentSide, setCurrentSide] = useState(side);

  // Sync side if prop changes
  React.useEffect(() => {
    setCurrentSide(side);
  }, [side]);

  const isVertical = templateId === 'corporate-id-dark' || templateId === 'mhrsa-inter-college-vertical';


  return (
    <div className="relative select-none flex flex-col items-center">
      {/* Interactive Flip Toggle Button (If interactive) */}
      {isInteractive && (
        <div className="mb-2 flex items-center gap-1 bg-slate-900/90 p-1 rounded-xl border border-slate-800 shadow-md">
          <button
            type="button"
            onClick={() => setCurrentSide('front')}
            className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
              currentSide === 'front'
                ? 'bg-cyan-500 text-slate-950 shadow'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Front Side
          </button>
          <button
            type="button"
            onClick={() => setCurrentSide('back')}
            className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
              currentSide === 'back'
                ? 'bg-cyan-500 text-slate-950 shadow'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Back Side
          </button>
        </div>
      )}

      {/* Card Wrapper with CR80 Standard Aspect Ratio */}
      <div
        className="rounded-2xl shadow-2xl overflow-hidden border border-slate-700/60 relative transition-transform duration-300"
        style={{
          width: isVertical ? '230px' : '340px',
          height: isVertical ? '340px' : '215px',
          transform: `scale(${scale})`,
          transformOrigin: 'top center',
          boxShadow: '0 12px 30px -5px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(255, 255, 255, 0.08)',
        }}
      >
        {/* TEMPLATE 1: SCHOOL MODERN BLUE */}
        {templateId === 'school-modern-blue' && (
          currentSide === 'front' ? (
            /* School Front */
            <div className="w-full h-full bg-white flex flex-col justify-between text-slate-800 relative font-sans">
              {/* Header */}
              <div className="bg-gradient-to-r from-blue-700 to-cyan-600 px-3 py-2 text-white flex items-center gap-2">
                <div className="w-6 h-6 rounded-md bg-white p-0.5 shrink-0 flex items-center justify-center">
                  <div className="w-full h-full rounded bg-blue-700 flex items-center justify-center text-[9px] font-black text-white">DPS</div>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-black tracking-tight uppercase leading-tight truncate">Delhi Public Academy</p>
                  <p className="text-[8px] text-cyan-100 truncate">CBSE Affiliated • Session 2026-27</p>
                </div>
              </div>

              {/* Body */}
              <div className="flex-1 px-3 py-2 flex items-center gap-3">
                {/* Photo Frame */}
                <div className="w-20 h-24 rounded-lg border-2 border-cyan-500 bg-slate-100 overflow-hidden shrink-0 shadow-sm relative flex items-center justify-center">
                  <svg viewBox="0 0 100 120" className="w-full h-full">
                    <rect width="100" height="120" fill="#f1f5f9" />
                    <circle cx="50" cy="40" r="22" fill="#0284c7" />
                    <path d="M15,115 C15,80 32,70 50,70 C68,70 85,80 85,115 Z" fill="#0369a1" />
                    <circle cx="50" cy="38" r="17" fill="#fed7aa" />
                    <path d="M42,30 Q50,23 58,30 Q50,26 42,30" fill="#1e293b" />
                  </svg>
                  <span className="absolute bottom-1 right-1 px-1 py-0.2 rounded bg-cyan-600 text-white text-[6px] font-bold">300 DPI</span>
                </div>

                {/* Details */}
                <div className="flex-1 min-w-0 text-left space-y-1">
                  <div className="border-b border-cyan-500 pb-0.5">
                    <p className="text-[12px] font-black text-slate-900 uppercase leading-none truncate">Aarav Sharma</p>
                    <p className="text-[8px] font-bold text-cyan-700">STUDENT ID CARD</p>
                  </div>
                  <div className="text-[8.5px] space-y-0.5 text-slate-700">
                    <div className="flex"><span className="w-14 text-slate-500 font-bold text-[7.5px] uppercase">Roll No:</span><span className="font-bold text-slate-900 font-mono">DPA-1042</span></div>
                    <div className="flex"><span className="w-14 text-slate-500 font-bold text-[7.5px] uppercase">Class / Sec:</span><span className="font-bold text-slate-900">10th - A</span></div>
                    <div className="flex"><span className="w-14 text-slate-500 font-bold text-[7.5px] uppercase">Blood Grp:</span><span className="font-bold text-rose-600">O+ (Positive)</span></div>
                    <div className="flex"><span className="w-14 text-slate-500 font-bold text-[7.5px] uppercase">Mobile:</span><span className="font-bold font-mono text-slate-900">+91 98765 43210</span></div>
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="bg-slate-900 px-3 py-1 text-white flex items-center justify-between text-[7px] font-bold">
                <span className="text-cyan-400">Sector 4, R.K. Puram, New Delhi</span>
                <span className="text-slate-400 font-mono">VALID: 2026-27</span>
              </div>
            </div>
          ) : (
            /* School Back */
            <div className="w-full h-full bg-slate-50 flex flex-col justify-between text-slate-800 p-2.5 font-sans relative">
              <div className="border-b border-slate-200 pb-1 flex items-center justify-between">
                <span className="text-[9px] font-black text-blue-900 uppercase">Emergency & Guidelines</span>
                <span className="text-[7.5px] font-mono text-slate-500">Ph: 011-26170000</span>
              </div>

              <div className="grid grid-cols-12 gap-2 my-auto items-center">
                {/* Details */}
                <div className="col-span-8 space-y-1 text-[8px] text-slate-700">
                  <div>
                    <span className="text-[7px] text-slate-400 font-bold uppercase block">Father's Name:</span>
                    <span className="font-bold text-slate-900">Mr. Rajesh Sharma</span>
                  </div>
                  <div>
                    <span className="text-[7px] text-slate-400 font-bold uppercase block">Residential Address:</span>
                    <span className="font-medium text-slate-800 line-clamp-2">B-42, Vasant Vihar, New Delhi - 110057</span>
                  </div>
                  <div className="text-[6.5px] text-slate-500 italic pt-0.5">
                    * If found, please return to school office.
                  </div>
                </div>

                {/* QR + Signature */}
                <div className="col-span-4 flex flex-col items-center gap-1 border-l border-slate-200 pl-2">
                  <div className="w-12 h-12 bg-white border border-slate-300 rounded p-1 flex items-center justify-center shadow-xs">
                    <QrCode size={36} className="text-slate-900" />
                  </div>
                  <div className="text-center">
                    <svg viewBox="0 0 100 24" className="w-12 h-3 mx-auto">
                      <path d="M5,18 Q25,2 45,14 T75,8 T95,16" stroke="#0f172a" strokeWidth="2.5" fill="none" />
                    </svg>
                    <span className="text-[6px] font-bold text-slate-500 uppercase block">Principal</span>
                  </div>
                </div>
              </div>

              <div className="bg-blue-950 text-cyan-200 text-center py-0.5 rounded text-[6.5px] font-bold uppercase tracking-wider">
                Authorized Institutional Identification Card
              </div>
            </div>
          )
        )}

        {/* TEMPLATE 2: CORPORATE ID DARK (VERTICAL) */}
        {templateId === 'corporate-id-dark' && (
          currentSide === 'front' ? (
            /* Corporate Front */
            <div className="w-full h-full bg-slate-950 text-white flex flex-col justify-between p-3.5 relative font-sans border-t-4 border-cyan-400">
              {/* Top Bar */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <div className="w-5 h-5 rounded-lg bg-gradient-to-tr from-cyan-400 to-blue-600 flex items-center justify-center font-black text-[9px] text-slate-950">N</div>
                  <span className="text-[10px] font-black tracking-wider uppercase text-white">NEXUS TECH</span>
                </div>
                <span className="text-[7px] font-mono px-1.5 py-0.5 rounded bg-cyan-950 text-cyan-400 border border-cyan-800">STAFF</span>
              </div>

              {/* Avatar Center */}
              <div className="flex flex-col items-center gap-2 my-auto">
                <div className="w-20 h-24 rounded-xl border-2 border-cyan-400/80 bg-slate-900 overflow-hidden shadow-lg shadow-cyan-950/50 relative">
                  <svg viewBox="0 0 100 120" className="w-full h-full">
                    <rect width="100" height="120" fill="#0f172a" />
                    <circle cx="50" cy="40" r="22" fill="#0284c7" />
                    <path d="M15,115 C15,80 32,70 50,70 C68,70 85,80 85,115 Z" fill="#0369a1" />
                    <circle cx="50" cy="38" r="17" fill="#fed7aa" />
                  </svg>
                </div>
                <div className="text-center">
                  <h4 className="text-[13px] font-black uppercase text-white tracking-tight">Vikram Aditya</h4>
                  <p className="text-[8px] font-bold text-cyan-400">Sr. Systems Architect</p>
                  <p className="text-[7.5px] text-slate-400">Core Engineering</p>
                </div>
              </div>

              {/* Bottom Specs */}
              <div className="bg-slate-900/80 rounded-xl p-2 border border-slate-800/80 grid grid-cols-2 gap-1 text-[8px]">
                <div><span className="text-[6.5px] text-slate-500 font-bold block">EMPLOYEE ID</span><span className="font-mono font-bold text-cyan-300">CORP-8842</span></div>
                <div><span className="text-[6.5px] text-slate-500 font-bold block">VALID TILL</span><span className="font-mono font-bold text-slate-200">DEC 2027</span></div>
              </div>
            </div>
          ) : (
            /* Corporate Back */
            <div className="w-full h-full bg-slate-950 text-slate-300 flex flex-col justify-between p-3.5 relative font-sans text-[8px]">
              <div className="border-b border-slate-800 pb-1.5 flex items-center justify-between">
                <span className="font-bold text-cyan-400 text-[9px] uppercase">Corporate Access</span>
                <span className="text-[7px] text-slate-500 font-mono">HQ • Cyber City</span>
              </div>

              <div className="flex flex-col items-center gap-2 my-auto text-center">
                <div className="w-16 h-16 bg-white rounded-lg p-1.5 shadow-md">
                  <QrCode size={52} className="text-slate-950" />
                </div>
                <p className="text-[7px] text-slate-400 max-w-[180px]">
                  Scan for security gate clearance and verified corporate credentials.
                </p>
              </div>

              <div className="border-t border-slate-800 pt-2 space-y-1 text-[7px] text-slate-400">
                <p className="flex justify-between"><span>Emergency Hotline:</span><strong className="text-white font-mono">+1 800 555 0199</strong></p>
                <p className="text-[6.5px] text-slate-500">Property of Nexus Technologies Inc.</p>
              </div>
            </div>
          )
        )}

        {/* TEMPLATE 3: UNIVERSITY CLASSIC GOLD */}
        {templateId === 'university-classic-gold' && (
          currentSide === 'front' ? (
            /* University Front */
            <div className="w-full h-full bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 text-white flex flex-col justify-between p-3 font-sans border-2 border-amber-500/40">
              <div className="flex items-center justify-between border-b border-amber-500/30 pb-1.5">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-amber-500 text-slate-950 font-black text-[9px] flex items-center justify-center shadow-md">UNI</div>
                  <div>
                    <h5 className="text-[10px] font-black text-amber-300 uppercase tracking-tight">Apex University</h5>
                    <p className="text-[7.5px] text-slate-400">Faculty of Technology</p>
                  </div>
                </div>
                <span className="text-[8px] font-bold text-amber-400 font-mono">2026-28</span>
              </div>

              <div className="flex items-center gap-3 my-auto">
                <div className="w-20 h-24 rounded-lg border-2 border-amber-400 bg-slate-800 overflow-hidden shrink-0 shadow-md">
                  <svg viewBox="0 0 100 120" className="w-full h-full">
                    <rect width="100" height="120" fill="#1e1b4b" />
                    <circle cx="50" cy="40" r="22" fill="#d97706" />
                    <path d="M15,115 C15,80 32,70 50,70 C68,70 85,80 85,115 Z" fill="#b45309" />
                    <circle cx="50" cy="38" r="17" fill="#fed7aa" />
                  </svg>
                </div>
                <div className="space-y-0.5 text-[8.5px]">
                  <p className="text-[12px] font-black text-white uppercase">Ananya Verma</p>
                  <p className="text-[8px] font-bold text-amber-400">B.Tech Computer Science</p>
                  <div className="pt-1 text-[7.5px] text-slate-300 space-y-0.5">
                    <p><span className="text-slate-500 font-bold uppercase">Roll:</span> <strong className="text-white font-mono">APEX-2026-092</strong></p>
                    <p><span className="text-slate-500 font-bold uppercase">Blood:</span> <strong className="text-rose-400">B+</strong></p>
                  </div>
                </div>
              </div>

              <div className="bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 rounded flex items-center justify-between text-[7px] text-amber-300 font-bold">
                <span>UNIVERSITY STUDENT CARD</span>
                <span className="font-mono">VALID: 2028</span>
              </div>
            </div>
          ) : (
            /* University Back */
            <div className="w-full h-full bg-slate-900 text-slate-300 flex flex-col justify-between p-3 font-sans text-[8px] border-2 border-amber-500/30">
              <div className="border-b border-slate-800 pb-1 flex justify-between">
                <span className="text-amber-400 font-bold uppercase">Campus Regulations</span>
                <span className="text-slate-500 font-mono text-[7px]">Library & Lab Pass</span>
              </div>

              <div className="grid grid-cols-12 gap-2 my-auto items-center">
                <div className="col-span-8 text-[7.5px] space-y-1 text-slate-300">
                  <p>1. Card must be carried on campus at all times.</p>
                  <p>2. Non-transferable; valid for laboratory access.</p>
                  <p className="text-slate-400">Campus: Knowledge Park III, Greater Noida</p>
                </div>
                <div className="col-span-4 flex flex-col items-center">
                  <div className="w-12 h-12 bg-white rounded p-1 shadow">
                    <QrCode size={38} className="text-slate-900" />
                  </div>
                  <span className="text-[6px] text-slate-400 font-mono mt-0.5">APEX-092</span>
                </div>
              </div>

              <div className="border-t border-slate-800 pt-1 flex justify-between items-center text-[7px] text-slate-400">
                <span>Registrar Signature Verified</span>
                <span className="text-amber-400 font-mono font-bold">WWW.APEX.EDU</span>
              </div>
            </div>
          )
        )}

        {/* TEMPLATE 4: MEMBERSHIP VIP EMERALD */}
        {templateId === 'membership-vip-emerald' && (
          currentSide === 'front' ? (
            /* VIP Front */
            <div className="w-full h-full bg-gradient-to-tr from-emerald-950 via-slate-950 to-teal-950 text-white flex flex-col justify-between p-3.5 font-sans border-2 border-emerald-500/40">
              <div className="flex items-center justify-between border-b border-emerald-500/30 pb-1.5">
                <div className="flex items-center gap-1.5">
                  <Sparkles size={14} className="text-emerald-400" />
                  <span className="text-[10px] font-black uppercase text-emerald-300 tracking-wider">ROYAL ELITE CLUB</span>
                </div>
                <span className="text-[8px] font-black px-1.5 py-0.5 rounded bg-emerald-500 text-slate-950 shadow">PLATINUM VIP</span>
              </div>

              <div className="flex items-center gap-3.5 my-auto">
                <div className="w-20 h-24 rounded-xl border-2 border-emerald-400 bg-slate-900 overflow-hidden shrink-0 shadow-lg">
                  <svg viewBox="0 0 100 120" className="w-full h-full">
                    <rect width="100" height="120" fill="#022c22" />
                    <circle cx="50" cy="40" r="22" fill="#059669" />
                    <path d="M15,115 C15,80 32,70 50,70 C68,70 85,80 85,115 Z" fill="#047857" />
                    <circle cx="50" cy="38" r="17" fill="#fed7aa" />
                  </svg>
                </div>
                <div className="space-y-1">
                  <h4 className="text-[13px] font-black uppercase text-white">Priya Nair</h4>
                  <p className="text-[8px] font-bold text-emerald-400 font-mono">MEMBER #VIP-9920</p>
                  <p className="text-[7.5px] text-slate-400">All-Access Concierge Tier</p>
                </div>
              </div>

              <div className="flex items-center justify-between text-[7px] text-slate-400 font-mono">
                <span>EXCLUSIVE MEMBERSHIP</span>
                <span className="text-emerald-400 font-bold">EXP: DEC 2027</span>
              </div>
            </div>
          ) : (
            /* VIP Back */
            <div className="w-full h-full bg-slate-950 text-slate-300 flex flex-col justify-between p-3 font-sans text-[8px] border-2 border-emerald-500/30">
              <div className="border-b border-slate-800 pb-1 flex justify-between">
                <span className="text-emerald-400 font-bold uppercase">Member Privileges</span>
                <span className="text-slate-500 font-mono text-[7px]">VIP 24/7 Access</span>
              </div>

              <div className="grid grid-cols-12 gap-2 my-auto items-center">
                <div className="col-span-8 text-[7.5px] space-y-1 text-slate-300">
                  <p>• Complimentary Valet & Lounge Access</p>
                  <p>• Priority Booking & Guest Pass Allowance</p>
                  <p className="text-slate-400">Concierge Desk: +91 1800 200 9999</p>
                </div>
                <div className="col-span-4 flex flex-col items-center">
                  <div className="w-12 h-12 bg-white rounded p-1 shadow">
                    <QrCode size={38} className="text-slate-900" />
                  </div>
                  <span className="text-[6px] text-emerald-400 font-mono mt-0.5">VIP-9920</span>
                </div>
              </div>

              <div className="bg-emerald-950 text-emerald-300 text-center py-0.5 rounded text-[7px] font-bold uppercase">
                Authorized Elite Membership Pass
              </div>
            </div>
          )
        )}

        {/* TEMPLATE 5: M.H.R.S.A. INTER COLLEGE (VERTICAL) */}
        {templateId === 'mhrsa-inter-college-vertical' && (

          currentSide === 'front' ? (
            /* MHRSA Front */
            <div className="w-full h-full bg-white text-slate-800 flex flex-col justify-between relative font-sans select-none overflow-hidden">
              {/* Header */}
              <div
                className="bg-[#002244] text-white p-2.5 pb-3.5 relative flex items-center gap-2 border-b-2 border-amber-500"
                style={{ clipPath: 'ellipse(120% 100% at 50% 0%)' }}
              >
                {/* Crest */}
                <div className="w-8 h-8 rounded-full bg-white p-0.5 shrink-0 flex items-center justify-center shadow-md">
                  <svg viewBox="0 0 100 100" className="w-full h-full">
                    <circle cx="50" cy="50" r="46" fill="#ffffff" stroke="#002244" strokeWidth="4" />
                    <circle cx="50" cy="50" r="41" fill="none" stroke="#f59e0b" strokeWidth="2" />
                    <path d="M25,65 C20,45 35,28 50,28 C65,28 80,45 75,65 C68,75 32,75 25,65 Z" fill="#002244" />
                    <polygon points="50,22 55,34 45,34" fill="#f59e0b" />
                    <path d="M35,52 Q50,42 50,60 Q50,42 65,52" stroke="#ffffff" strokeWidth="3" fill="none" />
                    <text x="50" y="82" fontSize="9" fontFamily="Arial" fontWeight="900" fill="#002244" textAnchor="middle">ESTD. 2010</text>
                  </svg>
                </div>

                <div className="min-w-0 flex-1">
                  <h4 className="text-[12px] font-black uppercase text-white tracking-wider leading-none truncate">M.H.R.S.A.</h4>
                  <p className="text-[8px] font-black text-amber-400 tracking-wider uppercase leading-tight mt-0.5">INTER COLLEGE</p>
                  <p className="text-[6.5px] text-slate-200 leading-tight truncate mt-0.5 flex items-center gap-0.5">
                    <span>📍</span> Shahpur Jot Yusuf 'Hathila' Bahraich, UP
                  </p>
                </div>
              </div>

              {/* Body */}
              <div className="flex-1 flex flex-col items-center px-3 py-1">
                {/* Synthetic Generic Student Portrait Frame */}
                <div className="w-20 h-24 rounded-xl border-2 border-[#002244] bg-slate-50 overflow-hidden shrink-0 shadow-sm relative my-0.5 flex items-center justify-center">
                  <svg viewBox="0 0 100 120" className="w-full h-full">
                    <rect width="100" height="120" fill="#f8fafc" />
                    <circle cx="50" cy="40" r="22" fill="#002244" />
                    {/* Uniform with Green Scarf */}
                    <path d="M15,115 C15,80 32,70 50,70 C68,70 85,80 85,115 Z" fill="#e2e8f0" stroke="#002244" strokeWidth="1" />
                    <path d="M35,70 L50,105 L65,70 Z" fill="#15803d" />
                    <path d="M45,70 L50,88 L55,70 Z" fill="#002244" />
                    <circle cx="50" cy="38" r="17" fill="#fed7aa" />
                    {/* Hair */}
                    <path d="M33,35 C33,18 45,15 50,15 C55,15 67,18 67,35 C67,40 65,42 62,35 C58,25 42,25 38,35 C35,42 33,40 33,35 Z" fill="#1e293b" />
                  </svg>
                  <span className="absolute bottom-1 right-1 px-1 py-0.2 rounded bg-amber-500 text-slate-950 text-[6px] font-black">STUDENT</span>
                </div>

                {/* Details Table */}
                <div className="w-full text-[8.5px] leading-tight space-y-0.5 text-slate-800 pt-0.5 font-sans">
                  <div className="flex items-center"><span className="w-22 text-[7.5px] font-bold text-slate-700">Student's Name</span><span className="w-2.5 font-black text-[#002244] text-center">:</span><span className="font-extrabold text-black uppercase truncate">MARIYA</span></div>
                  <div className="flex items-center"><span className="w-22 text-[7.5px] font-bold text-slate-700">Father's Name</span><span className="w-2.5 font-black text-[#002244] text-center">:</span><span className="font-extrabold text-black uppercase truncate">SHANU</span></div>
                  <div className="flex items-start"><span className="w-22 text-[7.5px] font-bold text-slate-700">Address</span><span className="w-2.5 font-black text-[#002244] text-center">:</span><span className="font-extrabold text-black uppercase text-[7px] leading-tight truncate">SHAHPUR JOT YUSUF 'HATHILA' BAHRAICH</span></div>
                  <div className="flex items-center"><span className="w-22 text-[7.5px] font-bold text-slate-700">Mobile No.</span><span className="w-2.5 font-black text-[#002244] text-center">:</span><span className="font-extrabold font-mono text-black">9125264245</span></div>
                  <div className="flex items-center"><span className="w-22 text-[7.5px] font-bold text-slate-700">Date of Birth</span><span className="w-2.5 font-black text-[#002244] text-center">:</span><span className="font-extrabold font-mono text-black">22/12/2011</span></div>
                  <div className="flex items-center"><span className="w-22 text-[7.5px] font-bold text-slate-700">Class</span><span className="w-2.5 font-black text-[#002244] text-center">:</span><span className="font-extrabold text-black">11th</span></div>
                  <div className="flex items-center"><span className="w-22 text-[7.5px] font-bold text-slate-700">Roll No.</span><span className="w-2.5 font-black text-[#002244] text-center">:</span><span className="font-extrabold font-mono text-black">083</span></div>
                </div>
              </div>

              {/* Footer with Wave & Barcode + Principal Sign */}
              <div className="h-10 relative flex items-end justify-between px-3 pb-1 bg-white">
                <div
                  className="absolute bottom-0 left-0 w-32 h-10 bg-[#002244] border-t-2 border-amber-500"
                  style={{ clipPath: 'ellipse(100% 100% at 0% 100%)' }}
                />

                {/* Barcode */}
                <div className="relative z-10 bg-white border border-slate-300 rounded p-0.5 shadow-sm">
                  <svg className="w-24 h-5" viewBox="0 0 140 30">
                    <rect x="0" y="0" width="3" height="30" fill="#000"/>
                    <rect x="5" y="0" width="2" height="30" fill="#000"/>
                    <rect x="9" y="0" width="4" height="30" fill="#000"/>
                    <rect x="15" y="0" width="2" height="30" fill="#000"/>
                    <rect x="19" y="0" width="3" height="30" fill="#000"/>
                    <rect x="24" y="0" width="5" height="30" fill="#000"/>
                    <rect x="31" y="0" width="2" height="30" fill="#000"/>
                    <rect x="35" y="0" width="4" height="30" fill="#000"/>
                    <rect x="41" y="0" width="3" height="30" fill="#000"/>
                    <rect x="46" y="0" width="2" height="30" fill="#000"/>
                    <rect x="50" y="0" width="4" height="30" fill="#000"/>
                    <rect x="56" y="0" width="3" height="30" fill="#000"/>
                    <rect x="61" y="0" width="5" height="30" fill="#000"/>
                    <rect x="68" y="0" width="2" height="30" fill="#000"/>
                    <rect x="72" y="0" width="4" height="30" fill="#000"/>
                    <rect x="78" y="0" width="3" height="30" fill="#000"/>
                    <rect x="83" y="0" width="2" height="30" fill="#000"/>
                    <rect x="87" y="0" width="4" height="30" fill="#000"/>
                    <rect x="93" y="0" width="5" height="30" fill="#000"/>
                    <rect x="100" y="0" width="2" height="30" fill="#000"/>
                    <rect x="104" y="0" width="4" height="30" fill="#000"/>
                    <rect x="110" y="0" width="3" height="30" fill="#000"/>
                    <rect x="115" y="0" width="2" height="30" fill="#000"/>
                    <rect x="119" y="0" width="4" height="30" fill="#000"/>
                    <rect x="125" y="0" width="3" height="30" fill="#000"/>
                    <rect x="130" y="0" width="4" height="30" fill="#000"/>
                    <rect x="136" y="0" width="4" height="30" fill="#000"/>
                  </svg>
                </div>

                {/* Principal Signature */}
                <div className="relative z-10 flex flex-col items-center">
                  <svg viewBox="0 0 100 28" className="w-11 h-3.5">
                    <path d="M5,20 Q20,2 35,15 T65,8 T95,16" stroke="#16a34a" strokeWidth="3" fill="none" strokeLinecap="round"/>
                  </svg>
                  <span className="text-[6px] font-extrabold text-slate-800 border-t border-slate-600 pt-0.2 w-11 text-center">Principal</span>
                </div>
              </div>
            </div>
          ) : (
            /* MHRSA Back */
            <div className="w-full h-full bg-white text-slate-800 flex flex-col justify-between relative font-sans select-none overflow-hidden">
              {/* Header */}
              <div
                className="bg-[#002244] text-white p-2.5 pb-3 text-center relative border-b-2 border-amber-500"
                style={{ clipPath: 'ellipse(125% 100% at 50% 0%)' }}
              >
                <h4 className="text-[12px] font-black uppercase text-white tracking-wider leading-none">M.H.R.S.A.</h4>
                <p className="text-[8px] font-black text-amber-400 tracking-wider uppercase leading-tight mt-0.5">INTER COLLEGE</p>
                <div className="w-16 h-0.5 bg-amber-500 mx-auto mt-1 rounded-full"></div>
              </div>

              {/* Body */}
              <div className="flex-1 flex flex-col justify-between p-3 py-2 relative">
                {/* Watermark Crest */}
                <div className="absolute inset-0 flex items-center justify-center opacity-10 pointer-events-none">
                  <svg viewBox="0 0 100 100" className="w-28 h-28">
                    <circle cx="50" cy="50" r="46" fill="none" stroke="#002244" strokeWidth="4" />
                    <circle cx="50" cy="50" r="41" fill="none" stroke="#f59e0b" strokeWidth="2" />
                    <path d="M25,65 C20,45 35,28 50,28 C65,28 80,45 75,65 C68,75 32,75 25,65 Z" fill="#002244" />
                    <polygon points="50,22 55,34 45,34" fill="#f59e0b" />
                    <path d="M35,52 Q50,42 50,60 Q50,42 65,52" stroke="#002244" strokeWidth="3" fill="none" />
                    <text x="50" y="82" fontSize="9" fontFamily="Arial" fontWeight="900" fill="#002244" textAnchor="middle">ESTD. 2010</text>
                  </svg>
                </div>

                {/* Contact Lines */}
                <div className="space-y-1 text-[7.5px] text-slate-800 font-bold relative z-10">
                  <p className="flex items-start gap-1 leading-tight">
                    <span className="text-[9px]">📍</span>
                    <span>Shahpur Jot Yusuf 'Hathila' Bahraich, Uttar Pradesh - 271801</span>
                  </p>
                  <p className="flex items-center gap-1 font-mono">
                    <span className="text-[9px]">📞</span>
                    <span>74088065057</span>
                  </p>
                </div>

                {/* Terms Box */}
                <div className="border border-[#002244] rounded-lg overflow-hidden bg-white shadow-xs relative z-10 my-1">
                  <div className="bg-[#002244] text-white text-[7.5px] font-black uppercase text-center py-0.5 tracking-wider">
                    TERMS & CONDITIONS
                  </div>
                  <ul className="p-1.5 space-y-0.8 text-[6.5px] text-slate-800 font-semibold leading-tight">
                    <li className="flex items-start gap-1"><span className="text-[#002244] font-bold">•</span><span>This card is non-transferable.</span></li>
                    <li className="flex items-start gap-1"><span className="text-[#002244] font-bold">•</span><span>This card is the property of M.H.R.S.A. Inter College.</span></li>
                    <li className="flex items-start gap-1"><span className="text-[#002244] font-bold">•</span><span>Loss of this card must be reported to the office immediately.</span></li>
                    <li className="flex items-start gap-1"><span className="text-[#002244] font-bold">•</span><span>This card must be presented whenever required.</span></li>
                  </ul>
                </div>
              </div>

              {/* Bottom Navy Bar */}
              <div className="bg-[#002244] text-white text-center py-1 text-[7.5px] font-extrabold border-t border-amber-500">
                Emergency Contact : <span className="font-mono text-amber-300 font-bold">9125264245</span>
              </div>
            </div>
          )
        )}
      </div>
    </div>
  );
}

