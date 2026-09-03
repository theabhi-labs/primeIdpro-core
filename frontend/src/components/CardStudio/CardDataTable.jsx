import React, { useState, useMemo } from 'react';
import { Search, Filter, Edit3, Image as ImageIcon, CheckCircle2, AlertTriangle, XCircle, RotateCcw, ChevronLeft, ChevronRight, Upload } from 'lucide-react';

export default function CardDataTable({ records = [], onUpdateRecord, onReplacePhoto }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const [editingCell, setEditingCell] = useState(null); // { recordId, field }
  const [editValue, setEditValue] = useState('');

  // Filter & Search records
  const filteredRecords = useMemo(() => {
    return records.filter((r) => {
      // Status filter
      if (statusFilter === 'matched' && !r.photo?.matched) return false;
      if (statusFilter === 'missing' && r.photo?.matched) return false;
      if (statusFilter === 'errors' && r.validation?.status !== 'error') return false;

      // Search term
      if (searchTerm.trim()) {
        const query = searchTerm.toLowerCase();
        const name = String(r.fields?.name || '').toLowerCase();
        const roll = String(r.fields?.rollNumber || r.fields?.employeeId || '').toLowerCase();
        const cls = String(r.fields?.class || r.fields?.department || '').toLowerCase();
        return name.includes(query) || roll.includes(query) || cls.includes(query);
      }
      return true;
    });
  }, [records, statusFilter, searchTerm]);

  // Paginated records
  const totalPages = Math.max(1, Math.ceil(filteredRecords.length / pageSize));
  const paginatedRecords = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredRecords.slice(start, start + pageSize);
  }, [filteredRecords, page, pageSize]);

  const handleStartEdit = (recordId, field, currentValue) => {
    setEditingCell({ recordId, field });
    setEditValue(currentValue || '');
  };

  const handleSaveEdit = (recordId, field) => {
    if (!editingCell) return;
    onUpdateRecord?.(recordId, { [field]: editValue });
    setEditingCell(null);
  };

  const getFullPhotoUrl = (url) => {
    if (!url) return null;
    if (url.startsWith('http') || url.startsWith('data:')) return url;
    const base = window.electronAPI?.getApiUrl ? window.electronAPI.getApiUrl() : 'http://127.0.0.1:10000';
    return `${base}${url}`;
  };

  return (
    <div className="space-y-4">
      {/* Top Filter & Search Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-slate-950/80 border border-slate-800 rounded-2xl">
        <div className="flex items-center gap-2 flex-1 min-w-[240px]">
          <div className="relative w-full max-w-xs">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setPage(1);
              }}
              placeholder="Search by name, roll no, class..."
              className="w-full bg-slate-900 border border-slate-700/80 rounded-xl pl-8 pr-3 py-1.5 text-xs text-white placeholder:text-slate-500 outline-none focus:border-cyan-500"
            />
          </div>

          {/* Filter Pills */}
          <div className="flex items-center gap-1.5 text-xs">
            <button
              type="button"
              onClick={() => { setStatusFilter('all'); setPage(1); }}
              className={`px-2.5 py-1 rounded-lg font-semibold transition-all ${
                statusFilter === 'all'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              All ({records.length})
            </button>
            <button
              type="button"
              onClick={() => { setStatusFilter('matched'); setPage(1); }}
              className={`px-2.5 py-1 rounded-lg font-semibold transition-all ${
                statusFilter === 'matched'
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Matched ({records.filter(r => r.photo?.matched).length})
            </button>
            <button
              type="button"
              onClick={() => { setStatusFilter('missing'); setPage(1); }}
              className={`px-2.5 py-1 rounded-lg font-semibold transition-all ${
                statusFilter === 'missing'
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Missing Photos ({records.filter(r => !r.photo?.matched).length})
            </button>
          </div>
        </div>

        {/* Record count indicator */}
        <span className="text-xs text-slate-400 font-mono">
          Showing {paginatedRecords.length} of {filteredRecords.length} records
        </span>
      </div>

      {/* Table Container */}
      <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-950/60 shadow-xl">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="bg-slate-900 border-b border-slate-800 text-slate-400 font-bold uppercase tracking-wider text-[10px]">
              <th className="p-3 w-12 text-center">#</th>
              <th className="p-3 w-16 text-center">Photo</th>
              <th className="p-3">Full Name</th>
              <th className="p-3">Roll / ID</th>
              <th className="p-3">Class / Dept</th>
              <th className="p-3">Phone</th>
              <th className="p-3">Blood Grp</th>
              <th className="p-3 text-center">Photo Status</th>
              <th className="p-3 text-center">Validation</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60 font-sans">
            {paginatedRecords.length === 0 ? (
              <tr>
                <td colSpan={9} className="p-8 text-center text-slate-500 text-xs">
                  No records matching search or filter criteria.
                </td>
              </tr>
            ) : (
              paginatedRecords.map((rec, rIdx) => {
                const photoSrc = getFullPhotoUrl(rec.processedPhoto?.processedUrl || rec.photo?.originalPath);
                const isPhotoMatched = rec.photo?.matched || rec.processedPhoto?.status === 'completed';
                const hasErrors = rec.validation?.errors && rec.validation.errors.length > 0;
                const hasWarnings = rec.validation?.warnings && rec.validation.warnings.length > 0;

                return (
                  <tr key={rec.id} className="hover:bg-slate-900/40 transition-colors">
                    {/* Index */}
                    <td className="p-3 text-center font-mono text-slate-500 font-bold text-[11px]">
                      {(page - 1) * pageSize + rIdx + 1}
                    </td>

                    {/* Photo Thumbnail */}
                    <td className="p-2 text-center">
                      <div className="w-10 h-12 rounded-lg bg-slate-900 border border-slate-700/80 overflow-hidden mx-auto flex items-center justify-center relative group shadow-sm">
                        {photoSrc ? (
                          <img src={photoSrc} alt="Student" className="w-full h-full object-cover" />
                        ) : (
                          <svg viewBox="0 0 100 120" className="w-full h-full bg-slate-950 p-1">
                            <circle cx="50" cy="40" r="22" fill="#38bdf8" />
                            <path d="M15,115 C15,80 32,70 50,70 C68,70 85,80 85,115 Z" fill="#0284c7" />
                            <circle cx="50" cy="38" r="17" fill="#fed7aa" />
                          </svg>
                        )}
                        {/* Replace photo quick button */}
                        <label className="absolute inset-0 bg-slate-950/80 opacity-0 group-hover:opacity-100 flex items-center justify-center cursor-pointer transition-opacity">
                          <Upload size={12} className="text-cyan-400" />
                          <input
                            type="file"
                            accept="image/*"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) onReplacePhoto?.(rec.id, file);
                            }}
                            className="hidden"
                          />
                        </label>
                      </div>
                    </td>

                    {/* Full Name (Inline Editable) */}
                    <td className="p-3">
                      {editingCell?.recordId === rec.id && editingCell?.field === 'name' ? (
                        <input
                          type="text"
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onBlur={() => handleSaveEdit(rec.id, 'name')}
                          onKeyDown={(e) => e.key === 'Enter' && handleSaveEdit(rec.id, 'name')}
                          autoFocus
                          className="bg-slate-900 border border-cyan-500 rounded px-2 py-1 text-xs text-white outline-none w-full"
                        />
                      ) : (
                        <div
                          onClick={() => handleStartEdit(rec.id, 'name', rec.fields?.name)}
                          className="font-bold text-white uppercase hover:text-cyan-400 cursor-pointer flex items-center gap-1 group"
                          title="Click to edit name"
                        >
                          <span>{rec.fields?.name || '-'}</span>
                          <Edit3 size={10} className="opacity-0 group-hover:opacity-100 text-slate-500" />
                        </div>
                      )}
                    </td>

                    {/* Roll / ID (Inline Editable) */}
                    <td className="p-3 font-mono font-bold text-cyan-400">
                      {editingCell?.recordId === rec.id && editingCell?.field === 'rollNumber' ? (
                        <input
                          type="text"
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onBlur={() => handleSaveEdit(rec.id, 'rollNumber')}
                          onKeyDown={(e) => e.key === 'Enter' && handleSaveEdit(rec.id, 'rollNumber')}
                          autoFocus
                          className="bg-slate-900 border border-cyan-500 rounded px-2 py-1 text-xs text-white outline-none w-24"
                        />
                      ) : (
                        <div
                          onClick={() => handleStartEdit(rec.id, 'rollNumber', rec.fields?.rollNumber || rec.fields?.employeeId)}
                          className="hover:text-cyan-300 cursor-pointer flex items-center gap-1 group"
                        >
                          <span>{rec.fields?.rollNumber || rec.fields?.employeeId || '-'}</span>
                          <Edit3 size={10} className="opacity-0 group-hover:opacity-100 text-slate-500" />
                        </div>
                      )}
                    </td>

                    {/* Class / Department */}
                    <td className="p-3 text-slate-300">
                      {rec.fields?.class || rec.fields?.department || '-'}
                      {rec.fields?.section ? ` (${rec.fields.section})` : ''}
                    </td>

                    {/* Phone */}
                    <td className="p-3 font-mono text-slate-400 text-[11px]">
                      {rec.fields?.mobile || '-'}
                    </td>

                    {/* Blood Group */}
                    <td className="p-3">
                      {rec.fields?.bloodGroup ? (
                        <span className="font-bold text-rose-400 text-xs">{rec.fields.bloodGroup}</span>
                      ) : (
                        <span className="text-slate-600">-</span>
                      )}
                    </td>

                    {/* Photo Status Pill */}
                    <td className="p-3 text-center">
                      {rec.processedPhoto?.status === 'completed' ? (
                        <span className="px-2 py-0.5 rounded-full bg-cyan-950 text-cyan-300 border border-cyan-800/50 text-[10px] font-bold">
                          PROCESSED
                        </span>
                      ) : isPhotoMatched ? (
                        <span className="px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-800/50 text-[10px] font-bold">
                          MATCHED
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700 text-[10px] font-bold">
                          AVATAR
                        </span>
                      )}
                    </td>

                    {/* Validation Status */}
                    <td className="p-3 text-center">
                      {hasErrors ? (
                        <span
                          className="px-2 py-0.5 rounded-full bg-rose-950/80 text-rose-300 border border-rose-800/50 text-[10px] font-bold cursor-help"
                          title={rec.validation.errors.join('\n')}
                        >
                          ⚠️ Error
                        </span>
                      ) : hasWarnings ? (
                        <span
                          className="px-2 py-0.5 rounded-full bg-amber-950/80 text-amber-300 border border-amber-800/50 text-[10px] font-bold cursor-help"
                          title={rec.validation.warnings.join('\n')}
                        >
                          ⚠️ Notice
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full bg-emerald-950/80 text-emerald-300 border border-emerald-800/50 text-[10px] font-bold">
                          ✅ Valid
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>


      {/* Pagination Footer */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between p-3 bg-slate-950/80 border border-slate-800 rounded-2xl">
          <span className="text-xs text-slate-400">
            Page <strong>{page}</strong> of <strong>{totalPages}</strong>
          </span>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage(prev => Math.max(1, prev - 1))}
              className="p-1.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-40 text-slate-300 rounded-lg border border-slate-800"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage(prev => Math.min(totalPages, prev + 1))}
              className="p-1.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-40 text-slate-300 rounded-lg border border-slate-800"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
