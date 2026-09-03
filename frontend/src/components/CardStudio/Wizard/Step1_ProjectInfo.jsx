import React from 'react';
import { Building2, Tag, Calendar, Phone, Mail, MapPin, Sparkles, FileSignature } from 'lucide-react';

const CARD_TYPES = [
  { id: 'school', label: 'School ID Card', icon: '🏫' },
  { id: 'college', label: 'College / University', icon: '🎓' },
  { id: 'coaching', label: 'Coaching / Institute', icon: '📚' },
  { id: 'employee', label: 'Corporate / Staff', icon: '💼' },
  { id: 'membership', label: 'Club / Gym / VIP', icon: '⭐' },
  { id: 'library', label: 'Library Pass', icon: '📖' },
  { id: 'hospital', label: 'Hospital / Healthcare', icon: '🏥' },
  { id: 'visitor', label: 'Visitor / Gate Pass', icon: '🎫' },
  { id: 'event', label: 'Event / Conference', icon: '🎟️' },
  { id: 'custom', label: 'Custom Card', icon: '✨' },
];

export default function Step1_ProjectInfo({ project, updateProject, onNext }) {
  const org = project.organization || {};

  const handleOrgChange = (field, val) => {
    updateProject({
      organization: {
        ...org,
        [field]: val,
      },
    });
  };

  const handleLogoUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      handleOrgChange('logo', reader.result);
    };
    reader.readAsDataURL(file);
  };

  const handleSignatureUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      handleOrgChange('signature', reader.result);
    };
    reader.readAsDataURL(file);
  };

  const canProceed = project.name?.trim() && (org.name?.trim() || project.client?.trim());

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header Banner */}
      <div className="p-4 rounded-2xl bg-gradient-to-r from-blue-900/30 via-slate-900 to-cyan-900/30 border border-blue-500/20 flex items-center justify-between">
        <div>
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-cyan-400" />
            Step 1: Project & Organization Information
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Configure project parameters and project-level organization details (applied automatically to all cards).
          </p>
        </div>
      </div>

      {/* Grid: Project Basics & Card Type */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Project Name */}
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-slate-300 uppercase tracking-wider">
            Project Name <span className="text-rose-400">*</span>
          </label>
          <input
            type="text"
            value={project.name || ''}
            onChange={(e) => updateProject({ name: e.target.value })}
            placeholder="e.g. ABC Public School - ID Cards 2026"
            className="w-full bg-slate-950 border border-slate-700/80 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 rounded-xl px-3.5 py-2.5 text-sm text-white outline-none transition-all placeholder:text-slate-600"
          />
        </div>

        {/* Client Name */}
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-slate-300 uppercase tracking-wider">
            Client / Organization Name <span className="text-rose-400">*</span>
          </label>
          <input
            type="text"
            value={project.client || org.name || ''}
            onChange={(e) => {
              updateProject({ client: e.target.value });
              handleOrgChange('name', e.target.value);
            }}
            placeholder="e.g. Delhi Public School"
            className="w-full bg-slate-950 border border-slate-700/80 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 rounded-xl px-3.5 py-2.5 text-sm text-white outline-none transition-all placeholder:text-slate-600"
          />
        </div>
      </div>

      {/* Card Type Selector */}
      <div className="space-y-2">
        <label className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
          <Tag className="w-3.5 h-3.5 text-cyan-400" />
          Card Category / Type
        </label>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
          {CARD_TYPES.map((type) => {
            const isSelected = project.cardType === type.id;
            return (
              <button
                key={type.id}
                type="button"
                onClick={() => updateProject({ cardType: type.id })}
                className={`p-3 rounded-xl border text-left transition-all flex flex-col items-start gap-1.5 ${
                  isSelected
                    ? 'bg-cyan-500/10 border-cyan-500/50 text-cyan-300 shadow-md shadow-cyan-950/40 ring-1 ring-cyan-500/30'
                    : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-white'
                }`}
              >
                <span className="text-xl">{type.icon}</span>
                <span className="text-xs font-bold truncate w-full">{type.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Project-Level Organization Data (Entered Once) */}
      <div className="p-5 rounded-2xl bg-slate-950/70 border border-slate-800 space-y-4">
        <div className="flex items-center gap-2 pb-2 border-b border-slate-800">
          <Building2 className="w-4 h-4 text-cyan-400" />
          <h4 className="text-xs font-bold text-white uppercase tracking-wider">
            Organization Metadata (Header & Back Info)
          </h4>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold text-slate-400 flex items-center gap-1">
              <Calendar size={12} className="text-cyan-400" /> Session / Year
            </label>
            <input
              type="text"
              value={org.session || ''}
              onChange={(e) => handleOrgChange('session', e.target.value)}
              placeholder="e.g. 2026-27"
              className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:border-cyan-500 outline-none"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold text-slate-400 flex items-center gap-1">
              <Phone size={12} className="text-cyan-400" /> Office Phone
            </label>
            <input
              type="text"
              value={org.phone || ''}
              onChange={(e) => handleOrgChange('phone', e.target.value)}
              placeholder="e.g. +91 11 2617 0000"
              className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:border-cyan-500 outline-none"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold text-slate-400 flex items-center gap-1">
              <Mail size={12} className="text-cyan-400" /> Email / Website
            </label>
            <input
              type="text"
              value={org.email || ''}
              onChange={(e) => handleOrgChange('email', e.target.value)}
              placeholder="e.g. info@school.org"
              className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:border-cyan-500 outline-none"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-[11px] font-semibold text-slate-400 flex items-center gap-1">
            <MapPin size={12} className="text-cyan-400" /> Campus Address / Subtitle
          </label>
          <input
            type="text"
            value={org.address || ''}
            onChange={(e) => handleOrgChange('address', e.target.value)}
            placeholder="e.g. Sector 4, R.K. Puram, New Delhi • Affiliated to State Board"
            className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:border-cyan-500 outline-none"
          />
        </div>

        {/* Logos & Signatures */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
          {/* Logo Upload */}
          <div className="p-3 bg-slate-900/60 rounded-xl border border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-3">
              {org.logo ? (
                <img src={org.logo} alt="Logo" className="w-10 h-10 object-contain rounded bg-white p-1" />
              ) : (
                <div className="w-10 h-10 rounded bg-slate-800 flex items-center justify-center text-slate-500 text-xs font-bold">
                  LOGO
                </div>
              )}
              <div>
                <p className="text-xs font-bold text-slate-200">Organization Crest / Logo</p>
                <p className="text-[10px] text-slate-500">PNG / JPG / SVG</p>
              </div>
            </div>
            <label className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-cyan-400 rounded-lg cursor-pointer border border-slate-700 transition-all">
              {org.logo ? 'Change' : 'Upload'}
              <input type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" />
            </label>
          </div>

          {/* Signature Upload */}
          <div className="p-3 bg-slate-900/60 rounded-xl border border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-3">
              {org.signature ? (
                <img src={org.signature} alt="Sign" className="w-10 h-10 object-contain rounded bg-white p-1" />
              ) : (
                <div className="w-10 h-10 rounded bg-slate-800 flex items-center justify-center text-slate-500 text-xs font-bold">
                  <FileSignature size={16} />
                </div>
              )}
              <div>
                <p className="text-xs font-bold text-slate-200">Principal Signature</p>
                <p className="text-[10px] text-slate-500">Transparent PNG</p>
              </div>
            </div>
            <label className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-cyan-400 rounded-lg cursor-pointer border border-slate-700 transition-all">
              {org.signature ? 'Change' : 'Upload'}
              <input type="file" accept="image/*" onChange={handleSignatureUpload} className="hidden" />
            </label>
          </div>
        </div>
      </div>

      {/* Action Footer */}
      <div className="flex justify-end pt-2">
        <button
          type="button"
          disabled={!canProceed}
          onClick={onNext}
          className="px-6 py-2.5 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 disabled:from-slate-800 disabled:to-slate-800 disabled:text-slate-600 text-slate-950 font-bold text-xs rounded-xl transition-all shadow-md active:scale-95 cursor-pointer"
        >
          Continue to Template Selection →
        </button>
      </div>
    </div>
  );
}
