import React, { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, ImagePlus, AlertCircle } from 'lucide-react';
import { validateImage } from '../../services/api';  // ✅ fixed path

const PhotoUploader = ({ onUpload }) => {
  const [errorMessage, setErrorMessage] = useState(null);

  const showError = (msg) => {
    setErrorMessage(msg);
    setTimeout(() => setErrorMessage(null), 5000);
  };

  const onDrop = useCallback((acceptedFiles, rejectedFiles) => {
    console.log('📁 Accepted:', acceptedFiles);
    console.log('❌ Rejected:', rejectedFiles);

    if (rejectedFiles?.length) {
      const reasons = rejectedFiles.map(r => {
        const file = r.file;
        const errors = r.errors.map(e => e.message).join(', ');
        return `${file.name}: ${errors}`;
      }).join('; ');
      showError(`Rejected: ${reasons}`);
    }

    if (acceptedFiles.length) {
      const validFiles = [];
      const invalidFiles = [];

      acceptedFiles.forEach(file => {
        const validation = validateImage(file);
        if (validation.valid) validFiles.push(file);
        else invalidFiles.push({ file, error: validation.error });
      });

      if (invalidFiles.length) {
        showError(`${invalidFiles.length} file(s) invalid: ${invalidFiles.map(i => i.file.name).join(', ')}`);
      }

      if (validFiles.length) onUpload(validFiles);
    }
  }, [onUpload]);

  const onDropRejected = useCallback((rejectedFiles) => {
    const reasons = rejectedFiles.map(r => {
      const file = r.file;
      const errors = r.errors.map(e => e.message).join(', ');
      return `${file.name}: ${errors}`;
    }).join('; ');
    showError(`Cannot upload: ${reasons}`);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    onDropRejected,
    accept: { 'image/*': ['.jpeg', '.jpg', '.png', '.webp'] },
    maxSize: 10 * 1024 * 1024,
    multiple: true,
    noClick: true,
  });

  const handleFileInputChange = (e) => {
    const files = Array.from(e.target.files);
    if (files.length) {
      const validFiles = [];
      const invalidFiles = [];
      files.forEach(file => {
        const validation = validateImage(file);
        if (validation.valid) validFiles.push(file);
        else invalidFiles.push({ file, error: validation.error });
      });
      if (invalidFiles.length) {
        showError(`${invalidFiles.length} file(s) invalid: ${invalidFiles.map(i => i.file.name).join(', ')}`);
      }
      if (validFiles.length) onUpload(validFiles);
    }
  };

  return (
    <div className="min-h-screen bg-[#020617] text-slate-200 flex flex-col items-center p-6 font-sans">
      {errorMessage && (
        <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-50 bg-red-600/90 backdrop-blur-md text-white px-6 py-3 rounded-xl shadow-2xl flex items-center gap-2">
          <AlertCircle className="w-5 h-5" />
          <span className="text-sm font-medium">{errorMessage}</span>
        </div>
      )}

      <div
        {...getRootProps()}
        className={`relative w-full max-w-2xl group transition-all duration-300 ease-in-out border-2 border-dashed rounded-[2rem] p-12 text-center 
          ${isDragActive 
            ? 'border-cyan-500 bg-cyan-500/10 shadow-[0_0_40px_-10px_rgba(6,182,212,0.3)]' 
            : 'border-slate-800 bg-slate-900/40 hover:border-slate-600 hover:bg-slate-900/60'
          }`}
      >
        <input {...getInputProps()} multiple style={{ display: 'none' }} />
        <div className="absolute inset-0 bg-gradient-to-b from-cyan-500/5 to-transparent rounded-[2rem] pointer-events-none" />
        <div className="relative z-10">
          <div className={`mx-auto w-20 h-20 rounded-2xl flex items-center justify-center mb-6 transition-transform duration-500 group-hover:scale-110 
            ${isDragActive ? 'bg-cyan-500 text-white' : 'bg-slate-800 text-slate-400'}`}>
            <Upload className={`w-10 h-10 ${isDragActive ? 'animate-bounce' : ''}`} />
          </div>
          <h3 className="text-xl font-semibold text-white mb-2">
            {isDragActive ? 'Release to Enhance' : 'Upload your Portrait'}
          </h3>
          <p className="text-slate-400 mb-8 max-w-xs mx-auto">
            Drag & drop your images here or use the professional selector
          </p>
          <div className="flex flex-col items-center gap-4">
            <label
              htmlFor="file-upload-multi"
              className="group relative flex items-center gap-2 px-8 py-3 bg-white text-black font-bold rounded-xl cursor-pointer hover:bg-cyan-400 transition-all duration-200 shadow-xl"
            >
              <ImagePlus className="w-5 h-5" />
              Select Photos
              <input
                id="file-upload-multi"
                type="file"
                multiple
                accept="image/jpeg,image/jpg,image/png,image/webp"
                onChange={handleFileInputChange}
                className="hidden"
              />
            </label>
            <p className="text-xs text-slate-500">
              Supports: <span className="text-slate-300">JPEG, PNG, WEBP (Max 10MB)</span>
            </p>
          </div>
        </div>
      </div>

      <div className="mt-8 text-center">
        <div className="flex items-center gap-4 text-slate-500 text-xs uppercase tracking-[0.2em]">
          <span>Fast Processing</span>
          <span className="w-1 h-1 bg-slate-700 rounded-full"></span>
          <span>Studio Quality</span>
          <span className="w-1 h-1 bg-slate-700 rounded-full"></span>
          <span>AI Refined</span>
        </div>
      </div>
    </div>
  );
};

export default PhotoUploader;