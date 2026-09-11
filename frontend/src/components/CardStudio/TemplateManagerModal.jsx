import React, { useState, useEffect } from 'react';
import { X, LayoutTemplate } from 'lucide-react';
import TemplateManager from './TemplateManager';
import { getCardTemplatesApi } from '../../services/cardApi';

const TemplateManagerModal = ({ isOpen, onClose, setToast }) => {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetchTemplates = async () => {
    try {
      setLoading(true);
      const data = await getCardTemplatesApi();
      if (Array.isArray(data)) {
        setTemplates(data);
      }
    } catch (err) {
      console.error('Failed to fetch templates:', err);
      setToast?.({ type: 'error', message: 'Failed to load templates' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchTemplates();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fadeIn">
      <div className="w-full max-w-6xl bg-[#0d1322] border border-slate-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Modal Header */}
        <div className="px-6 py-5 border-b border-slate-800 flex items-center justify-between bg-slate-900/50">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
              <LayoutTemplate size={20} />
            </div>
            <div>
              <h2 className="text-base font-extrabold text-white">Card Templates Manager</h2>
              <p className="text-[11px] text-slate-400">View and manage all your CR80 Card Templates</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto flex-1 text-xs text-slate-200">
          {loading ? (
            <div className="py-20 text-center text-slate-500 text-sm">Loading templates...</div>
          ) : (
            <TemplateManager 
              templates={templates} 
              onTemplateCreated={fetchTemplates} 
              setToast={setToast}
            />
          )}
        </div>
      </div>
    </div>
  );
};

export default TemplateManagerModal;
