import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Search, X, Globe, Check, Sparkles, ShieldCheck } from 'lucide-react';

const POPULAR_CODES = ['in', 'us', 'gb', 'ca', 'au', 'ae', 'sa', 'de', 'fr', 'jp', 'cn', 'sg', 'my', 'nz', 'br', 'ru'];

const CountrySearchModal = ({ isOpen, onClose, countries, selectedCountry, onSelectCountry }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState('all'); // 'all' | 'popular'
  const inputRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      setSearchQuery('');
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  const filteredCountries = useMemo(() => {
    if (!countries || !countries.length) return [];
    
    let list = countries;
    if (filterMode === 'popular') {
      list = countries.filter(c => POPULAR_CODES.includes(c.code.toLowerCase()) || POPULAR_CODES.includes((c.iso || '').toLowerCase()));
    }

    if (!searchQuery.trim()) return list;

    const q = searchQuery.toLowerCase().trim();
    return list.filter(c => 
      c.name.toLowerCase().includes(q) ||
      c.code.toLowerCase().includes(q) ||
      (c.iso && c.iso.toLowerCase().includes(q)) ||
      (c.standard && c.standard.toLowerCase().includes(q)) ||
      (c.size && c.size.toLowerCase().includes(q))
    );
  }, [countries, searchQuery, filterMode]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
      <div 
        className="relative w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] text-white"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/40">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400">
              <Globe size={20} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                Select Passport & Visa Standard
                <span className="text-xs px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 font-medium">
                  {countries.length} Countries
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Official biometric dimensions compliant with ICAO 9303 standards
              </p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Search & Filter Bar */}
        <div className="p-4 border-b border-slate-800/80 bg-slate-900/60 space-y-3">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input
              ref={inputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by country name (e.g. India, USA, Canada, Germany, Japan...)"
              className="w-full pl-10 pr-10 py-2.5 bg-slate-950 border border-slate-700/80 rounded-xl text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-all"
            />
            {searchQuery && (
              <button 
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
              >
                <X size={16} />
              </button>
            )}
          </div>

          {/* Quick Filter Tabs */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setFilterMode('all')}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                filterMode === 'all'
                  ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/20 font-bold'
                  : 'bg-slate-800/60 text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              All Countries ({countries.length})
            </button>
            <button
              onClick={() => setFilterMode('popular')}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                filterMode === 'popular'
                  ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/20 font-bold'
                  : 'bg-slate-800/60 text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              <Sparkles size={12} />
              Popular Standards
            </button>
          </div>
        </div>

        {/* Countries Grid */}
        <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
          {filteredCountries.length === 0 ? (
            <div className="py-12 text-center text-slate-400">
              <Globe size={36} className="mx-auto mb-3 opacity-30 text-slate-500" />
              <p className="font-semibold text-sm text-slate-300">No matching country found</p>
              <p className="text-xs text-slate-500 mt-1">Try searching for country name or ISO code</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {filteredCountries.map((c) => {
                const isSelected = selectedCountry === c.code || selectedCountry === (c.iso || '').toLowerCase();
                const displayStandard = c.standard || c.size || '35x45 mm';
                return (
                  <div
                    key={c.code}
                    onClick={() => {
                      onSelectCountry(c.code);
                      onClose();
                    }}
                    className={`p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between group ${
                      isSelected
                        ? 'bg-cyan-500/10 border-cyan-500/50 shadow-md shadow-cyan-500/10'
                        : 'bg-slate-950/60 border-slate-800/80 hover:bg-slate-800/60 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 ${
                        isSelected 
                          ? 'bg-cyan-500 text-slate-950' 
                          : 'bg-slate-800 text-slate-400 group-hover:text-slate-200'
                      }`}>
                        {c.iso || c.code.slice(0, 2).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="font-semibold text-sm text-slate-200 truncate group-hover:text-white flex items-center gap-1.5">
                          <span>{c.name}</span>
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-xs font-medium text-cyan-400">
                            {displayStandard}
                          </span>
                          <span className="text-[10px] text-slate-500">• 300 DPI</span>
                        </div>
                      </div>
                    </div>

                    <div className="shrink-0 ml-2">
                      {isSelected ? (
                        <div className="w-5 h-5 rounded-full bg-cyan-500 text-slate-950 flex items-center justify-center shadow">
                          <Check size={12} strokeWidth={3} />
                        </div>
                      ) : (
                        <div className="w-5 h-5 rounded-full border border-slate-700 group-hover:border-slate-500 transition-colors" />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer info */}
        <div className="p-3.5 border-t border-slate-800 bg-slate-950/60 flex items-center justify-between text-xs text-slate-400">
          <div className="flex items-center gap-2">
            <ShieldCheck size={14} className="text-emerald-400" />
            <span>Standard: <strong>{filteredCountries.length}</strong> available</span>
          </div>
          <span className="text-slate-500">Auto-applies 300 DPI crop & head ratio</span>
        </div>
      </div>
    </div>
  );
};

export default CountrySearchModal;
