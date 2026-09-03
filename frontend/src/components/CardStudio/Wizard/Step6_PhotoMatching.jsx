import React, { useState, useRef } from 'react';
import { FolderOpen, Upload, CheckCircle2, AlertTriangle, XCircle, Loader2, Sparkles, RefreshCw, UserCheck } from 'lucide-react';
import { matchCardPhotos } from '../../../services/cardApi';

export default function Step6_PhotoMatching({ project, updateProject, onNext, onPrev, setToast }) {
  const [photoFolderPath, setPhotoFolderPath] = useState('');
  const [matchStrategy, setMatchStrategy] = useState('auto');
  const [identifierField, setIdentifierField] = useState('rollNumber');
  const [isMatching, setIsMatching] = useState(false);
  const [matchStats, setMatchStats] = useState(null);

  const folderInputRef = useRef(null);

  const handleRunPhotoMatch = async (uploadedFiles = null) => {
    setIsMatching(true);
    try {
      const payload = {
        projectId: project.id,
        photoFolderPath: photoFolderPath || null,
        matchStrategy,
        identifierField,
        uploadedPhotoFiles: uploadedFiles || null,
      };

      const res = await matchCardPhotos(payload);
      if (res?.success) {
        setMatchStats(res.stats);
        updateProject({
          records: res.records || project.records,
          photosMatched: res.stats?.matched || 0,
        });
        setToast?.({
          type: 'success',
          message: `Photo matching complete! Matched ${res.stats.matched} / ${project.records?.length || 0} photos.`,
        });
      }
    } catch (err) {
      console.error('Match error:', err);
      setToast?.({ type: 'error', message: err?.response?.data?.detail || 'Photo matching failed.' });
    } finally {
      setIsMatching(false);
    }
  };

  const handleFolderUpload = (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    // Convert uploaded files to path / dataUrl list
    const uploadedList = [];
    let loadedCount = 0;

    files.forEach((file) => {
      const reader = new FileReader();
      reader.onload = () => {
        uploadedList.push({
          filename: file.name,
          path: file.path || null,
          dataUrl: reader.result,
        });
        loadedCount++;
        if (loadedCount === files.length) {
          handleRunPhotoMatch(uploadedList);
        }
      };
      reader.readAsDataURL(file);
    });
  };

  const totalRecords = project.records?.length || project.totalRecords || 0;
  const matchedCount = matchStats?.matched ?? project.photosMatched ?? 0;
  const missingCount = Math.max(0, totalRecords - matchedCount);

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header Banner */}
      <div className="p-4 rounded-2xl bg-gradient-to-r from-blue-900/30 via-slate-900 to-cyan-900/30 border border-blue-500/20 flex items-center justify-between">
        <div>
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <UserCheck className="w-5 h-5 text-cyan-400" />
            Step 6: Match Student / Staff Photos
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Connect each record with their respective portrait photo via filename, roll number, employee ID, or embedded Excel media.
          </p>
        </div>
      </div>

      {/* Matching Controls Box */}
      <div className="p-5 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-4">
        <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2 pb-2 border-b border-slate-800">
          <FolderOpen size={16} className="text-cyan-400" /> Photo Source & Matching Strategy
        </h4>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Strategy Selector */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold text-slate-400">Match Strategy</label>
            <select
              value={matchStrategy}
              onChange={(e) => setMatchStrategy(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:border-cyan-500 outline-none"
            >
              <option value="auto">Auto-Detect (Embedded → Filename → ID)</option>
              <option value="roll_no">Identifier Match (Roll No / Emp ID + .jpg)</option>
              <option value="exact_filename">Exact Filename in Excel Column</option>
              <option value="embedded">Embedded Excel Photos Only</option>
            </select>
          </div>

          {/* Identifier Field Selector */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold text-slate-400">Identifier Field for Photo Name</label>
            <select
              value={identifierField}
              onChange={(e) => setIdentifierField(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:border-cyan-500 outline-none"
            >
              <option value="rollNumber">Roll Number (e.g. 101.jpg)</option>
              <option value="employeeId">Employee ID (e.g. EMP-01.jpg)</option>
              <option value="registrationNumber">Admission / Reg No</option>
              <option value="memberId">Membership ID</option>
              <option value="name">Full Name (e.g. rahul_kumar.jpg)</option>
            </select>
          </div>
        </div>

        {/* Action Buttons: Pick Folder or Run Matching */}
        <div className="pt-2 flex flex-wrap items-center gap-3">
          {/* Hidden Directory Input */}
          <input
            type="file"
            ref={folderInputRef}
            onChange={handleFolderUpload}
            webkitdirectory="true"
            directory="true"
            multiple
            className="hidden"
          />

          <button
            type="button"
            onClick={() => folderInputRef.current?.click()}
            disabled={isMatching}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-xs font-bold text-cyan-400 rounded-xl border border-slate-700 flex items-center gap-2 transition-all cursor-pointer"
          >
            <FolderOpen size={15} /> Select Photos Folder
          </button>

          <button
            type="button"
            onClick={() => handleRunPhotoMatch(null)}
            disabled={isMatching}
            className="px-5 py-2 bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 font-bold text-xs rounded-xl border border-cyan-500/40 flex items-center gap-2 transition-all cursor-pointer"
          >
            {isMatching ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            Run Photo Matching Engine
          </button>
        </div>
      </div>

      {/* Match Statistics Card */}
      <div className="grid grid-cols-3 gap-4">
        {/* Matched */}
        <div className="p-4 rounded-2xl bg-slate-950/70 border border-emerald-500/30 flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
            <CheckCircle2 size={20} />
          </div>
          <div>
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Matched Photos</p>
            <p className="text-lg font-black text-emerald-400 font-mono">
              {matchedCount} <span className="text-xs text-slate-500">/ {totalRecords}</span>
            </p>
          </div>
        </div>

        {/* Missing */}
        <div className="p-4 rounded-2xl bg-slate-950/70 border border-amber-500/30 flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
            <AlertTriangle size={20} />
          </div>
          <div>
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Missing Photos</p>
            <p className="text-lg font-black text-amber-400 font-mono">{missingCount}</p>
          </div>
        </div>

        {/* Embedded / Folder info */}
        <div className="p-4 rounded-2xl bg-slate-950/70 border border-slate-800 flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/30 flex items-center justify-center text-blue-400">
            <Sparkles size={20} />
          </div>
          <div>
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Match Accuracy</p>
            <p className="text-lg font-black text-white font-mono">
              {totalRecords > 0 ? Math.round((matchedCount / totalRecords) * 100) : 0}%
            </p>
          </div>
        </div>
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
          className="px-6 py-2.5 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-bold text-xs rounded-xl transition-all shadow-md active:scale-95 cursor-pointer"
        >
          Process Photo Queue →
        </button>
      </div>
    </div>
  );
}
