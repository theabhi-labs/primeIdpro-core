import React, { useState, useEffect } from 'react';

const PropertiesPanel = ({ selectedElement, canvasRef, templateMeta }) => {
  const [localProps, setLocalProps] = useState({});

  useEffect(() => {
    if (selectedElement) {
      setLocalProps({
        x: Math.round(selectedElement.left),
        y: Math.round(selectedElement.top),
        width: Math.round(selectedElement.width * (selectedElement.scaleX || 1)),
        height: Math.round(selectedElement.height * (selectedElement.scaleY || 1)),
        rotation: Math.round(selectedElement.angle || 0),
        bind: selectedElement.bind || '',
        text: selectedElement.text || '',
        fill: selectedElement.fill || '#000000',
        locked: selectedElement.lockMovementX || false,
        visible: selectedElement.visible !== false,
      });
    }
  }, [selectedElement]);

  const handleChange = (key, value) => {
    const updated = { ...localProps, [key]: value };
    setLocalProps(updated);

    if (canvasRef.current && selectedElement) {
      if (key === 'x') selectedElement.set({ left: Number(value) });
      if (key === 'y') selectedElement.set({ top: Number(value) });
      if (key === 'width') selectedElement.set({ width: Number(value), scaleX: 1 });
      if (key === 'height') selectedElement.set({ height: Number(value), scaleY: 1 });
      if (key === 'rotation') selectedElement.set({ angle: Number(value) });
      
      if (key === 'locked') {
         selectedElement.set({
           lockMovementX: value,
           lockMovementY: value,
           lockRotation: value,
           lockScalingX: value,
           lockScalingY: value,
         });
      }

      if (key === 'visible') {
         selectedElement.set({ visible: value });
      }

      if (key === 'fill') selectedElement.set({ fill: value });
      
      if (key === 'bind') {
         selectedElement.set({ bind: value || null });
         if (selectedElement.type === 'text') {
            selectedElement.set({ text: value ? `[${value}]` : 'Text' });
         }
      }
      
      if (key === 'text' && !selectedElement.bind) {
         selectedElement.set({ text: value });
      }

      selectedElement.setCoords();
      canvasRef.current.renderAll();
      canvasRef.current.fire('object:modified', { target: selectedElement });
    }
  };

  const bringForward = () => {
     if (canvasRef.current && selectedElement) {
        canvasRef.current.bringForward(selectedElement);
        canvasRef.current.fire('object:modified', { target: selectedElement });
     }
  }
  
  const sendBackward = () => {
     if (canvasRef.current && selectedElement) {
        canvasRef.current.sendBackwards(selectedElement);
        canvasRef.current.fire('object:modified', { target: selectedElement });
     }
  }
  
  const deleteEl = () => {
     if (canvasRef.current && selectedElement) {
        canvasRef.current.remove(selectedElement);
        canvasRef.current.fire('object:modified');
     }
  }

  if (!selectedElement) {
    return (
      <div className="flex flex-col h-full">
        <h3 className="font-semibold text-slate-800 mb-4">Template Properties</h3>
        <div className="space-y-4">
          <PropRow label="Size">
            <div className="text-slate-800 font-medium">{templateMeta?.width} × {templateMeta?.height} {templateMeta?.unit}</div>
          </PropRow>
          <PropRow label="DPI">
            <div className="text-slate-800">{templateMeta?.dpi}</div>
          </PropRow>
          <div className="text-center text-slate-400 mt-10">Select an element to edit properties</div>
        </div>
      </div>
    );
  }

  const elType = selectedElement.semanticType || selectedElement.type;
  const fields = templateMeta?.field_schema || [];

  return (
    <div className="flex flex-col h-full">
      <h3 className="font-semibold text-slate-800 mb-4 capitalize">{elType} Properties</h3>
      
      <div className="space-y-4 pb-10">
        
        {/* Transform */}
        <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 space-y-3">
           <h4 className="text-xs font-semibold uppercase text-slate-500 tracking-wider">Transform</h4>
           <div className="grid grid-cols-2 gap-3">
             <NumInput label="X" value={localProps.x} onChange={v => handleChange('x', v)} />
             <NumInput label="Y" value={localProps.y} onChange={v => handleChange('y', v)} />
             <NumInput label="W" value={localProps.width} onChange={v => handleChange('width', v)} />
             <NumInput label="H" value={localProps.height} onChange={v => handleChange('height', v)} />
             <NumInput label="Rot" value={localProps.rotation} onChange={v => handleChange('rotation', v)} />
           </div>
        </div>

        {/* Dynamic Binding */}
        <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 space-y-3">
           <h4 className="text-xs font-semibold uppercase text-slate-500 tracking-wider">Data</h4>
           <div className="flex flex-col gap-1">
             <label className="text-xs text-slate-500">Bind Field</label>
             <select 
               className="w-full bg-white border border-slate-300 rounded px-2 py-1.5 text-sm outline-none focus:border-blue-500"
               value={localProps.bind}
               onChange={(e) => handleChange('bind', e.target.value)}
             >
               <option value="">-- Static --</option>
               {fields.map(f => (
                 <option key={f.key} value={f.key}>{f.label} ({f.key})</option>
               ))}
             </select>
           </div>
           
           {elType === 'text' && !localProps.bind && (
             <div className="flex flex-col gap-1">
               <label className="text-xs text-slate-500">Text Content</label>
               <input 
                 type="text" 
                 className="w-full bg-white border border-slate-300 rounded px-2 py-1.5 text-sm outline-none focus:border-blue-500"
                 value={localProps.text}
                 onChange={(e) => handleChange('text', e.target.value)}
               />
             </div>
           )}
        </div>

        {/* Style */}
        <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 space-y-3">
           <h4 className="text-xs font-semibold uppercase text-slate-500 tracking-wider">Style</h4>
           <div className="flex flex-col gap-1">
             <label className="text-xs text-slate-500">Color/Fill</label>
             <div className="flex gap-2 items-center">
               <input 
                 type="color" 
                 className="h-8 w-8 rounded cursor-pointer border border-slate-300 p-0.5 bg-white"
                 value={localProps.fill}
                 onChange={(e) => handleChange('fill', e.target.value)}
               />
               <span className="text-sm font-mono text-slate-600">{localProps.fill}</span>
             </div>
           </div>
        </div>

        {/* Actions */}
        <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 space-y-3">
           <h4 className="text-xs font-semibold uppercase text-slate-500 tracking-wider">Actions</h4>
           
           <div className="flex items-center justify-between">
             <span className="text-sm text-slate-600">Locked</span>
             <input 
               type="checkbox" 
               checked={localProps.locked}
               onChange={(e) => handleChange('locked', e.target.checked)}
               className="w-4 h-4 cursor-pointer"
             />
           </div>

           <div className="flex items-center justify-between">
             <span className="text-sm text-slate-600">Visible</span>
             <input 
               type="checkbox" 
               checked={localProps.visible}
               onChange={(e) => handleChange('visible', e.target.checked)}
               className="w-4 h-4 cursor-pointer"
             />
           </div>

           <div className="grid grid-cols-2 gap-2 mt-2">
             <button onClick={bringForward} className="bg-white border border-slate-300 rounded text-xs py-1.5 hover:bg-slate-50">Bring Fwd</button>
             <button onClick={sendBackward} className="bg-white border border-slate-300 rounded text-xs py-1.5 hover:bg-slate-50">Send Back</button>
           </div>
           
           <button onClick={deleteEl} className="w-full mt-2 bg-red-50 text-red-600 border border-red-100 rounded text-sm py-1.5 font-medium hover:bg-red-100">
             Delete Element
          </button>
        </div>

      </div>
    </div>
  );
};

const PropRow = ({ label, children }) => (
  <div className="flex justify-between items-center text-sm">
    <span className="text-slate-500">{label}</span>
    {children}
  </div>
);

const NumInput = ({ label, value, onChange }) => {
  return (
    <div className="flex flex-col">
       <div className="flex bg-white border border-slate-300 rounded overflow-hidden focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500">
         <span className="bg-slate-100 text-slate-500 text-xs px-2 py-1.5 border-r border-slate-200 w-8 text-center">{label}</span>
         <input 
           type="number" 
           value={value} 
           onChange={(e) => onChange(e.target.value)}
           className="w-full text-sm px-2 outline-none text-slate-700"
         />
       </div>
    </div>
  );
};

export default PropertiesPanel;
