import React, { useState, useEffect } from 'react';
import {
  ArrowLeft,
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
  Image as ImageIcon,
  Plus,
  Trash2,
  RefreshCw,
  Eye,
  Sliders,
} from 'lucide-react';
import {
  getCardTemplatesApi,
  saveCardProjectApi,
  renderLiveSampleApi,
} from '../../services/cardApi';

const DEFAULT_FIELDS = [
  { id: 'name', label: 'Student Full Name', required: true, defaultChecked: true },
  { id: 'rollNumber', label: 'Roll Number / ID', required: true, defaultChecked: true },
  { id: 'className', label: 'Class & Section', required: false, defaultChecked: true },
  { id: 'fatherName', label: "Father's Name", required: false, defaultChecked: true },
  { id: 'motherName', label: "Mother's Name", required: false, defaultChecked: true },
  { id: 'address', label: 'Residential Address', required: false, defaultChecked: true },
  { id: 'phone', label: 'Mobile No. / Contact Phone', required: false, defaultChecked: true },
  { id: 'dob', label: 'Date of Birth (DOB)', required: false, defaultChecked: true },
  { id: 'bloodGroup', label: 'Blood Group', required: false, defaultChecked: true },
  { id: 'emergencyContact', label: 'Emergency Contact', required: false, defaultChecked: false },
];

const PRESET_COLORS = [
  { name: 'Royal Blue', hex: '#2563eb' },
  { name: 'Navy Dark', hex: '#0f172a' },
  { name: 'Emerald Green', hex: '#059669' },
  { name: 'Crimson Red', hex: '#dc2626' },
  { name: 'Purple Violet', hex: '#7c3aed' },
  { name: 'Warm Amber', hex: '#d97706' },
];

const PHOTO_BG_PRESETS = [
  { name: 'Pure White', hex: '#FFFFFF' },
  { name: 'Studio Blue', hex: '#2563EB' },
  { name: 'Sky Cyan', hex: '#0EA5E9' },
  { name: 'Passport Grey', hex: '#F1F5F9' },
  { name: 'Dark Navy', hex: '#0F172A' },
  { name: 'Crimson Red', hex: '#DC2626' },
];

const ProjectSetupView = ({ onBack, onCreated, setToast }) => {
  const [activeTab, setActiveTab] = useState(1); // 1: Template, 2: School Info, 3: Fields & Link
  const [activeSubTab, setActiveSubTab] = useState('front'); // 'front' | 'back' inside Tab 2
  const [templates, setTemplates] = useState([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [saving, setSaving] = useState(false);
  const [syncingTemplates, setSyncingTemplates] = useState(false);

  // Form State
  const [projectName, setProjectName] = useState('DPS School Session 2026-27');
  const [cardType, setCardType] = useState('school');
  const [orientation, setOrientation] = useState('vertical');
  const [selectedTemplateId, setSelectedTemplateId] = useState('school-modern-blue');
  const [themeColor, setThemeColor] = useState('#2563eb');
  const [photoBgColor, setPhotoBgColor] = useState('#FFFFFF');
  const [autoRemovePhotoBg, setAutoRemovePhotoBg] = useState(true);

  // Front Side Dynamic Info
  const [schoolName, setSchoolName] = useState('Delhi Public School');
  const [schoolSubtitle, setSchoolSubtitle] = useState('Inter College');
  const [schoolAddress, setSchoolAddress] = useState('Cantt Road, Varanasi, Uttar Pradesh - 221002');
  const [schoolPhone, setSchoolPhone] = useState('+91 98765 43210');
  const [schoolSession, setSchoolSession] = useState('2026-2027');
  const [estdText, setEstdText] = useState('ESTD. 2010');
  const [schoolLogo, setSchoolLogo] = useState('');
  const [showLogo, setShowLogo] = useState(true);
  const [principalSign, setPrincipalSign] = useState('');
  const [showSignature, setShowSignature] = useState(true);
  const [signatureLabel, setSignatureLabel] = useState('Principal');
  const [showBarcode, setShowBarcode] = useState(true);
  const [showQr, setShowQr] = useState(true);

  // Back Side Dynamic Info
  const [backTitle, setBackTitle] = useState('');
  const [backSubtitle, setBackSubtitle] = useState('');
  const [backAddress, setBackAddress] = useState('');
  const [backPhone, setBackPhone] = useState('');
  const [showWatermark, setShowWatermark] = useState(true);
  const [watermarkText, setWatermarkText] = useState('ESTD. 2010');
  const [showTerms, setShowTerms] = useState(true);
  const [backTermsTitle, setBackTermsTitle] = useState('TERMS & CONDITIONS');
  const [termsList, setTermsList] = useState([
    'This card is non-transferable.',
    'Loss of this card must be reported to the office immediately.',
    'This card must be presented whenever required.',
    'Cardholder is responsible for safe custody of this card.',
  ]);
  const [backFooterText, setBackFooterText] = useState('Emergency Contact : {phone}');
  const [showBackFooter, setShowBackFooter] = useState(true);

  // Selected Dynamic Fields & Custom Fields
  const [fieldsList, setFieldsList] = useState(DEFAULT_FIELDS);
  const [selectedFields, setSelectedFields] = useState(
    DEFAULT_FIELDS.filter((f) => f.defaultChecked).map((f) => f.id)
  );
  const [newCustomFieldName, setNewCustomFieldName] = useState('');

  // Live Card Preview
  const [previewSide, setPreviewSide] = useState('front');
  const [previewHtml, setPreviewHtml] = useState('');
  const [previewLoading, setPreviewLoading] = useState(false);

  useEffect(() => {
    loadTemplates();
  }, []);

  const loadTemplates = async () => {
    try {
      setLoadingTemplates(true);
      const data = await getCardTemplatesApi();
      if (Array.isArray(data) && data.length > 0) {
        setTemplates(data);
        setSelectedTemplateId(data[0].id);
        if (data[0].size?.orientation) {
          setOrientation(data[0].size.orientation);
        }
      }
    } catch (err) {
      console.error('Failed to load card templates:', err);
    } finally {
      setLoadingTemplates(false);
    }
  };

  const handleSyncTemplates = async () => {
    try {
      setSyncingTemplates(true);
      // Trigger sync
      import('../../services/api').then(async (apiModule) => {
        const api = apiModule.default;
        await api.post('/cards/templates/sync');
        setToast?.({ type: 'success', message: 'Templates synced successfully from Cloud!' });
        await loadTemplates(); // Reload list after sync
      });
    } catch (err) {
      console.error('Failed to sync templates:', err);
      setToast?.({ type: 'error', message: 'Failed to sync templates from Cloud.' });
    } finally {
      setSyncingTemplates(false);
    }
  };

  // Live Render on any state change (< 150ms debounce)
  useEffect(() => {
    const updateLivePreview = async () => {
      try {
        setPreviewLoading(true);
        const orgData = {
          name: schoolName,
          subtitle: schoolSubtitle,
          address: schoolAddress,
          phone: schoolPhone,
          session: schoolSession,
          estdText,
          logo: showLogo ? (schoolLogo || null) : null,
          showLogo,
          signature: showSignature ? (principalSign || null) : null,
          showSignature,
          signatureLabel,
          showBarcode,
          showQr,
          backTitle: backTitle || schoolName,
          backSubtitle: backSubtitle || schoolSubtitle,
          backAddress: backAddress || schoolAddress,
          backPhone: backPhone || schoolPhone,
          showWatermark,
          watermarkText,
          showTerms,
          backTermsTitle,
          terms: termsList.filter((t) => t.trim().length > 0),
          backFooterText,
          showBackFooter,
        };

        const html = await renderLiveSampleApi({
          templateId: selectedTemplateId,
          side: previewSide,
          org: orgData,
        });
        setPreviewHtml(html);
      } catch (err) {
        console.error('Live preview render error:', err);
      } finally {
        setPreviewLoading(false);
      }
    };

    const timer = setTimeout(updateLivePreview, 120);
    return () => clearTimeout(timer);
  }, [
    selectedTemplateId,
    previewSide,
    schoolName,
    schoolSubtitle,
    schoolAddress,
    schoolPhone,
    schoolSession,
    estdText,
    schoolLogo,
    showLogo,
    principalSign,
    showSignature,
    signatureLabel,
    showBarcode,
    showQr,
    backTitle,
    backSubtitle,
    backAddress,
    backPhone,
    showWatermark,
    watermarkText,
    showTerms,
    backTermsTitle,
    termsList,
    backFooterText,
    showBackFooter,
    themeColor,
  ]);

  const handleFieldToggle = (fieldId) => {
    if (fieldId === 'name' || fieldId === 'rollNumber') return; // Mandatory
    setSelectedFields((prev) =>
      prev.includes(fieldId) ? prev.filter((id) => id !== fieldId) : [...prev, fieldId]
    );
  };

  const handleAddCustomField = () => {
    if (!newCustomFieldName.trim()) return;
    const cleanId = newCustomFieldName.trim().toLowerCase().replace(/[^a-z0-9]/g, '_');
    if (fieldsList.some((f) => f.id === cleanId)) {
      setToast?.({ type: 'error', message: 'Field already exists' });
      return;
    }
    const newField = {
      id: cleanId,
      label: newCustomFieldName.trim(),
      required: false,
      defaultChecked: true,
    };
    setFieldsList((prev) => [...prev, newField]);
    setSelectedFields((prev) => [...prev, cleanId]);
    setNewCustomFieldName('');
    setToast?.({ type: 'success', message: `Added custom field "${newField.label}"` });
  };

  const handleLogoUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setSchoolLogo(reader.result);
      setShowLogo(true);
    };
    reader.readAsDataURL(file);
  };

  const handleSignUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setPrincipalSign(reader.result);
      setShowSignature(true);
    };
    reader.readAsDataURL(file);
  };

  const handleAddTerm = () => {
    setTermsList((prev) => [...prev, 'New rule / instruction point']);
  };

  const handleUpdateTerm = (idx, text) => {
    setTermsList((prev) => {
      const copy = [...prev];
      copy[idx] = text;
      return copy;
    });
  };

  const handleDeleteTerm = (idx) => {
    setTermsList((prev) => prev.filter((_, i) => i !== idx));
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
        cardSize: {
          width: orientation === 'vertical' ? 53.98 : 85.60,
          height: orientation === 'vertical' ? 85.60 : 53.98,
          unit: 'mm',
          orientation
        },
        publicShareToken: shareToken,
        photoProcessingProfile: {
          removeBg: autoRemovePhotoBg,
          bgColor: photoBgColor,
          faceDetectCrop: true,
          targetDpi: 300,
          aspectRatio: '35x45',
          scaleAdjust: 1.0,
        },
        organization: {
          name: schoolName.trim(),
          subtitle: schoolSubtitle.trim(),
          clientName: schoolName.trim(),
          address: schoolAddress.trim(),
          phone: schoolPhone.trim(),
          session: schoolSession.trim(),
          estdText: estdText.trim(),
          logo: showLogo ? (schoolLogo || null) : null,
          showLogo,
          signature: showSignature ? (principalSign || null) : null,
          showSignature,
          signatureLabel: signatureLabel.trim(),
          showBarcode,
          showQr,
          backTitle: (backTitle || schoolName).trim(),
          backSubtitle: (backSubtitle || schoolSubtitle).trim(),
          backAddress: (backAddress || schoolAddress).trim(),
          backPhone: (backPhone || schoolPhone).trim(),
          showWatermark,
          watermarkText: watermarkText.trim(),
          showTerms,
          backTermsTitle: backTermsTitle.trim(),
          terms: termsList.filter((t) => t.trim().length > 0),
          backFooterText: backFooterText.trim(),
          showBackFooter,
        },
        fieldsConfig: fieldsList,
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
        setToast?.({ type: 'success', message: '🎉 ID Card Project created successfully!' });
        onCreated?.(newProject);
      }
    } catch (err) {
      console.error('Failed to create card project:', err);
      setToast?.({ type: 'error', message: 'Failed to create project.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-[#070b14] text-slate-100 overflow-hidden">
      {/* ================= HEADER ================= */}
      <header className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/80 backdrop-blur-md shrink-0">
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={onBack}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-all cursor-pointer flex items-center gap-1.5 text-xs font-semibold"
          >
            <ArrowLeft size={16} />
            <span>Back to Projects</span>
          </button>
          <div className="h-6 w-[1px] bg-slate-800" />
          <div>
            <h1 className="text-base font-extrabold text-white flex items-center gap-2">
              ID Card Project Setup Studio
            </h1>
            <p className="text-[11px] text-slate-400">
              Live Interactive 300 DPI Card Customizer & Multi-Batch Setup
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleCreateProject}
            disabled={saving}
            className="px-5 py-2.5 bg-gradient-to-r from-cyan-500 via-blue-600 to-indigo-600 hover:from-cyan-400 hover:to-indigo-500 text-slate-950 font-extrabold text-xs rounded-xl shadow-lg shadow-cyan-950/40 transition-all flex items-center gap-2 cursor-pointer active:scale-95 disabled:opacity-50"
          >
            <Sparkles size={15} />
            <span>{saving ? 'Creating Project...' : '🚀 Create & Open Studio'}</span>
          </button>
        </div>
      </header>

      {/* ================= 2-COLUMN FULL-SCREEN WORKSPACE ================= */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* LEFT COLUMN: BIG INTERACTIVE LIVE 300 DPI CARD PREVIEW */}
        <div className="w-full lg:w-[460px] xl:w-[500px] p-6 border-b lg:border-b-0 lg:border-r border-slate-800 bg-slate-950/60 flex flex-col items-center justify-between shrink-0 overflow-y-auto">
          {/* Card Preview Controls */}
          <div className="w-full flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <span className="text-xs font-extrabold text-cyan-400 flex items-center gap-1.5">
                <Eye size={15} />
                <span>Live 300 DPI Card Preview</span>
              </span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                CR80 Standard
              </span>
            </div>

            {/* Front / Back Toggle */}
            <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-900 border border-slate-800">
              <button
                type="button"
                onClick={() => setPreviewSide('front')}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  previewSide === 'front'
                    ? 'bg-cyan-500 text-slate-950 shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Front Side
              </button>
              <button
                type="button"
                onClick={() => setPreviewSide('back')}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  previewSide === 'back'
                    ? 'bg-cyan-500 text-slate-950 shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Back Side
              </button>
            </div>
          </div>

          {/* CR80 Proportional Visual Container */}
          <div className={`relative w-full ${orientation === 'vertical' ? 'max-w-[340px] aspect-[54/86]' : 'max-w-[460px] aspect-[86/54]'} rounded-2xl overflow-hidden shadow-2xl border-2 border-cyan-500/40 bg-white flex items-center justify-center transition-all duration-300`}>
            {previewLoading ? (
              <div className="flex flex-col items-center gap-2 text-slate-400">
                <RefreshCw size={24} className="animate-spin text-cyan-500" />
                <span className="text-xs">Updating Vector Card...</span>
              </div>
            ) : previewHtml ? (
              <iframe
                srcDoc={previewHtml}
                title="Live Card Sample"
                className="w-full h-full border-none pointer-events-auto"
                sandbox="allow-same-origin"
              />
            ) : (
              <div className="text-center p-6 text-slate-400">
                <School size={36} className="mx-auto mb-2 text-slate-500" />
                <p className="text-xs font-semibold">Live Card Preview</p>
              </div>
            )}
          </div>

          {/* Dynamic Details Caption */}
          <div className="w-full mt-4 p-3.5 rounded-2xl bg-slate-900/90 border border-slate-800 text-xs flex items-center justify-between">
            <div className="truncate">
              <p className="font-bold text-white truncate">{schoolName || 'School Name'}</p>
              <p className="text-[11px] text-cyan-400 truncate">
                Template: {selectedTemplateId} • Session {schoolSession}
              </p>
            </div>
            <span className="text-[10px] px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-400 font-bold border border-cyan-500/30">
              ⚡ Live Sync
            </span>
          </div>
        </div>

        {/* RIGHT COLUMN: CONFIGURATION TABS & CONTROLS */}
        <div className="flex-1 flex flex-col overflow-hidden bg-[#090d16]">
          {/* 3 Step Tabs */}
          <div className="grid grid-cols-3 border-b border-slate-800 bg-slate-900/40 text-xs shrink-0">
            <button
              type="button"
              onClick={() => setActiveTab(1)}
              className={`py-3.5 font-extrabold flex items-center justify-center gap-2 border-b-2 transition-all cursor-pointer ${
                activeTab === 1
                  ? 'border-cyan-400 text-cyan-400 bg-cyan-500/5'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <span className="w-5 h-5 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-[10px]">
                1
              </span>
              <span>Template & Color</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab(2)}
              className={`py-3.5 font-extrabold flex items-center justify-center gap-2 border-b-2 transition-all cursor-pointer ${
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
              className={`py-3.5 font-extrabold flex items-center justify-center gap-2 border-b-2 transition-all cursor-pointer ${
                activeTab === 3
                  ? 'border-cyan-400 text-cyan-400 bg-cyan-500/5'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <span className="w-5 h-5 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-[10px]">
                3
              </span>
              <span>Fields & Custom Fields</span>
            </button>
          </div>

          {/* TAB CONTENT BODY */}
          <div className="p-6 md:p-8 overflow-y-auto flex-1 space-y-6 text-xs text-slate-200">
            {/* TAB 1: TEMPLATE & THEME COLOR */}
            {activeTab === 1 && (
              <div className="space-y-5">
                <div>
                  <label className="block text-xs font-bold text-slate-200 mb-1.5">Project Title *</label>
                  <input
                    type="text"
                    value={projectName}
                    onChange={(e) => setProjectName(e.target.value)}
                    placeholder="e.g. DPS School Session 2026-27"
                    className="w-full px-4 py-3 bg-slate-900 border border-slate-800 rounded-xl text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500 text-xs shadow-inner"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-200 mb-1.5">Card Category</label>
                    <select
                      value={cardType}
                      onChange={(e) => setCardType(e.target.value)}
                      className="w-full px-4 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-slate-100 focus:outline-none focus:border-cyan-500 text-xs"
                    >
                      <option value="school">School / College ID</option>
                      <option value="coaching">Coaching / Institute</option>
                      <option value="corporate">Corporate / Staff ID</option>
                      <option value="membership">Membership / Club</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-200 mb-1.5">Card Orientation (CR80)</label>
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
                  <label className="block text-xs font-bold text-slate-200 mb-2 flex items-center gap-1.5">
                    <Palette size={14} className="text-cyan-400" />
                    <span>Card Theme Color (Changes Header & Accent Colors)</span>
                  </label>
                  <div className="flex items-center gap-3">
                    {PRESET_COLORS.map((col) => (
                      <button
                        key={col.hex}
                        type="button"
                        onClick={() => setThemeColor(col.hex)}
                        className={`w-8 h-8 rounded-full border-2 transition-all flex items-center justify-center cursor-pointer ${
                          themeColor === col.hex ? 'border-white scale-110 shadow-lg shadow-cyan-950/50' : 'border-transparent hover:scale-105'
                        }`}
                        style={{ backgroundColor: col.hex }}
                        title={col.name}
                      >
                        {themeColor === col.hex && <Check size={16} className="text-white drop-shadow" />}
                      </button>
                    ))}
                    <input
                      type="color"
                      value={themeColor}
                      onChange={(e) => setThemeColor(e.target.value)}
                      className="w-8 h-8 rounded-full bg-transparent border-none cursor-pointer"
                      title="Custom Color"
                    />
                  </div>
                </div>

                {/* Uniform Student Photo Background Selection */}
                <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <label className="text-xs font-bold text-slate-100 flex items-center gap-2">
                        <Sparkles size={14} className="text-cyan-400" />
                        <span>Uniform Student Photo Background</span>
                      </label>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        Sabhi student photos ka background automatically is color me replace hoga.
                      </p>
                    </div>
                    <span className="text-[10px] px-2.5 py-1 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 font-bold shrink-0 self-start sm:self-center">
                      Auto Studio Processing
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-2.5 pt-1">
                    {PHOTO_BG_PRESETS.map((bg) => {
                      const isSelected = photoBgColor.toUpperCase() === bg.hex.toUpperCase();
                      return (
                        <button
                          key={bg.hex}
                          type="button"
                          onClick={() => setPhotoBgColor(bg.hex)}
                          className={`px-3 py-1.5 rounded-xl border flex items-center gap-2 text-xs font-bold transition-all cursor-pointer ${
                            isSelected
                              ? 'bg-cyan-500/20 border-cyan-400 text-white shadow'
                              : 'bg-slate-950/60 border-slate-800 text-slate-300 hover:border-slate-700'
                          }`}
                        >
                          <span
                            className="w-3.5 h-3.5 rounded-full border border-slate-600 shadow-inner shrink-0"
                            style={{ backgroundColor: bg.hex }}
                          />
                          <span>{bg.name}</span>
                          {isSelected && <Check size={12} className="text-cyan-400" />}
                        </button>
                      );
                    })}

                    {/* Custom Color Input */}
                    <div className="flex items-center gap-1.5 px-3 py-1 rounded-xl border border-slate-800 bg-slate-950/60">
                      <input
                        type="color"
                        value={photoBgColor}
                        onChange={(e) => setPhotoBgColor(e.target.value)}
                        className="w-5 h-5 rounded border-0 cursor-pointer bg-transparent"
                        title="Choose custom background color"
                      />
                      <span className="text-[11px] font-mono text-slate-300 uppercase">{photoBgColor}</span>
                    </div>
                  </div>
                </div>

                {/* Template Presets Gallery */}
                <div>
                  <div className="flex items-center justify-between mb-2.5">
                    <label className="text-xs font-bold text-slate-200">
                      Select Card Template Package
                    </label>
                    <button
                      type="button"
                      onClick={handleSyncTemplates}
                      disabled={syncingTemplates}
                      className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-cyan-400 text-[11px] font-bold rounded-lg border border-slate-700 flex items-center gap-1.5 transition-all disabled:opacity-50"
                    >
                      <RefreshCw size={12} className={syncingTemplates ? 'animate-spin' : ''} />
                      {syncingTemplates ? 'Syncing...' : 'Sync from Cloud'}
                    </button>
                  </div>
                  {loadingTemplates ? (
                    <div className="py-8 text-center text-slate-500 text-xs">Loading templates...</div>
                  ) : (
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3.5">
                      {templates.map((tpl) => (
                        <button
                          key={tpl.id}
                          type="button"
                          onClick={() => {
                            setSelectedTemplateId(tpl.id);
                            if (tpl.size?.orientation) {
                              setOrientation(tpl.size.orientation);
                            }
                          }}
                          className={`p-3.5 rounded-2xl border text-left flex flex-col justify-between gap-2.5 transition-all cursor-pointer ${
                            selectedTemplateId === tpl.id
                              ? 'bg-cyan-500/10 border-cyan-400 shadow-xl shadow-cyan-950/30'
                              : 'bg-slate-900/80 border-slate-800 hover:border-slate-700'
                          }`}
                        >
                          <div className="w-full h-20 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-center overflow-hidden">
                            {tpl.preview ? (
                              <img src={tpl.preview} alt={tpl.name} className="w-full h-full object-contain p-1" />
                            ) : (
                              <CreditCard size={28} className="text-slate-600" />
                            )}
                          </div>
                          <div>
                            <p className="font-extrabold text-xs text-white truncate">{tpl.name}</p>
                            <p className="text-[10px] text-slate-400 uppercase font-mono">{tpl.category}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* TAB 2: 100% DYNAMIC FRONT & BACK CUSTOMIZER */}
            {activeTab === 2 && (
              <div className="space-y-5">
                {/* Front / Back Sub-Tabs Selector */}
                <div className="flex items-center gap-2 p-1.5 rounded-2xl bg-slate-900 border border-slate-800">
                  <button
                    type="button"
                    onClick={() => {
                      setActiveSubTab('front');
                      setPreviewSide('front');
                    }}
                    className={`flex-1 py-2.5 rounded-xl font-extrabold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer ${
                      activeSubTab === 'front'
                        ? 'bg-cyan-500 text-slate-950 shadow-md'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <span>🪪 Front Side Elements</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveSubTab('back');
                      setPreviewSide('back');
                    }}
                    className={`flex-1 py-2.5 rounded-xl font-extrabold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer ${
                      activeSubTab === 'back'
                        ? 'bg-cyan-500 text-slate-950 shadow-md'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <span>📜 Back Side & Terms</span>
                  </button>
                </div>

                {/* ================= SUB-TAB 1: FRONT SIDE CUSTOMIZER ================= */}
                {activeSubTab === 'front' && (
                  <div className="space-y-4">
                    {/* Organization / School Main Name */}
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="text-xs font-bold text-slate-200">School / Organization Full Name *</label>
                        {schoolName && (
                          <button
                            type="button"
                            onClick={() => setSchoolName('')}
                            className="text-[10px] text-rose-400 hover:text-rose-300 font-semibold cursor-pointer"
                          >
                            Clear / Delete
                          </button>
                        )}
                      </div>
                      <input
                        type="text"
                        value={schoolName}
                        onChange={(e) => setSchoolName(e.target.value)}
                        placeholder="e.g. Delhi Public School"
                        className="w-full px-4 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500 text-xs shadow-inner"
                      />
                    </div>

                    {/* Subtitle / Category */}
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="text-xs font-bold text-slate-200">
                          Subtitle / Category <span className="text-[10px] text-slate-400">(e.g. INTER COLLEGE, Higher Secondary)</span>
                        </label>
                        {schoolSubtitle && (
                          <button
                            type="button"
                            onClick={() => setSchoolSubtitle('')}
                            className="text-[10px] text-rose-400 hover:text-rose-300 font-semibold cursor-pointer"
                          >
                            Delete Subtitle
                          </button>
                        )}
                      </div>
                      <input
                        type="text"
                        value={schoolSubtitle}
                        onChange={(e) => setSchoolSubtitle(e.target.value)}
                        placeholder="e.g. INTER COLLEGE (Leave empty to remove completely)"
                        className="w-full px-4 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500 text-xs shadow-inner"
                      />
                    </div>

                    {/* Address & Academic Session */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <label className="text-xs font-bold text-slate-200">Address / Campus</label>
                          {schoolAddress && (
                            <button
                              type="button"
                              onClick={() => setSchoolAddress('')}
                              className="text-[10px] text-rose-400 hover:text-rose-300 cursor-pointer"
                            >
                              Clear
                            </button>
                          )}
                        </div>
                        <input
                          type="text"
                          value={schoolAddress}
                          onChange={(e) => setSchoolAddress(e.target.value)}
                          placeholder="e.g. Cantt Road, Varanasi, UP"
                          className="w-full px-4 py-2 bg-slate-900 border border-slate-800 rounded-xl text-slate-100 text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-200 mb-1.5">Academic Session / Year</label>
                        <input
                          type="text"
                          value={schoolSession}
                          onChange={(e) => setSchoolSession(e.target.value)}
                          placeholder="e.g. 2026-2027"
                          className="w-full px-4 py-2 bg-slate-900 border border-slate-800 rounded-xl text-slate-100 text-xs"
                        />
                      </div>
                    </div>

                    {/* Helpline & ESTD text */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                      <div>
                        <label className="block text-xs font-bold text-slate-200 mb-1.5">Helpline / Contact Phone</label>
                        <input
                          type="text"
                          value={schoolPhone}
                          onChange={(e) => setSchoolPhone(e.target.value)}
                          placeholder="e.g. +91 98765 43210"
                          className="w-full px-4 py-2 bg-slate-900 border border-slate-800 rounded-xl text-slate-100 text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-200 mb-1.5">Crest / ESTD Text</label>
                        <input
                          type="text"
                          value={estdText}
                          onChange={(e) => setEstdText(e.target.value)}
                          placeholder="e.g. ESTD. 2010"
                          className="w-full px-4 py-2 bg-slate-900 border border-slate-800 rounded-xl text-slate-100 text-xs"
                        />
                      </div>
                    </div>

                    {/* Logo & Signature Customizer Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
                      {/* Logo Card */}
                      <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2.5">
                            <div className="w-10 h-10 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-center overflow-hidden">
                              {schoolLogo ? (
                                <img src={schoolLogo} alt="Logo" className="w-full h-full object-contain p-1" />
                              ) : (
                                <Building size={20} className="text-slate-500" />
                              )}
                            </div>
                            <div>
                              <p className="font-bold text-white text-xs">School Logo</p>
                              <p className="text-[10px] text-slate-400">PNG / JPG / SVG</p>
                            </div>
                          </div>

                          <label className="relative inline-flex items-center cursor-pointer" title="Toggle Show Logo">
                            <input
                              type="checkbox"
                              checked={showLogo}
                              onChange={(e) => setShowLogo(e.target.checked)}
                              className="sr-only peer"
                            />
                            <div className="w-9 h-5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-cyan-500"></div>
                          </label>
                        </div>

                        <div className="flex items-center gap-2 pt-1">
                          <label className="flex-1 py-1.5 text-center rounded-xl bg-slate-800 hover:bg-slate-700 text-cyan-400 text-xs font-bold border border-slate-700 cursor-pointer">
                            <span>{schoolLogo ? 'Replace Logo' : 'Upload Logo'}</span>
                            <input type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" />
                          </label>
                          {schoolLogo && (
                            <button
                              type="button"
                              onClick={() => setSchoolLogo('')}
                              className="p-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 cursor-pointer"
                              title="Delete Logo"
                            >
                              <Trash2 size={15} />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Principal Signature Card */}
                      <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2.5">
                            <div className="w-10 h-10 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-center overflow-hidden">
                              {principalSign ? (
                                <img src={principalSign} alt="Signature" className="w-full h-full object-contain p-1" />
                              ) : (
                                <Sparkles size={20} className="text-slate-500" />
                              )}
                            </div>
                            <div>
                              <p className="font-bold text-white text-xs">Principal Sign</p>
                              <p className="text-[10px] text-slate-400">Transparent PNG</p>
                            </div>
                          </div>

                          <label className="relative inline-flex items-center cursor-pointer" title="Toggle Show Signature">
                            <input
                              type="checkbox"
                              checked={showSignature}
                              onChange={(e) => setShowSignature(e.target.checked)}
                              className="sr-only peer"
                            />
                            <div className="w-9 h-5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-cyan-500"></div>
                          </label>
                        </div>

                        <div>
                          <input
                            type="text"
                            value={signatureLabel}
                            onChange={(e) => setSignatureLabel(e.target.value)}
                            placeholder="Signatory Title (e.g. Principal / Director)"
                            className="w-full px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-slate-200 text-xs"
                          />
                        </div>

                        <div className="flex items-center gap-2">
                          <label className="flex-1 py-1.5 text-center rounded-xl bg-slate-800 hover:bg-slate-700 text-cyan-400 text-xs font-bold border border-slate-700 cursor-pointer">
                            <span>{principalSign ? 'Replace Sign' : 'Upload Sign'}</span>
                            <input type="file" accept="image/*" onChange={handleSignUpload} className="hidden" />
                          </label>
                          {principalSign && (
                            <button
                              type="button"
                              onClick={() => setPrincipalSign('')}
                              className="p-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 cursor-pointer"
                              title="Delete Signature"
                            >
                              <Trash2 size={15} />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Barcode Toggle */}
                    <div className="p-3.5 rounded-2xl bg-slate-900/60 border border-slate-800 flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <QrCode size={18} className="text-cyan-400" />
                        <div>
                          <p className="font-bold text-white text-xs">Show Front Vector Barcode</p>
                          <p className="text-[11px] text-slate-400">Renders high-precision vector barcode at bottom</p>
                        </div>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={showBarcode}
                          onChange={(e) => setShowBarcode(e.target.checked)}
                          className="sr-only peer"
                        />
                        <div className="w-9 h-5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-cyan-500"></div>
                      </label>
                    </div>
                  </div>
                )}

                {/* ================= SUB-TAB 2: BACK SIDE & TERMS CUSTOMIZER ================= */}
                {activeSubTab === 'back' && (
                  <div className="space-y-4">
                    {/* Back Header Customization */}
                    <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-3">
                      <p className="font-extrabold text-xs text-cyan-400">Back Side Header & Watermark</p>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[11px] font-bold text-slate-300 mb-1">Back Header Title</label>
                          <input
                            type="text"
                            value={backTitle}
                            onChange={(e) => setBackTitle(e.target.value)}
                            placeholder={`Syncs with "${schoolName}" if empty`}
                            className="w-full px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-slate-200 text-xs"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-bold text-slate-300 mb-1">Back Subtitle</label>
                          <input
                            type="text"
                            value={backSubtitle}
                            onChange={(e) => setBackSubtitle(e.target.value)}
                            placeholder={`Syncs with "${schoolSubtitle}" if empty`}
                            className="w-full px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-slate-200 text-xs"
                          />
                        </div>
                      </div>

                      {/* Watermark Controls */}
                      <div className="pt-2 border-t border-slate-800 flex items-center justify-between gap-4">
                        <div className="flex-1">
                          <label className="block text-[11px] font-bold text-slate-300 mb-1">Watermark Text</label>
                          <input
                            type="text"
                            value={watermarkText}
                            onChange={(e) => setWatermarkText(e.target.value)}
                            placeholder="e.g. ESTD. 2010 or OFFICIAL"
                            className="w-full px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-slate-200 text-xs"
                          />
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <span className="text-[11px] font-bold text-slate-300">Show Watermark</span>
                          <label className="relative inline-flex items-center cursor-pointer">
                            <input
                              type="checkbox"
                              checked={showWatermark}
                              onChange={(e) => setShowWatermark(e.target.checked)}
                              className="sr-only peer"
                            />
                            <div className="w-9 h-5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-cyan-500"></div>
                          </label>
                        </div>
                      </div>
                    </div>

                    {/* Dynamic Terms & Conditions List */}
                    <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-extrabold text-xs text-cyan-400">Terms & Conditions / Rules</p>
                          <p className="text-[10px] text-slate-400">Add, edit, or delete any instruction point</p>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer" title="Toggle Terms Box">
                          <input
                            type="checkbox"
                            checked={showTerms}
                            onChange={(e) => setShowTerms(e.target.checked)}
                            className="sr-only peer"
                          />
                          <div className="w-9 h-5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-cyan-500"></div>
                        </label>
                      </div>

                      {showTerms && (
                        <div className="space-y-2.5 pt-1">
                          <div>
                            <label className="block text-[11px] font-bold text-slate-300 mb-1">Section Header Title</label>
                            <input
                              type="text"
                              value={backTermsTitle}
                              onChange={(e) => setBackTermsTitle(e.target.value)}
                              placeholder="e.g. TERMS & CONDITIONS / RULES"
                              className="w-full px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-slate-200 text-xs"
                            />
                          </div>

                          <div className="space-y-2 pt-1">
                            {termsList.map((term, idx) => (
                              <div key={idx} className="flex items-center gap-2">
                                <span className="text-cyan-400 font-bold text-xs">{idx + 1}.</span>
                                <input
                                  type="text"
                                  value={term}
                                  onChange={(e) => handleUpdateTerm(idx, e.target.value)}
                                  className="flex-1 px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-slate-200 text-xs focus:outline-none focus:border-cyan-500"
                                />
                                <button
                                  type="button"
                                  onClick={() => handleDeleteTerm(idx)}
                                  className="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 cursor-pointer"
                                  title="Delete this point"
                                >
                                  <Trash2 size={13} />
                                </button>
                              </div>
                            ))}

                            <button
                              type="button"
                              onClick={handleAddTerm}
                              className="mt-2 px-3.5 py-1.5 rounded-xl bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 text-xs font-bold border border-cyan-500/30 flex items-center gap-1.5 cursor-pointer transition-all"
                            >
                              <Plus size={13} />
                              <span>+ Add Rule / Point</span>
                            </button>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Back Footer / Emergency Note */}
                    <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-extrabold text-xs text-cyan-400">Back Bottom Footer / Emergency Note</p>
                          <p className="text-[10px] text-slate-400">Use {'{phone}'} or {'{name}'} for dynamic replacement</p>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer" title="Toggle Footer Bar">
                          <input
                            type="checkbox"
                            checked={showBackFooter}
                            onChange={(e) => setShowBackFooter(e.target.checked)}
                            className="sr-only peer"
                          />
                          <div className="w-9 h-5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-cyan-500"></div>
                        </label>
                      </div>

                      {showBackFooter && (
                        <input
                          type="text"
                          value={backFooterText}
                          onChange={(e) => setBackFooterText(e.target.value)}
                          placeholder="e.g. Emergency Contact : {phone}"
                          className="w-full px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-slate-200 text-xs"
                        />
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* TAB 3: DYNAMIC FIELDS & ADD CUSTOM FIELD */}
            {activeTab === 3 && (
              <div className="space-y-5">
                <div>
                  <label className="block text-xs font-bold text-slate-200 mb-1">
                    Student Information Fields
                  </label>
                  <p className="text-[11px] text-slate-400 mb-3">
                    Select which fields should be collected via Excel or the School Web Link.
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {fieldsList.map((field) => {
                      const isChecked = selectedFields.includes(field.id);
                      const isFixed = field.id === 'name' || field.id === 'rollNumber';
                      return (
                        <div
                          key={field.id}
                          onClick={() => handleFieldToggle(field.id)}
                          className={`p-3 rounded-xl border flex items-center justify-between transition-all cursor-pointer ${
                            isChecked
                              ? 'bg-cyan-500/10 border-cyan-500/40 text-white'
                              : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          <div className="flex items-center gap-2.5">
                            <div
                              className={`w-4 h-4 rounded-md border flex items-center justify-center ${
                                isChecked
                                  ? 'bg-cyan-500 border-cyan-400 text-slate-950'
                                  : 'border-slate-700 bg-slate-950'
                              }`}
                            >
                              {isChecked && <Check size={12} strokeWidth={3} />}
                            </div>
                            <span className="font-bold text-xs">{field.label}</span>
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

                {/* + Add Custom Field Section */}
                <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-3">
                  <label className="block text-xs font-bold text-cyan-400 flex items-center gap-1.5">
                    <Plus size={14} />
                    <span>Add Custom Field (e.g. Bus Route, House, Section, Aadhaar No)</span>
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={newCustomFieldName}
                      onChange={(e) => setNewCustomFieldName(e.target.value)}
                      placeholder="Enter field name (e.g. Bus Route No)"
                      className="flex-1 px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 text-xs focus:outline-none focus:border-cyan-500"
                    />
                    <button
                      type="button"
                      onClick={handleAddCustomField}
                      className="px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs rounded-xl shadow cursor-pointer transition-all shrink-0"
                    >
                      + Add Field
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* BOTTOM STEP CONTROLS */}
          <div className="px-6 py-4 border-t border-slate-800 flex items-center justify-between bg-slate-900/50 shrink-0">
            <div>
              {activeTab > 1 && (
                <button
                  type="button"
                  onClick={() => setActiveTab((t) => t - 1)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs flex items-center gap-1.5 cursor-pointer"
                >
                  <ArrowLeft size={14} />
                  <span>Previous Step</span>
                </button>
              )}
            </div>

            <div className="flex items-center gap-3">
              {activeTab < 3 ? (
                <button
                  type="button"
                  onClick={() => setActiveTab((t) => t + 1)}
                  className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-cyan-400 hover:text-white font-extrabold text-xs rounded-xl border border-slate-700 transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <span>Continue to Step {activeTab + 1}</span>
                  <ArrowRight size={14} />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleCreateProject}
                  disabled={saving}
                  className="px-6 py-2.5 bg-gradient-to-r from-cyan-500 via-blue-600 to-indigo-600 hover:from-cyan-400 hover:to-indigo-500 text-slate-950 font-extrabold text-xs rounded-xl shadow-lg shadow-cyan-950/40 transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  <Sparkles size={15} />
                  <span>{saving ? 'Creating Project...' : '🚀 Finish & Open Studio'}</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProjectSetupView;
