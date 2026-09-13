import React from 'react';

const RecordTable = ({ 
  records, 
  fieldSchema, 
  onEdit, 
  onDelete, 
  onToggleImportant, 
  onChangeStatus,
  selectedIds = [],
  onSelectRecord,
  onSelectAll
}) => {
  // Determine primary and secondary columns from schema
  const textFields = fieldSchema.filter(f => f.data_type === 'text');
  
  // Default to first text field as primary, second as identifier (if available)
  const primaryField = textFields.length > 0 ? textFields[0] : fieldSchema[0];
  const identifierField = textFields.length > 1 ? textFields[1] : (fieldSchema.length > 1 && fieldSchema[1].key !== primaryField.key ? fieldSchema[1] : null);

  const allReadySelected = records.length > 0 && records.filter(r => r.status === 'ready').every(r => selectedIds.includes(r.id));
  const readyRecordsCount = records.filter(r => r.status === 'ready').length;

  return (
    <table className="min-w-full text-left border-collapse">
      <thead className="bg-slate-50 sticky top-0 z-10 border-b border-slate-200">
        <tr>
          <th className="px-4 py-3 w-10 text-center">
            <input 
              type="checkbox" 
              checked={allReadySelected && readyRecordsCount > 0}
              onChange={(e) => onSelectAll(e.target.checked)}
              disabled={readyRecordsCount === 0}
              className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer disabled:opacity-50"
              title="Select all READY records"
            />
          </th>
          <th className="px-2 py-3 text-xs font-semibold text-slate-500 w-10 text-center">⭐</th>
          <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase">{primaryField.label}</th>
          {identifierField && (
            <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase hidden md:table-cell">{identifierField.label}</th>
          )}
          <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase w-32">Status</th>
          <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase w-40 hidden sm:table-cell">Updated</th>
          <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase w-32 text-right">Actions</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100 bg-white">
        {records.map(record => (
          <tr key={record.id} className="hover:bg-slate-50 transition-colors group">
            <td className="px-4 py-3 text-center">
              <input 
                type="checkbox"
                checked={selectedIds.includes(record.id)}
                onChange={(e) => onSelectRecord(record.id, e.target.checked)}
                disabled={record.status !== 'ready'}
                className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer disabled:opacity-50"
              />
            </td>
            <td className="px-2 py-3 text-center">
              <button 
                onClick={() => onToggleImportant(record.id, record.important)}
                className={`text-lg focus:outline-none ${record.important ? 'text-amber-400' : 'text-slate-300 hover:text-amber-300'}`}
                title={record.important ? "Remove importance" : "Mark as important"}
              >
                ★
              </button>
            </td>
            <td className="px-4 py-3">
              <div className="font-medium text-slate-800">
                {record.data[primaryField.key] || <span className="text-slate-400 italic">Empty</span>}
              </div>
            </td>
            {identifierField && (
              <td className="px-4 py-3 hidden md:table-cell text-sm text-slate-600">
                {record.data[identifierField.key] || '-'}
              </td>
            )}
            <td className="px-4 py-3">
              <div className="flex items-center space-x-2">
                <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                  record.status === 'ready' ? 'bg-emerald-100 text-emerald-800' : 
                  record.status === 'draft' ? 'bg-amber-100 text-amber-800' : 
                  'bg-slate-100 text-slate-800'
                }`}>
                  {record.status.toUpperCase()}
                </span>
                
                {/* Quick toggle if DRAFT */}
                {record.status === 'draft' && (
                  <button 
                    onClick={() => onChangeStatus(record.id, 'ready')}
                    className="text-xs text-indigo-600 hover:text-indigo-800 hidden group-hover:block"
                    title="Mark as Ready"
                  >
                    Set Ready
                  </button>
                )}
              </div>
            </td>
            <td className="px-4 py-3 hidden sm:table-cell text-xs text-slate-500">
              {new Date(record.updated_at).toLocaleDateString()} {new Date(record.updated_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
            </td>
            <td className="px-4 py-3 text-right">
              <button 
                onClick={() => onEdit(record)}
                className="text-indigo-600 hover:text-indigo-900 font-medium text-sm mr-3"
              >
                Edit
              </button>
              <button 
                onClick={() => onDelete(record.id)}
                className="text-red-600 hover:text-red-900 font-medium text-sm"
              >
                Delete
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
};

export default RecordTable;
