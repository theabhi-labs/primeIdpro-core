import React, { useState } from 'react';
import ProjectHub from './ProjectHub';
import CardStudioWorkspace from './CardStudioWorkspace';
import ProjectSetupView from './ProjectSetupView';
import PrintSheetModal from './PrintSheetModal';

const CardStudioRoot = ({ setToast }) => {
  const [currentView, setCurrentView] = useState('hub'); // 'hub' | 'setup' | 'workspace'
  const [activeProjectId, setActiveProjectId] = useState(null);
  const [printModalState, setPrintModalState] = useState({ open: false, project: null });

  const handleOpenProject = (projectId) => {
    setActiveProjectId(projectId);
    setCurrentView('workspace');
  };

  const handleBackToHub = () => {
    setActiveProjectId(null);
    setCurrentView('hub');
  };

  const handleStartNewProject = () => {
    setCurrentView('setup');
  };

  const handleProjectCreated = (newProject) => {
    if (newProject?.id) {
      setActiveProjectId(newProject.id);
      setCurrentView('workspace');
    } else {
      setCurrentView('hub');
    }
  };

  const handleOpenPrint = (project) => {
    setPrintModalState({ open: true, project });
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden relative">
      {currentView === 'setup' ? (
        <ProjectSetupView
          onBack={handleBackToHub}
          onCreated={handleProjectCreated}
          setToast={setToast}
        />
      ) : currentView === 'workspace' && activeProjectId ? (
        <CardStudioWorkspace
          projectId={activeProjectId}
          onBack={handleBackToHub}
          setToast={setToast}
        />
      ) : (
        <ProjectHub
          onOpenProject={handleOpenProject}
          onNewProject={handleStartNewProject}
          onOpenPrint={handleOpenPrint}
          setToast={setToast}
        />
      )}

      {/* Direct Print Sheet Modal from Hub */}
      {printModalState.open && (
        <PrintSheetModal
          isOpen={printModalState.open}
          onClose={() => setPrintModalState({ open: false, project: null })}
          project={printModalState.project}
          batch={printModalState.project?.batches?.[0]}
          setToast={setToast}
        />
      )}
    </div>
  );
};

export default CardStudioRoot;
