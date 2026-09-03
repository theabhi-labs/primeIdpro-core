import React, { useState } from 'react';
import { Columns3, ArrowRight, Plus, Save, Sparkles, Check, AlertCircle } from 'lucide-react';

const STANDARD_TARGET_FIELDS = [
  { id: 'name', label: 'Full Name', required: true },
  { id: 'rollNumber', label: 'Roll No / ID', required: true },
  { id: 'class', label: 'Class / Grade', required: false },
  { id: 'section', label: 'Section / Division', required: false },
  { id: 'fatherName', label: "Father's Name", required: false },
  { id: 'motherName', label: "Mother's Name", required: false },
  { id: 'dob', label: 'Date of Birth', required: false },
  { id: 'bloodGroup', label: 'Blood Group', required: false },
  { id: 'mobile', label: 'Mobile / Emergency', required: false },
  { id: 'email', label: 'Email Address', required: false },
  { id: 'address', label: 'Residential Address', required: false },
  { id: 'photo', label: 'Photo Filename / Path', required: false },
  { id: 'admissionNo', label: 'Admission Number', required: false },
  { id: 'employeeId', label: 'Employee ID', required: false },
  { id: 'designation', label: 'Designation / Title', required: false },
  { id: 'department', label: 'Department / Branch', required: false },
  { id: 'course', label: 'Course / Program', required: false },
  { id: 'memberId', label: 'Membership ID', required: false },
  { id: 'tier', label: 'Tier / Category', required: false },
  { id: 'validTill', label: 'Validity Date', required: false },
];

export default function Step5_ColumnMapping({ project, updateProject, onNext, onPrev, setToast }) {
  const detectedHeaders = project.metadata?.detectedHeaders || [];
  const mappings = project.columnMappings || {};

  const [customFieldName, setCustomFieldName] = useState('');
  const [profileName, setProfileName] = useState('');
  const [savedProfiles, setSavedProfiles] = useState(['Default School Mapping', 'Employee Standard Profile']);

  const handleMappingChange = (excelCol, targetFieldId) => {
    updateProject({
      columnMappings: {
        ...mappings,
        [excelCol]: targetFieldId === '_ignore_' ? undefined : targetFieldId,
      },
    });
  };

  const handleAddCustomField = () => {
    if (!customFieldName.trim()) return;
    const cleanId = customFieldName.toLowerCase().replace(/[^a-z0-9]/g, '_');
    STANDARD_TARGET_FIELDS.push({ id: cleanId, label: customFieldName, required: false });
    setCustomFieldName('');
    setToast?.({ type: 'info', message: `Added custom field: ${cleanId}` });
  };

  const handleSaveProfile = () => {
    if (!profileName.trim()) return;
    setSavedProfiles(prev => [...prev, profileName.trim()]);
    setProfileName('');
    setToast?.({ type: 'success', message: 'Mapping profile saved for future re-use.' });
  };

  // Check if at least name and ID/rollNumber are mapped
  const isManual = project.dataSourceType === 'manual' || project.dataSourceType === 'paste' || (project.records && project.records.length > 0);
  const mappedValues = Object.values(mappings).filter(Boolean);
  const hasName = isManual ? true : mappedValues.includes('name');
  const hasId = isManual ? true : mappedValues.some(v => ['rollNumber', 'employeeId', 'memberId', 'registrationNumber'].includes(v));


  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header Banner */}
      <div className="p-4 rounded-2xl bg-gradient-to-r from-blue-900/30 via-slate-900 to-cyan-900/30 border border-blue-500/20 flex items-center justify-between">
        <div>
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <Columns3 className="w-5 h-5 text-cyan-400" />
            Step 5: Map Spreadsheet Columns to Card Fields
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Connect each column from your uploaded file to internal template fields. Save mapping profiles for 1-click reuse next time.
          </p>
        </div>
      </div>

      {/* Mapping Profile Quick Load & Save */}
      <div className="p-4 rounded-2xl bg-slate-950/70 border border-slate-800 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Sparkles size={16} className="text-cyan-400" />
          <span className="text-xs font-bold text-slate-300">Saved Mapping Profiles:</span>
          <select
            className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white outline-none focus:border-cyan-500"
            onChange={(e) => {
              if (e.target.value) {
                setToast?.({ type: 'success', message: `Loaded profile: ${e.target.value}` });
              }
            }}
          >
            <option value="">-- Load Saved Profile --</option>
            {savedProfiles.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <input
            type="text"
            value={profileName}
            onChange={(e) => setProfileName(e.target.value)}
            placeholder="Profile Name (e.g. DPS Mapping)"
            className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white outline-none placeholder:text-slate-600"
          />
          <button
            type="button"
            onClick={handleSaveProfile}
            disabled={!profileName.trim()}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-xs font-bold text-cyan-400 rounded-lg border border-slate-700 flex items-center gap-1 transition-all"
          >
            <Save size={13} /> Save Profile
          </button>
        </div>
      </div>

      {/* Mapping Rows Table */}
      <div className="p-5 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-3">
        <div className="grid grid-cols-12 gap-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider pb-2 border-b border-slate-800">
          <div className="col-span-5">Spreadsheet Column (Source)</div>
          <div className="col-span-2 text-center">Mapping</div>
          <div className="col-span-5">Card Field (Destination)</div>
        </div>

        <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1">
          {detectedHeaders.length === 0 ? (
            <p className="text-xs text-slate-500 py-4 text-center">No spreadsheet columns detected. Please go back to Step 4 and upload a file.</p>
          ) : (
            detectedHeaders.map((header) => {
              const currentMapped = mappings[header] || '';
              const isMapped = Boolean(currentMapped);

              return (
                <div
                  key={header}
                  className={`grid grid-cols-12 gap-3 items-center p-2.5 rounded-xl border transition-all ${
                    isMapped
                      ? 'bg-slate-900/90 border-slate-700/80'
                      : 'bg-slate-950 border-slate-800/60 opacity-80'
                  }`}
                >
                  {/* Left: Source Header */}
                  <div className="col-span-5 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-cyan-400"></span>
                    <span className="text-xs font-bold text-white font-mono truncate" title={header}>
                      {header}
                    </span>
                  </div>

                  {/* Center: Arrow Icon */}
                  <div className="col-span-2 flex justify-center text-slate-600">
                    <ArrowRight size={14} className={isMapped ? 'text-cyan-400' : 'text-slate-600'} />
                  </div>

                  {/* Right: Target Field Selector */}
                  <div className="col-span-5">
                    <select
                      value={currentMapped || '_ignore_'}
                      onChange={(e) => handleMappingChange(header, e.target.value)}
                      className={`w-full rounded-lg px-3 py-1.5 text-xs font-semibold outline-none transition-all ${
                        isMapped
                          ? 'bg-slate-950 border border-cyan-500/50 text-cyan-300'
                          : 'bg-slate-900 border border-slate-800 text-slate-400'
                      }`}
                    >
                      <option value="_ignore_">-- Do Not Map (Ignore) --</option>
                      <optgroup label="Standard Fields">
                        {STANDARD_TARGET_FIELDS.map((f) => (
                          <option key={f.id} value={f.id}>
                            {f.label} {f.required ? '*' : ''} ({f.id})
                          </option>
                        ))}
                      </optgroup>
                    </select>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Add Custom Field row */}
        <div className="pt-3 border-t border-slate-800 flex items-center gap-3">
          <input
            type="text"
            value={customFieldName}
            onChange={(e) => setCustomFieldName(e.target.value)}
            placeholder="Add Custom Field (e.g. Bus Route, House, Blood Group)"
            className="flex-1 bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-white outline-none focus:border-cyan-500"
          />
          <button
            type="button"
            onClick={handleAddCustomField}
            disabled={!customFieldName.trim()}
            className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-xs font-bold text-cyan-400 rounded-lg border border-slate-700 flex items-center gap-1 transition-all"
          >
            <Plus size={14} /> Add Custom Field
          </button>
        </div>
      </div>

      {/* Validation indicator */}
      {(!hasName || !hasId) && (
        <div className="p-3.5 rounded-2xl bg-amber-950/30 border border-amber-500/30 flex items-center gap-2.5 text-amber-300 text-xs font-medium">
          <AlertCircle size={16} className="shrink-0" />
          <span>Please map at least <strong>Full Name</strong> and an identifier (<strong>Roll No</strong> or <strong>Employee ID</strong>) before continuing.</span>
        </div>
      )}

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
          disabled={!hasName}
          onClick={onNext}
          className="px-6 py-2.5 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 disabled:from-slate-800 disabled:to-slate-800 disabled:text-slate-600 text-slate-950 font-bold text-xs rounded-xl transition-all shadow-md active:scale-95 cursor-pointer"
        >
          Match Photos →
        </button>
      </div>
    </div>
  );
}
