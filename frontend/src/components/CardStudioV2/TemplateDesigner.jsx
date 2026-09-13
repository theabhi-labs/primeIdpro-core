import React, { useState, useEffect, useRef } from 'react';
import { getTemplateV2, updateTemplateV2 } from '../../services/cardStudioV2Api';
import CanvasWorkspace from './CanvasWorkspace';
import { serializeTemplate, deserializeTemplate, generateElementId } from '../../utils/cardTemplateSerializer';
import { Save, ArrowLeft, MousePointer2, Type, Image as ImageIcon, Square, Circle, Minus, Grid, Maximize, ZoomIn, ZoomOut } from 'lucide-react';
import PropertiesPanel from './PropertiesPanel';
import FieldManager from './FieldManager';

const TemplateDesigner = ({ templateId, onBack }) => {
  const [templateMeta, setTemplateMeta] = useState(null);
  const [elements, setElements] = useState([]);
  const [selectedElement, setSelectedElement] = useState(null);
  
  const [loading, setLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState('Saved'); // Saved, Saving..., Error
  const [isDirty, setIsDirty] = useState(false);
  
  const [gridEnabled, setGridEnabled] = useState(false);
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [activeTab, setActiveTab] = useState('properties'); // properties | fields
  
  const canvasRef = useRef(null);

  useEffect(() => {
    loadTemplate();
  }, [templateId]);

  const loadTemplate = async () => {
    try {
      setLoading(true);
      const data = await getTemplateV2(templateId);
      setTemplateMeta(data);
      const deserializedElements = deserializeTemplate(data);
      setElements(deserializedElements);
      setIsDirty(false);
      setSaveStatus('Saved');
    } catch (err) {
      console.error(err);
      alert('Failed to load template.');
    } finally {
      setLoading(false);
    }
  };

  const handleManualSave = async () => {
    if (!templateMeta) return;
    try {
      setSaveStatus('Saving...');
      const schema = serializeTemplate(canvasRef.current, templateMeta);
      await updateTemplateV2(templateId, schema);
      setSaveStatus('Saved');
      setIsDirty(false);
    } catch (err) {
      console.error(err);
      setSaveStatus('Error');
      // Do NOT set isDirty to false on error, so it can retry later.
    }
  };

  // Debounced Autosave effect
  useEffect(() => {
    if (!isDirty) return;
    
    const handler = setTimeout(() => {
      handleManualSave();
    }, 1500);

    return () => clearTimeout(handler);
  }, [isDirty]);

  const handleCanvasChange = (fabricCanvas) => {
    canvasRef.current = fabricCanvas;
    setIsDirty(true);
    setSaveStatus('Unsaved');
  };

  const addElement = (type) => {
    if (!canvasRef.current) return;
    
    const baseOptions = {
       id: generateElementId(),
       left: 50,
       top: 50,
    };
    
    let el;
    // Add via fabric API directly
    if (type === 'text') {
       el = new window.fabric.IText('New Text', { ...baseOptions, fontFamily: 'Arial', fontSize: 24 });
    } else if (type === 'image') {
       el = new window.fabric.Rect({ ...baseOptions, width: 100, height: 100, fill: '#e2e8f0', semanticType: 'image' });
    } else if (type === 'rect') {
       el = new window.fabric.Rect({ ...baseOptions, width: 100, height: 50, fill: '#cccccc' });
    } else if (type === 'circle') {
       el = new window.fabric.Circle({ ...baseOptions, radius: 40, fill: '#cccccc' });
    } else if (type === 'line') {
       el = new window.fabric.Rect({ ...baseOptions, width: 100, height: 2, fill: '#000000', semanticType: 'line' });
    }

    if (el) {
       canvasRef.current.add(el);
       canvasRef.current.setActiveObject(el);
       canvasRef.current.renderAll();
       handleCanvasChange(canvasRef.current);
    }
  };

  if (loading) return <div className="p-8">Loading designer...</div>;
  if (!templateMeta) return null;

  const cardDimensions = { width: templateMeta.width, height: templateMeta.height };

  return (
    <div className="flex flex-col h-full w-full bg-slate-100">
      
      {/* Top Header */}
      <div className="h-14 bg-white border-b border-slate-200 flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="p-1.5 hover:bg-slate-100 rounded text-slate-600">
            <ArrowLeft size={20} />
          </button>
          <div>
            <h2 className="font-semibold text-slate-800">{templateMeta.name}</h2>
            <div className="text-xs text-slate-500">
              {templateMeta.width}x{templateMeta.height} {templateMeta.unit} • {saveStatus}
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
           <button 
             onClick={handleManualSave}
             className="flex items-center gap-2 bg-slate-800 hover:bg-slate-900 text-white px-4 py-1.5 rounded-md text-sm font-medium"
           >
             <Save size={16} /> Save
           </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        
        {/* Left Toolbar */}
        <div className="w-16 bg-white border-r border-slate-200 flex flex-col items-center py-4 gap-4 shrink-0">
          <ToolbarButton icon={<MousePointer2 />} label="Select" onClick={() => {}} active />
          <div className="w-8 h-px bg-slate-200 my-1"></div>
          <ToolbarButton icon={<Type />} label="Text" onClick={() => addElement('text')} />
          <ToolbarButton icon={<ImageIcon />} label="Image" onClick={() => addElement('image')} />
          <ToolbarButton icon={<Square />} label="Rect" onClick={() => addElement('rect')} />
          <ToolbarButton icon={<Circle />} label="Circle" onClick={() => addElement('circle')} />
          <ToolbarButton icon={<Minus />} label="Line" onClick={() => addElement('line')} />
        </div>

        {/* Center Canvas Area */}
        <div className="flex-1 flex flex-col relative overflow-hidden">
           <CanvasWorkspace
              elements={elements}
              cardDimensions={cardDimensions}
              onElementSelect={setSelectedElement}
              onCanvasChange={handleCanvasChange}
              gridEnabled={gridEnabled}
              snapEnabled={snapEnabled}
              zoomLevel={zoomLevel}
           />
           
           {/* Bottom View Controls */}
           <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-white rounded-lg shadow-md border border-slate-200 px-4 py-2 flex items-center gap-4">
             <button onClick={() => setGridEnabled(!gridEnabled)} className={`p-1.5 rounded ${gridEnabled ? 'bg-blue-100 text-blue-600' : 'hover:bg-slate-100 text-slate-600'}`} title="Toggle Grid">
               <Grid size={18} />
             </button>
             <button onClick={() => setSnapEnabled(!snapEnabled)} className={`p-1.5 rounded ${snapEnabled ? 'bg-blue-100 text-blue-600' : 'hover:bg-slate-100 text-slate-600'}`} title="Toggle Snap to Grid">
               <Maximize size={18} />
             </button>
             <div className="w-px h-6 bg-slate-200"></div>
             <button onClick={() => setZoomLevel(z => Math.max(0.1, z - 0.1))} className="p-1.5 hover:bg-slate-100 text-slate-600 rounded">
                <ZoomOut size={18} />
             </button>
             <span className="text-sm font-medium w-12 text-center text-slate-700">{Math.round(zoomLevel * 100)}%</span>
             <button onClick={() => setZoomLevel(z => Math.min(3, z + 0.1))} className="p-1.5 hover:bg-slate-100 text-slate-600 rounded">
                <ZoomIn size={18} />
             </button>
           </div>
        </div>

        {/* Right Properties Panel */}
        <div className="w-80 bg-white border-l border-slate-200 flex flex-col shrink-0">
          <div className="flex border-b border-slate-200">
            <button 
              className={`flex-1 py-3 text-sm font-medium ${activeTab === 'properties' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-slate-500 hover:text-slate-700'}`}
              onClick={() => setActiveTab('properties')}
            >
              Properties
            </button>
            <button 
              className={`flex-1 py-3 text-sm font-medium ${activeTab === 'fields' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-slate-500 hover:text-slate-700'}`}
              onClick={() => setActiveTab('fields')}
            >
              Fields
            </button>
          </div>
          
          <div className="flex-1 overflow-y-auto p-4">
            {activeTab === 'properties' ? (
              <PropertiesPanel selectedElement={selectedElement} canvasRef={canvasRef} templateMeta={templateMeta} />
            ) : (
              <FieldManager 
                templateMeta={templateMeta} 
                onChange={(newSchema) => { 
                   setTemplateMeta({...templateMeta, field_schema: newSchema}); 
                   setIsDirty(true); 
                }} 
              />
            )}
          </div>
        </div>

      </div>
    </div>
  );
};

const ToolbarButton = ({ icon, label, onClick, active }) => (
  <button 
    onClick={onClick}
    className={`p-2 rounded-lg flex flex-col items-center justify-center gap-1 w-12 transition-colors ${active ? 'bg-blue-100 text-blue-600' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800'}`}
    title={label}
  >
    {icon}
  </button>
);

export default TemplateDesigner;
