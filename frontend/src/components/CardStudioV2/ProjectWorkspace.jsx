import React, { useEffect, useState } from 'react';
import { getProjectV2, getProjectSummaryV2, listRecordsV2, toggleRecordImportantV2, updateRecordStatusV2, deleteRecordV2 } from '../../services/cardStudioV2Api';
import RecordTable from './RecordTable';
import RecordDrawer from './RecordDrawer';
import CollectionLinkManager from './CollectionLinkManager';
import BulkImportWizard from './BulkImportWizard';
import GenerationPanel from './GenerationPanel';

const ProjectWorkspace = ({ projectId, onBack }) => {
  const [project, setProject] = useState(null);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  
  // Link Manager
  const [linkManagerOpen, setLinkManagerOpen] = useState(false);
  const [importWizardOpen, setImportWizardOpen] = useState(false);
  const [generationPanelOpen, setGenerationPanelOpen] = useState(false);
  
  // Table State
  const [records, setRecords] = useState([]);
  const [totalRecords, setTotalRecords] = useState(0);
  const [tableLoading, setTableLoading] = useState(false);
  const [selectedRecordIds, setSelectedRecordIds] = useState([]);
  
  // Filter/Sort/Pagination State
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortConfig, setSortConfig] = useState('updated_desc');
  
  // Drawer state
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState(null);

  useEffect(() => {
    loadProjectAndSummary();
  }, [projectId]);

  useEffect(() => {
    if (project) {
      loadRecords();
    }
  }, [project, page, pageSize, search, statusFilter, sortConfig]);

  const loadProjectAndSummary = async () => {
    try {
      setLoading(true);
      const [projData, summaryData] = await Promise.all([
        getProjectV2(projectId),
        getProjectSummaryV2(projectId)
      ]);
      setProject(projData);
      setSummary(summaryData);
    } catch (err) {
      console.error(err);
      alert('Failed to load project details');
      onBack();
    } finally {
      setLoading(false);
    }
  };

  const loadRecords = async () => {
    try {
      setTableLoading(true);
      const skip = (page - 1) * pageSize;
      const data = await listRecordsV2(projectId, {
        limit: pageSize,
        skip,
        search,
        status: statusFilter,
        sort: sortConfig
      });
      setRecords(data.records || []);
      setTotalRecords(data.total || 0);
    } catch (err) {
      console.error(err);
    } finally {
      setTableLoading(false);
    }
  };

  const handleAddRecord = () => {
    setEditingRecord(null);
    setDrawerOpen(true);
  };

  const handleEditRecord = (record) => {
    setEditingRecord(record);
    setDrawerOpen(true);
  };

  const handleDrawerClose = (refresh = false) => {
    setDrawerOpen(false);
    setEditingRecord(null);
    if (refresh) {
      loadRecords();
      getProjectSummaryV2(projectId).then(setSummary).catch(console.error);
    }
  };

  const handleToggleImportant = async (recordId, currentStatus) => {
    try {
      await toggleRecordImportantV2(projectId, recordId, !currentStatus);
      loadRecords();
    } catch (err) {
      console.error(err);
    }
  };

  const handleDelete = async (recordId) => {
    if (!window.confirm('Are you sure you want to delete this record?')) return;
    try {
      await deleteRecordV2(projectId, recordId);
      // Adjust page if deleting last item on current page
      if (records.length === 1 && page > 1) {
        setPage(page - 1);
      } else {
        loadRecords();
      }
      getProjectSummaryV2(projectId).then(setSummary).catch(console.error);
    } catch (err) {
      console.error(err);
      alert('Failed to delete record');
    }
  };

  const handleSelectRecord = (recordId, checked) => {
    setSelectedRecordIds(prev => 
      checked ? [...prev, recordId] : prev.filter(id => id !== recordId)
    );
  };

  const handleSelectAll = (checked) => {
    if (checked) {
      const readyIds = records.filter(r => r.status === 'ready').map(r => r.id);
      setSelectedRecordIds(readyIds);
    } else {
      setSelectedRecordIds([]);
    }
  };

  const handleStatusChange = async (recordId, newStatus) => {
    try {
      await updateRecordStatusV2(projectId, recordId, newStatus);
      loadRecords();
      getProjectSummaryV2(projectId).then(setSummary).catch(console.error);
    } catch (err) {
      if (err.response?.status === 422) {
        alert('Validation failed. Make sure required fields are filled.');
      } else {
        alert('Failed to update status');
      }
    }
  };

  if (loading || !project) {
    return (
      <div className="flex-1 flex items-center justify-center bg-slate-50">
        <div className="text-slate-500">Loading project...</div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-slate-50">
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex-shrink-0">
        <div className="flex items-center space-x-4 mb-2">
          <button onClick={onBack} className="text-slate-400 hover:text-slate-600 font-medium text-sm">
            &larr; Back to Projects
          </button>
        </div>
        <div className="flex justify-between items-end">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">{project.name}</h1>
            <div className="text-sm text-slate-500 mt-1 flex items-center space-x-3">
              <span>Card Size: {project.snapshot_schema?.width}x{project.snapshot_schema?.height}{project.snapshot_schema?.unit}</span>
              <span>•</span>
              <span className="text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full font-medium text-xs">
                {summary?.total || 0} Total Records
              </span>
              <span className="text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full font-medium text-xs">
                {summary?.draft || 0} Draft
              </span>
              <span className="text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full font-medium text-xs">
                {summary?.ready || 0} Ready
              </span>
            </div>
          </div>
          <div className="flex space-x-3">
            <button
              onClick={() => setLinkManagerOpen(true)}
              className="bg-cyan-600 hover:bg-cyan-700 text-white px-4 py-2 rounded-lg font-medium shadow-sm transition-colors flex items-center gap-2"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>
              Collect Data
            </button>
            <button
              onClick={() => setImportWizardOpen(true)}
              className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg font-medium shadow-sm transition-colors flex items-center gap-2"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
              Import Excel
            </button>
            <button
              onClick={handleAddRecord}
              className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg font-medium shadow-sm transition-colors"
            >
              + Add Record
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 p-6 overflow-hidden flex flex-col">
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm flex-1 flex flex-col overflow-hidden">
          
      {linkManagerOpen && (
        <CollectionLinkManager 
          projectId={projectId} 
          onClose={() => setLinkManagerOpen(false)} 
        />
      )}
      {importWizardOpen && (
        <BulkImportWizard 
          project={project} 
          onClose={() => setImportWizardOpen(false)}
          onComplete={() => {
            fetchRecords();
            fetchSummary();
          }} 
        />
      )}
          {/* Controls */}
          <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
            <div className="flex space-x-2 items-center">
              {selectedRecordIds.length > 0 && (
                <button
                  onClick={() => setGenerationPanelOpen(true)}
                  className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition shadow-sm flex items-center"
                >
                  <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                  </svg>
                  Generate Cards ({selectedRecordIds.length})
                </button>
              )}
              <button 
                onClick={() => setImportWizardOpen(true)}
                className="px-4 py-2 border border-slate-300 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-50 transition shadow-sm"
              >
                Import Excel/CSV
              </button>
              <button 
                onClick={() => setLinkManagerOpen(true)}
                className="px-4 py-2 border border-slate-300 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-50 transition shadow-sm flex items-center"
              >
                Collect Data (Link)
              </button>
              <button 
                onClick={() => {
                  setEditingRecord(null);
                  setDrawerOpen(true);
                }}
                className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition shadow-sm"
              >
                Add Record
              </button>
              <select 
                value={sortConfig}
                onChange={(e) => {
                  setSortConfig(e.target.value);
                  setPage(1);
                }}
                className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
              >
                <option value="updated_desc">Newest First</option>
                <option value="updated_asc">Oldest First</option>
                <option value="name_asc">Name (A-Z)</option>
                <option value="name_desc">Name (Z-A)</option>
                <option value="important_first">Important First</option>
              </select>
            </div>
            
            <div className="text-sm text-slate-500 flex items-center space-x-2">
              <span>Showing {records.length > 0 ? (page - 1) * pageSize + 1 : 0}-{Math.min(page * pageSize, totalRecords)} of {totalRecords}</span>
              <div className="flex space-x-1 ml-2">
                <button 
                  disabled={page === 1}
                  onClick={() => setPage(p => p - 1)}
                  className="px-2 py-1 border border-slate-300 rounded hover:bg-slate-50 disabled:opacity-50 disabled:hover:bg-transparent"
                >
                  &larr;
                </button>
                <button 
                  disabled={page * pageSize >= totalRecords}
                  onClick={() => setPage(p => p + 1)}
                  className="px-2 py-1 border border-slate-300 rounded hover:bg-slate-50 disabled:opacity-50 disabled:hover:bg-transparent"
                >
                  &rarr;
                </button>
              </div>
            </div>
          </div>

          {/* Table */}
          <div className="flex-1 overflow-auto">
            {tableLoading ? (
              <div className="flex items-center justify-center h-full text-slate-400">Loading records...</div>
            ) : records.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-slate-500 space-y-4">
                <p>No records found.</p>
                {search || statusFilter !== 'all' ? (
                  <button onClick={() => { setSearch(''); setStatusFilter('all'); }} className="text-indigo-600 hover:underline">Clear Filters</button>
                ) : (
                  <button onClick={handleAddRecord} className="px-4 py-2 bg-indigo-50 text-indigo-700 rounded-lg font-medium hover:bg-indigo-100 transition-colors">Add your first record</button>
                )}
              </div>
            ) : (
              <RecordTable 
                records={records} 
                fieldSchema={project?.template_snapshot?.field_schema || []} 
                onEdit={handleEditRecord}
                onDelete={handleDeleteRecord}
                onToggleImportant={handleToggleImportant}
                onChangeStatus={handleStatusChange}
                selectedIds={selectedRecordIds}
                onSelectRecord={handleSelectRecord}
                onSelectAll={handleSelectAll}
              />
            )}
          </div>
        </div>
      </div>
      
      {drawerOpen && (
        <RecordDrawer 
          project={project}
          record={editingRecord}
          onClose={() => { setDrawerOpen(false); setEditingRecord(null); }}
          onSave={handleSaveRecord}
        />
      )}

      {generationPanelOpen && (
        <GenerationPanel
          projectId={projectId}
          project={project}
          selectedRecordIds={selectedRecordIds}
          onClose={() => setGenerationPanelOpen(false)}
        />
      )}
    </div>
  );
};

export default ProjectWorkspace;
