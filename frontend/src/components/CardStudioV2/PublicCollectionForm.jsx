import React, { useState, useEffect } from 'react';
import { ShieldCheck, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { publicGetCollectionSchemaV2, publicSubmitCollectionV2 } from '../../services/cardStudioV2Api';

const PublicCollectionForm = ({ token }) => {
  const [schema, setSchema] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  
  const [formData, setFormData] = useState({});
  const [validationErrors, setValidationErrors] = useState({});

  useEffect(() => {
    const fetchSchema = async () => {
      try {
        const data = await publicGetCollectionSchemaV2(token);
        setSchema(data);
        
        // Initialize default form data
        const initial = {};
        data.fields.forEach(f => {
          if (f.data_type === 'boolean') initial[f.key] = false;
          else initial[f.key] = '';
        });
        setFormData(initial);
      } catch (err) {
        if (err.response?.status === 404 || err.response?.status === 403) {
          setError('This form is no longer available.');
        } else {
          setError('An error occurred while loading the form.');
        }
      } finally {
        setLoading(false);
      }
    };
    
    fetchSchema();
  }, [token]);

  const handleChange = (key, value) => {
    setFormData(prev => ({ ...prev, [key]: value }));
    if (validationErrors[key]) {
      setValidationErrors(prev => ({ ...prev, [key]: null }));
    }
  };

  const validateForm = () => {
    const errors = {};
    let isValid = true;
    schema.fields.forEach(f => {
      if (f.required && (formData[f.key] === '' || formData[f.key] === null || formData[f.key] === undefined)) {
        errors[f.key] = 'This field is required';
        isValid = false;
      }
    });
    setValidationErrors(errors);
    return isValid;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;
    
    setSubmitting(true);
    setError(null);
    try {
      const res = await publicSubmitCollectionV2(token, formData);
      setSuccess({ reference: res.reference || 'SUCCESS' });
    } catch (err) {
      if (err.response?.status === 422) {
        // Handle validation errors from backend if any
        const backendErrors = {};
        if (Array.isArray(err.response.data?.detail)) {
          err.response.data.detail.forEach(d => {
            const field = d.loc[d.loc.length - 1];
            backendErrors[field] = d.msg;
          });
        }
        setValidationErrors(backendErrors);
        setError('Please correct the highlighted errors.');
      } else if (err.response?.status === 403) {
        setError('Submission failed: ' + (err.response.data?.detail || 'Limit reached or expired.'));
      } else {
        setError('An unexpected error occurred during submission.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen w-full bg-slate-50 flex flex-col items-center justify-center">
        <Loader2 className="animate-spin text-cyan-600 mb-4" size={32} />
        <p className="text-slate-500 font-medium">Loading secure form...</p>
      </div>
    );
  }

  if (error && !schema) {
    return (
      <div className="min-h-screen w-full bg-slate-50 flex flex-col items-center justify-center p-6">
        <div className="bg-white p-8 rounded-2xl shadow-xl border border-slate-200 max-w-md w-full text-center flex flex-col items-center">
          <div className="w-16 h-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center mb-6">
            <AlertCircle size={32} />
          </div>
          <h2 className="text-xl font-bold text-slate-800 mb-2">Form Unavailable</h2>
          <p className="text-slate-500">{error}</p>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen w-full bg-slate-50 flex flex-col items-center justify-center p-6">
        <div className="bg-white p-10 rounded-2xl shadow-xl border border-slate-200 max-w-md w-full text-center flex flex-col items-center">
          <div className="w-20 h-20 bg-emerald-50 text-emerald-500 rounded-full flex items-center justify-center mb-6 shadow-inner">
            <CheckCircle2 size={40} />
          </div>
          <h2 className="text-2xl font-black text-slate-800 mb-2">Submitted Successfully</h2>
          <p className="text-slate-500 mb-6">Your information has been securely recorded.</p>
          <div className="bg-slate-50 border border-slate-200 rounded-xl px-6 py-4 w-full">
            <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider mb-1">Reference Number</p>
            <p className="text-2xl font-mono font-bold text-slate-700 tracking-widest">{success.reference}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full bg-slate-50 flex flex-col sm:py-10">
      <div className="w-full max-w-2xl mx-auto bg-white sm:rounded-2xl sm:shadow-xl border-x sm:border-y border-slate-200 overflow-hidden flex-1 sm:flex-none flex flex-col">
        
        {/* Header */}
        <div className="bg-slate-900 px-6 py-8 text-center text-white relative">
          <div className="absolute top-4 right-4 flex items-center gap-1.5 px-2 py-1 bg-white/10 rounded-full backdrop-blur-sm border border-white/10">
            <ShieldCheck size={14} className="text-emerald-400" />
            <span className="text-[10px] font-semibold text-emerald-50 tracking-wider">SECURE</span>
          </div>
          <h1 className="text-2xl font-black mt-2 mb-1">{schema.project_name}</h1>
          <p className="text-sm text-slate-400 font-medium">Data Collection Form</p>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 sm:p-8 flex-1 flex flex-col">
          {error && (
            <div className="mb-6 p-4 bg-red-50 text-red-600 border border-red-200 rounded-xl text-sm font-medium flex items-center gap-2">
              <AlertCircle size={16} className="shrink-0" />
              {error}
            </div>
          )}

          <div className="space-y-5 flex-1">
            {schema.fields.map(field => {
              const isError = !!validationErrors[field.key];
              
              if (field.data_type === 'image' || field.data_type === 'photo') {
                return (
                  <div key={field.key} className="p-4 border border-dashed border-slate-300 rounded-xl bg-slate-50 text-center">
                    <label className="block text-sm font-semibold text-slate-700 mb-1">{field.label}</label>
                    <p className="text-xs text-slate-500">Photo upload will be available soon.</p>
                  </div>
                );
              }

              return (
                <div key={field.key}>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                    {field.label} {field.required && <span className="text-red-500">*</span>}
                  </label>
                  
                  {field.data_type === 'select' ? (
                    <select
                      value={formData[field.key] || ''}
                      onChange={(e) => handleChange(field.key, e.target.value)}
                      className={`w-full px-4 py-2.5 rounded-xl border ${isError ? 'border-red-300 bg-red-50' : 'border-slate-300 bg-white'} text-slate-800 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 transition-all`}
                    >
                      <option value="" disabled>Select {field.label}</option>
                      {field.options?.map(opt => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                  ) : field.data_type === 'boolean' ? (
                    <div className="flex items-center gap-3 mt-2">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name={field.key}
                          checked={formData[field.key] === true}
                          onChange={() => handleChange(field.key, true)}
                          className="w-4 h-4 text-cyan-600"
                        />
                        <span className="text-sm text-slate-700">Yes</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name={field.key}
                          checked={formData[field.key] === false}
                          onChange={() => handleChange(field.key, false)}
                          className="w-4 h-4 text-cyan-600"
                        />
                        <span className="text-sm text-slate-700">No</span>
                      </label>
                    </div>
                  ) : (
                    <input
                      type={field.data_type === 'date' ? 'date' : field.data_type === 'number' ? 'number' : 'text'}
                      value={formData[field.key] || ''}
                      onChange={(e) => handleChange(field.key, e.target.value)}
                      placeholder={`Enter ${field.label}`}
                      className={`w-full px-4 py-2.5 rounded-xl border ${isError ? 'border-red-300 bg-red-50' : 'border-slate-300 bg-white'} text-slate-800 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 transition-all`}
                    />
                  )}
                  
                  {isError && <p className="text-xs text-red-500 mt-1.5 font-medium">{validationErrors[field.key]}</p>}
                </div>
              );
            })}
          </div>

          <div className="mt-8 pt-6 border-t border-slate-100">
            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-cyan-600 hover:bg-cyan-700 disabled:bg-slate-400 text-white font-bold py-3.5 px-4 rounded-xl shadow-lg shadow-cyan-600/20 transition-all flex justify-center items-center gap-2"
            >
              {submitting ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  Submitting...
                </>
              ) : (
                'Submit Form'
              )}
            </button>
            <p className="text-center text-[10px] text-slate-400 mt-4 font-medium uppercase tracking-wider">
              Powered by PrimeIDPRO
            </p>
          </div>
        </form>
      </div>
    </div>
  );
};

export default PublicCollectionForm;
