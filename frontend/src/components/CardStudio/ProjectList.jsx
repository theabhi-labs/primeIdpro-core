import React from 'react';
import { FolderKanban, Plus, Clock, Users, ArrowRight, Trash2, CheckCircle2, Play } from 'lucide-react';

export default function ProjectList({ projects = [], onOpenProject, onNewProject, onDeleteProject }) {
  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Top Banner & New Project Action */}
      <div className="flex items-center justify-between p-5 bg-gradient-to-r from-blue-950/40 via-slate-950 to-cyan-950/40 border border-blue-500/20 rounded-3xl">
        <div>
          <h3 className="text-lg font-black text-white tracking-tight flex items-center gap-2">
            <FolderKanban className="w-6 h-6 text-cyan-400" />
            Card Studio Projects
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Production batches for schools, universities, institutes, and corporate employee cards.
          </p>
        </div>

        <button
          type="button"
          onClick={onNewProject}
          className="px-5 py-2.5 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-extrabold text-xs rounded-xl shadow-lg shadow-cyan-950/40 flex items-center gap-2 transition-all active:scale-95 cursor-pointer"
        >
          <Plus size={16} />
          <span>New Card Project</span>
        </button>
      </div>

      {/* Projects Grid */}
      {projects.length === 0 ? (
        <div className="p-12 text-center rounded-3xl bg-slate-950/60 border border-slate-800 space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400 mx-auto">
            <FolderKanban size={28} />
          </div>
          <div>
            <h4 className="text-sm font-bold text-white">No Saved Projects Yet</h4>
            <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
              Create your first bulk card production project to import Excel, match photos, and generate 300 DPI ID cards.
            </p>
          </div>
          <button
            type="button"
            onClick={onNewProject}
            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-cyan-400 font-bold text-xs rounded-xl border border-cyan-500/40 transition-all"
          >
            + Create New Project
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map((proj) => (
            <div
              key={proj.id}
              className="p-5 rounded-2xl bg-slate-950/80 border border-slate-800 hover:border-slate-700 hover:bg-slate-900/50 transition-all flex flex-col justify-between group relative"
            >
              <div>
                {/* Header: Status Pill & Delete button */}
                <div className="flex items-center justify-between mb-3">
                  <span className="px-2.5 py-0.5 rounded-full bg-cyan-950/80 border border-cyan-800/40 text-cyan-400 font-mono text-[10px] font-bold uppercase tracking-wider">
                    {proj.cardType || 'CARD'}
                  </span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteProject?.(proj.id);
                    }}
                    className="p-1 text-slate-500 hover:text-rose-400 transition-colors"
                    title="Delete project"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>

                {/* Title & Client */}
                <h4 className="text-sm font-bold text-white group-hover:text-cyan-400 transition-colors line-clamp-1">
                  {proj.name}
                </h4>
                <p className="text-xs text-slate-400 mt-0.5 line-clamp-1">
                  {proj.client || 'General Production'}
                </p>

                {/* Stats row */}
                <div className="grid grid-cols-2 gap-2 mt-4 pt-3 border-t border-slate-800/80 text-[11px]">
                  <div className="flex items-center gap-1.5 text-slate-400">
                    <Users size={13} className="text-cyan-400" />
                    <span><strong>{proj.totalRecords}</strong> Records</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-slate-400">
                    <CheckCircle2 size={13} className="text-emerald-400" />
                    <span><strong>{proj.photosMatched}</strong> Photos</span>
                  </div>
                </div>
              </div>

              {/* Open / Resume Button */}
              <button
                type="button"
                onClick={() => onOpenProject(proj.id)}
                className="mt-4 w-full py-2 bg-slate-900 group-hover:bg-cyan-500/10 text-slate-300 group-hover:text-cyan-300 text-xs font-bold rounded-xl border border-slate-800 group-hover:border-cyan-500/30 flex items-center justify-center gap-1.5 transition-all cursor-pointer"
              >
                <span>Open Project Workspace</span>
                <ArrowRight size={13} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
