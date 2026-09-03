import React, { useState, useRef } from 'react';
import {
  UploadCloud,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Image as ImageIcon,
  Plus,
  Trash2,
  Edit3,
  Sparkles,
  ClipboardList,
  UserPlus,
  Camera,
  Upload,
} from 'lucide-react';
import { importCardFile } from '../../../services/cardApi';

const SAMPLE_STUDENTS = [
  {
    name: 'MARIYA',
    rollNumber: '083',
    class: '11th',
    section: 'A',
    fatherName: 'SHANU',
    mobile: '9125264245',
    dob: '22/12/2011',
    bloodGroup: 'B+',
    address: "SHAHPUR JOT YUSUF 'HATHILA' BAHRAICH",
  },
  {
    name: 'AARAV SHARMA',
    rollNumber: '104',
    class: '10th',
    section: 'A',
    fatherName: 'RAJESH SHARMA',
    mobile: '9876543210',
    dob: '14/08/2010',
    bloodGroup: 'O+',
    address: 'B-42, VASANT VIHAR, NEW DELHI',
  },
  {
    name: 'ANANYA VERMA',
    rollNumber: '092',
    class: '12th',
    section: 'B',
    fatherName: 'VIKAS VERMA',
    mobile: '9811223344',
    dob: '05/03/2009',
    bloodGroup: 'A+',
    address: 'CIVIL LINES, BAHRAICH, UP',
  },
  {
    name: 'RAHUL KUMAR',
    rollNumber: '115',
    class: '10th',
    section: 'B',
    fatherName: 'MANOJ KUMAR',
    mobile: '9822334455',
    dob: '19/11/2010',
    bloodGroup: 'AB+',
    address: 'STATION ROAD, BAHRAICH',
  },
  {
    name: 'PRIYA SINGH',
    rollNumber: '047',
    class: '11th',
    section: 'A',
    fatherName: 'DINESH SINGH',
    mobile: '9833445566',
    dob: '30/01/2011',
    bloodGroup: 'O-',
    address: 'KACHAHRI ROAD, BAHRAICH',
  },
];

export default function Step4_DataImport({ project, updateProject, onNext, onPrev, setToast }) {
  const [activeMode, setActiveMode] = useState('excel'); // 'excel' | 'manual' | 'paste'
  const [isUploading, setIsUploading] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [selectedSheet, setSelectedSheet] = useState(null);
  const fileInputRef = useRef(null);

  // Manual Entry Form State
  const [newRecord, setNewRecord] = useState({
    name: '',
    rollNumber: '',
    class: '',
    section: 'A',
    fatherName: '',
    mobile: '',
    bloodGroup: '',
    dob: '',
    address: '',
    photoDataUrl: '',
  });

  // Paste Text State
  const [pasteText, setPasteText] = useState('');

  // 1. Handle File Upload (Excel / CSV)
  const handleFileUpload = async (file, sheetName = null) => {
    if (!file) return;
    setIsUploading(true);
    try {
      const data = await importCardFile(file, sheetName);
      if (data?.success) {
        setImportResult(data);
        setSelectedSheet(data.sheets?.[0] || 'Sheet1');

        updateProject({
          dataSourceType: data.fileType === '.csv' ? 'csv' : 'excel',
          dataSourceName: data.fileName,
          totalRecords: data.totalRows,
          columnMappings: data.suggestedMappings || {},
          metadata: {
            ...project.metadata,
            tempFilePath: data.tempFilePath,
            detectedHeaders: data.detectedHeaders,
            embeddedImagesCount: data.embeddedImagesCount,
          },
        });
        setToast?.({ type: 'success', message: `Imported ${data.totalRows} records from ${data.fileName}` });
      }
    } catch (err) {
      console.error('Import error:', err);
      setToast?.({ type: 'error', message: err?.response?.data?.detail || 'Failed to parse spreadsheet file.' });
    } finally {
      setIsUploading(false);
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) handleFileUpload(file);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) handleFileUpload(file);
  };

  // 2. Handle Manual Entry Add Row
  const handleAddManualRecord = () => {
    if (!newRecord.name.trim() || !newRecord.rollNumber.trim()) {
      setToast?.({ type: 'error', message: "Please enter at least Student's Name and Roll No." });
      return;
    }

    const recId = `rec_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const newEntry = {
      id: recId,
      fields: {
        name: newRecord.name.trim().toUpperCase(),
        rollNumber: newRecord.rollNumber.trim(),
        class: newRecord.class.trim(),
        section: newRecord.section.trim(),
        fatherName: newRecord.fatherName.trim().toUpperCase(),
        mobile: newRecord.mobile.trim(),
        bloodGroup: newRecord.bloodGroup.trim(),
        dob: newRecord.dob.trim(),
        address: newRecord.address.trim().toUpperCase(),
      },
      photo: newRecord.photoDataUrl
        ? {
            source: 'manual',
            originalFilename: `${newRecord.rollNumber}.jpg`,
            originalPath: newRecord.photoDataUrl,
            matched: true,
            matchConfidence: 1.0,
            matchMethod: 'manual',
          }
        : { matched: false },
      processedPhoto: newRecord.photoDataUrl
        ? { status: 'completed', processedUrl: newRecord.photoDataUrl }
        : { status: 'pending' },
      validation: { status: 'valid', errors: [], warnings: [] },
    };

    const currentRecords = project.records || [];
    const updated = [...currentRecords, newEntry];

    updateProject({
      dataSourceType: 'manual',
      dataSourceName: 'Manual Entry',
      totalRecords: updated.length,
      records: updated,
      photosMatched: updated.filter((r) => r.photo?.matched).length,
      columnMappings: {
        name: 'name',
        rollNumber: 'rollNumber',
        class: 'class',
        section: 'section',
        fatherName: 'fatherName',
        mobile: 'mobile',
        bloodGroup: 'bloodGroup',
        dob: 'dob',
        address: 'address',
      },
      metadata: {
        ...project.metadata,
        detectedHeaders: ['name', 'rollNumber', 'class', 'section', 'fatherName', 'mobile', 'bloodGroup', 'dob', 'address'],
      },
    });

    // Reset Form
    setNewRecord({
      name: '',
      rollNumber: '',
      class: '',
      section: 'A',
      fatherName: '',
      mobile: '',
      bloodGroup: '',
      dob: '',
      address: '',
      photoDataUrl: '',
    });

    setToast?.({ type: 'success', message: `Added record for ${newEntry.fields.name}` });
  };

  // 3. Handle Manual Record Delete
  const handleDeleteManualRecord = (recId) => {
    const updated = (project.records || []).filter((r) => r.id !== recId);
    updateProject({
      totalRecords: updated.length,
      records: updated,
      photosMatched: updated.filter((r) => r.photo?.matched).length,
    });
    setToast?.({ type: 'info', message: 'Record removed.' });
  };

  // 4. Handle Photo Pick for Manual Record
  const handlePhotoUploadForRecord = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setNewRecord((prev) => ({ ...prev, photoDataUrl: reader.result }));
    };
    reader.readAsDataURL(file);
  };

  // 5. Handle Sample Data Fill
  const handleFillSampleData = () => {
    const sampleEntries = SAMPLE_STUDENTS.map((s, idx) => ({
      id: `sample_${idx + 1}`,
      fields: { ...s },
      photo: { matched: false },
      processedPhoto: { status: 'pending' },
      validation: { status: 'valid', errors: [], warnings: [] },
    }));

    updateProject({
      dataSourceType: 'manual',
      dataSourceName: 'Sample Demo Records',
      totalRecords: sampleEntries.length,
      records: sampleEntries,
      photosMatched: 0,
      columnMappings: {
        name: 'name',
        rollNumber: 'rollNumber',
        class: 'class',
        section: 'section',
        fatherName: 'fatherName',
        mobile: 'mobile',
        bloodGroup: 'bloodGroup',
        dob: 'dob',
        address: 'address',
      },
      metadata: {
        ...project.metadata,
        detectedHeaders: ['name', 'rollNumber', 'class', 'section', 'fatherName', 'mobile', 'bloodGroup', 'dob', 'address'],
      },
    });

    setActiveMode('manual');
    setToast?.({ type: 'success', message: `Added ${sampleEntries.length} sample student records!` });
  };

  // 6. Handle Paste TSV/CSV from Clipboard
  const handleParsePastedText = () => {
    if (!pasteText.trim()) return;
    const lines = pasteText.trim().split('\n').filter((l) => l.trim());
    if (!lines.length) return;

    // Detect delimiter (Tab or Comma)
    const firstLine = lines[0];
    const delimiter = firstLine.includes('\t') ? '\t' : ',';

    const parsedRows = lines.map((line, rIdx) => {
      const parts = line.split(delimiter).map((p) => p.trim().replace(/^["']|["']$/g, ''));
      return {
        id: `pasted_${Date.now()}_${rIdx}`,
        fields: {
          name: parts[0]?.toUpperCase() || `STUDENT ${rIdx + 1}`,
          rollNumber: parts[1] || `${rIdx + 1}`,
          class: parts[2] || '10th',
          section: parts[3] || 'A',
          fatherName: parts[4]?.toUpperCase() || '',
          mobile: parts[5] || '',
          dob: parts[6] || '',
          bloodGroup: parts[7] || '',
          address: parts[8]?.toUpperCase() || '',
        },
        photo: { matched: false },
        processedPhoto: { status: 'pending' },
        validation: { status: 'valid', errors: [], warnings: [] },
      };
    });

    const updated = [...(project.records || []), ...parsedRows];

    updateProject({
      dataSourceType: 'paste',
      dataSourceName: 'Clipboard Paste',
      totalRecords: updated.length,
      records: updated,
      photosMatched: updated.filter((r) => r.photo?.matched).length,
      columnMappings: {
        name: 'name',
        rollNumber: 'rollNumber',
        class: 'class',
        section: 'section',
        fatherName: 'fatherName',
        mobile: 'mobile',
        bloodGroup: 'bloodGroup',
        dob: 'dob',
        address: 'address',
      },
      metadata: {
        ...project.metadata,
        detectedHeaders: ['name', 'rollNumber', 'class', 'section', 'fatherName', 'mobile', 'bloodGroup', 'dob', 'address'],
      },
    });

    setPasteText('');
    setActiveMode('manual');
    setToast?.({ type: 'success', message: `Successfully parsed & added ${parsedRows.length} records!` });
  };

  const manualRecords = project.records || [];
  const canProceed = Boolean(importResult || manualRecords.length > 0);

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header Banner */}
      <div className="p-4 rounded-2xl bg-gradient-to-r from-blue-900/30 via-slate-900 to-cyan-900/30 border border-blue-500/20 flex items-center justify-between">
        <div>
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-cyan-400" />
            Step 4: Import Structured Data & Student Records
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Choose how to provide your data: bulk Excel (.xlsx) / CSV file upload, manual entry form, or copy-paste from clipboard.
          </p>
        </div>

        {/* Quick Sample Data Fill Button */}
        <button
          type="button"
          onClick={handleFillSampleData}
          className="px-3.5 py-1.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-extrabold text-xs rounded-xl shadow-md flex items-center gap-1.5 transition-all cursor-pointer shrink-0"
          title="Instantly fills 5 sample school records for testing"
        >
          <Sparkles size={13} />
          <span>⚡ Fill 5 Sample Records</span>
        </button>
      </div>

      {/* Mode Switcher Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
        <button
          type="button"
          onClick={() => setActiveMode('excel')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
            activeMode === 'excel'
              ? 'bg-cyan-500 text-slate-950 shadow-md'
              : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
          }`}
        >
          <UploadCloud size={14} />
          <span>Upload Excel / CSV File</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveMode('manual')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
            activeMode === 'manual'
              ? 'bg-cyan-500 text-slate-950 shadow-md'
              : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
          }`}
        >
          <UserPlus size={14} />
          <span>Manual Entry Form ({manualRecords.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveMode('paste')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
            activeMode === 'paste'
              ? 'bg-cyan-500 text-slate-950 shadow-md'
              : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
          }`}
        >
          <ClipboardList size={14} />
          <span>Paste from Clipboard</span>
        </button>
      </div>

      {/* ================= MODE 1: EXCEL / CSV UPLOAD ================= */}
      {activeMode === 'excel' && (
        <div className="space-y-4">
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            onClick={() => !isUploading && fileInputRef.current?.click()}
            className={`p-8 rounded-3xl border-2 border-dashed flex flex-col items-center justify-center text-center cursor-pointer transition-all ${
              importResult
                ? 'bg-slate-950/40 border-cyan-500/40 hover:border-cyan-400'
                : 'bg-slate-950/80 border-slate-700 hover:border-cyan-500 hover:bg-slate-900/50'
            }`}
          >
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept=".xlsx,.xls,.csv"
              className="hidden"
            />

            {isUploading ? (
              <div className="flex flex-col items-center gap-3 py-6">
                <Loader2 size={36} className="animate-spin text-cyan-400" />
                <p className="text-sm font-bold text-slate-200">Parsing spreadsheet & extracting drawing media...</p>
                <p className="text-xs text-slate-500 font-mono">Running offline openpyxl parser</p>
              </div>
            ) : importResult ? (
              <div className="flex flex-col items-center gap-2 py-3">
                <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                  <CheckCircle2 size={24} />
                </div>
                <h4 className="text-sm font-bold text-white mt-1">{importResult.fileName}</h4>
                <p className="text-xs text-emerald-400 font-medium">
                  ✅ Successfully parsed {importResult.totalRows} rows • {importResult.detectedHeaders?.length} columns
                </p>
                {importResult.embeddedImagesCount > 0 && (
                  <span className="text-[11px] px-2.5 py-1 rounded-full bg-blue-950 text-blue-300 border border-blue-800/50 flex items-center gap-1.5 mt-1 font-semibold">
                    <ImageIcon size={12} /> {importResult.embeddedImagesCount} Embedded Photos Extracted
                  </span>
                )}
                <p className="text-[11px] text-slate-500 mt-2">Click to replace or upload a different spreadsheet</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3 py-4">
                <div className="w-14 h-14 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400 shadow-lg shadow-cyan-950/40">
                  <UploadCloud size={28} />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-white">Drag & drop your Excel (.xlsx) or CSV file here</h4>
                  <p className="text-xs text-slate-400 mt-1">Supports multi-worksheet workbooks, arbitrary column names, and embedded photos</p>
                </div>
                <button
                  type="button"
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-xs font-bold text-cyan-400 rounded-xl border border-slate-700 transition-all mt-1 cursor-pointer"
                >
                  Browse Local Files
                </button>
              </div>
            )}
          </div>

          {/* Worksheet Selector (If multi-sheet) */}
          {importResult?.sheets?.length > 1 && (
            <div className="p-4 rounded-2xl bg-slate-950/70 border border-slate-800 flex items-center justify-between">
              <span className="text-xs font-bold text-slate-300">Select Worksheet:</span>
              <div className="flex gap-2">
                {importResult.sheets.map((sheet) => (
                  <button
                    key={sheet}
                    type="button"
                    onClick={() => setSelectedSheet(sheet)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                      selectedSheet === sheet
                        ? 'bg-cyan-500 text-slate-950 font-bold'
                        : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
                    }`}
                  >
                    {sheet}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ================= MODE 2: MANUAL DATA ENTRY FORM ================= */}
      {activeMode === 'manual' && (
        <div className="space-y-6">
          {/* Quick Add Form Box */}
          <div className="p-5 rounded-3xl bg-slate-950/80 border border-slate-800 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <UserPlus size={15} className="text-cyan-400" />
                Add Student / Staff Record Manually
              </h4>
              <span className="text-[11px] text-slate-500">Fields marked * are required</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
              {/* Name */}
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-300">Student's Full Name *</label>
                <input
                  type="text"
                  value={newRecord.name}
                  onChange={(e) => setNewRecord({ ...newRecord, name: e.target.value })}
                  placeholder="e.g. MARIYA"
                  className="w-full bg-slate-900 border border-slate-700/80 rounded-xl px-3 py-2 text-xs text-white uppercase outline-none focus:border-cyan-500"
                />
              </div>

              {/* Roll No */}
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-300">Roll No / ID *</label>
                <input
                  type="text"
                  value={newRecord.rollNumber}
                  onChange={(e) => setNewRecord({ ...newRecord, rollNumber: e.target.value })}
                  placeholder="e.g. 083"
                  className="w-full bg-slate-900 border border-slate-700/80 rounded-xl px-3 py-2 text-xs text-white font-mono outline-none focus:border-cyan-500"
                />
              </div>

              {/* Class & Section */}
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-300">Class</label>
                  <input
                    type="text"
                    value={newRecord.class}
                    onChange={(e) => setNewRecord({ ...newRecord, class: e.target.value })}
                    placeholder="11th"
                    className="w-full bg-slate-900 border border-slate-700/80 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-cyan-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-300">Section</label>
                  <input
                    type="text"
                    value={newRecord.section}
                    onChange={(e) => setNewRecord({ ...newRecord, section: e.target.value })}
                    placeholder="A"
                    className="w-full bg-slate-900 border border-slate-700/80 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-cyan-500"
                  />
                </div>
              </div>

              {/* Father Name */}
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-300">Father's Name</label>
                <input
                  type="text"
                  value={newRecord.fatherName}
                  onChange={(e) => setNewRecord({ ...newRecord, fatherName: e.target.value })}
                  placeholder="e.g. SHANU"
                  className="w-full bg-slate-900 border border-slate-700/80 rounded-xl px-3 py-2 text-xs text-white uppercase outline-none focus:border-cyan-500"
                />
              </div>

              {/* Mobile */}
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-300">Mobile No.</label>
                <input
                  type="text"
                  value={newRecord.mobile}
                  onChange={(e) => setNewRecord({ ...newRecord, mobile: e.target.value })}
                  placeholder="9125264245"
                  className="w-full bg-slate-900 border border-slate-700/80 rounded-xl px-3 py-2 text-xs text-white font-mono outline-none focus:border-cyan-500"
                />
              </div>

              {/* DOB & Blood Group */}
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-300">DOB</label>
                  <input
                    type="text"
                    value={newRecord.dob}
                    onChange={(e) => setNewRecord({ ...newRecord, dob: e.target.value })}
                    placeholder="22/12/2011"
                    className="w-full bg-slate-900 border border-slate-700/80 rounded-xl px-3 py-2 text-xs text-white font-mono outline-none focus:border-cyan-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-300">Blood Grp</label>
                  <input
                    type="text"
                    value={newRecord.bloodGroup}
                    onChange={(e) => setNewRecord({ ...newRecord, bloodGroup: e.target.value })}
                    placeholder="O+"
                    className="w-full bg-slate-900 border border-slate-700/80 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-cyan-500"
                  />
                </div>
              </div>
            </div>

            {/* Address & Photo Row */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-3.5 pt-1">
              <div className="md:col-span-8 space-y-1">
                <label className="text-[11px] font-bold text-slate-300">Residential Address</label>
                <input
                  type="text"
                  value={newRecord.address}
                  onChange={(e) => setNewRecord({ ...newRecord, address: e.target.value })}
                  placeholder="e.g. SHAHPUR JOT YUSUF 'HATHILA' BAHRAICH"
                  className="w-full bg-slate-900 border border-slate-700/80 rounded-xl px-3 py-2 text-xs text-white uppercase outline-none focus:border-cyan-500"
                />
              </div>

              {/* Photo Upload */}
              <div className="md:col-span-4 space-y-1">
                <label className="text-[11px] font-bold text-slate-300">Student Photo (Optional)</label>
                <label className="w-full bg-slate-900 hover:bg-slate-850 border border-slate-700/80 hover:border-cyan-500 rounded-xl px-3 py-1.5 flex items-center justify-between cursor-pointer transition-all">
                  <span className="text-xs text-slate-400 truncate">
                    {newRecord.photoDataUrl ? '✅ Photo Selected' : 'Choose Photo File'}
                  </span>
                  <Camera size={14} className="text-cyan-400 shrink-0" />
                  <input type="file" accept="image/*" onChange={handlePhotoUploadForRecord} className="hidden" />
                </label>
              </div>
            </div>

            {/* Add Button */}
            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={handleAddManualRecord}
                className="px-5 py-2.5 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-bold text-xs rounded-xl shadow-md flex items-center gap-2 transition-all active:scale-95 cursor-pointer"
              >
                <Plus size={15} />
                <span>Add Record to Batch</span>
              </button>
            </div>
          </div>

          {/* Manually Added Records Table */}
          {manualRecords.length > 0 && (
            <div className="p-5 rounded-3xl bg-slate-950/80 border border-slate-800 space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                  Records in Current Batch ({manualRecords.length})
                </h4>
                <span className="text-[11px] text-emerald-400 font-bold">✅ Ready for Production</span>
              </div>

              <div className="overflow-x-auto rounded-2xl border border-slate-800">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-900 border-b border-slate-800 text-slate-400 font-bold uppercase text-[10px]">
                      <th className="p-2.5 w-10 text-center">#</th>
                      <th className="p-2.5">Name</th>
                      <th className="p-2.5">Roll No</th>
                      <th className="p-2.5">Class</th>
                      <th className="p-2.5">Father's Name</th>
                      <th className="p-2.5">Mobile</th>
                      <th className="p-2.5">Address</th>
                      <th className="p-2.5 w-12 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-sans">
                    {manualRecords.map((rec, rIdx) => (
                      <tr key={rec.id || rIdx} className="hover:bg-slate-900/40">
                        <td className="p-2.5 text-center font-mono text-slate-500">{rIdx + 1}</td>
                        <td className="p-2.5 font-bold text-white uppercase">{rec.fields?.name}</td>
                        <td className="p-2.5 font-mono font-bold text-cyan-400">{rec.fields?.rollNumber}</td>
                        <td className="p-2.5 text-slate-300">{rec.fields?.class}</td>
                        <td className="p-2.5 text-slate-300 uppercase">{rec.fields?.fatherName || '-'}</td>
                        <td className="p-2.5 font-mono text-slate-400">{rec.fields?.mobile || '-'}</td>
                        <td className="p-2.5 text-slate-400 truncate max-w-[150px]">{rec.fields?.address || '-'}</td>
                        <td className="p-2.5 text-center">
                          <button
                            type="button"
                            onClick={() => handleDeleteManualRecord(rec.id)}
                            className="p-1 text-slate-500 hover:text-rose-400 transition-colors"
                            title="Remove"
                          >
                            <Trash2 size={13} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ================= MODE 3: PASTE FROM CLIPBOARD ================= */}
      {activeMode === 'paste' && (
        <div className="p-5 rounded-3xl bg-slate-950/80 border border-slate-800 space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-slate-800">
            <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <ClipboardList size={15} className="text-cyan-400" />
              Paste Tab/Comma-Separated Data from Excel or Google Sheets
            </h4>
          </div>

          <div className="space-y-2">
            <p className="text-xs text-slate-400">
              Columns Order: <span className="font-mono text-cyan-300 font-semibold">Name, RollNo, Class, Section, FatherName, Mobile, DOB, BloodGroup, Address</span>
            </p>
            <textarea
              rows={6}
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              placeholder="MARIYA&#9;083&#9;11th&#9;A&#9;SHANU&#9;9125264245&#9;22/12/2011&#9;B+&#9;SHAHPUR JOT YUSUF&#10;AARAV SHARMA&#9;104&#9;10th&#9;A&#9;RAJESH SHARMA&#9;9876543210&#9;14/08/2010&#9;O+&#9;VASANT VIHAR"
              className="w-full bg-slate-900 border border-slate-700 rounded-2xl p-3 text-xs text-white font-mono outline-none focus:border-cyan-500"
            />
          </div>

          <div className="flex justify-end">
            <button
              type="button"
              disabled={!pasteText.trim()}
              onClick={handleParsePastedText}
              className="px-5 py-2.5 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 disabled:opacity-50 text-slate-950 font-bold text-xs rounded-xl shadow-md flex items-center gap-2 transition-all cursor-pointer"
            >
              <CheckCircle2 size={15} />
              <span>Parse & Add Pasted Records</span>
            </button>
          </div>
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
          disabled={!canProceed}
          onClick={onNext}
          className="px-6 py-2.5 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 disabled:from-slate-800 disabled:to-slate-800 disabled:text-slate-600 text-slate-950 font-bold text-xs rounded-xl transition-all shadow-md active:scale-95 cursor-pointer"
        >
          {manualRecords.length > 0 ? 'Proceed to Photo Matching →' : 'Map Columns →'}
        </button>
      </div>
    </div>
  );
}
