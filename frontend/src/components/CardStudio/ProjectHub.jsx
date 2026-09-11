import React, { useState, useEffect } from 'react';
import {
  CreditCard,
  Plus,
  Search,
  ExternalLink,
  Printer,
  Copy,
  Check,
  Trash2,
  Lock,
  Layers,
  Sparkles,
  Calendar,
  Users,
  ChevronRight,
  School,
  Building,
  RefreshCw,
  LayoutTemplate,
} from 'lucide-react';
import { listCardProjectsApi, deleteCardProjectApi } from '../../services/cardApi';
import TemplateManagerModal from './TemplateManagerModal';

const ProjectHub = ({ onOpenProject, onNewProject, onOpenPrint, setToast }) => {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedToken, setCopiedToken] = useState(null);
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);

  const fetchProjects = async () => {
    try {
      setLoading(true);
      const data = await listCardProjectsApi();
      setProjects(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to load card projects:', err);
      // Fallback empty list
      setProjects([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProjects();
  }, []);

  const handleDelete = async (e, projectId, projectName) => {
    e.stopPropagation();
    if (!window.confirm(`Are you sure you want to delete project "${projectName}"?`)) return;
    try {
      await deleteCardProjectApi(projectId);
      setProjects((prev) => prev.filter((p) => p.id !== projectId));
      setToast?.({ type: 'success', message: 'Project deleted successfully' });
    } catch (err) {
      console.error('Delete failed:', err);
      setToast?.({ type: 'error', message: 'Failed to delete project' });
    }
  };

  const handleCopyLink = (e, token) => {
    e.stopPropagation();
    const isDev = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
    const link = isDev
      ? `http://localhost:5173/cards/fill/${token}`
      : `https://primeidpro.online/cards/fill/${token}`;
    navigator.clipboard.writeText(link);
    setCopiedToken(token);
    setToast?.({ type: 'success', message: '🔗 School Live Form link copied!' });
    setTimeout(() => setCopiedToken(null), 2500);
  };

  const filteredProjects = projects.filter((p) => {
    const q = searchQuery.toLowerCase();
    return (
      (p.name && p.name.toLowerCase().includes(q)) ||
      (p.organization?.name && p.organization.name.toLowerCase().includes(q)) ||
      (p.client && p.client.toLowerCase().includes(q))
    );
  });

  return (
    <div className="flex-1 flex flex-col h-full bg-[#090d16] text-slate-100 overflow-y-auto p-6 md:p-8">
      {/* Header & Main Actions */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 pb-6 border-b border-slate-800/80">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 rounded-2xl bg-gradient-to-br from-cyan-500/20 to-blue-600/20 border border-cyan-500/30 text-cyan-400 shadow-inner">
              <CreditCard size={24} />
            </div>
            <div>
              <h1 className="text-2xl font-extrabold tracking-tight text-white flex items-center gap-2">
                Card Studio <span className="text-xs px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 font-mono">v2.0 PRO</span>
              </h1>
              <p className="text-xs text-slate-400 mt-0.5">
                Bulk School & Corporate ID Card Generator • 100% Local AI Face Crop • Multi-Batch Sessions
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto">
          <button
            type="button"
            onClick={fetchProjects}
            className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-white hover:border-slate-700 transition-all cursor-pointer"
            title="Refresh Projects"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>

          <button
            type="button"
            onClick={() => setIsTemplateModalOpen(true)}
            className="flex-1 md:flex-initial px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-cyan-400 border border-cyan-500/30 font-bold text-sm rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-95"
          >
            <LayoutTemplate size={18} />
            <span>Card Templates</span>
          </button>

          <button
            type="button"
            onClick={onNewProject}
            className="flex-1 md:flex-initial px-4 py-2.5 bg-gradient-to-r from-cyan-500 via-blue-600 to-indigo-600 hover:from-cyan-400 hover:to-indigo-500 text-slate-950 font-extrabold text-sm rounded-xl shadow-lg shadow-cyan-950/40 transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-95"
          >
            <Plus size={18} />
            <span>Create New Project</span>
          </button>
        </div>
      </div>

      {/* Search & Statistics Bar */}
      <div className="mt-6 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="relative w-full sm:w-80">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search school or project name..."
            className="w-full pl-10 pr-4 py-2 bg-slate-900/90 border border-slate-800 rounded-xl text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition-all shadow-inner"
          />
        </div>

        <div className="flex items-center gap-4 text-xs text-slate-400 w-full sm:w-auto justify-end">
          <span className="flex items-center gap-1.5 font-medium">
            <Layers size={14} className="text-cyan-400" />
            <strong className="text-slate-200">{projects.length}</strong> Projects
          </span>
          <div className="w-1 h-1 rounded-full bg-slate-700" />
          <span className="flex items-center gap-1.5 font-medium">
            <Users size={14} className="text-emerald-400" />
            <strong className="text-slate-200">
              {projects.reduce((sum, p) => sum + (p.records?.length || p.totalRecords || 0), 0)}
            </strong> Total Cards
          </span>
        </div>
      </div>

      {/* Projects Grid */}
      <div className="mt-6 flex-1">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-500 gap-3">
            <RefreshCw size={24} className="animate-spin text-cyan-400" />
            <p className="text-xs">Loading your school ID card projects...</p>
          </div>
        ) : filteredProjects.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 px-4 text-center rounded-3xl bg-slate-900/30 border border-slate-800/60 mt-2">
            <div className="p-4 rounded-2xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 mb-4">
              <School size={36} />
            </div>
            <h3 className="text-base font-bold text-white">No ID Card Projects Yet</h3>
            <p className="text-xs text-slate-400 max-w-sm mt-1 mb-6">
              Create your first project for a School, College, or Coaching institute. Set up common data, choose a template, and send the live data form link!
            </p>
            <button
              type="button"
              onClick={onNewProject}
              className="px-4 py-2.5 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-bold text-xs rounded-xl shadow-md transition-all flex items-center gap-2 cursor-pointer"
            >
              <Plus size={16} />
              <span>Create Project Now</span>
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 pb-8">
            {filteredProjects.map((project) => {
              const totalCards = project.records?.length || project.totalRecords || 0;
              const batches = project.batches || [];
              const shareToken = project.publicShareToken || project.id;
              const isLocked = project.status === 'LOCKED_FOR_PRINT' || project.status === 'GENERATED';

              return (
                <div
                  key={project.id}
                  onClick={() => onOpenProject(project.id)}
                  className="group relative rounded-2xl bg-slate-900/70 border border-slate-800 hover:border-cyan-500/40 p-5 transition-all duration-300 hover:shadow-xl hover:shadow-cyan-950/20 flex flex-col justify-between cursor-pointer overflow-hidden backdrop-blur-sm"
                >
                  {/* Accent Top Bar */}
                  <div
                    className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-cyan-500 to-blue-600 opacity-80 group-hover:opacity-100 transition-opacity"
                    style={{ backgroundColor: project.themeColor || undefined }}
                  />

                  {/* Card Top: School Info */}
                  <div>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center font-bold text-cyan-400 text-sm overflow-hidden shrink-0">
                          {project.organization?.logo ? (
                            <img src={project.organization.logo} alt="Logo" className="w-full h-full object-contain p-1" />
                          ) : (
                            <Building size={20} className="text-slate-400" />
                          )}
                        </div>
                        <div className="truncate">
                          <h3 className="text-sm font-bold text-white group-hover:text-cyan-300 transition-colors truncate">
                            {project.name}
                          </h3>
                          <p className="text-[11px] text-slate-400 truncate">
                            {project.organization?.name || project.client || 'School Project'}
                          </p>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={(e) => handleDelete(e, project.id, project.name)}
                        className="p-1.5 rounded-lg text-slate-600 hover:text-rose-400 hover:bg-rose-950/30 transition-all opacity-0 group-hover:opacity-100 cursor-pointer"
                        title="Delete Project"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>

                    {/* Stats & Session Badges */}
                    <div className="mt-4 flex flex-wrap items-center gap-2">
                      <span className="px-2 py-1 rounded-lg bg-slate-800/90 text-slate-300 text-[11px] font-semibold border border-slate-700/60 flex items-center gap-1.5">
                        <Users size={12} className="text-cyan-400" />
                        <span>{totalCards} Students</span>
                      </span>

                      {/* Batch Status Badge */}
                      {isLocked ? (
                        <span className="px-2 py-1 rounded-lg bg-emerald-950/60 text-emerald-300 text-[11px] font-semibold border border-emerald-500/30 flex items-center gap-1">
                          <Lock size={11} className="text-emerald-400" />
                          <span>Locked for Print</span>
                        </span>
                      ) : (
                        <span className="px-2 py-1 rounded-lg bg-amber-950/60 text-amber-300 text-[11px] font-semibold border border-amber-500/30 flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                          <span>Live Form Active</span>
                        </span>
                      )}

                      {batches.length > 1 && (
                        <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 text-[10px] font-mono border border-slate-700">
                          {batches.length} Batches
                        </span>
                      )}

                      {/* Photo Background Indicator */}
                      <span className="px-2 py-1 rounded-lg bg-slate-800/90 text-slate-300 text-[11px] font-semibold border border-slate-700/60 flex items-center gap-1.5">
                        <span
                          className="w-2.5 h-2.5 rounded-full border border-slate-600 shadow-inner shrink-0"
                          style={{ backgroundColor: project.photoProcessingProfile?.bgColor || '#FFFFFF' }}
                        />
                        <span className="text-[10px] font-mono opacity-80">Photo BG</span>
                      </span>
                    </div>
                  </div>

                  {/* Card Bottom: Quick Actions */}
                  <div className="mt-5 pt-3.5 border-t border-slate-800/80 flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={(e) => handleCopyLink(e, shareToken)}
                      className="px-2.5 py-1.5 rounded-lg bg-slate-800/90 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-semibold border border-slate-700 transition-all flex items-center gap-1.5 cursor-pointer"
                      title="Copy School Live Web Form Link"
                    >
                      {copiedToken === shareToken ? (
                        <>
                          <Check size={13} className="text-emerald-400" />
                          <span className="text-emerald-400 text-[11px]">Copied!</span>
                        </>
                      ) : (
                        <>
                          <Copy size={13} className="text-cyan-400" />
                          <span className="text-[11px]">School Link</span>
                        </>
                      )}
                    </button>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenPrint?.(project);
                        }}
                        className="p-1.5 rounded-lg bg-slate-800/90 hover:bg-cyan-500 hover:text-slate-950 text-slate-300 border border-slate-700 hover:border-cyan-400 transition-all cursor-pointer"
                        title="Print A4 / CR80 Sheet"
                      >
                        <Printer size={15} />
                      </button>

                      <div className="p-1.5 text-cyan-400 group-hover:translate-x-0.5 transition-transform">
                        <ChevronRight size={16} />
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <TemplateManagerModal 
        isOpen={isTemplateModalOpen} 
        onClose={() => setIsTemplateModalOpen(false)} 
        setToast={setToast}
      />
    </div>
  );
};

export default ProjectHub;
