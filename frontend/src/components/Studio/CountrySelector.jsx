import React from 'react';
import { Globe2, ShieldCheck, Zap } from 'lucide-react';

const CountrySelector = ({ countries, selectedCountry, onChange }) => {
  // Skeleton Loader for Dark Mode
  if (!countries.length) {
    return (
      <div className="h-16 w-full animate-pulse bg-slate-900/50 border border-slate-800 rounded-2xl" />
    );
  }

  return (
    <div className="relative group overflow-hidden">
      {/* Background Glow Effect */}
      <div className="absolute -inset-1 bg-gradient-to-r from-cyan-500/20 to-blue-600/20 rounded-2xl blur opacity-25 group-hover:opacity-50 transition duration-1000"></div>
      
      <div className="relative bg-[#0f172a]/80 backdrop-blur-xl border border-slate-800 rounded-2xl p-4 md:p-5 flex flex-col md:flex-row items-center justify-between gap-4 shadow-2xl">
        
        <div className="flex items-center gap-4 w-full md:w-auto">
          {/* Icon Badge */}
          <div className="hidden sm:flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
            <Globe2 size={20} />
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 w-full">
            <label className="text-xs font-bold uppercase tracking-widest text-slate-500 whitespace-nowrap">
              Passport Standard
            </label>
            
            <div className="relative flex-1 sm:min-w-[240px]">
              <select
                value={selectedCountry}
                onChange={(e) => onChange(e.target.value)}
                className="w-full appearance-none bg-slate-800 border border-slate-700 text-slate-200 rounded-xl px-4 py-2.5 pr-10 focus:ring-2 focus:ring-cyan-500 focus:border-transparent outline-none cursor-pointer transition-all hover:bg-slate-700/50 font-medium"
              >
                {countries.map(c => (
                  <option key={c.code} value={c.code} className="bg-[#0f172a]">
                    {c.name} ({c.standard})
                  </option>
                ))}
              </select>
              {/* Custom Arrow */}
              <div className="absolute inset-y-0 right-3 flex items-center pointer-events-none text-slate-500">
                <svg className="w-4 h-4 fill-current" viewBox="0 0 20 20">
                  <path d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" />
                </svg>
              </div>
            </div>
          </div>
        </div>

        {/* AI Processing Info Badge */}
        <div className="flex items-center gap-3 bg-cyan-500/5 border border-cyan-500/10 px-4 py-2 rounded-xl w-full md:w-auto justify-center md:justify-start">
          <div className="flex -space-x-1">
            <Zap size={14} className="text-cyan-400 fill-cyan-400/20" />
          </div>
          <p className="text-[11px] md:text-xs font-medium text-slate-400 leading-tight">
            <span className="text-cyan-400 block sm:inline font-bold uppercase mr-1">AI Logic Active:</span>
            Auto-crop & background removal enabled.
          </p>
          <ShieldCheck size={16} className="text-emerald-500 ml-1 hidden sm:block" />
        </div>

      </div>
    </div>
  );
};

export default CountrySelector;