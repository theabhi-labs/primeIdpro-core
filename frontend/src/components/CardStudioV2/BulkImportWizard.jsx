import React, { useState, useEffect, useRef } from 'react';
import { UploadCloud, Folder, Columns3, CheckCircle2, AlertCircle, Image as ImageIcon, Loader2 } from 'lucide-react';
import * as XLSX from 'xlsx';
import Papa from 'papaparse';
import { uploadPrivatePhotoV2, bulkCreateRecordsV2 } from '../../services/cardStudioV2Api';

const BulkImportWizard = ({ project, onClose, onComplete }) => {
  const [step, setStep] = useState(1);
  
  // State for files
  const [dataFile, setDataFile] = useState(null);
  const [photoFiles, setPhotoFiles] = useState([]); // Array of File objects
  
  // State for parsing
  const [headers, setHeaders] = useState([]);
  const [rawRows, setRawRows] = useState([]);
  const [mappings, setMappings] = useState({});
  const [photoColumn, setPhotoColumn] = useState('');
  
  // State for processing
  const [previewRecords, setPreviewRecords] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [importProgress, setImportProgress] = useState(0);
  
  // State for results
  const [importResults, setImportResults] = useState(null);
  
  // Fetch semantic schema from project
  const fieldSchema = project?.template_snapshot?.field_schema || [];
  const photoFields = fieldSchema.filter(f => f.data_type === 'image' || f.data_type === 'photo');

  // Step 1: Handle File Selection
  const handleDataFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setDataFile(file);
    parseDataFile(file);
  };

  const handlePhotoFolderChange = (e) => {
    const files = Array.from(e.target.files).filter(f => f.type.startsWith('image/'));
    setPhotoFiles(files);
  };

  const parseDataFile = (file) => {
    setIsProcessing(true);
    const ext = file.name.split('.').pop().toLowerCase();
    
    if (ext === 'csv') {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          setHeaders(results.meta.fields || []);
          setRawRows(results.data);
          setIsProcessing(false);
        }
      });
    } else if (ext === 'xlsx' || ext === 'xls') {
      const reader = new FileReader();
      reader.onload = (e) => {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const json = XLSX.utils.sheet_to_json(worksheet, { defval: '' });
        
        if (json.length > 0) {
          setHeaders(Object.keys(json[0]));
          setRawRows(json);
        }
        setIsProcessing(false);
      };
      reader.readAsArrayBuffer(file);
    } else {
      alert("Unsupported file type");
      setIsProcessing(false);
    }
  };

  // Step 2: Handle Mappings
  const handleMappingChange = (header, schemaKey) => {
    setMappings(prev => ({
      ...prev,
      [header]: schemaKey
    }));
  };

  const generatePreview = () => {
    // Deterministic photo matcher
    const normalize = (name) => name.toLowerCase().replace(/[\s_-]+/g, '');
    const photoDict = {};
    photoFiles.forEach(f => {
      const norm = normalize(f.name);
      if (!photoDict[norm]) photoDict[norm] = [];
      photoDict[norm].push(f);
    });

    const records = rawRows.map((row, idx) => {
      const data = {};
      let validationErrors = [];
      let photoMatch = null;
      let photoStatus = 'ok'; // ok, missing, ambiguous, none

      // Map fields
      Object.entries(mappings).forEach(([header, key]) => {
        if (key && key !== '_ignore_') {
          data[key] = row[header];
        }
      });

      // Find photo file if mapped
      if (photoColumn && row[photoColumn]) {
        const searchedName = row[photoColumn];
        const normSearch = normalize(searchedName);
        const matches = photoDict[normSearch];
        
        if (!matches || matches.length === 0) {
          photoStatus = 'missing';
          validationErrors.push(`Photo missing: ${searchedName}`);
        } else if (matches.length > 1) {
          photoStatus = 'ambiguous';
          validationErrors.push(`Ambiguous photo match: ${searchedName}`);
        } else {
          photoMatch = matches[0];
        }
      } else if (photoColumn) {
        photoStatus = 'none';
      }

      // Check required fields
      fieldSchema.forEach(f => {
        if (f.required && (!data[f.key] || data[f.key].toString().trim() === '')) {
          validationErrors.push(`Missing required field: ${f.label}`);
        }
      });

      return {
        _index: idx + 1,
        _raw: row,
        data,
        photoMatch,
        photoStatus,
        validationErrors,
        isValid: validationErrors.length === 0 && photoStatus !== 'ambiguous'
      };
    });

    setPreviewRecords(records);
    setStep(3);
  };

  // Final Import Process
  const handleImport = async () => {
    setIsProcessing(true);
    setStep(4);
    
    const validRecords = previewRecords.filter(r => r.isValid);
    if (validRecords.length === 0) {
      setIsProcessing(false);
      return;
    }

    try {
      // Phase 1: Upload Photos in chunks
      let uploadedPhotosCount = 0;
      const photoIdMap = new Map(); // file reference -> opaque photo_id

      const uniquePhotos = new Set();
      validRecords.forEach(r => {
        if (r.photoMatch) uniquePhotos.add(r.photoMatch);
      });

      const photoArray = Array.from(uniquePhotos);
      for (let i = 0; i < photoArray.length; i++) {
        const file = photoArray[i];
        const res = await uploadPrivatePhotoV2(project.id, file);
        photoIdMap.set(file, res.photo_id);
        uploadedPhotosCount++;
        setUploadProgress(Math.round((uploadedPhotosCount / photoArray.length) * 100));
      }

      // Phase 2: Create bulk payload and submit in chunks of 50
      let created = 0;
      let skipped = 0;
      let failed = 0;
      const batchId = `BATCH-${Date.now()}`;

      const chunkSize = 50;
      for (let i = 0; i < validRecords.length; i += chunkSize) {
        const chunk = validRecords.slice(i, i + chunkSize).map(r => {
          const finalData = { ...r.data };
          
          // Inject opaque photo_id where required
          if (r.photoMatch && photoFields.length > 0) {
            const pid = photoIdMap.get(r.photoMatch);
            photoFields.forEach(pf => {
              // Only inject into mapped photo field, or first photo field if none mapped
              finalData[pf.key] = pid;
            });
          }

          return {
            data: finalData,
            status: 'ready',
            source: 'excel'
          };
        });

        const res = await bulkCreateRecordsV2(project.id, batchId, chunk);
        created += res.created || 0;
        skipped += res.skipped || 0;
        failed += res.failed || 0;

        setImportProgress(Math.round(((i + chunk.length) / validRecords.length) * 100));
      }

      setImportResults({ created, skipped, failed });
      setStep(5);
    } catch (err) {
      console.error(err);
      alert("An error occurred during import.");
    } finally {
      setIsProcessing(false);
      // Cleanup object URLs if we had generated any
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-center items-center bg-slate-900/50 backdrop-blur-sm p-6">
      <div className="bg-white w-full max-w-5xl h-[85vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-fade-in-up">
        
        {/* Header */}
        <div className="bg-slate-50 border-b border-slate-100 px-6 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-cyan-100 text-cyan-600 rounded-xl flex items-center justify-center">
              <UploadCloud size={20} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-800">Bulk Import Wizard</h2>
              <p className="text-xs font-medium text-slate-500">Step {step} of 5</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-2">✕</button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-8">
          
          {step === 1 && (
            <div className="max-w-2xl mx-auto space-y-8">
              <div className="text-center">
                <h3 className="text-2xl font-bold text-slate-800 mb-2">Upload Data Source</h3>
                <p className="text-slate-500">Select an Excel or CSV file containing your records.</p>
              </div>

              <div className="border-2 border-dashed border-slate-300 rounded-2xl p-10 text-center hover:border-cyan-500 hover:bg-cyan-50 transition-colors">
                <input 
                  type="file" 
                  accept=".xlsx, .xls, .csv" 
                  onChange={handleDataFileChange} 
                  className="hidden" 
                  id="data-file" 
                />
                <label htmlFor="data-file" className="cursor-pointer flex flex-col items-center">
                  <UploadCloud size={48} className="text-slate-400 mb-4" />
                  <span className="text-lg font-bold text-slate-700">{dataFile ? dataFile.name : 'Select Data File'}</span>
                  <span className="text-sm text-slate-500 mt-1">.xlsx or .csv up to 10MB</span>
                </label>
              </div>

              {dataFile && (
                <div className="flex justify-end">
                  <button onClick={() => setStep(2)} className="bg-cyan-600 text-white px-6 py-3 rounded-xl font-bold shadow-md hover:bg-cyan-700">
                    Next Step →
                  </button>
                </div>
              )}
            </div>
          )}

          {step === 2 && (
            <div className="space-y-6">
              <div>
                <h3 className="text-xl font-bold text-slate-800">Map Columns</h3>
                <p className="text-slate-500">Match the columns from your file to the project's semantic schema.</p>
              </div>

              <div className="grid grid-cols-2 gap-8">
                <div className="bg-slate-50 rounded-xl border border-slate-200 p-4">
                  <h4 className="font-bold text-slate-700 mb-4 flex items-center gap-2">
                    <Columns3 size={18} /> Data Mapping
                  </h4>
                  <div className="space-y-3">
                    {headers.map(h => (
                      <div key={h} className="flex items-center gap-4 bg-white p-3 rounded-lg border border-slate-200">
                        <span className="font-medium text-sm text-slate-700 w-1/3 truncate">{h}</span>
                        <span className="text-slate-400">→</span>
                        <select 
                          className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-sm outline-none"
                          value={mappings[h] || ''}
                          onChange={(e) => handleMappingChange(h, e.target.value)}
                        >
                          <option value="_ignore_">-- Ignore Column --</option>
                          {fieldSchema.map(f => (
                            <option key={f.key} value={f.key}>{f.label} {f.required ? '*' : ''}</option>
                          ))}
                        </select>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-slate-50 rounded-xl border border-slate-200 p-4 flex flex-col">
                  <h4 className="font-bold text-slate-700 mb-4 flex items-center gap-2">
                    <ImageIcon size={18} /> Photo Directory
                  </h4>
                  <p className="text-sm text-slate-600 mb-4">
                    If you have local photos, select the folder containing them. Ensure you map a column containing the filenames.
                  </p>
                  
                  <div className="mb-4">
                    <label className="block text-sm font-semibold text-slate-700 mb-1">Which column contains the photo filename?</label>
                    <select 
                      className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none"
                      value={photoColumn}
                      onChange={(e) => setPhotoColumn(e.target.value)}
                    >
                      <option value="">-- No Photos --</option>
                      {headers.map(h => (
                        <option key={h} value={h}>{h}</option>
                      ))}
                    </select>
                  </div>

                  {photoColumn && (
                    <div className="flex-1 border-2 border-dashed border-slate-300 rounded-xl flex items-center justify-center p-6 bg-white">
                      <input 
                        type="file" 
                        webkitdirectory="" 
                        directory="" 
                        onChange={handlePhotoFolderChange} 
                        className="hidden" 
                        id="photo-folder" 
                      />
                      <label htmlFor="photo-folder" className="cursor-pointer text-center">
                        <Folder size={32} className="mx-auto text-indigo-400 mb-2" />
                        <div className="font-bold text-slate-700">Select Photo Folder</div>
                        <div className="text-xs text-slate-500 mt-1">{photoFiles.length} files selected</div>
                      </label>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex justify-between items-center pt-4">
                <button onClick={() => setStep(1)} className="text-slate-500 font-medium hover:text-slate-800">← Back</button>
                <button 
                  onClick={generatePreview}
                  className="bg-cyan-600 text-white px-6 py-2.5 rounded-xl font-bold shadow-md hover:bg-cyan-700"
                >
                  Generate Preview
                </button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="flex flex-col h-full space-y-4">
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="text-xl font-bold text-slate-800">Preview & Validate</h3>
                  <p className="text-slate-500">Review matched photos and validation errors before importing.</p>
                </div>
                <div className="flex gap-4">
                  <div className="bg-emerald-50 border border-emerald-200 px-4 py-2 rounded-lg text-emerald-700 font-bold text-sm">
                    {previewRecords.filter(r => r.isValid).length} Valid
                  </div>
                  <div className="bg-red-50 border border-red-200 px-4 py-2 rounded-lg text-red-700 font-bold text-sm">
                    {previewRecords.filter(r => !r.isValid).length} Invalid
                  </div>
                </div>
              </div>

              <div className="flex-1 border border-slate-200 rounded-xl overflow-hidden flex flex-col">
                <div className="overflow-y-auto flex-1">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 sticky top-0 border-b border-slate-200 z-10">
                      <tr>
                        <th className="p-3 font-semibold text-slate-600 w-16">Row</th>
                        <th className="p-3 font-semibold text-slate-600 w-24">Status</th>
                        <th className="p-3 font-semibold text-slate-600 w-24">Photo</th>
                        <th className="p-3 font-semibold text-slate-600">Mapped Data</th>
                        <th className="p-3 font-semibold text-slate-600">Validation</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {previewRecords.map(r => (
                        <tr key={r._index} className={!r.isValid ? 'bg-red-50/30' : 'hover:bg-slate-50'}>
                          <td className="p-3 text-slate-500 font-medium">{r._index}</td>
                          <td className="p-3">
                            {r.isValid ? (
                              <span className="inline-flex items-center gap-1 text-emerald-600 font-semibold text-xs">
                                <CheckCircle2 size={14} /> Valid
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-red-600 font-semibold text-xs">
                                <AlertCircle size={14} /> Invalid
                              </span>
                            )}
                          </td>
                          <td className="p-3">
                            {r.photoMatch ? (
                              <div className="w-10 h-10 rounded-md overflow-hidden bg-slate-100 border border-slate-200">
                                <img src={URL.createObjectURL(r.photoMatch)} alt="" className="w-full h-full object-cover" />
                              </div>
                            ) : (
                              <div className="w-10 h-10 rounded-md bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-400">
                                <ImageIcon size={16} />
                              </div>
                            )}
                          </td>
                          <td className="p-3">
                            <div className="flex flex-wrap gap-2">
                              {Object.entries(r.data).map(([k, v]) => (
                                <span key={k} className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full border border-slate-200 truncate max-w-[150px]">
                                  {v}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className="p-3 text-xs text-red-600 font-medium">
                            {r.validationErrors.map((err, i) => (
                              <div key={i}>• {err}</div>
                            ))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="flex justify-between items-center pt-2">
                <button onClick={() => setStep(2)} className="text-slate-500 font-medium hover:text-slate-800">← Edit Mapping</button>
                <button 
                  onClick={handleImport}
                  disabled={previewRecords.filter(r => r.isValid).length === 0}
                  className="bg-emerald-600 text-white px-8 py-2.5 rounded-xl font-bold shadow-md hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-2"
                >
                  {isProcessing && <Loader2 size={16} className="animate-spin" />}
                  Start Import ({previewRecords.filter(r => r.isValid).length})
                </button>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="flex flex-col items-center justify-center h-full max-w-md mx-auto text-center space-y-8">
              <Loader2 size={48} className="animate-spin text-cyan-600 mx-auto" />
              
              <div className="w-full space-y-6">
                <div>
                  <div className="flex justify-between text-sm font-bold text-slate-700 mb-2">
                    <span>Uploading Photos</span>
                    <span>{uploadProgress}%</span>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-2.5">
                    <div className="bg-cyan-600 h-2.5 rounded-full transition-all duration-300" style={{ width: `${uploadProgress}%` }}></div>
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-sm font-bold text-slate-700 mb-2">
                    <span>Creating Records</span>
                    <span>{importProgress}%</span>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-2.5">
                    <div className="bg-indigo-600 h-2.5 rounded-full transition-all duration-300" style={{ width: `${importProgress}%` }}></div>
                  </div>
                </div>
              </div>
              
              <p className="text-slate-500 font-medium">Please do not close this window...</p>
            </div>
          )}

          {step === 5 && importResults && (
            <div className="flex flex-col items-center justify-center h-full max-w-md mx-auto text-center space-y-6">
              <div className="w-20 h-20 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center">
                <CheckCircle2 size={40} />
              </div>
              
              <h3 className="text-2xl font-black text-slate-800">Import Complete!</h3>
              
              <div className="w-full bg-slate-50 rounded-2xl border border-slate-200 p-6 grid grid-cols-3 gap-4">
                <div className="flex flex-col">
                  <span className="text-3xl font-black text-emerald-600">{importResults.created}</span>
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider mt-1">Created</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-3xl font-black text-amber-500">{importResults.skipped}</span>
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider mt-1">Skipped</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-3xl font-black text-red-500">{importResults.failed}</span>
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider mt-1">Failed</span>
                </div>
              </div>

              <button 
                onClick={() => {
                  onComplete();
                  onClose();
                }}
                className="w-full bg-slate-800 text-white py-3 rounded-xl font-bold hover:bg-slate-900 transition-colors"
              >
                Return to Workspace
              </button>
            </div>
          )}

        </div>
      </div>
    </div>
  );
};

export default BulkImportWizard;
