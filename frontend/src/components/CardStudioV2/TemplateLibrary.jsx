import React, { useState, useEffect } from 'react';
import { listTemplatesV2, createTemplateV2, duplicateTemplateV2, archiveTemplateV2 } from '../../services/cardStudioV2Api';
import { Plus, Copy, Archive, FileText, FolderPlus, Clock } from 'lucide-react';

const SIZES = {
  CR80: { label: 'CR80 (85.60 x 53.98 mm)', width: 1011, height: 638, unit: 'px', dpi: 300, w_mm: 85.60, h_mm: 53.98 },
  CR79: { label: 'CR79 (83.90 x 51.05 mm)', width: 991, height: 603, unit: 'px', dpi: 300, w_mm: 83.90, h_mm: 51.05 },
  CR100: { label: 'CR100 (98.00 x 67.00 mm)', width: 1157, height: 791, unit: 'px', dpi: 300, w_mm: 98.00, h_mm: 67.00 },
  Custom: { label: 'Custom (1000 x 600 px)', width: 1000, height: 600, unit: 'px', dpi: 300, w_mm: 84.67, h_mm: 50.80 },
};

const TemplateLibrary = ({ onOpenTemplate, onCreateProject }) => {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    fetchTemplates();
  }, []);

  const fetchTemplates = async () => {
    try {
      setLoading(true);
      const data = await listTemplatesV2();
      // Filter out archived unless we add a toggle later
      setTemplates(data.filter(t => t.active));
      setError(null);
    } catch (err) {
      console.error(err);
      setError('Failed to load templates.');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateNew = async (sizeKey) => {
    try {
      setCreating(true);
      const sizeDef = SIZES[sizeKey];
      
      const newTemplate = {
        name: `New Template (${sizeKey})`,
        description: `Created on ${new Date().toLocaleDateString()}`,
        schema_version: 1,
        width: sizeDef.width,
        height: sizeDef.height,
        unit: sizeDef.unit,
        dpi: sizeDef.dpi,
        elements: [],
        field_schema: []
      };

      const created = await createTemplateV2(newTemplate);
      onOpenTemplate(created.id);
    } catch (err) {
      console.error(err);
      alert('Failed to create template');
    } finally {
      setCreating(false);
    }
  };

  const handleDuplicate = async (e, templateId) => {
    e.stopPropagation();
    try {
      await duplicateTemplateV2(templateId);
      await fetchTemplates();
    } catch (err) {
      alert('Failed to duplicate template');
    }
  };

  const handleArchive = async (e, templateId) => {
    e.stopPropagation();
    if (!window.confirm("Are you sure you want to archive this template?")) return;
    try {
      await archiveTemplateV2(templateId);
      await fetchTemplates();
    } catch (err) {
      alert('Failed to archive template');
    }
  };

  if (loading) return <div className="p-8">Loading templates...</div>;
  if (error) return <div className="p-8 text-red-600">{error}</div>;

  return (
    <div className="flex-1 p-8 overflow-y-auto">
      <div className="max-w-6xl mx-auto">
        
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">Card Studio V2</h1>
            <p className="text-slate-500">Visual Template Designer</p>
          </div>
          
          <div className="flex gap-2">
            <div className="group relative">
              <button 
                disabled={creating}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center gap-2"
              >
                <Plus size={20} />
                Create Template
              </button>
              {/* Dropdown for presets */}
              <div className="absolute right-0 mt-2 w-56 bg-white rounded-md shadow-lg border border-slate-200 hidden group-hover:block z-10">
                {Object.keys(SIZES).map(key => (
                  <button
                    key={key}
                    onClick={() => handleCreateNew(key)}
                    className="w-full text-left px-4 py-3 hover:bg-slate-50 text-sm border-b last:border-0"
                  >
                    <div className="font-medium text-slate-700">{key}</div>
                    <div className="text-xs text-slate-500">{SIZES[key].label}</div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {templates.length === 0 ? (
          <div className="text-center py-20 bg-white rounded-xl border border-slate-200">
            <FileText size={48} className="mx-auto text-slate-300 mb-4" />
            <h3 className="text-lg font-medium text-slate-700">No Templates Yet</h3>
            <p className="text-slate-500 mt-2">Create your first ID card template to get started.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {templates.map(tpl => (
              <div 
                key={tpl.id}
                onClick={() => onOpenTemplate(tpl.id)}
                className="bg-white rounded-xl border border-slate-200 shadow-sm hover:shadow-md hover:border-blue-300 transition-all cursor-pointer overflow-hidden group flex flex-col h-56"
              >
                {/* Thumbnail area placeholder */}
                <div className="bg-slate-100 flex-1 flex items-center justify-center relative overflow-hidden border-b border-slate-100">
                   <div 
                     className="bg-white shadow-sm rounded-sm"
                     style={{
                        width: '120px', 
                        height: `${(tpl.height / tpl.width) * 120}px`
                     }}
                   ></div>
                   
                   <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                     <button 
                        onClick={(e) => { e.stopPropagation(); onCreateProject(tpl.id); }}
                        className="p-1.5 bg-white text-slate-600 rounded-md shadow hover:text-green-600"
                        title="Create Project from Template"
                     >
                        <FolderPlus size={16} />
                     </button>
                     <button 
                        onClick={(e) => handleDuplicate(e, tpl.id)}
                        className="p-1.5 bg-white text-slate-600 rounded-md shadow hover:text-blue-600"
                        title="Duplicate Template"
                     >
                        <Copy size={16} />
                     </button>
                     <button 
                        onClick={(e) => handleArchive(e, tpl.id)}
                        className="p-1.5 bg-white text-slate-600 rounded-md shadow hover:text-red-600"
                        title="Archive Template"
                     >
                        <Archive size={16} />
                     </button>
                   </div>
                </div>
                
                {/* Meta */}
                <div className="p-4">
                  <h3 className="font-semibold text-slate-800 truncate" title={tpl.name}>{tpl.name}</h3>
                  <div className="text-xs text-slate-500 mt-1 flex flex-col gap-1">
                    <span className="flex items-center gap-1"><FileText size={12}/> {tpl.width}x{tpl.height} {tpl.unit}</span>
                    <span className="flex items-center gap-1"><Clock size={12}/> {new Date(tpl.updated_at).toLocaleDateString()}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

      </div>
    </div>
  );
};

export default TemplateLibrary;
