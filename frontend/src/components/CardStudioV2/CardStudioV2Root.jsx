import React, { useState } from 'react';
import TemplateLibrary from './TemplateLibrary';
import TemplateDesigner from './TemplateDesigner';
import ProjectList from './ProjectList';
import ProjectWorkspace from './ProjectWorkspace';
import { createProjectV2 } from '../../services/cardStudioV2Api';

const CardStudioV2Root = () => {
  const [currentView, setCurrentView] = useState('library'); // 'library' | 'designer' | 'projects' | 'workspace'
  const [selectedTemplateId, setSelectedTemplateId] = useState(null);
  const [selectedProjectId, setSelectedProjectId] = useState(null);

  const openTemplate = (templateId) => {
    setSelectedTemplateId(templateId);
    setCurrentView('designer');
  };

  const openProject = (projectId) => {
    setSelectedProjectId(projectId);
    setCurrentView('workspace');
  };

  const handleCreateProject = async (templateId, projectName) => {
    try {
      const project = await createProjectV2({
        template_id: templateId,
        name: projectName
      });
      openProject(project.id);
    } catch (err) {
      console.error(err);
      alert('Failed to create project');
    }
  };

  const backToRoot = () => {
    setSelectedTemplateId(null);
    setSelectedProjectId(null);
    setCurrentView(currentView === 'designer' ? 'library' : 'projects');
  };

  return (
    <div className="w-full h-full bg-slate-50 flex flex-col overflow-hidden">
      
      {/* Top Navigation for root views */}
      {(currentView === 'library' || currentView === 'projects') && (
        <div className="bg-white border-b border-slate-200 px-6 py-4 flex space-x-6">
          <button 
            onClick={() => setCurrentView('library')}
            className={`font-medium pb-1 border-b-2 ${currentView === 'library' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
          >
            Templates
          </button>
          <button 
            onClick={() => setCurrentView('projects')}
            className={`font-medium pb-1 border-b-2 ${currentView === 'projects' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
          >
            Projects
          </button>
        </div>
      )}

      {currentView === 'library' && (
        <TemplateLibrary 
          onOpenTemplate={openTemplate} 
          onCreateProject={(templateId) => {
            const name = prompt('Enter Project Name:');
            if (name) handleCreateProject(templateId, name);
          }}
        />
      )}
      
      {currentView === 'projects' && (
        <ProjectList 
          onOpenProject={openProject}
          onCreateProject={() => setCurrentView('library')} // Redirect to library to select template
        />
      )}

      {currentView === 'designer' && (
        <TemplateDesigner
          templateId={selectedTemplateId}
          onBack={backToRoot}
        />
      )}

      {currentView === 'workspace' && (
        <ProjectWorkspace
          projectId={selectedProjectId}
          onBack={backToRoot}
        />
      )}
    </div>
  );
};

export default CardStudioV2Root;
