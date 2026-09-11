import React, { useState, useEffect } from 'react';
import {
  X,
  CreditCard,
  School,
  Building,
  Check,
  Upload,
  Copy,
  Sparkles,
  QrCode,
  Layers,
  Palette,
  FileSpreadsheet,
  Link,
  ChevronRight,
  ArrowRight,
  ArrowLeft,
  Image as ImageIcon,
} from 'lucide-react';
import { getCardTemplatesApi, saveCardProjectApi } from '../../services/cardApi';

const AVAILABLE_FIELDS = [
  { id: 'name', label: 'Student Name', required: true, defaultChecked: true },
  { id: 'rollNumber', label: 'Roll Number / ID', required: true, defaultChecked: true },
  { id: 'className', label: 'Class & Section', required: false, defaultChecked: true },
  { id: 'fatherName', label: "Father's Name", required: false, defaultChecked: true },
  { id: 'dob', label: 'Date of Birth (DOB)', required: false, defaultChecked: true },
  { id: 'bloodGroup', label: 'Blood Group', required: false, defaultChecked: true },
  { id: 'phone', label: 'Emergency Contact / Phone', required: false, defaultChecked: true },
  { id: 'address', label: 'Residential Address', required: false, defaultChecked: false },
  { id: 'motherName', label: "Mother's Name", required: false, defaultChecked: false },
  { id: 'busRoute', label: 'Bus Route / Stop', required: false, defaultChecked: false },
];

const PRESET_COLORS = [
  { name: 'Royal Blue', hex: '#2563eb' },
  { name: 'Navy Dark', hex: '#1e293b' },
  { name: 'Emerald Green', hex: '#059669' },
  { name: 'Crimson Red', hex: '#dc2626' },
  { name: 'Purple Violet', hex: '#7c3aed' },
  { name: 'Warm Amber', hex: '#d97706' },
];

const NewProjectModal = ({ isOpen, onClose, onCreated, setToast }) => {
  const [activeTab, setActiveTab] = useState(1); // 1: Template, 2: School Info, 3: Fields & Link
  const [templates, setTemplates] = useState([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form State
  const [projectName, setProjectName] = useState('');
  const [cardType, setCardType] = useState('school'); // school, college, corporate
  const [orientation, setOrientation] = useState('vertical'); // vertical, horizontal
  const [selectedTemplateId, setSelectedTemplateId] = useState('school-modern-blue');
  const [themeColor, setThemeColor] = useState('#2563eb');

  // School Common Info
  const [schoolName, setSchoolName] = useState('');
  const [schoolAddress, setSchoolAddress] = useState('');
  const [schoolPhone, setSchoolPhone] = useState('');
  const [schoolSession, setSchoolSession] = useState('2026-2027');
  const [schoolLogo, setSchoolLogo] = useState('');
  const [principalSign, setPrincipalSign] = useState('');

  // Selected Dynamic Fields
  const [selectedFields, setSelectedFields] = useState(
    AVAILABLE_FIELDS.filter((f) => f.defaultChecked).map((f) => f.id)
  );

  useEffect(() => {
    if (isOpen) {
      loadTemplates();
    }
  }, [isOpen]);

  const loadTemplates = async () => {
    try {
      setLoadingTemplates(true);
      const data = await getCardTemplatesApi();
      if (Array.isArray(data) && data.length > 0) {
        setTemplates(data);
        setSelectedTemplateId(data[0].id);
      }
    } catch (err) {
      console.error('Failed to load card templates:', err);
    } finally {
      setLoadingTemplates(false);
    }
  };

  if (!isOpen) return null;

  const handleFieldToggle = (fieldId) => {
    if (fieldId === 'name' || fieldId === 'rollNumber') return; // Mandatory
    setSelectedFields((prev) =>
      prev.includes(fieldId) ? prev.filter((id) => id !== fieldId) : [...prev, fieldId]
    );
  };

  const handleLogoUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setSchoolLogo(reader.result);
    reader.readAsDataURL(file);
  };

  const handleSignUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setPrincipalSign(reader.result);
    reader.readAsDataURL(file);
  };

  const handleCreateProject = async () => {
    if (!projectName.trim()) {
      setToast?.({ type: 'error', message: 'Please enter a project name' });
      setActiveTab(1);
      return;
    }
    if (!schoolName.trim()) {
      setToast?.({ type: 'error', message: 'Please enter School / Organization name' });
      setActiveTab(2);
      return;
    }

    try {
      setSaving(true);
      const projectId = `proj_${Date.now()}`;
      const shareToken = Math.random().toString(36).substring(2, 12);

      const newProject = {
        id: projectId,
        name: projectName.trim(),
        client: schoolName.trim(),
        cardType,
        themeColor,
        templateId: selectedTemplateId,
        publicShareToken: shareToken,
        organization: {
          name: schoolName.trim(),
          clientName: schoolName.trim(),
          address: schoolAddress.trim(),
          phone: schoolPhone.trim(),
          session: schoolSession.trim(),
          logo: schoolLogo || null,
          signature: principalSign || null,
        },
        requiredFields: selectedFields,
        batches: [
          {
            id: 'batch_1',
            batchNumber: 1,
            name: 'Batch 1 (Main Admissions)',
            status: 'COLLECTING',
            totalRecords: 0,
            records: [],
            createdAt: new Date().toISOString(),
          },
        ],
        currentBatchId: 'batch_1',
        records: [],
        status: 'COLLECTING',
        totalRecords: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const res = await saveCardProjectApi(newProject);
      if (res?.success) {
        setToast?.({ type: 'success', message: '🎉 Project created successfully!' });
        onCreated?.(newProject);
        onClose();
      }
    } catch (err) {
      console.error('Failed to create card project:', err);
      setToast?.({ type: 'error', message: 'Failed to create project. Check server connection.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fadeIn">
      <div className="w-full max-w-2xl bg-[#0d1322] border border-slate-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Modal Header */}
        <div className="px-6 py-5 border-b border-slate-800 flex items-center justify-between bg-slate-900/50">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
              <CreditCard size={20} />
            </div>
            <div>
              <h2 className="text-base font-extrabold text-white">Create New ID Card Project</h2>
              <p className="text-[11px] text-slate-400">Set up templates, school common info & data fields</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* 3 Step Navigation Tabs */}
        <div className="grid grid-cols-3 border-b border-slate-800 bg-slate-950/40 text-xs">
          <button
            type="button"
            onClick={() => setActiveTab(1)}
            className={`py-3 font-bold flex items-center justify-center gap-2 border-b-2 transition-all cursor-pointer ${
              activeTab === 1
                ? 'border-cyan-400 text-cyan-400 bg-cyan-500/5'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <span className="w-5 h-5 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-[10px]">
              1
            </span>
            <span>Template & Size</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab(2)}
            className={`py-3 font-bold flex items-center justify-center gap-2 border-b-2 transition-all cursor-pointer ${
              activeTab === 2
                ? 'border-cyan-400 text-cyan-400 bg-cyan-500/5'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <span className="w-5 h-5 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-[10px]">
              2
            </span>
            <span>School Details</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab(3)}
            className={`py-3 font-bold flex items-center justify-center gap-2 border-b-2 transition-all cursor-pointer ${
              activeTab === 3
                ? 'border-cyan-400 text-cyan-400 bg-cyan-500/5'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <span className="w-5 h-5 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-[10px]">
              3
            </span>
            <span>Fields & Web Link</span>
          </button>
        </div>

        {/* Tab Content Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-5 text-xs text-slate-200">
          {/* TAB 1: TEMPLATE & CARD SIZE */}
          {activeTab === 1 && (
            <div className="space-y-4">
              <div>
                <label className="block text-[11px] font-bold text-slate-300 mb-1.5">Project Title *</label>
                <input
                  type="text"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  placeholder="e.g. DPS School Session 2026-27"
                  className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500 text-xs shadow-inner"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-bold text-slate-300 mb-1.5">Card Category</label>
                  <select
                    value={cardType}
                    onChange={(e) => setCardType(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-slate-100 focus:outline-none focus:border-cyan-500 text-xs"
                  >
                    <option value="school">School / College ID</option>
                    <option value="coaching">Coaching / Institute</option>
                    <option value="corporate">Corporate / Staff ID</option>
                    <option value="membership">Membership / Club</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-300 mb-1.5">Card Orientation (CR80 Standard)</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setOrientation('vertical')}
                      className={`py-2 px-2.5 rounded-xl border text-center font-bold transition-all cursor-pointer ${
                        orientation === 'vertical'
                          ? 'bg-cyan-500/10 border-cyan-500 text-cyan-400'
                          : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                      }`}
                    >
                      Vertical (54×86mm)
                    </button>
                    <button
                      type="button"
                      onClick={() => setOrientation('horizontal')}
                      className={`py-2 px-2.5 rounded-xl border text-center font-bold transition-all cursor-pointer ${
                        orientation === 'horizontal'
                          ? 'bg-cyan-500/10 border-cyan-500 text-cyan-400'
                          : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                      }`}
                    >
                      Horizontal (86×54mm)
                    </button>
                  </div>
                </div>
              </div>

              {/* Theme Color Presets */}
              <div>
                <label className="block text-[11px] font-bold text-slate-300 mb-1.5 flex items-center gap-1.5">
                  <Palette size={13} className="text-cyan-400" />
                  <span>Card Theme Color (Matches School Uniform/Logo)</span>
                </label>
                <div className="flex items-center gap-2">
                  {PRESET_COLORS.map((col) => (
                    <button
                      key={col.hex}
                      type="button"
                      onClick={() => setThemeColor(col.hex)}
                      className={`w-7 h-7 rounded-full border-2 transition-all flex items-center justify-center cursor-pointer ${
                        themeColor === col.hex ? 'border-white scale-110 shadow-lg' : 'border-transparent hover:scale-105'
                      }`}
                      style={{ backgroundColor: col.hex }}
                      title={col.name}
                    >
                      {themeColor === col.hex && <Check size={14} className="text-white drop-shadow" />}
                    </button>
                  ))}
                  <input
                    type="color"
                    value={themeColor}
                    onChange={(e) => setThemeColor(e.target.value)}
                    className="w-7 h-7 rounded-full bg-transparent border-none cursor-pointer"
                    title="Custom Color"
                  />
                </div>
              </div>

              {/* Template Presets Selector */}
              <div>
                <label className="block text-[11px] font-bold text-slate-300 mb-2">Choose Template Preset</label>
                {loadingTemplates ? (
                  <div className="py-8 text-center text-slate-500 text-xs">Loading templates...</div>
                ) : (
                  <div className="grid grid-cols-3 gap-3">
                    {templates.map((tpl) => (
                      <button
                        key={tpl.id}
                        type="button"
                        onClick={() => {
                          setSelectedTemplateId(tpl.id);
                        }}
                        className={`p-3 rounded-2xl border text-left flex flex-col justify-between gap-2 transition-all cursor-pointer ${
                          selectedTemplateId === tpl.id
                            ? 'bg-cyan-500/10 border-cyan-400 shadow-md shadow-cyan-950/30'
                            : 'bg-slate-900/80 border-slate-800 hover:border-slate-700'
                        }`}
                      >
                        <div className="w-full h-16 rounded-lg bg-slate-950 border border-slate-800 flex items-center justify-center overflow-hidden">
                          {tpl.preview ? (
                            <img src={tpl.preview} alt={tpl.name} className="w-full h-full object-cover" />
                          ) : (
                            <CreditCard size={24} className="text-slate-600" />
                          )}
                        </div>
                        <div>
                          <p className="font-bold text-[11px] text-white truncate">{tpl.name}</p>
                          <p className="text-[9px] text-slate-400 uppercase font-mono">{tpl.category}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: COMMON SCHOOL DATA */}
          {activeTab === 2 && (
            <div className="space-y-4">
              <div>
                <label className="block text-[11px] font-bold text-slate-300 mb-1.5">School / College Name *</label>
                <input
                  type="text"
                  value={schoolName}
                  onChange={(e) => setSchoolName(e.target.value)}
                  placeholder="e.g. Delhi Public School, Varanasi"
                  className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500 text-xs shadow-inner"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-bold text-slate-300 mb-1.5">Address / Campus</label>
                  <input
                    type="text"
                    value={schoolAddress}
                    onChange={(e) => setSchoolAddress(e.target.value)}
                    placeholder="e.g. Cantt Road, Varanasi, UP"
                    className="w-full px-3.5 py-2 bg-slate-900 border border-slate-800 rounded-xl text-slate-100 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-300 mb-1.5">Academic Session / Year</label>
                  <input
                    type="text"
                    value={schoolSession}
                    onChange={(e) => setSchoolSession(e.target.value)}
                    placeholder="e.g. 2026-2027"
                    className="w-full px-3.5 py-2 bg-slate-900 border border-slate-800 rounded-xl text-slate-100 text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-300 mb-1.5">Contact Phone / Helpline</label>
                <input
                  type="text"
                  value={schoolPhone}
                  onChange={(e) => setSchoolPhone(e.target.value)}
                  placeholder="e.g. +91 9876543210"
                  className="w-full px-3.5 py-2 bg-slate-900 border border-slate-800 rounded-xl text-slate-100 text-xs"
                />
              </div>

              {/* Logo & Signature Uploads */}
              <div className="grid grid-cols-2 gap-4 pt-2">
                <div className="p-3.5 rounded-2xl bg-slate-900/80 border border-slate-800 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-10 h-10 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-center overflow-hidden">
                      {schoolLogo ? (
                        <img src={schoolLogo} alt="Logo" className="w-full h-full object-contain p-1" />
                      ) : (
                        <Building size={18} className="text-slate-500" />
                      )}
                    </div>
                    <div>
                      <p className="font-bold text-white text-[11px]">School Logo</p>
                      <p className="text-[9px] text-slate-400">PNG / JPG</p>
                    </div>
                  </div>
                  <label className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-cyan-400 text-xs font-bold border border-slate-700 cursor-pointer">
                    <span>{schoolLogo ? 'Change' : 'Upload'}</span>
                    <input type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" />
                  </label>
                </div>

                <div className="p-3.5 rounded-2xl bg-slate-900/80 border border-slate-800 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-10 h-10 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-center overflow-hidden">
                      {principalSign ? (
                        <img src={principalSign} alt="Signature" className="w-full h-full object-contain p-1" />
                      ) : (
                        <Sparkles size={18} className="text-slate-500" />
                      )}
                    </div>
                    <div>
                      <p className="font-bold text-white text-[11px]">Principal Sign</p>
                      <p className="text-[9px] text-slate-400">Transparent PNG</p>
                    </div>
                  </div>
                  <label className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-cyan-400 text-xs font-bold border border-slate-700 cursor-pointer">
                    <span>{principalSign ? 'Change' : 'Upload'}</span>
                    <input type="file" accept="image/*" onChange={handleSignUpload} className="hidden" />
                  </label>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: DYNAMIC FIELDS & WEB LINK */}
          {activeTab === 3 && (
            <div className="space-y-4">
              <div>
                <label className="block text-[11px] font-bold text-slate-300 mb-1">
                  Required Student Form Fields
                </label>
                <p className="text-[10px] text-slate-400 mb-3">
                  These fields will appear in the School Online Form & Excel Sheet for data collection.
                </p>

                <div className="grid grid-cols-2 gap-2.5">
                  {AVAILABLE_FIELDS.map((field) => {
                    const isChecked = selectedFields.includes(field.id);
                    const isFixed = field.id === 'name' || field.id === 'rollNumber';
                    return (
                      <div
                        key={field.id}
                        onClick={() => handleFieldToggle(field.id)}
                        className={`p-2.5 rounded-xl border flex items-center justify-between transition-all cursor-pointer ${
                          isChecked
                            ? 'bg-cyan-500/10 border-cyan-500/40 text-white'
                            : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <div
                            className={`w-4 h-4 rounded-md border flex items-center justify-center ${
                              isChecked
                                ? 'bg-cyan-500 border-cyan-400 text-slate-950'
                                : 'border-slate-700 bg-slate-950'
                            }`}
                          >
                            {isChecked && <Check size={12} strokeWidth={3} />}
                          </div>
                          <span className="font-semibold text-xs">{field.label}</span>
                        </div>
                        {isFixed && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 font-mono">
                            Mandatory
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Instant Link Highlight Box */}
              <div className="p-4 rounded-2xl bg-gradient-to-br from-cyan-950/40 via-slate-900 to-indigo-950/40 border border-cyan-500/30 space-y-2">
                <div className="flex items-center gap-2 text-cyan-400 font-bold text-xs">
                  <Link size={14} />
                  <span>Real-Time School Data Collection Link</span>
                </div>
                <p className="text-[11px] text-slate-300">
                  Upon creation, a unique shareable link will be generated for the school teachers to enter student records with <strong>Live Camera Snap</strong> directly on their phones.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer Controls */}
        <div className="px-6 py-4 border-t border-slate-800 flex items-center justify-between bg-slate-900/50">
          <div>
            {activeTab > 1 && (
              <button
                type="button"
                onClick={() => setActiveTab((t) => t - 1)}
                className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs flex items-center gap-1.5 cursor-pointer"
              >
                <ArrowLeft size={14} />
                <span>Back</span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-3">
            {activeTab < 3 ? (
              <button
                type="button"
                onClick={() => {
                  if (activeTab === 1 && !projectName.trim()) {
                    setToast?.({ type: 'error', message: 'Please enter a project title' });
                    return;
                  }
                  setActiveTab((t) => t + 1);
                }}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-cyan-400 hover:text-white font-bold text-xs rounded-xl border border-slate-700 transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <span>Next Step</span>
                <ArrowRight size={14} />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleCreateProject}
                disabled={saving}
                className="px-5 py-2.5 bg-gradient-to-r from-cyan-500 via-blue-600 to-indigo-600 hover:from-cyan-400 hover:to-indigo-500 text-slate-950 font-extrabold text-xs rounded-xl shadow-lg shadow-cyan-950/40 transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <Sparkles size={14} />
                <span>{saving ? 'Creating Project...' : '🚀 Generate Project & Link'}</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default NewProjectModal;
