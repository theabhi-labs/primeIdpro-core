import React, { useState } from 'react';
import RecordForm from './RecordForm';
import { createRecordV2, updateRecordV2 } from '../../services/cardStudioV2Api';

const RecordDrawer = ({ projectId, record, fieldSchema, onClose }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [validationErrors, setValidationErrors] = useState({}); // Field-level errors

  const handleSave = async (formData, saveAsReady) => {
    try {
      setLoading(true);
      setError('');
      setValidationErrors({});
      
      const payload = {
        data: formData,
        status: saveAsReady ? 'ready' : 'draft',
        important: record ? record.important : false
      };

      if (record) {
        await updateRecordV2(projectId, record.id, payload);
      } else {
        await createRecordV2(projectId, payload);
      }
      
      onClose(true); // Close and refresh
    } catch (err) {
      console.error(err);
      if (err.response?.status === 422) {
        // Validation error
        const detail = err.response.data.detail;
        if (typeof detail === 'string') {
          // Fallback string error from backend
          setError(`Validation Failed: ${detail}`);
        } else {
          setError('Validation Failed. Please check the required fields.');
        }
      } else {
        setError('An unexpected error occurred while saving.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/50 backdrop-blur-sm transition-opacity">
      <div className="w-full max-w-md bg-white h-full shadow-2xl flex flex-col animate-slide-in-right">
        
        <div className="flex justify-between items-center px-6 py-4 border-b border-slate-100 bg-slate-50">
          <h2 className="text-xl font-bold text-slate-800">
            {record ? 'Edit Record' : 'New Record'}
          </h2>
          <button 
            onClick={() => onClose(false)}
            className="text-slate-400 hover:text-slate-600 focus:outline-none"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {error && (
            <div className="mb-6 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
              {error}
            </div>
          )}
          
          <RecordForm 
            initialData={record ? record.data : {}}
            fieldSchema={fieldSchema}
            onSave={handleSave}
            loading={loading}
            validationErrors={validationErrors}
          />
        </div>

      </div>
    </div>
  );
};

export default RecordDrawer;
