import React, { useState, useEffect } from 'react';
import { createGenerationJobV2, getGenerationJobV2, getGenerationPdfUrlV2 } from '../../services/cardStudioV2Api';

const GenerationPanel = ({ projectId, project, selectedRecordIds, onClose }) => {
  const [step, setStep] = useState('layout'); // layout, progress, result
  const [jobId, setJobId] = useState(null);
  
  const [layoutConfig, setLayoutConfig] = useState({
    paper: 'A4',
    orientation: 'portrait',
    margin_top_mm: 5,
    margin_right_mm: 5,
    margin_bottom_mm: 5,
    margin_left_mm: 5,
    gap_x_mm: 2,
    gap_y_mm: 2
  });

  const handleGenerate = async () => {
    try {
      setStep('progress');
      const res = await createGenerationJobV2(projectId, {
        record_ids: selectedRecordIds,
        layout: layoutConfig
      });
      setJobId(res.job_id);
    } catch (err) {
      console.error(err);
      alert('Failed to start generation job: ' + (err.response?.data?.detail || err.message));
      setStep('layout');
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
          <h2 className="text-lg font-bold text-slate-800 flex items-center">
            <svg className="w-5 h-5 mr-2 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
            </svg>
            Generate Cards
          </h2>
          {step === 'layout' && (
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
        
        <div className="flex-1 overflow-auto bg-slate-100">
          {step === 'layout' && (
            <LayoutConfigurator 
              config={layoutConfig} 
              setConfig={setLayoutConfig} 
              recordCount={selectedRecordIds.length}
              template={project?.template_snapshot}
            />
          )}
          {step === 'progress' && jobId && (
            <GenerationProgress jobId={jobId} onComplete={() => setStep('result')} />
          )}
          {step === 'result' && jobId && (
            <GenerationResult jobId={jobId} onClose={onClose} />
          )}
        </div>
        
        {step === 'layout' && (
          <div className="p-4 border-t border-slate-200 flex justify-between items-center bg-white">
            <div className="text-sm text-slate-500">
              {selectedRecordIds.length} records selected
            </div>
            <div className="flex space-x-3">
              <button onClick={onClose} className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50">
                Cancel
              </button>
              <button onClick={handleGenerate} className="px-6 py-2 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 flex items-center shadow-sm">
                Start Generation
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const LayoutConfigurator = ({ config, setConfig, recordCount, template }) => {
  const handleChange = (e) => {
    const { name, value, type } = e.target;
    setConfig(prev => ({
      ...prev,
      [name]: type === 'number' ? parseFloat(value) : value
    }));
  };

  // Basic math preview
  const cardW = template?.width || 85.6;
  const cardH = template?.height || 53.98;
  const pageW = config.paper === 'A4' ? (config.orientation === 'landscape' ? 297 : 210) : 210;
  const pageH = config.paper === 'A4' ? (config.orientation === 'landscape' ? 210 : 297) : 297;
  
  const usableW = pageW - config.margin_left_mm - config.margin_right_mm;
  const usableH = pageH - config.margin_top_mm - config.margin_bottom_mm;
  
  const cols = Math.floor((usableW + config.gap_x_mm) / (cardW + config.gap_x_mm)) || 0;
  const rows = Math.floor((usableH + config.gap_y_mm) / (cardH + config.gap_y_mm)) || 0;
  const cpp = cols * rows;
  const totalPages = cpp > 0 ? Math.ceil(recordCount / cpp) : 0;
  const fits = cpp > 0;

  return (
    <div className="flex flex-col md:flex-row h-full">
      <div className="w-full md:w-1/3 bg-white p-6 border-r border-slate-200 overflow-y-auto space-y-6">
        <div>
          <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider mb-4">Paper</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Format</label>
              <select name="paper" value={config.paper} onChange={handleChange} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm">
                <option value="A4">A4 (210 × 297 mm)</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Orientation</label>
              <select name="orientation" value={config.orientation} onChange={handleChange} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm">
                <option value="portrait">Portrait</option>
                <option value="landscape">Landscape</option>
              </select>
            </div>
          </div>
        </div>

        <div>
          <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider mb-4">Margins (mm)</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Top</label>
              <input type="number" name="margin_top_mm" value={config.margin_top_mm} onChange={handleChange} min="0" step="1" className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Bottom</label>
              <input type="number" name="margin_bottom_mm" value={config.margin_bottom_mm} onChange={handleChange} min="0" step="1" className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Left</label>
              <input type="number" name="margin_left_mm" value={config.margin_left_mm} onChange={handleChange} min="0" step="1" className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Right</label>
              <input type="number" name="margin_right_mm" value={config.margin_right_mm} onChange={handleChange} min="0" step="1" className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
            </div>
          </div>
        </div>

        <div>
          <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider mb-4">Spacing (mm)</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Horizontal Gap</label>
              <input type="number" name="gap_x_mm" value={config.gap_x_mm} onChange={handleChange} min="0" step="0.5" className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Vertical Gap</label>
              <input type="number" name="gap_y_mm" value={config.gap_y_mm} onChange={handleChange} min="0" step="0.5" className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
            </div>
          </div>
        </div>
      </div>
      
      <div className="w-full md:w-2/3 p-6 flex flex-col items-center">
        <div className="mb-4 bg-white px-4 py-2 rounded-lg shadow-sm border border-slate-200 flex space-x-6 text-sm">
          <div><span className="text-slate-500">Grid:</span> <span className="font-semibold">{cols} × {rows}</span></div>
          <div><span className="text-slate-500">Cards / Page:</span> <span className="font-semibold">{cpp}</span></div>
          <div><span className="text-slate-500">Est. Pages:</span> <span className="font-semibold">{totalPages}</span></div>
        </div>
        
        {!fits ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center p-6 bg-red-50 text-red-600 rounded-xl border border-red-100 max-w-sm">
              <svg className="w-12 h-12 mx-auto mb-2 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <h4 className="font-bold mb-1">Layout Invalid</h4>
              <p className="text-sm text-red-500">The card dimensions ({cardW} × {cardH} mm) do not fit on the page with the current margins and gaps. Please reduce margins or change orientation.</p>
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-auto w-full flex items-center justify-center p-4">
            <div 
              className="bg-white shadow-md border border-slate-300 relative transition-all"
              style={{
                width: `${pageW * 2}px`, // scale for preview
                height: `${pageH * 2}px`,
                paddingTop: `${config.margin_top_mm * 2}px`,
                paddingRight: `${config.margin_right_mm * 2}px`,
                paddingBottom: `${config.margin_bottom_mm * 2}px`,
                paddingLeft: `${config.margin_left_mm * 2}px`,
              }}
            >
              <div 
                className="w-full h-full border border-blue-200/50"
                style={{
                  display: 'grid',
                  gridTemplateColumns: `repeat(${cols}, ${cardW * 2}px)`,
                  gridAutoRows: `${cardH * 2}px`,
                  columnGap: `${config.gap_x_mm * 2}px`,
                  rowGap: `${config.gap_y_mm * 2}px`,
                }}
              >
                {Array.from({ length: Math.min(cpp, recordCount) }).map((_, i) => (
                  <div key={i} className="bg-indigo-50 border border-indigo-200 flex items-center justify-center text-xs text-indigo-400 font-medium">
                    Card {i + 1}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const GenerationProgress = ({ jobId, onComplete }) => {
  const [status, setStatus] = useState(null);
  
  useEffect(() => {
    const check = async () => {
      try {
        const res = await getGenerationJobV2(jobId);
        setStatus(res);
        if (['COMPLETED', 'PARTIAL', 'FAILED'].includes(res.status)) {
          onComplete();
        }
      } catch (err) {
        console.error(err);
      }
    };
    
    check();
    const int = setInterval(check, 2000);
    return () => clearInterval(int);
  }, [jobId]);

  if (!status) return <div className="p-12 text-center">Connecting...</div>;

  const pct = status.total > 0 ? Math.round((status.completed + status.failed) / status.total * 100) : 0;

  return (
    <div className="flex flex-col items-center justify-center h-full p-12">
      <div className="w-20 h-20 mb-6 relative">
        <svg className="animate-spin w-full h-full text-indigo-200" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"></circle>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        <div className="absolute inset-0 flex items-center justify-center text-sm font-bold text-indigo-600">
          {pct}%
        </div>
      </div>
      
      <h3 className="text-xl font-bold text-slate-800 mb-2">Generating PDF...</h3>
      <p className="text-slate-500 mb-8">Please wait while we render your cards and compose the A4 layout.</p>
      
      <div className="w-full max-w-md bg-white border border-slate-200 rounded-lg p-4 shadow-sm flex items-center justify-between">
        <div className="text-center">
          <div className="text-2xl font-bold text-slate-800">{status.total}</div>
          <div className="text-xs font-medium text-slate-500 uppercase tracking-wider">Total</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-emerald-600">{status.completed}</div>
          <div className="text-xs font-medium text-slate-500 uppercase tracking-wider">Completed</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-red-500">{status.failed}</div>
          <div className="text-xs font-medium text-slate-500 uppercase tracking-wider">Failed</div>
        </div>
      </div>
    </div>
  );
};

const GenerationResult = ({ jobId, onClose }) => {
  const [status, setStatus] = useState(null);
  
  useEffect(() => {
    getGenerationJobV2(jobId).then(setStatus).catch(console.error);
  }, [jobId]);

  if (!status) return null;

  return (
    <div className="flex flex-col h-full bg-white">
      <div className="flex-1 p-8 flex flex-col items-center justify-center text-center">
        {status.status === 'FAILED' ? (
          <>
            <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mb-4">
              <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <h3 className="text-2xl font-bold text-slate-800 mb-2">Generation Failed</h3>
            <p className="text-slate-500 max-w-md">The job failed completely. See the error log below for details.</p>
          </>
        ) : status.status === 'PARTIAL' ? (
          <>
            <div className="w-16 h-16 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center mb-4">
              <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h3 className="text-2xl font-bold text-slate-800 mb-2">Partial Success</h3>
            <p className="text-slate-500 max-w-md">Some cards could not be generated, but the PDF is ready for the successful ones.</p>
          </>
        ) : (
          <>
            <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mb-4">
              <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h3 className="text-2xl font-bold text-slate-800 mb-2">PDF Ready to Print</h3>
            <p className="text-slate-500 max-w-md">All {status.completed} cards were generated successfully.</p>
          </>
        )}
        
        {['COMPLETED', 'PARTIAL'].includes(status.status) && (
          <div className="mt-8 flex space-x-4">
            <a 
              href={getGenerationPdfUrlV2(jobId)}
              target="_blank" rel="noreferrer"
              className="px-6 py-3 bg-indigo-600 text-white font-medium rounded-xl hover:bg-indigo-700 shadow-md flex items-center transition"
            >
              <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Download PDF
            </a>
          </div>
        )}
      </div>
      
      {status.error_summary && status.error_summary.length > 0 && (
        <div className="bg-slate-50 p-6 border-t border-slate-200">
          <h4 className="text-sm font-bold text-slate-800 uppercase tracking-wider mb-3">Error Log</h4>
          <div className="max-h-32 overflow-y-auto bg-white border border-slate-200 rounded-lg text-sm divide-y divide-slate-100">
            {status.error_summary.map((err, i) => (
              <div key={i} className="p-3 flex space-x-3">
                <span className="text-red-500 font-medium whitespace-nowrap">ID: {err.record_id}</span>
                <span className="text-slate-600">{err.reason}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      
      <div className="p-4 border-t border-slate-200 text-center bg-slate-50">
        <button onClick={onClose} className="px-6 py-2 border border-slate-300 bg-white text-slate-700 font-medium rounded-lg hover:bg-slate-50">
          Close
        </button>
      </div>
    </div>
  );
};

export default GenerationPanel;
