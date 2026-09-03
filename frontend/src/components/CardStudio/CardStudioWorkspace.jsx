import React, { useState, useEffect } from 'react';
import {
  CreditCard,
  Plus,
  FolderKanban,
  LayoutTemplate,
  CheckCircle2,
  Table as TableIcon,
  Sparkles,
  Save,
  ArrowLeft,
  Eye,
  Printer,
  FileSpreadsheet,
  Download,
  Loader2,
} from 'lucide-react';

import Step1_ProjectInfo from './Wizard/Step1_ProjectInfo';
import Step2_TemplateSelection from './Wizard/Step2_TemplateSelection';
import CreditMeterBadge from '../Credits/CreditMeterBadge';

import Step3_PhotoConfig from './Wizard/Step3_PhotoConfig';
import Step4_DataImport from './Wizard/Step4_DataImport';
import Step5_ColumnMapping from './Wizard/Step5_ColumnMapping';
import Step6_PhotoMatching from './Wizard/Step6_PhotoMatching';
import Step7_PhotoQueue from './Wizard/Step7_PhotoQueue';
import Step8_PreflightAndGenerate from './Wizard/Step8_PreflightAndGenerate';
import CardDataTable from './CardDataTable';
import ProjectList from './ProjectList';
import TemplateManager from './TemplateManager';

import {
  getCardTemplates,
  listCardProjects,
  getCardProject,
  saveCardProject,
  deleteCardProject,
  renderCardPreviewHtml,
  generateCardPdfBlob,
} from '../../services/cardApi';

const DEFAULT_PROJECT = {
  id: '',
  name: '',
  client: '',
  cardType: 'school',
  organization: {
    name: '',
    address: '',
    phone: '',
    email: '',
    website: '',
    session: '2026-27',
  },
  templateId: 'school-modern-blue',
  templateVersion: '1.0.0',
  photoProcessingProfile: {
    removeBg: true,
    bgColor: '#FFFFFF',
    faceDetectCrop: true,
    enhance: true,
    targetDpi: 300,
    aspectRatio: '35x45',
  },
  records: [],
  columnMappings: {},
  status: 'DRAFT',
};

export default function CardStudioWorkspace({ setToast }) {
  const [activeTab, setActiveTab] = useState('projects'); // projects, wizard, production, templates
  const [wizardStep, setWizardStep] = useState(1);
  const [templates, setTemplates] = useState([]);
  const [projectsList, setProjectsList] = useState([]);
  const [currentProject, setCurrentProject] = useState(DEFAULT_PROJECT);
  const [isSaving, setIsSaving] = useState(false);

  // Fetch Templates and Saved Projects on Mount
  useEffect(() => {
    fetchTemplates();
    fetchProjects();
  }, []);

  const fetchTemplates = async () => {
    try {
      const list = await getCardTemplates();
      setTemplates(list || []);
    } catch (err) {
      console.error('Error loading templates:', err);
    }
  };

  const fetchProjects = async () => {
    try {
      const list = await listCardProjects();
      setProjectsList(list || []);
    } catch (err) {
      console.error('Error loading projects:', err);
    }
  };

  const handleStartNewProject = () => {
    const newId = `proj_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    setCurrentProject({
      ...DEFAULT_PROJECT,
      id: newId,
      name: 'New Card Production Batch',
    });
    setWizardStep(1);
    setActiveTab('wizard');
  };

  const handleOpenProject = async (projectId) => {
    try {
      const proj = await getCardProject(projectId);
      if (proj) {
        setCurrentProject(proj);
        setActiveTab('production');
        setToast?.({ type: 'success', message: `Loaded project: ${proj.name}` });
      }
    } catch (err) {
      console.error('Error opening project:', err);
      setToast?.({ type: 'error', message: 'Failed to load project.' });
    }
  };

  const handleDeleteProject = async (projectId) => {
    if (!window.confirm('Are you sure you want to delete this project?')) return;
    try {
      await deleteCardProject(projectId);
      fetchProjects();
      setToast?.({ type: 'info', message: 'Project deleted.' });
    } catch (err) {
      console.error('Error deleting project:', err);
    }
  };

  const handleSaveCurrentProject = async () => {
    if (!currentProject?.id) return;
    setIsSaving(true);
    try {
      await saveCardProject(currentProject);
      fetchProjects();
      setToast?.({ type: 'success', message: 'Project saved successfully!' });
    } catch (err) {
      console.error('Save error:', err);
      setToast?.({ type: 'error', message: 'Failed to save project.' });
    } finally {
      setIsSaving(false);
    }
  };

  const updateCurrentProject = (partial) => {
    setCurrentProject((prev) => ({
      ...prev,
      ...partial,
      updatedAt: new Date().toISOString(),
    }));
  };

  const handleUpdateRecord = (recordId, fieldsUpdate) => {
    const updated = (currentProject.records || []).map((r) => {
      if (r.id === recordId) {
        return {
          ...r,
          fields: {
            ...r.fields,
            ...fieldsUpdate,
          },
        };
      }
      return r;
    });
    updateCurrentProject({ records: updated });
  };

  const handleReplacePhoto = (recordId, file) => {
    const reader = new FileReader();
    reader.onload = () => {
      const updated = (currentProject.records || []).map((r) => {
        if (r.id === recordId) {
          return {
            ...r,
            photo: {
              source: 'manual',
              originalFilename: file.name,
              originalPath: reader.result,
              matched: true,
              matchConfidence: 1.0,
              matchMethod: 'manual',
            },
            processedPhoto: {
              status: 'pending',
              processedUrl: reader.result,
            },
          };
        }
        return r;
      });
      updateCurrentProject({ records: updated });
      setToast?.({ type: 'success', message: 'Photo replaced manually.' });
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="h-full w-full flex flex-col overflow-hidden bg-slate-950 text-white select-none">
      
      {/* --- Top Sub-Header & Navigation Tabs --- */}
      <div className="h-13 px-6 bg-slate-950/80 border-b border-slate-800/80 flex items-center justify-between shrink-0 z-10 backdrop-blur-md">
        
        {/* Left: Module Title & Navigation Tabs */}
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center text-slate-950 shadow-md shadow-cyan-500/20">
              <CreditCard size={17} className="text-slate-950 font-black" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-extrabold text-sm text-white tracking-tight">Universal Card Studio</span>
                <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
                  300 DPI
                </span>
              </div>
            </div>
          </div>

          {/* Sub Navigation Links */}
          <div className="flex items-center gap-1 bg-slate-900/90 p-1 rounded-xl border border-slate-800 text-xs">
            <button
              type="button"
              onClick={() => setActiveTab('projects')}
              className={`px-3 py-1.5 rounded-lg font-bold transition-all flex items-center gap-1.5 ${
                activeTab === 'projects'
                  ? 'bg-cyan-500 text-slate-950 shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <FolderKanban size={13} />
              <span>Projects</span>
            </button>

            <button
              type="button"
              onClick={handleStartNewProject}
              className={`px-3 py-1.5 rounded-lg font-bold transition-all flex items-center gap-1.5 ${
                activeTab === 'wizard'
                  ? 'bg-cyan-500 text-slate-950 shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Plus size={13} />
              <span>New Batch Wizard</span>
            </button>

            {currentProject.records?.length > 0 && (
              <button
                type="button"
                onClick={() => setActiveTab('production')}
                className={`px-3 py-1.5 rounded-lg font-bold transition-all flex items-center gap-1.5 ${
                  activeTab === 'production'
                    ? 'bg-cyan-500 text-slate-950 shadow'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <TableIcon size={13} />
                <span>Production Table ({currentProject.records.length})</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setActiveTab('templates')}
              className={`px-3 py-1.5 rounded-lg font-bold transition-all flex items-center gap-1.5 ${
                activeTab === 'templates'
                  ? 'bg-cyan-500 text-slate-950 shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <LayoutTemplate size={13} />
              <span>Templates</span>
            </button>
          </div>
        </div>

        {/* Right: Active Project Status, Credit Badge & Quick Save */}
        <div className="flex items-center gap-3">
          <CreditMeterBadge />

          {currentProject.id && (
            <div className="flex items-center gap-2 px-3 py-1 bg-slate-900 border border-slate-800 rounded-xl text-xs">
              <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
              <span className="font-semibold text-slate-300 truncate max-w-[180px]">{currentProject.name}</span>
            </div>
          )}


          {currentProject.id && (
            <button
              type="button"
              onClick={handleSaveCurrentProject}
              disabled={isSaving}
              className="px-3.5 py-1.5 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 disabled:opacity-50 text-slate-950 font-bold text-xs rounded-xl shadow-md flex items-center gap-1.5 transition-all cursor-pointer"
            >
              {isSaving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
              <span>{isSaving ? 'Saving...' : 'Save'}</span>
            </button>
          )}
        </div>
      </div>

      {/* --- Main Body Workspace --- */}
      <div className="flex-1 overflow-y-auto p-6">
        
        {/* VIEW 1: PROJECTS LIST */}
        {activeTab === 'projects' && (
          <ProjectList
            projects={projectsList}
            onOpenProject={handleOpenProject}
            onNewProject={handleStartNewProject}
            onDeleteProject={handleDeleteProject}
          />
        )}

        {/* VIEW 2: NEW PROJECT 8-STEP WIZARD */}
        {activeTab === 'wizard' && (
          <div className="space-y-6">
            
            {/* Step Progress Pills */}
            <div className="flex items-center justify-between max-w-4xl mx-auto px-2">
              {[
                'Project Info',
                'Template',
                'Photo Config',
                'Import Data',
                'Map Columns',
                'Match Photos',
                'Process Queue',
                'Preflight & Output',
              ].map((stepName, idx) => {
                const stepNum = idx + 1;
                const isCompleted = wizardStep > stepNum;
                const isCurrent = wizardStep === stepNum;

                return (
                  <button
                    key={stepNum}
                    type="button"
                    onClick={() => setWizardStep(stepNum)}
                    className="flex flex-col items-center gap-1 group cursor-pointer"
                  >
                    <div
                      className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                        isCurrent
                          ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-950/50 ring-2 ring-cyan-400/40'
                          : isCompleted
                          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                          : 'bg-slate-900 text-slate-500 border border-slate-800 group-hover:border-slate-700'
                      }`}
                    >
                      {isCompleted ? <CheckCircle2 size={13} /> : stepNum}
                    </div>
                    <span className={`text-[10px] font-semibold hidden md:block ${isCurrent ? 'text-cyan-400' : 'text-slate-500'}`}>
                      {stepName}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Step Content Routers */}
            {wizardStep === 1 && (
              <Step1_ProjectInfo
                project={currentProject}
                updateProject={updateCurrentProject}
                onNext={() => setWizardStep(2)}
              />
            )}

            {wizardStep === 2 && (
              <Step2_TemplateSelection
                templates={templates}
                project={currentProject}
                updateProject={updateCurrentProject}
                onNext={() => setWizardStep(3)}
                onPrev={() => setWizardStep(1)}
              />
            )}

            {wizardStep === 3 && (
              <Step3_PhotoConfig
                project={currentProject}
                updateProject={updateCurrentProject}
                onNext={() => setWizardStep(4)}
                onPrev={() => setWizardStep(2)}
              />
            )}

            {wizardStep === 4 && (
              <Step4_DataImport
                project={currentProject}
                updateProject={updateCurrentProject}
                onNext={() => setWizardStep(5)}
                onPrev={() => setWizardStep(3)}
                setToast={setToast}
              />
            )}

            {wizardStep === 5 && (
              <Step5_ColumnMapping
                project={currentProject}
                updateProject={updateCurrentProject}
                onNext={() => setWizardStep(6)}
                onPrev={() => setWizardStep(4)}
                setToast={setToast}
              />
            )}

            {wizardStep === 6 && (
              <Step6_PhotoMatching
                project={currentProject}
                updateProject={updateCurrentProject}
                onNext={() => setWizardStep(7)}
                onPrev={() => setWizardStep(5)}
                setToast={setToast}
              />
            )}

            {wizardStep === 7 && (
              <Step7_PhotoQueue
                project={currentProject}
                updateProject={updateCurrentProject}
                onNext={() => setWizardStep(8)}
                onPrev={() => setWizardStep(6)}
                setToast={setToast}
              />
            )}

            {wizardStep === 8 && (
              <Step8_PreflightAndGenerate
                project={currentProject}
                updateProject={updateCurrentProject}
                onPrev={() => setWizardStep(7)}
                setToast={setToast}
              />
            )}
          </div>
        )}

        {/* VIEW 3: LIVE PRODUCTION WORKSPACE (FULL DATA TABLE) */}
        {activeTab === 'production' && (
          <div className="space-y-6 max-w-6xl mx-auto">
            <div className="flex items-center justify-between p-4 bg-slate-950/80 border border-slate-800 rounded-2xl">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <TableIcon size={16} className="text-cyan-400" />
                  {currentProject.name} — Data Table
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Live spreadsheet record editor • {currentProject.records?.length || 0} records
                </p>
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setWizardStep(8);
                    setActiveTab('wizard');
                  }}
                  className="px-4 py-2 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-bold text-xs rounded-xl shadow-md flex items-center gap-1.5 transition-all cursor-pointer"
                >
                  <Eye size={14} />
                  <span>Preview & Export PDF</span>
                </button>
              </div>
            </div>

            <CardDataTable
              records={currentProject.records || []}
              onUpdateRecord={handleUpdateRecord}
              onReplacePhoto={handleReplacePhoto}
            />
          </div>
        )}

        {/* VIEW 4: TEMPLATES CATALOG */}
        {activeTab === 'templates' && (
          <TemplateManager
            templates={templates}
            onSelectTemplate={(tmpl) => {
              updateCurrentProject({ templateId: tmpl.id });
              setActiveTab('wizard');
              setWizardStep(2);
            }}
          />
        )}
      </div>
    </div>
  );
}
