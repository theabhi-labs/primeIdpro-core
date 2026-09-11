import React, { useState, useEffect, useRef } from 'react';
import {
  ArrowLeft,
  Copy,
  Check,
  Printer,
  Lock,
  Unlock,
  Plus,
  Search,
  FileSpreadsheet,
  Camera,
  Sparkles,
  RotateCw,
  Trash2,
  Edit2,
  Layers,
  Users,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  ChevronRight,
  School,
  Building,
  Upload,
  RefreshCw,
  QrCode,
  X,
  Sliders,
} from 'lucide-react';
import {
  getCardProjectApi,
  saveCardProjectApi,
  lockBatchApi,
  createNewBatchApi,
  importCardFile,
  processCardPhotoQueue,
  processSinglePhotoApi,
  renderPreviewApi,
} from '../../services/cardApi';
import PrintSheetModal from './PrintSheetModal';

const getSchoolPortalUrl = (token) => {
  if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
    return `http://localhost:5173/cards/fill/${token}`;
  }
  return `https://primeidpro-central-platform.onrender.com/cards/fill/${token}`;
};

const CardStudioWorkspace = ({ projectId, onBack, setToast }) => {
  const [project, setProject] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedRecordId, setSelectedRecordId] = useState(null);
  const [previewSide, setPreviewSide] = useState('front'); // 'front' | 'back'
  const [previewHtml, setPreviewHtml] = useState('');
  const [previewLoading, setPreviewLoading] = useState(false);
  const [activeBatchId, setActiveBatchId] = useState('batch_1');
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedLink, setCopiedLink] = useState(false);

  // Modals
  const [printModalOpen, setPrintModalOpen] = useState(false);
  const [qrModalOpen, setQrModalOpen] = useState(false);
  const [addStudentModalOpen, setAddStudentModalOpen] = useState(false);
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [settingsSubTab, setSettingsSubTab] = useState('front'); // 'front' | 'back'
  const [isImporting, setIsImporting] = useState(false);
  const [isProcessingPhotos, setIsProcessingPhotos] = useState(false);
  const [isLocking, setIsLocking] = useState(false);
  const [isSavingSettings, setIsSavingSettings] = useState(false);

  // Settings State for Org Customization
  const [editOrgName, setEditOrgName] = useState('');
  const [editOrgSubtitle, setEditOrgSubtitle] = useState('');
  const [editOrgAddress, setEditOrgAddress] = useState('');
  const [editOrgPhone, setEditOrgPhone] = useState('');
  const [editOrgSession, setEditOrgSession] = useState('');
  const [editOrgEstd, setEditOrgEstd] = useState('');
  const [editOrgLogo, setEditOrgLogo] = useState('');
  const [editOrgShowLogo, setEditOrgShowLogo] = useState(true);
  const [editOrgSign, setEditOrgSign] = useState('');
  const [editOrgShowSign, setEditOrgShowSign] = useState(true);
  const [editOrgSignLabel, setEditOrgSignLabel] = useState('Principal');
  const [editOrgShowBarcode, setEditOrgShowBarcode] = useState(true);
  const [editOrgBackTitle, setEditOrgBackTitle] = useState('');
  const [editOrgBackSubtitle, setEditOrgBackSubtitle] = useState('');
  const [editOrgShowWatermark, setEditOrgShowWatermark] = useState(true);
  const [editOrgWatermarkText, setEditOrgWatermarkText] = useState('ESTD. 2010');
  const [editOrgShowTerms, setEditOrgShowTerms] = useState(true);
  const [editOrgTermsTitle, setEditOrgTermsTitle] = useState('TERMS & CONDITIONS');
  const [editOrgTerms, setEditOrgTerms] = useState([]);
  const [editOrgBackFooterText, setEditOrgBackFooterText] = useState('');
  const [editOrgShowBackFooter, setEditOrgShowBackFooter] = useState(true);

  // Comprehensive Student Form State (Add & Edit)
  const [studentModalMode, setStudentModalMode] = useState('add'); // 'add' | 'edit'
  const [editingRecordId, setEditingRecordId] = useState(null);
  const [newStudentName, setNewStudentName] = useState('');
  const [newStudentRoll, setNewStudentRoll] = useState('');
  const [newStudentClass, setNewStudentClass] = useState('10th');
  const [newStudentFather, setNewStudentFather] = useState('');
  const [newStudentMother, setNewStudentMother] = useState('');
  const [newStudentAddress, setNewStudentAddress] = useState('');
  const [newStudentDob, setNewStudentDob] = useState('');
  const [newStudentBlood, setNewStudentBlood] = useState('B+');
  const [newStudentPhone, setNewStudentPhone] = useState('');
  const [newStudentEmergencyContact, setNewStudentEmergencyContact] = useState('');
  const [customStudentFields, setCustomStudentFields] = useState([]); // [{ key, label, value }]
  const [showAddCustomField, setShowAddCustomField] = useState(false);
  const [newCustomFieldLabel, setNewCustomFieldLabel] = useState('');
  const [newCustomFieldValue, setNewCustomFieldValue] = useState('');
  const [newStudentPhoto, setNewStudentPhoto] = useState(null);
  const [isSavingStudent, setIsSavingStudent] = useState(false);
  const [processedPhotoPreview, setProcessedPhotoPreview] = useState(null);
  const [isProcessingStudentPhoto, setIsProcessingStudentPhoto] = useState(false);
  const [showBgPicker, setShowBgPicker] = useState(false);

  const fileInputRef = useRef(null);

  const loadProject = async () => {
    if (!projectId) return;
    try {
      setLoading(true);
      const data = await getCardProjectApi(projectId);
      setProject(data);
      if (data?.batches?.length > 0) {
        setActiveBatchId(data.currentBatchId || data.batches[0].id);
      }
      if (data?.records?.length > 0 && !selectedRecordId) {
        setSelectedRecordId(data.records[0].id);
      }
    } catch (err) {
      console.error('Failed to load project details:', err);
      setToast?.({ type: 'error', message: 'Failed to load project details' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProject();
  }, [projectId]);

  // Active Batch & Records
  const batches = project?.batches || [];
  const currentBatch = batches.find((b) => b.id === activeBatchId) || batches[0] || null;
  const records = currentBatch?.records || project?.records || [];
  const selectedRecord = records.find((r) => r.id === selectedRecordId) || records[0] || null;
  const isBatchLocked = currentBatch?.status === 'LOCKED_FOR_PRINT';

  // Live HTML Preview Rendering
  useEffect(() => {
    if (!project) return;
    const renderPreview = async () => {
      try {
        setPreviewLoading(true);
        const html = await renderPreviewApi({
          projectId: project.id,
          recordId: selectedRecord?.id || null,
          side: previewSide,
        });
        setPreviewHtml(html);
      } catch (err) {
        console.error('Preview render error:', err);
      } finally {
        setPreviewLoading(false);
      }
    };
    renderPreview();
  }, [project?.id, selectedRecord?.id, selectedRecord?.processedPhoto?.processedUrl, previewSide]);

  // Copy School Live Link
  const handleCopySchoolLink = () => {
    const token = project?.publicShareToken || project?.id;
    const link = getSchoolPortalUrl(token);
    navigator.clipboard.writeText(link);
    setCopiedLink(true);
    setToast?.({ type: 'success', message: '🔗 School Live Form Link Copied!' });
    setTimeout(() => setCopiedLink(false), 2500);
  };

  // Lock Current Batch for Printing
  const handleLockBatch = async () => {
    if (!currentBatch) return;
    if (
      !window.confirm(
        `Are you sure you want to lock "${currentBatch.name}"? School users will no longer be able to edit records in this batch.`
      )
    )
      return;

    try {
      setIsLocking(true);
      const res = await lockBatchApi(project.id, currentBatch.id);
      if (res?.success) {
        setToast?.({ type: 'success', message: `🔒 ${currentBatch.name} locked for printing!` });
        await loadProject();
      }
    } catch (err) {
      console.error('Lock batch error:', err);
      setToast?.({ type: 'error', message: 'Failed to lock batch.' });
    } finally {
      setIsLocking(false);
    }
  };

  // Create New Batch Session
  const handleCreateNewBatch = async () => {
    const batchName = window.prompt('Enter new batch session name:', `Batch ${batches.length + 1} (Late Entries)`);
    if (!batchName) return;

    try {
      const res = await createNewBatchApi(project.id, batchName);
      if (res?.success) {
        setToast?.({ type: 'success', message: `✨ Created ${batchName} successfully!` });
        await loadProject();
        if (res.batch) setActiveBatchId(res.batch.id);
      }
    } catch (err) {
      console.error('Create batch error:', err);
      setToast?.({ type: 'error', message: 'Failed to create new batch.' });
    }
  };

  // Change Uniform Photo Background Color & Auto Reprocess All Cards
  const handleChangePhotoBgColor = async (newBgColor) => {
    if (!project) return;
    try {
      const updatedProfile = {
        ...(project.photoProcessingProfile || {}),
        bgColor: newBgColor,
        removeBg: true,
      };
      const updatedProject = {
        ...project,
        photoProcessingProfile: updatedProfile,
      };
      await saveCardProjectApi(updatedProject);
      setProject(updatedProject);
      setShowBgPicker(false);
      setToast?.({ type: 'info', message: `Uniform Photo BG set to ${newBgColor}. Reprocessing cards with Local AI...` });

      setIsProcessingPhotos(true);
      const res = await processCardPhotoQueue({
        projectId: project.id,
        forceReprocess: true,
      });
      if (res?.success) {
        setToast?.({
          type: 'success',
          message: `⚡ All ${res.totalProcessed} student photos updated onto ${newBgColor} locally (₹0 cost)!`,
        });
        await loadProject();
      }
    } catch (err) {
      console.error('Failed to change photo background color:', err);
      setToast?.({ type: 'error', message: 'Failed to update photo background color' });
    } finally {
      setIsProcessingPhotos(false);
    }
  };

  // Card & Organization Settings Handlers
  const handleOpenSettingsModal = () => {
    const org = project?.organization || {};
    setEditOrgName(org.name || '');
    setEditOrgSubtitle(org.subtitle || '');
    setEditOrgAddress(org.address || '');
    setEditOrgPhone(org.phone || '');
    setEditOrgSession(org.session || '');
    setEditOrgEstd(org.estdText || 'ESTD. 2010');
    setEditOrgLogo(org.logo || '');
    setEditOrgShowLogo(org.showLogo !== false);
    setEditOrgSign(org.signature || '');
    setEditOrgShowSign(org.showSignature !== false);
    setEditOrgSignLabel(org.signatureLabel || 'Principal');
    setEditOrgShowBarcode(org.showBarcode !== false);
    setEditOrgBackTitle(org.backTitle || '');
    setEditOrgBackSubtitle(org.backSubtitle || '');
    setEditOrgShowWatermark(org.showWatermark !== false);
    setEditOrgWatermarkText(org.watermarkText || 'ESTD. 2010');
    setEditOrgShowTerms(org.showTerms !== false);
    setEditOrgTermsTitle(org.backTermsTitle || 'TERMS & CONDITIONS');
    setEditOrgTerms(
      Array.isArray(org.terms) && org.terms.length > 0
        ? [...org.terms]
        : [
            'This card is non-transferable.',
            'Loss of this card must be reported to the office immediately.',
            'This card must be presented whenever required.',
            'Cardholder is responsible for safe custody of this card.',
          ]
    );
    setEditOrgBackFooterText(org.backFooterText || 'Emergency Contact : {phone}');
    setEditOrgShowBackFooter(org.showBackFooter !== false);
    setSettingsModalOpen(true);
  };

  const handleSaveOrgSettings = async () => {
    if (!project) return;
    try {
      setIsSavingSettings(true);
      const updatedOrg = {
        ...(project.organization || {}),
        name: editOrgName.trim(),
        subtitle: editOrgSubtitle.trim(),
        address: editOrgAddress.trim(),
        phone: editOrgPhone.trim(),
        session: editOrgSession.trim(),
        estdText: editOrgEstd.trim(),
        logo: editOrgShowLogo ? (editOrgLogo || null) : null,
        showLogo: editOrgShowLogo,
        signature: editOrgShowSign ? (editOrgSign || null) : null,
        showSignature: editOrgShowSign,
        signatureLabel: editOrgSignLabel.trim(),
        showBarcode: editOrgShowBarcode,
        backTitle: editOrgBackTitle.trim(),
        backSubtitle: editOrgBackSubtitle.trim(),
        showWatermark: editOrgShowWatermark,
        watermarkText: editOrgWatermarkText.trim(),
        showTerms: editOrgShowTerms,
        backTermsTitle: editOrgTermsTitle.trim(),
        terms: editOrgTerms.filter((t) => t.trim().length > 0),
        backFooterText: editOrgBackFooterText.trim(),
        showBackFooter: editOrgShowBackFooter,
      };

      const updatedProject = {
        ...project,
        organization: updatedOrg,
      };

      const res = await saveCardProjectApi(updatedProject);
      if (res?.success) {
        setProject(updatedProject);
        setToast?.({ type: 'success', message: '✨ Card details & settings updated live!' });
        setSettingsModalOpen(false);
        // Force refresh vector preview
        setPreviewLoading(true);
        const html = await renderPreviewApi({
          projectId: project.id,
          recordId: selectedRecord?.id || null,
          side: previewSide,
        });
        setPreviewHtml(html);
        setPreviewLoading(false);
      }
    } catch (err) {
      console.error('Failed to save org settings:', err);
      setToast?.({ type: 'error', message: 'Failed to save settings' });
    } finally {
      setIsSavingSettings(false);
    }
  };

  // Open Add Student Modal
  const handleOpenAddStudentModal = () => {
    setStudentModalMode('add');
    setEditingRecordId(null);
    setNewStudentName('');
    setNewStudentRoll('');
    setNewStudentClass(records.length > 0 && records[records.length - 1]?.fields?.className ? records[records.length - 1].fields.className : '10th');
    setNewStudentFather('');
    setNewStudentMother('');
    setNewStudentAddress('');
    setNewStudentDob('');
    setNewStudentBlood('B+');
    setNewStudentPhone('');
    setNewStudentEmergencyContact('');
    setCustomStudentFields([]);
    setShowAddCustomField(false);
    setNewCustomFieldLabel('');
    setNewCustomFieldValue('');
    setNewStudentPhoto(null);
    setAddStudentModalOpen(true);
  };

  // Open Edit Student Modal
  const handleOpenEditStudentModal = (rec) => {
    if (!rec) return;
    setStudentModalMode('edit');
    setEditingRecordId(rec.id);
    const f = rec.fields || {};
    setNewStudentName(f.name || f.fullName || '');
    setNewStudentRoll(f.rollNumber || f.rollNo || '');
    setNewStudentClass(f.className || f.class || '10th');
    setNewStudentFather(f.fatherName || f.father || '');
    setNewStudentMother(f.motherName || f.mother || '');
    setNewStudentAddress(f.address || f.residentialAddress || '');
    setNewStudentDob(f.dob || '');
    setNewStudentBlood(f.bloodGroup || 'B+');
    setNewStudentPhone(f.phone || f.mobile || '');
    setNewStudentEmergencyContact(f.emergencyContact || '');

    // Extract any extra custom fields
    const standardKeys = [
      'name', 'fullName', 'studentName', 'rollNumber', 'rollNo', 'id',
      'className', 'class', 'fatherName', 'father', 'motherName', 'mother',
      'address', 'residentialAddress', 'phone', 'mobile', 'dob', 'bloodGroup', 'emergencyContact'
    ];
    const extraCustoms = [];
    Object.keys(f).forEach((k) => {
      if (!standardKeys.includes(k) && f[k] !== undefined && f[k] !== null && String(f[k]).trim() !== '') {
        extraCustoms.push({
          key: k,
          label: k.charAt(0).toUpperCase() + k.slice(1).replace(/([A-Z])/g, ' $1'),
          value: String(f[k]),
        });
      }
    });
    setCustomStudentFields(extraCustoms);
    setShowAddCustomField(false);
    setNewCustomFieldLabel('');
    setNewCustomFieldValue('');

    const currentPhoto = rec.processedPhoto?.processedUrl || rec.photo?.originalPath || null;
    setNewStudentPhoto(currentPhoto);
    setAddStudentModalOpen(true);
  };

  // Add Dynamic Custom Field to current student
  const handleAddCustomFieldToStudent = () => {
    if (!newCustomFieldLabel.trim()) return;
    const cleanKey = newCustomFieldLabel.trim().toLowerCase().replace(/[^a-zA-Z0-9]/g, '_');
    const existing = customStudentFields.find((c) => c.key === cleanKey);
    if (!existing) {
      setCustomStudentFields((prev) => [
        ...prev,
        {
          key: cleanKey,
          label: newCustomFieldLabel.trim(),
          value: newCustomFieldValue.trim(),
        },
      ]);
    }
    setNewCustomFieldLabel('');
    setNewCustomFieldValue('');
    setShowAddCustomField(false);
  };

  const handleRemoveCustomFieldFromStudent = (key) => {
    setCustomStudentFields((prev) => prev.filter((c) => c.key !== key));
  };

  const handleUpdateCustomFieldValue = (key, val) => {
    setCustomStudentFields((prev) =>
      prev.map((c) => (c.key === key ? { ...c, value: val } : c))
    );
  };

  // Delete Student Record
  const handleDeleteRecord = async (recordId, e) => {
    e?.stopPropagation();
    if (!window.confirm('Are you sure you want to delete this student record?')) return;

    try {
      const updatedRecords = records.filter((r) => r.id !== recordId);
      if (currentBatch) {
        currentBatch.records = updatedRecords;
        currentBatch.totalRecords = updatedRecords.length;
      }
      project.records = updatedRecords;
      project.totalRecords = updatedRecords.length;

      await saveCardProjectApi(project);
      setToast?.({ type: 'success', message: 'Student record deleted' });
      await loadProject();
      if (selectedRecordId === recordId) {
        setSelectedRecordId(updatedRecords.length > 0 ? updatedRecords[0].id : null);
      }
    } catch (err) {
      console.error('Delete student error:', err);
      setToast?.({ type: 'error', message: 'Failed to delete record' });
    }
  };

  // Excel / CSV File Import (Imports ALL rows with Smart Header & Field Resolution)
  const handleFileImport = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsImporting(true);
      const formData = new FormData();
      formData.append('file', file);
      const res = await importCardFile(formData);

      if (res?.success) {
        const rowsToImport = (Array.isArray(res.allRows) && res.allRows.length > 0)
          ? res.allRows
          : (Array.isArray(res.sampleRows) ? res.sampleRows : []);

        if (rowsToImport.length === 0) {
          setToast?.({ type: 'warning', message: 'No student data rows found in the selected file.' });
          return;
        }

        const getRowValue = (row, candidates, fallback = '') => {
          if (!row) return fallback;
          const keys = Object.keys(row);
          // 1. Direct match
          for (const c of candidates) {
            if (row[c] !== undefined && row[c] !== null && String(row[c]).trim() !== '') {
              return String(row[c]).trim();
            }
          }
          // 2. Normalized alphanumeric match
          for (const c of candidates) {
            const normC = c.toLowerCase().replace(/[^a-z0-9]/g, '');
            for (const k of keys) {
              const normK = k.toLowerCase().replace(/[^a-z0-9]/g, '');
              if (normK === normC) {
                const val = row[k];
                if (val !== undefined && val !== null && String(val).trim() !== '') {
                  return String(val).trim();
                }
              }
            }
          }
          // 3. Substring match
          for (const c of candidates) {
            if (c.length < 3) continue;
            const normC = c.toLowerCase().replace(/[^a-z0-9]/g, '');
            for (const k of keys) {
              const normK = k.toLowerCase().replace(/[^a-z0-9]/g, '');
              if (normK.includes(normC) || normC.includes(normK)) {
                const val = row[k];
                if (val !== undefined && val !== null && String(val).trim() !== '') {
                  return String(val).trim();
                }
              }
            }
          }
          return fallback;
        };

        const newRecords = rowsToImport.map((row, idx) => {
          const sName = getRowValue(row, ['name', 'studentName', 'student_name', 'fullName', 'candidateName', 'candidate_name', 'student', 'naam'], `Student ${records.length + idx + 1}`);
          const sRoll = getRowValue(row, ['rollNumber', 'rollNo', 'roll_no', 'roll', 'roll_num', 'id', 'idNo', 'studentId', 'admissionNo', 'admNo', 'regNo', 'scholarNo', 'sNo', 'srNo'], `${100 + records.length + idx + 1}`);
          const sClass = getRowValue(row, ['className', 'class', 'standard', 'grade', 'std', 'sec', 'section', 'division', 'batch'], '10th');
          const sFather = getRowValue(row, ['fatherName', 'father', 'father_name', 'fathers_name', 'guardianName', 'guardian', 'parentName'], '');
          const sMother = getRowValue(row, ['motherName', 'mother', 'mother_name', 'mothers_name'], '');
          const sAddress = getRowValue(row, ['address', 'residentialAddress', 'residential_address', 'homeAddress', 'residence', 'city', 'location'], '');
          const sDob = getRowValue(row, ['dob', 'dateOfBirth', 'date_of_birth', 'birthDate', 'birthdate'], '');
          const sBlood = getRowValue(row, ['bloodGroup', 'blood_group', 'bloodGrp', 'bg', 'blood'], 'B+');
          const sPhone = getRowValue(row, ['phone', 'mobile', 'mobileNo', 'mobile_no', 'contact', 'contactNo', 'phone_no', 'cell', 'telephone'], '');
          const sEmerg = getRowValue(row, ['emergencyContact', 'emergency_contact', 'emergencyPhone', 'emergency'], sPhone);
          const embeddedPhoto = row['_embedded_photo_path'] || null;

          return {
            id: `rec_${Date.now()}_${idx}_${Math.random().toString(36).substring(2, 6)}`,
            index: records.length + idx + 1,
            fields: {
              ...row,
              name: sName,
              fullName: sName,
              studentName: sName,
              rollNumber: sRoll,
              rollNo: sRoll,
              className: sClass,
              class: sClass,
              fatherName: sFather,
              father: sFather,
              motherName: sMother,
              mother: sMother,
              address: sAddress,
              residentialAddress: sAddress,
              dob: sDob,
              bloodGroup: sBlood,
              phone: sPhone,
              mobile: sPhone,
              emergencyContact: sEmerg,
            },
            sourceData: row,
            photo: embeddedPhoto
              ? { matched: true, source: 'embedded', originalPath: embeddedPhoto, matchMethod: 'embedded' }
              : { matched: false, source: 'none' },
            processedPhoto: embeddedPhoto
              ? { status: 'completed', processedUrl: embeddedPhoto }
              : { status: 'completed' },
            validation: { status: 'valid', errors: [], warnings: [] },
          };
        });

        const updatedRecords = [...records, ...newRecords];
        if (currentBatch) {
          currentBatch.records = updatedRecords;
          currentBatch.totalRecords = updatedRecords.length;
        }
        project.records = updatedRecords;
        project.totalRecords = updatedRecords.length;

        await saveCardProjectApi(project);
        setToast?.({ type: 'success', message: `📥 Successfully imported all ${newRecords.length} students from ${file.name}!` });
        await loadProject();
        if (newRecords.length > 0) setSelectedRecordId(newRecords[0].id);
      }
    } catch (err) {
      console.error('Import file error:', err);
      setToast?.({ type: 'error', message: err?.response?.data?.detail || 'Failed to import Excel/CSV file' });
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Comprehensive Student Save (Add & Edit) — Instant UI with Background Photo Processing
  const handleSaveSingleStudent = async (e) => {
    e.preventDefault();
    const studentName = newStudentName.trim();
    const studentRoll = newStudentRoll.trim();

    if (!studentName || !studentRoll) {
      setToast?.({ type: 'error', message: 'Student Full Name and Roll Number are required' });
      return;
    }

    try {
      setIsSavingStudent(true);
      const isEdit = studentModalMode === 'edit' && editingRecordId;
      const recordId = isEdit ? editingRecordId : `rec_${Date.now()}`;
      const attachedPhoto = newStudentPhoto;

      // Construct dynamic custom fields object
      const customObj = {};
      customStudentFields.forEach((c) => {
        if (c.key && c.value !== undefined) {
          customObj[c.key] = c.value.trim();
        }
      });

      const studentFields = {
        name: studentName,
        fullName: studentName,
        studentName: studentName,
        rollNumber: studentRoll,
        rollNo: studentRoll,
        id: studentRoll,
        className: newStudentClass.trim(),
        class: newStudentClass.trim(),
        fatherName: newStudentFather.trim(),
        father: newStudentFather.trim(),
        motherName: newStudentMother.trim(),
        mother: newStudentMother.trim(),
        address: newStudentAddress.trim(),
        residentialAddress: newStudentAddress.trim(),
        dob: newStudentDob.trim(),
        bloodGroup: newStudentBlood.trim(),
        phone: newStudentPhone.trim(),
        mobile: newStudentPhone.trim(),
        emergencyContact: newStudentEmergencyContact.trim() || newStudentPhone.trim(),
        ...customObj,
      };

      let updatedRecords;
      if (isEdit) {
        updatedRecords = records.map((r) => {
          if (r.id === recordId) {
            return {
              ...r,
              fields: {
                ...r.fields,
                ...studentFields,
              },
              photo: {
                ...r.photo,
                matched: Boolean(attachedPhoto),
                source: attachedPhoto?.startsWith('data:') ? 'manual' : r.photo?.source || 'manual',
                originalPath: attachedPhoto || r.photo?.originalPath,
                processedPath: attachedPhoto || r.photo?.processedPath,
              },
              processedPhoto: {
                ...r.processedPhoto,
                processedUrl: attachedPhoto || r.processedPhoto?.processedUrl,
              },
            };
          }
          return r;
        });
      } else {
        const newRec = {
          id: recordId,
          index: records.length + 1,
          fields: studentFields,
          photo: {
            matched: Boolean(attachedPhoto),
            source: 'manual',
            originalPath: attachedPhoto,
            processedPath: attachedPhoto,
          },
          processedPhoto: {
            status: 'completed',
            processedUrl: attachedPhoto,
          },
          validation: { status: 'valid', errors: [], warnings: [] },
        };
        updatedRecords = [...records, newRec];
      }

      if (currentBatch) {
        currentBatch.records = updatedRecords;
        currentBatch.totalRecords = updatedRecords.length;
      }
      project.records = updatedRecords;
      project.totalRecords = updatedRecords.length;

      // 1. Save and Close Modal Immediately
      await saveCardProjectApi(project);
      setToast?.({
        type: 'success',
        message: isEdit ? `✓ Updated details for "${studentName}"` : `✓ Added student "${studentName}"`,
      });
      setSelectedRecordId(recordId);
      setAddStudentModalOpen(false);
      await loadProject();

      // 2. Asynchronous Background Photo Enhancement
      if (attachedPhoto && attachedPhoto.startsWith('data:') && project.photoProcessingProfile?.removeBg) {
        processSinglePhotoApi({
          projectId: project.id,
          photoDataUrl: attachedPhoto,
          recordName: studentName,
          bgColor: project.photoProcessingProfile?.bgColor || '#FFFFFF',
        })
          .then(async (res) => {
            if (res?.success && res.processedPhoto?.processedUrl) {
              const freshProject = await getCardProjectApi(project.id);
              if (freshProject) {
                const rec = freshProject.records?.find((r) => r.id === recordId);
                if (rec) {
                  rec.processedPhoto = res.processedPhoto;
                  if (rec.photo) rec.photo.processedPath = res.processedPhoto.processedUrl;
                }
                for (const b of freshProject.batches || []) {
                  const bRec = b.records?.find((r) => r.id === recordId);
                  if (bRec) {
                    bRec.processedPhoto = res.processedPhoto;
                    if (bRec.photo) bRec.photo.processedPath = res.processedPhoto.processedUrl;
                  }
                }
                await saveCardProjectApi(freshProject);
                setProject({ ...freshProject });
              }
            }
          })
          .catch((err) => {
            console.warn('Silent background photo processing note:', err);
          });
      }
    } catch (err) {
      console.error('Error saving single student:', err);
      setToast?.({ type: 'error', message: 'Failed to save student' });
    } finally {
      setIsSavingStudent(false);
    }
  };

  // Process All Photos with 100% Local AI (₹0 Cost)
  const handleProcessPhotos = async () => {
    try {
      setIsProcessingPhotos(true);
      const res = await processCardPhotoQueue({
        projectId: project.id,
        forceReprocess: true,
      });
      if (res?.success) {
        setToast?.({
          type: 'success',
          message: `⚡ Processed ${res.totalProcessed} student photos locally with uniform background (₹0 API cost)!`,
        });
        await loadProject();
      }
    } catch (err) {
      console.error('Photo processing error:', err);
      setToast?.({ type: 'error', message: 'Failed to process photos with local engine' });
    } finally {
      setIsProcessingPhotos(false);
    }
  };

  // Filter records
  const filteredRecords = records.filter((r) => {
    const q = searchQuery.toLowerCase();
    const name = (r.fields?.name || '').toLowerCase();
    const roll = (r.fields?.rollNumber || '').toLowerCase();
    const cls = (r.fields?.className || '').toLowerCase();
    return name.includes(q) || roll.includes(q) || cls.includes(q);
  });

  if (loading || !project) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-[#070b14] text-slate-400 gap-3">
        <RefreshCw size={24} className="animate-spin text-cyan-400" />
        <p className="text-xs">Loading Card Studio Workspace...</p>
      </div>
    );
  }

  const publicLink = getSchoolPortalUrl(project.publicShareToken || project.id);

  return (
    <div className="flex-1 flex flex-col h-full bg-[#070b14] text-slate-100 overflow-hidden">
      {/* ================= 1. TOP HEADER ================= */}
      <header className="px-6 py-3.5 border-b border-slate-800 flex items-center justify-between bg-slate-900/80 backdrop-blur-md shrink-0">
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={onBack}
            className="p-2 rounded-xl bg-slate-800/90 hover:bg-slate-700 text-slate-300 hover:text-white transition-all cursor-pointer flex items-center gap-1.5 text-xs font-semibold"
          >
            <ArrowLeft size={16} />
            <span className="hidden sm:inline">Projects</span>
          </button>

          <div className="h-6 w-[1px] bg-slate-800" />

          <div>
            <div className="flex items-center gap-2.5">
              <h2 className="text-base font-extrabold text-white truncate max-w-xs">{project.name}</h2>
              <span
                className="w-2.5 h-2.5 rounded-full"
                style={{ backgroundColor: project.themeColor || '#2563eb' }}
                title="Theme Color"
              />
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-slate-800 text-cyan-400 border border-slate-700">
                {project.templateId}
              </span>
            </div>
            <p className="text-[11px] text-slate-400 truncate">
              {project.organization?.name || 'School Project'} • {records.length} Total Cards
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2.5">
          {/* Card & School Details Settings Modal Button */}
          <button
            type="button"
            onClick={handleOpenSettingsModal}
            className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold border border-slate-700 flex items-center gap-1.5 cursor-pointer shadow-sm transition-all"
            title="Edit School Details, Logo, Signature, Watermark, & Terms"
          >
            <Sliders size={14} className="text-cyan-400" />
            <span className="hidden md:inline">Card Settings</span>
          </button>

          <button
            type="button"
            onClick={handleCopySchoolLink}
            className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold border border-slate-700 flex items-center gap-1.5 cursor-pointer shadow-sm transition-all"
            title={`Copy Link: ${publicLink}`}
          >
            {copiedLink ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} className="text-cyan-400" />}
            <span className="hidden md:inline">{copiedLink ? 'Copied!' : 'School Link'}</span>
          </button>

          {/* Uniform Photo BG Switcher */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowBgPicker(!showBgPicker)}
              className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold border border-slate-700 flex items-center gap-1.5 cursor-pointer shadow-sm transition-all"
              title="Change Uniform Student Photo Background Color"
            >
              <span
                className="w-3.5 h-3.5 rounded-full border border-slate-500 shadow-inner shrink-0"
                style={{ backgroundColor: project?.photoProcessingProfile?.bgColor || '#FFFFFF' }}
              />
              <span className="hidden sm:inline">Photo BG</span>
            </button>

            {showBgPicker && (
              <div className="absolute right-0 top-full mt-2 w-56 p-3 bg-[#0d1322] border border-slate-800 rounded-2xl shadow-2xl z-50 space-y-2.5">
                <div className="flex items-center justify-between pb-1 border-b border-slate-800">
                  <span className="text-[11px] font-bold text-white">Uniform Photo Background</span>
                  <button onClick={() => setShowBgPicker(false)} className="text-slate-500 hover:text-white">
                    <X size={13} />
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-1.5">
                  {[
                    { name: 'White', hex: '#FFFFFF' },
                    { name: 'Blue', hex: '#2563EB' },
                    { name: 'Cyan', hex: '#0EA5E9' },
                    { name: 'Grey', hex: '#F1F5F9' },
                    { name: 'Navy', hex: '#0F172A' },
                    { name: 'Red', hex: '#DC2626' },
                  ].map((c) => (
                    <button
                      key={c.hex}
                      type="button"
                      onClick={() => handleChangePhotoBgColor(c.hex)}
                      className="p-1.5 rounded-lg border border-slate-800 hover:border-cyan-400 bg-slate-900 flex flex-col items-center gap-1 cursor-pointer"
                    >
                      <span
                        className="w-4 h-4 rounded-full border border-slate-600"
                        style={{ backgroundColor: c.hex }}
                      />
                      <span className="text-[10px] text-slate-300">{c.name}</span>
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2 pt-1 border-t border-slate-800">
                  <input
                    type="color"
                    value={project?.photoProcessingProfile?.bgColor || '#FFFFFF'}
                    onChange={(e) => handleChangePhotoBgColor(e.target.value)}
                    className="w-6 h-6 rounded border-0 cursor-pointer bg-transparent"
                  />
                  <span className="text-[10px] text-slate-400 font-mono">Custom Color</span>
                </div>
              </div>
            )}
          </div>

          {/* Quick Manual Add Student */}
          <button
            type="button"
            onClick={handleOpenAddStudentModal}
            className="px-3 py-1.5 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 text-xs font-bold border border-cyan-500/30 flex items-center gap-1.5 cursor-pointer shadow-sm transition-all"
          >
            <Plus size={14} />
            <span className="hidden md:inline">+ Add Student</span>
          </button>

          {/* Import Excel */}
          <label className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold border border-slate-700 flex items-center gap-1.5 cursor-pointer shadow-sm transition-all">
            <FileSpreadsheet size={14} className="text-emerald-400" />
            <span className="hidden md:inline">{isImporting ? 'Importing...' : 'Import Excel'}</span>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleFileImport}
              className="hidden"
              disabled={isImporting}
            />
          </label>

          {/* Local AI Photo Processing */}
          <button
            type="button"
            onClick={handleProcessPhotos}
            disabled={isProcessingPhotos}
            className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold border border-slate-700 flex items-center gap-1.5 cursor-pointer shadow-sm transition-all disabled:opacity-50"
            title="Auto-Center & Crop Faces with Local AI (₹0 Cost)"
          >
            <Sparkles size={14} className="text-amber-400" />
            <span className="hidden lg:inline">{isProcessingPhotos ? 'Cropping...' : 'Local AI Crop'}</span>
          </button>

          {/* Lock Current Batch */}
          <button
            type="button"
            onClick={handleLockBatch}
            disabled={isLocking || isBatchLocked}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold border flex items-center gap-1.5 cursor-pointer shadow-sm transition-all ${
              isBatchLocked
                ? 'bg-emerald-950/60 border-emerald-500/30 text-emerald-300'
                : 'bg-amber-950/40 hover:bg-amber-900/50 border-amber-500/40 text-amber-300'
            }`}
            title="Lock Current Batch for Printing"
          >
            <Lock size={14} />
            <span className="hidden sm:inline">{isBatchLocked ? 'Locked for Print' : 'Lock Batch'}</span>
          </button>

          {/* Master Print Button */}
          <button
            type="button"
            onClick={() => setPrintModalOpen(true)}
            className="px-4 py-1.5 bg-gradient-to-r from-cyan-500 via-blue-600 to-indigo-600 hover:from-cyan-400 hover:to-indigo-500 text-slate-950 font-extrabold text-xs rounded-xl shadow-md shadow-cyan-950/40 flex items-center gap-1.5 cursor-pointer transition-all active:scale-95"
          >
            <Printer size={15} />
            <span>Print Sheet</span>
          </button>
        </div>
      </header>

      {/* ================= 2. MAIN 2-COLUMN WORKSPACE ================= */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* LEFT COLUMN: LIVE CR80 CARD PREVIEW */}
        <div className="w-full lg:w-[440px] xl:w-[480px] p-6 border-b lg:border-b-0 lg:border-r border-slate-800 bg-slate-950/60 flex flex-col items-center justify-between shrink-0 overflow-y-auto">
          {/* Card Preview Header */}
          <div className="w-full flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-cyan-400">300 DPI Vector Card Preview</span>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                CR80
              </span>
            </div>

            {/* Front / Back Flip Button */}
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
                Front
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
                Back
              </button>
            </div>
          </div>

          {/* CR80 Physical Proportion Box (Ratio 85.6 : 53.98) */}
          <div className="relative w-full max-w-[340px] aspect-[54/86] rounded-2xl overflow-hidden shadow-2xl border-2 border-cyan-500/40 bg-white flex items-center justify-center transition-all duration-300">
            {previewLoading ? (
              <div className="flex flex-col items-center gap-2 text-slate-400">
                <RefreshCw size={24} className="animate-spin text-cyan-500" />
                <span className="text-[11px]">Rendering Vector Card...</span>
              </div>
            ) : previewHtml ? (
              <iframe
                srcDoc={previewHtml}
                title="Card Preview"
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

          {/* Card Meta & Student Switcher Info */}
          <div className="w-full mt-4 p-3.5 rounded-2xl bg-slate-900/90 border border-slate-800 flex items-center justify-between text-xs">
            <div className="truncate">
              <p className="font-bold text-white truncate">
                {selectedRecord?.fields?.name || 'Sample Student Preview'}
              </p>
              <p className="text-[11px] text-cyan-400 truncate">
                Roll: {selectedRecord?.fields?.rollNumber || '083'} • Class: {selectedRecord?.fields?.className || '10th-A'}
              </p>
            </div>

            <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-950/60 text-emerald-400 border border-emerald-500/30 font-semibold shrink-0">
              ✓ Ready for Print
            </span>
          </div>
        </div>

        {/* RIGHT COLUMN: BATCH SESSIONS & SPREADSHEET TABLE */}
        <div className="flex-1 flex flex-col overflow-hidden bg-[#090d16]">
          {/* Batch Session Tabs & Search */}
          <div className="px-6 pt-4 pb-2 flex items-center justify-between gap-3 border-b border-slate-800/80 bg-slate-900/30">
            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
              {batches.map((b) => {
                const isActive = b.id === activeBatchId;
                const isLocked = b.status === 'LOCKED_FOR_PRINT';
                return (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => setActiveBatchId(b.id)}
                    className={`px-3.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-2 border transition-all cursor-pointer whitespace-nowrap ${
                      isActive
                        ? 'bg-cyan-500/10 border-cyan-500/50 text-cyan-400 shadow-sm'
                        : 'bg-slate-900/80 border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <span>{b.name}</span>
                    <span
                      className={`w-2 h-2 rounded-full ${
                        isLocked ? 'bg-emerald-400' : 'bg-amber-400 animate-pulse'
                      }`}
                      title={isLocked ? 'Locked for Print' : 'Live Collecting'}
                    />
                    <span className="text-[10px] font-mono opacity-60">({b.records?.length || 0})</span>
                  </button>
                );
              })}

              <button
                type="button"
                onClick={handleCreateNewBatch}
                className="p-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-cyan-400 border border-slate-800 transition-colors cursor-pointer"
                title="Start New Batch Session (Late Admissions)"
              >
                <Plus size={16} />
              </button>
            </div>

            {/* Quick Search */}
            <div className="relative w-48 shrink-0">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search students..."
                className="w-full pl-8 pr-3 py-1 bg-slate-900 border border-slate-800 rounded-lg text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
              />
            </div>
          </div>

          {/* SPREADSHEET TABLE */}
          <div className="flex-1 overflow-auto p-4">
            {filteredRecords.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-8 text-slate-500">
                <div className="w-14 h-14 rounded-3xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 flex items-center justify-center mb-3">
                  <Users size={28} />
                </div>
                <p className="text-sm font-bold text-white">No Student Records in this Batch</p>
                <p className="text-xs text-slate-400 max-w-sm mt-1 mb-5">
                  Click <strong>"+ Add Student"</strong> above to type records, import an Excel sheet, or share the School Web link.
                </p>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={handleOpenAddStudentModal}
                    className="px-4 py-2 bg-gradient-to-r from-cyan-500 to-blue-600 text-slate-950 font-bold text-xs rounded-xl shadow cursor-pointer"
                  >
                    + Add First Student
                  </button>
                  <button
                    type="button"
                    onClick={handleCopySchoolLink}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs rounded-xl border border-slate-700 cursor-pointer"
                  >
                    Copy School Link
                  </button>
                </div>
              </div>
            ) : (
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 text-[11px] text-slate-400 font-bold uppercase tracking-wider bg-slate-900/60 sticky top-0">
                    <th className="py-2.5 px-3 w-10 text-center">#</th>
                    <th className="py-2.5 px-3">Student Name</th>
                    <th className="py-2.5 px-3">Roll / ID</th>
                    <th className="py-2.5 px-3">Class</th>
                    <th className="py-2.5 px-3">Father's Name</th>
                    <th className="py-2.5 px-3">Address</th>
                    <th className="py-2.5 px-3">Contact</th>
                    <th className="py-2.5 px-3">DOB</th>
                    <th className="py-2.5 px-3">Blood</th>
                    <th className="py-2.5 px-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {filteredRecords.map((rec, idx) => {
                    const isSelected = rec.id === selectedRecord?.id;
                    const f = rec.fields || {};
                    const sName = f.name || f.fullName || 'Student';
                    const sRoll = f.rollNumber || f.rollNo || '—';
                    const sClass = f.className || f.class || '—';
                    const sFather = f.fatherName || f.father || '—';
                    const sAddress = f.address || f.residentialAddress || '';
                    const sPhone = f.phone || f.mobile || '—';
                    const sDob = f.dob || '—';
                    const sBlood = f.bloodGroup || '—';

                    return (
                      <tr
                        key={rec.id || idx}
                        onClick={() => setSelectedRecordId(rec.id)}
                        className={`transition-colors cursor-pointer group ${
                          isSelected
                            ? 'bg-cyan-500/10 text-white'
                            : 'hover:bg-slate-900/60 text-slate-300'
                        }`}
                      >
                        <td className="py-2.5 px-3 text-center font-mono text-[11px] text-slate-500">
                          {idx + 1}
                        </td>
                        <td className="py-2.5 px-3 font-bold text-slate-100 flex items-center gap-2">
                          <span className="w-6 h-6 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-[10px] font-bold text-cyan-400 shrink-0">
                            {sName ? sName[0] : 'S'}
                          </span>
                          <span className="truncate max-w-[140px]" title={sName}>{sName}</span>
                        </td>
                        <td className="py-2.5 px-3 font-mono font-semibold text-cyan-400">{sRoll}</td>
                        <td className="py-2.5 px-3 font-semibold">{sClass}</td>
                        <td className="py-2.5 px-3 text-slate-400 truncate max-w-[110px]" title={sFather}>{sFather}</td>
                        <td className="py-2.5 px-3 text-slate-400 truncate max-w-[140px]" title={sAddress}>
                          {sAddress ? sAddress : <span className="text-slate-600 italic">None</span>}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-slate-300">{sPhone}</td>
                        <td className="py-2.5 px-3 text-slate-400 font-mono text-[11px]">{sDob}</td>
                        <td className="py-2.5 px-3 font-mono font-bold text-rose-400">{sBlood}</td>
                        <td className="py-2.5 px-3 text-right">
                          <div className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                            {/* Edit Student Button */}
                            <button
                              type="button"
                              onClick={() => handleOpenEditStudentModal(rec)}
                              className="p-1 rounded-lg bg-slate-800 hover:bg-cyan-500/20 text-slate-400 hover:text-cyan-300 border border-slate-700/60 transition-colors"
                              title="Edit Student Details"
                            >
                              <Edit2 size={13} />
                            </button>

                            {/* Delete Student Button */}
                            <button
                              type="button"
                              onClick={(e) => handleDeleteRecord(rec.id, e)}
                              className="p-1 rounded-lg bg-slate-800 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 border border-slate-700/60 transition-colors"
                              title="Delete Student"
                            >
                              <Trash2 size={13} />
                            </button>

                            {isSelected && (
                              <span className="text-[9px] font-bold text-cyan-400 px-1.5 py-0.5 rounded bg-cyan-500/20 border border-cyan-500/30">
                                Active
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {/* ================= COMPREHENSIVE DYNAMIC ADD / EDIT STUDENT MODAL ================= */}
      {addStudentModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md overflow-y-auto">
          <div className="w-full max-w-2xl bg-[#0a0f1d] border border-slate-800 rounded-3xl shadow-2xl p-6 space-y-4 my-8 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                  {studentModalMode === 'edit' ? <Edit2 size={18} /> : <Plus size={18} />}
                </div>
                <div>
                  <h3 className="text-sm font-extrabold text-white">
                    {studentModalMode === 'edit'
                      ? `Edit Student Details (${newStudentName || 'Record'})`
                      : `Add New Student to ${currentBatch?.name || 'Batch'}`}
                  </h3>
                  <p className="text-[11px] text-slate-400">All fields are dynamically linked to your ID Card template</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setAddStudentModalOpen(false)}
                className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-white cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSaveSingleStudent} className="space-y-4 text-xs overflow-y-auto flex-1 pr-1">
              {/* SECTION 1: PRIMARY IDENTITY */}
              <div className="space-y-3">
                <p className="text-[11px] font-extrabold text-cyan-400 uppercase tracking-wider flex items-center gap-1.5">
                  <span>1. Student Identity & Roll</span>
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-200 mb-1">
                      Student Full Name <span className="text-cyan-400">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={newStudentName}
                      onChange={(e) => setNewStudentName(e.target.value)}
                      placeholder="e.g. Rahul Sharma or MARIYA"
                      className="w-full px-3.5 py-2 bg-slate-900 border border-slate-800 rounded-xl text-slate-100 text-xs focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/30 font-semibold"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-200 mb-1">
                      Roll Number / Student ID <span className="text-cyan-400">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={newStudentRoll}
                      onChange={(e) => setNewStudentRoll(e.target.value)}
                      placeholder="e.g. 083 or 101"
                      className="w-full px-3.5 py-2 bg-slate-900 border border-slate-800 rounded-xl text-slate-100 text-xs focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/30 font-mono font-bold text-cyan-400"
                    />
                  </div>
                </div>
              </div>

              {/* SECTION 2: ACADEMIC & PARENTS */}
              <div className="space-y-3 pt-2 border-t border-slate-800/80">
                <p className="text-[11px] font-extrabold text-cyan-400 uppercase tracking-wider">
                  2. Academic & Family Details
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-300 mb-1">Class & Section</label>
                    <input
                      type="text"
                      value={newStudentClass}
                      onChange={(e) => setNewStudentClass(e.target.value)}
                      placeholder="e.g. 11TH or 10th-A"
                      className="w-full px-3.5 py-2 bg-slate-900 border border-slate-800 rounded-xl text-slate-100 text-xs focus:outline-none focus:border-cyan-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-300 mb-1">Father's Name</label>
                    <input
                      type="text"
                      value={newStudentFather}
                      onChange={(e) => setNewStudentFather(e.target.value)}
                      placeholder="e.g. SHANU or Rajesh Sharma"
                      className="w-full px-3.5 py-2 bg-slate-900 border border-slate-800 rounded-xl text-slate-100 text-xs focus:outline-none focus:border-cyan-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-300 mb-1">Mother's Name</label>
                    <input
                      type="text"
                      value={newStudentMother}
                      onChange={(e) => setNewStudentMother(e.target.value)}
                      placeholder="e.g. Sunita Sharma"
                      className="w-full px-3.5 py-2 bg-slate-900 border border-slate-800 rounded-xl text-slate-100 text-xs focus:outline-none focus:border-cyan-500"
                    />
                  </div>
                </div>
              </div>

              {/* SECTION 3: ADDRESS & CONTACT DETAILS */}
              <div className="space-y-3 pt-2 border-t border-slate-800/80">
                <p className="text-[11px] font-extrabold text-cyan-400 uppercase tracking-wider">
                  3. Residential Address & Contact
                </p>
                <div>
                  <label className="block text-[11px] font-bold text-slate-300 mb-1 flex items-center justify-between">
                    <span>Full Residential Address</span>
                    <span className="text-[10px] text-slate-500 font-normal">Prints on Card Body</span>
                  </label>
                  <input
                    type="text"
                    value={newStudentAddress}
                    onChange={(e) => setNewStudentAddress(e.target.value)}
                    placeholder="e.g. SHAHPUR JOT YUSUF 'HATHILA' BAHRAICH"
                    className="w-full px-3.5 py-2 bg-slate-900 border border-slate-800 rounded-xl text-slate-100 text-xs focus:outline-none focus:border-cyan-500"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-300 mb-1">Mobile No. / Phone</label>
                    <input
                      type="tel"
                      value={newStudentPhone}
                      onChange={(e) => setNewStudentPhone(e.target.value)}
                      placeholder="e.g. 9125264245"
                      className="w-full px-3.5 py-2 bg-slate-900 border border-slate-800 rounded-xl text-slate-100 text-xs font-mono focus:outline-none focus:border-cyan-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-300 mb-1">Emergency Contact (Optional)</label>
                    <input
                      type="tel"
                      value={newStudentEmergencyContact}
                      onChange={(e) => setNewStudentEmergencyContact(e.target.value)}
                      placeholder="e.g. +91 98765 43210"
                      className="w-full px-3.5 py-2 bg-slate-900 border border-slate-800 rounded-xl text-slate-100 text-xs font-mono focus:outline-none focus:border-cyan-500"
                    />
                  </div>
                </div>
              </div>

              {/* SECTION 4: PERSONAL & BIOMETRIC */}
              <div className="space-y-3 pt-2 border-t border-slate-800/80">
                <p className="text-[11px] font-extrabold text-cyan-400 uppercase tracking-wider">
                  4. Personal & Medical Info
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-300 mb-1">Date of Birth (DOB)</label>
                    <input
                      type="text"
                      value={newStudentDob}
                      onChange={(e) => setNewStudentDob(e.target.value)}
                      placeholder="DD/MM/YYYY (e.g. 22/12/2011)"
                      className="w-full px-3.5 py-2 bg-slate-900 border border-slate-800 rounded-xl text-slate-100 text-xs focus:outline-none focus:border-cyan-500 font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-300 mb-1">Blood Group</label>
                    <select
                      value={newStudentBlood}
                      onChange={(e) => setNewStudentBlood(e.target.value)}
                      className="w-full px-3.5 py-2 bg-slate-900 border border-slate-800 rounded-xl text-slate-100 text-xs font-mono focus:outline-none focus:border-cyan-500"
                    >
                      <option value="A+">A+ (A Positive)</option>
                      <option value="A-">A- (A Negative)</option>
                      <option value="B+">B+ (B Positive)</option>
                      <option value="B-">B- (B Negative)</option>
                      <option value="O+">O+ (O Positive)</option>
                      <option value="O-">O- (O Negative)</option>
                      <option value="AB+">AB+ (AB Positive)</option>
                      <option value="AB-">AB- (AB Negative)</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* SECTION 5: CUSTOM DYNAMIC FIELDS */}
              <div className="space-y-2.5 pt-2 border-t border-slate-800/80">
                <div className="flex items-center justify-between">
                  <p className="text-[11px] font-extrabold text-cyan-400 uppercase tracking-wider">
                    5. Custom / Extra Fields
                  </p>
                  <button
                    type="button"
                    onClick={() => setShowAddCustomField(!showAddCustomField)}
                    className="text-[11px] text-cyan-400 hover:text-cyan-300 font-bold flex items-center gap-1 cursor-pointer"
                  >
                    <Plus size={12} />
                    <span>+ Add Custom Field</span>
                  </button>
                </div>

                {/* Inline Add Custom Field Input */}
                {showAddCustomField && (
                  <div className="p-3 rounded-xl bg-slate-900/90 border border-cyan-500/30 space-y-2">
                    <p className="text-[10px] text-slate-400 font-semibold">Enter custom field name (e.g. Bus Route No, Aadhaar No, Transport):</p>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={newCustomFieldLabel}
                        onChange={(e) => setNewCustomFieldLabel(e.target.value)}
                        placeholder="Field Name (e.g. Bus Route No)"
                        className="flex-1 px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-slate-200 text-xs focus:outline-none focus:border-cyan-500"
                      />
                      <input
                        type="text"
                        value={newCustomFieldValue}
                        onChange={(e) => setNewCustomFieldValue(e.target.value)}
                        placeholder="Field Value (e.g. Route 4)"
                        className="flex-1 px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-slate-200 text-xs focus:outline-none focus:border-cyan-500"
                      />
                      <button
                        type="button"
                        onClick={handleAddCustomFieldToStudent}
                        className="px-3 py-1.5 bg-cyan-500 text-slate-950 font-bold text-xs rounded-lg hover:bg-cyan-400 cursor-pointer"
                      >
                        Add
                      </button>
                    </div>
                  </div>
                )}

                {/* Render Custom Fields List */}
                {customStudentFields.length > 0 && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    {customStudentFields.map((cf) => (
                      <div key={cf.key} className="flex items-center gap-2">
                        <div className="flex-1">
                          <label className="block text-[10px] font-bold text-slate-400 mb-0.5">{cf.label}</label>
                          <input
                            type="text"
                            value={cf.value}
                            onChange={(e) => handleUpdateCustomFieldValue(cf.key, e.target.value)}
                            placeholder={`Enter ${cf.label}`}
                            className="w-full px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-slate-200 text-xs focus:outline-none focus:border-cyan-500"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemoveCustomFieldFromStudent(cf.key)}
                          className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 self-end mb-0.5"
                          title="Remove this custom field"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* SECTION 6: STUDENT PHOTO */}
              <div className="space-y-3 pt-2 border-t border-slate-800/80">
                <p className="text-[11px] font-extrabold text-cyan-400 uppercase tracking-wider">
                  6. Student Photo (Portrait)
                </p>
                <div className="p-3.5 rounded-2xl bg-slate-900/80 border border-slate-800 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-14 h-16 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-center overflow-hidden shrink-0">
                      {newStudentPhoto ? (
                        <img src={newStudentPhoto} alt="Student" className="w-full h-full object-cover" />
                      ) : (
                        <Camera size={22} className="text-slate-600" />
                      )}
                    </div>
                    <div>
                      <p className="font-bold text-white text-xs">
                        {newStudentPhoto ? 'Photo Attached' : 'No Photo Selected'}
                      </p>
                      <p className="text-[10px] text-slate-400">AI Background auto-standardization enabled</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <label className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-cyan-400 text-xs font-bold rounded-xl border border-slate-700 cursor-pointer transition-all">
                      <span>{newStudentPhoto ? 'Change Photo' : 'Choose Photo'}</span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            const reader = new FileReader();
                            reader.onload = () => setNewStudentPhoto(reader.result);
                            reader.readAsDataURL(file);
                          }
                        }}
                        className="hidden"
                      />
                    </label>
                    {newStudentPhoto && (
                      <button
                        type="button"
                        onClick={() => setNewStudentPhoto(null)}
                        className="p-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 cursor-pointer"
                        title="Remove Photo"
                      >
                        <Trash2 size={15} />
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* MODAL FOOTER */}
              <div className="pt-4 border-t border-slate-800 flex items-center justify-end gap-3 sticky bottom-0 bg-[#0a0f1d]">
                <button
                  type="button"
                  onClick={() => setAddStudentModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs cursor-pointer transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingStudent}
                  className="px-6 py-2 bg-gradient-to-r from-cyan-500 via-blue-600 to-indigo-600 hover:from-cyan-400 hover:to-indigo-500 text-slate-950 font-extrabold text-xs rounded-xl shadow-lg shadow-cyan-950/40 flex items-center gap-2 cursor-pointer transition-all disabled:opacity-50"
                >
                  <Check size={15} />
                  <span>{isSavingStudent ? 'Saving...' : studentModalMode === 'edit' ? 'Update Student Record' : 'Save Student'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Card & Organization Settings Modal */}
      {settingsModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="w-full max-w-2xl bg-[#090d16] border border-slate-800 rounded-3xl p-6 shadow-2xl space-y-5 my-8 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                  <Sliders size={18} />
                </div>
                <div>
                  <h3 className="text-sm font-extrabold text-white">Card & School Customization Studio</h3>
                  <p className="text-[11px] text-slate-400">Edit Front/Back texts, Subtitle, Logo, Signature, Watermark, and Terms</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSettingsModalOpen(false)}
                className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-white cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            {/* Front / Back Sub-Tabs */}
            <div className="flex items-center gap-2 p-1.5 rounded-2xl bg-slate-900 border border-slate-800 shrink-0">
              <button
                type="button"
                onClick={() => setSettingsSubTab('front')}
                className={`flex-1 py-2 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer ${
                  settingsSubTab === 'front'
                    ? 'bg-cyan-500 text-slate-950 shadow-md'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <span>🪪 Front Side Elements</span>
              </button>
              <button
                type="button"
                onClick={() => setSettingsSubTab('back')}
                className={`flex-1 py-2 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer ${
                  settingsSubTab === 'back'
                    ? 'bg-cyan-500 text-slate-950 shadow-md'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <span>📜 Back Side & Terms</span>
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto space-y-4 pr-1 text-xs">
              {settingsSubTab === 'front' ? (
                <div className="space-y-4">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-bold text-slate-200">School / Organization Full Name</label>
                      {editOrgName && (
                        <button
                          type="button"
                          onClick={() => setEditOrgName('')}
                          className="text-[10px] text-rose-400 hover:text-rose-300 font-semibold cursor-pointer"
                        >
                          Clear
                        </button>
                      )}
                    </div>
                    <input
                      type="text"
                      value={editOrgName}
                      onChange={(e) => setEditOrgName(e.target.value)}
                      placeholder="e.g. Delhi Public School"
                      className="w-full px-3.5 py-2 bg-slate-900 border border-slate-800 rounded-xl text-slate-100 text-xs focus:outline-none focus:border-cyan-500"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-bold text-slate-200">
                        Subtitle / Category <span className="text-[10px] text-slate-400">(e.g. INTER COLLEGE, Higher Secondary)</span>
                      </label>
                      {editOrgSubtitle && (
                        <button
                          type="button"
                          onClick={() => setEditOrgSubtitle('')}
                          className="text-[10px] text-rose-400 hover:text-rose-300 font-semibold cursor-pointer"
                        >
                          Delete Subtitle
                        </button>
                      )}
                    </div>
                    <input
                      type="text"
                      value={editOrgSubtitle}
                      onChange={(e) => setEditOrgSubtitle(e.target.value)}
                      placeholder="e.g. INTER COLLEGE (Leave empty to remove)"
                      className="w-full px-3.5 py-2 bg-slate-900 border border-slate-800 rounded-xl text-slate-100 text-xs focus:outline-none focus:border-cyan-500"
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-200 mb-1">Address / Campus</label>
                      <input
                        type="text"
                        value={editOrgAddress}
                        onChange={(e) => setEditOrgAddress(e.target.value)}
                        placeholder="e.g. Cantt Road, Varanasi, UP"
                        className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-slate-100 text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-200 mb-1">Academic Session / Year</label>
                      <input
                        type="text"
                        value={editOrgSession}
                        onChange={(e) => setEditOrgSession(e.target.value)}
                        placeholder="e.g. 2026-2027"
                        className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-slate-100 text-xs"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-200 mb-1">Helpline Phone</label>
                      <input
                        type="text"
                        value={editOrgPhone}
                        onChange={(e) => setEditOrgPhone(e.target.value)}
                        placeholder="e.g. +91 98765 43210"
                        className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-slate-100 text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-200 mb-1">ESTD / Crest Text</label>
                      <input
                        type="text"
                        value={editOrgEstd}
                        onChange={(e) => setEditOrgEstd(e.target.value)}
                        placeholder="e.g. ESTD. 2010"
                        className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-slate-100 text-xs"
                      />
                    </div>
                  </div>

                  {/* Logo & Signature Cards */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                    {/* Logo Card */}
                    <div className="p-3.5 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-lg bg-slate-950 border border-slate-800 flex items-center justify-center overflow-hidden">
                            {editOrgLogo ? (
                              <img src={editOrgLogo} alt="Logo" className="w-full h-full object-contain p-0.5" />
                            ) : (
                              <Building size={16} className="text-slate-500" />
                            )}
                          </div>
                          <span className="font-bold text-white text-xs">Logo</span>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={editOrgShowLogo}
                            onChange={(e) => setEditOrgShowLogo(e.target.checked)}
                            className="sr-only peer"
                          />
                          <div className="w-8 h-4 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-cyan-500"></div>
                        </label>
                      </div>

                      <div className="flex items-center gap-2">
                        <label className="flex-1 py-1.5 text-center rounded-lg bg-slate-800 hover:bg-slate-700 text-cyan-400 text-xs font-bold border border-slate-700 cursor-pointer">
                          <span>{editOrgLogo ? 'Replace Logo' : 'Upload Logo'}</span>
                          <input
                            type="file"
                            accept="image/*"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) {
                                const reader = new FileReader();
                                reader.onload = () => {
                                  setEditOrgLogo(reader.result);
                                  setEditOrgShowLogo(true);
                                };
                                reader.readAsDataURL(file);
                              }
                            }}
                            className="hidden"
                          />
                        </label>
                        {editOrgLogo && (
                          <button
                            type="button"
                            onClick={() => setEditOrgLogo('')}
                            className="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20"
                            title="Delete Logo"
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Signature Card */}
                    <div className="p-3.5 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-lg bg-slate-950 border border-slate-800 flex items-center justify-center overflow-hidden">
                            {editOrgSign ? (
                              <img src={editOrgSign} alt="Sign" className="w-full h-full object-contain p-0.5" />
                            ) : (
                              <Sparkles size={16} className="text-slate-500" />
                            )}
                          </div>
                          <span className="font-bold text-white text-xs">Signature</span>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={editOrgShowSign}
                            onChange={(e) => setEditOrgShowSign(e.target.checked)}
                            className="sr-only peer"
                          />
                          <div className="w-8 h-4 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-cyan-500"></div>
                        </label>
                      </div>

                      <input
                        type="text"
                        value={editOrgSignLabel}
                        onChange={(e) => setEditOrgSignLabel(e.target.value)}
                        placeholder="Sign Title (e.g. Principal)"
                        className="w-full px-2.5 py-1 bg-slate-950 border border-slate-800 rounded-lg text-slate-200 text-xs"
                      />

                      <div className="flex items-center gap-2">
                        <label className="flex-1 py-1.5 text-center rounded-lg bg-slate-800 hover:bg-slate-700 text-cyan-400 text-xs font-bold border border-slate-700 cursor-pointer">
                          <span>{editOrgSign ? 'Replace Sign' : 'Upload Sign'}</span>
                          <input
                            type="file"
                            accept="image/*"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) {
                                const reader = new FileReader();
                                reader.onload = () => {
                                  setEditOrgSign(reader.result);
                                  setEditOrgShowSign(true);
                                };
                                reader.readAsDataURL(file);
                              }
                            }}
                            className="hidden"
                          />
                        </label>
                        {editOrgSign && (
                          <button
                            type="button"
                            onClick={() => setEditOrgSign('')}
                            className="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20"
                            title="Delete Signature"
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Barcode toggle */}
                  <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 flex items-center justify-between">
                    <span className="font-bold text-white text-xs">Show Front Vector Barcode</span>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={editOrgShowBarcode}
                        onChange={(e) => setEditOrgShowBarcode(e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-8 h-4 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-cyan-500"></div>
                    </label>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Back Header Customization */}
                  <div className="p-3.5 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-3">
                    <p className="font-extrabold text-xs text-cyan-400">Back Header & Watermark</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                      <div>
                        <label className="block text-[11px] font-bold text-slate-300 mb-1">Back Header Title</label>
                        <input
                          type="text"
                          value={editOrgBackTitle}
                          onChange={(e) => setEditOrgBackTitle(e.target.value)}
                          placeholder={`Syncs with "${editOrgName}" if empty`}
                          className="w-full px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-slate-200 text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-slate-300 mb-1">Back Subtitle</label>
                        <input
                          type="text"
                          value={editOrgBackSubtitle}
                          onChange={(e) => setEditOrgBackSubtitle(e.target.value)}
                          placeholder={`Syncs with "${editOrgSubtitle}" if empty`}
                          className="w-full px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-slate-200 text-xs"
                        />
                      </div>
                    </div>

                    <div className="pt-2 border-t border-slate-800 flex items-center justify-between gap-4">
                      <div className="flex-1">
                        <label className="block text-[11px] font-bold text-slate-300 mb-1">Watermark Text</label>
                        <input
                          type="text"
                          value={editOrgWatermarkText}
                          onChange={(e) => setEditOrgWatermarkText(e.target.value)}
                          placeholder="e.g. ESTD. 2010"
                          className="w-full px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-slate-200 text-xs"
                        />
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <span className="text-[11px] font-bold text-slate-300">Show Watermark</span>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={editOrgShowWatermark}
                            onChange={(e) => setEditOrgShowWatermark(e.target.checked)}
                            className="sr-only peer"
                          />
                          <div className="w-8 h-4 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-cyan-500"></div>
                        </label>
                      </div>
                    </div>
                  </div>

                  {/* Terms & Conditions Box */}
                  <div className="p-3.5 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="font-extrabold text-xs text-cyan-400">Terms & Conditions / Rules</span>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={editOrgShowTerms}
                          onChange={(e) => setEditOrgShowTerms(e.target.checked)}
                          className="sr-only peer"
                        />
                        <div className="w-8 h-4 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-cyan-500"></div>
                      </label>
                    </div>

                    {editOrgShowTerms && (
                      <div className="space-y-2 pt-1">
                        <input
                          type="text"
                          value={editOrgTermsTitle}
                          onChange={(e) => setEditOrgTermsTitle(e.target.value)}
                          placeholder="TERMS & CONDITIONS"
                          className="w-full px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-slate-200 text-xs"
                        />

                        <div className="space-y-2 pt-1">
                          {editOrgTerms.map((t, idx) => (
                            <div key={idx} className="flex items-center gap-2">
                              <span className="text-cyan-400 font-bold text-xs">{idx + 1}.</span>
                              <input
                                type="text"
                                value={t}
                                onChange={(e) => {
                                  const copy = [...editOrgTerms];
                                  copy[idx] = e.target.value;
                                  setEditOrgTerms(copy);
                                }}
                                className="flex-1 px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-slate-200 text-xs focus:outline-none focus:border-cyan-500"
                              />
                              <button
                                type="button"
                                onClick={() => setEditOrgTerms(editOrgTerms.filter((_, i) => i !== idx))}
                                className="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20"
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          ))}

                          <button
                            type="button"
                            onClick={() => setEditOrgTerms([...editOrgTerms, 'New rule / instruction point'])}
                            className="px-3 py-1.5 rounded-xl bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 text-xs font-bold border border-cyan-500/30 flex items-center gap-1.5 cursor-pointer"
                          >
                            <Plus size={13} />
                            <span>+ Add Rule / Point</span>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Back Footer Bar */}
                  <div className="p-3.5 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-extrabold text-xs text-cyan-400">Emergency Footer Note</span>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={editOrgShowBackFooter}
                          onChange={(e) => setEditOrgShowBackFooter(e.target.checked)}
                          className="sr-only peer"
                        />
                        <div className="w-8 h-4 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-cyan-500"></div>
                      </label>
                    </div>

                    {editOrgShowBackFooter && (
                      <input
                        type="text"
                        value={editOrgBackFooterText}
                        onChange={(e) => setEditOrgBackFooterText(e.target.value)}
                        placeholder="e.g. Emergency Contact : {phone}"
                        className="w-full px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-slate-200 text-xs"
                      />
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Modal Actions */}
            <div className="pt-3 border-t border-slate-800 flex items-center justify-end gap-3 shrink-0">
              <button
                type="button"
                onClick={() => setSettingsModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveOrgSettings}
                disabled={isSavingSettings}
                className="px-6 py-2 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-extrabold text-xs rounded-xl shadow cursor-pointer disabled:opacity-50"
              >
                {isSavingSettings ? 'Saving...' : '💾 Save & Update Live Preview'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Print Modal */}
      {printModalOpen && (
        <PrintSheetModal
          isOpen={printModalOpen}
          onClose={() => setPrintModalOpen(false)}
          project={project}
          batch={currentBatch}
          setToast={setToast}
        />
      )}
    </div>
  );
};

export default CardStudioWorkspace;
