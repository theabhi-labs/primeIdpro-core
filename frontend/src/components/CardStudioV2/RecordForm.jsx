import React, { useState } from 'react';

const RecordForm = ({ initialData, fieldSchema, onSave, loading, validationErrors }) => {
  const [formData, setFormData] = useState(initialData || {});

  const handleChange = (key, value) => {
    setFormData(prev => ({
      ...prev,
      [key]: value
    }));
  };

  const renderField = (field) => {
    const value = formData[field.key] || '';
    const hasError = validationErrors[field.key];
    const isRequired = field.required;

    let inputElement = null;

    if (field.options && field.options.length > 0) {
      inputElement = (
        <select
          value={value}
          onChange={(e) => handleChange(field.key, e.target.value)}
          className={`w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white ${
            hasError ? 'border-red-500 bg-red-50' : 'border-slate-300'
          }`}
        >
          <option value="">Select...</option>
          {field.options.map(opt => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      );
    } else if (field.data_type === 'boolean') {
      inputElement = (
        <label className="flex items-center space-x-2 cursor-pointer">
          <input
            type="checkbox"
            checked={!!formData[field.key]}
            onChange={(e) => handleChange(field.key, e.target.checked)}
            className="rounded text-indigo-600 focus:ring-indigo-500 w-4 h-4"
          />
          <span className="text-sm text-slate-700">Yes</span>
        </label>
      );
    } else if (field.data_type === 'date') {
      inputElement = (
        <input
          type="date"
          value={value}
          onChange={(e) => handleChange(field.key, e.target.value)}
          className={`w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
            hasError ? 'border-red-500 bg-red-50' : 'border-slate-300'
          }`}
        />
      );
    } else if (field.data_type === 'image') {
      inputElement = (
        <div className="border-2 border-dashed border-slate-300 rounded-lg p-4 text-center">
          <div className="text-sm text-slate-500 mb-2">Image upload (Phase 3C)</div>
          <input
            type="text"
            placeholder="Filename or URL placeholder"
            value={value}
            onChange={(e) => handleChange(field.key, e.target.value)}
            className="w-full border border-slate-200 rounded px-2 py-1 text-sm focus:outline-none"
          />
        </div>
      );
    } else {
      inputElement = (
        <input
          type={field.data_type === 'number' ? 'number' : field.data_type === 'email' ? 'email' : 'text'}
          value={value}
          onChange={(e) => handleChange(field.key, e.target.value)}
          placeholder={`Enter ${field.label.toLowerCase()}`}
          className={`w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
            hasError ? 'border-red-500 bg-red-50' : 'border-slate-300'
          }`}
        />
      );
    }

    return (
      <div key={field.key} className="mb-4">
        <label className="block text-sm font-bold text-slate-700 mb-1">
          {field.label} {isRequired && <span className="text-red-500">*</span>}
        </label>
        {inputElement}
        {hasError && <div className="text-xs text-red-500 mt-1">{hasError}</div>}
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1">
        {fieldSchema.map(field => renderField(field))}
      </div>
      
      <div className="mt-8 pt-4 border-t border-slate-100 flex justify-end space-x-3 sticky bottom-0 bg-white pb-4">
        <button
          onClick={() => onSave(formData, false)}
          disabled={loading}
          className="px-4 py-2 bg-white border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 font-medium disabled:opacity-50 transition-colors"
        >
          Save Draft
        </button>
        <button
          onClick={() => onSave(formData, true)}
          disabled={loading}
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium shadow-sm disabled:opacity-50 flex items-center transition-colors"
        >
          {loading && (
            <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
          )}
          Save & Ready
        </button>
      </div>
    </div>
  );
};

export default RecordForm;
