import React from 'react';

const FieldManager = ({ templateMeta, onChange }) => {
  const fields = templateMeta.field_schema || [];
  
  const handleAddField = () => {
    const key = prompt("Enter field key (e.g. student_name):");
    if (!key) return;
    if (fields.some(f => f.key === key)) {
      alert("Field key already exists.");
      return;
    }
    const newField = {
      key,
      label: key.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
      data_type: 'text',
      required: false,
      category: 'custom'
    };
    onChange([...fields, newField]);
  };

  const handleDelete = (key) => {
    // Check usage
    const usedCount = templateMeta.elements.filter(el => el.bind === key).length;
    if (usedCount > 0) {
      alert(`Field is currently used by ${usedCount} elements. Remove its bindings before deleting the field.`);
      return;
    }
    onChange(fields.filter(f => f.key !== key));
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex justify-between items-center mb-4">
        <h3 className="font-semibold text-slate-800">Fields</h3>
        <button 
          onClick={handleAddField}
          className="text-xs bg-blue-50 text-blue-600 px-2 py-1 rounded hover:bg-blue-100 font-medium"
        >
          + Add Field
        </button>
      </div>
      
      <div className="flex-1 overflow-y-auto space-y-2 pr-2">
        {fields.length === 0 ? (
           <div className="text-sm text-slate-500 text-center py-4">No fields defined.</div>
        ) : (
           fields.map(f => {
             const usedCount = templateMeta.elements.filter(el => el.bind === f.key).length;
             return (
               <div key={f.key} className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                 <div className="flex justify-between items-start">
                   <div>
                     <div className="font-medium text-slate-700 text-sm">{f.label}</div>
                     <div className="text-xs text-slate-400 font-mono mt-0.5">{f.key}</div>
                   </div>
                   <button 
                     onClick={() => handleDelete(f.key)}
                     className="text-slate-400 hover:text-red-500 p-1"
                   >
                     ×
                   </button>
                 </div>
                 <div className="mt-2 flex items-center justify-between text-xs">
                   <span className="bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded uppercase" style={{fontSize: '10px'}}>{f.data_type}</span>
                   <span className={usedCount > 0 ? "text-blue-500" : "text-slate-400"}>Used by {usedCount}</span>
                 </div>
               </div>
             )
           })
        )}
      </div>
    </div>
  );
};

export default FieldManager;
