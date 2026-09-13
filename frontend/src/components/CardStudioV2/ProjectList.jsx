import React, { useEffect, useState } from 'react';
import { listProjectsV2 } from '../../services/cardStudioV2Api';

const ProjectList = ({ onOpenProject, onCreateProject }) => {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchProjects = async () => {
      try {
        setLoading(true);
        const data = await listProjectsV2();
        setProjects(data || []);
      } catch (err) {
        setError(err.response?.data?.detail || 'Failed to load projects');
      } finally {
        setLoading(false);
      }
    };
    fetchProjects();
  }, []);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-slate-500">Loading projects...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-red-500">Error: {error}</div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col p-8 overflow-y-auto">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-slate-800">Projects</h1>
          <p className="text-slate-500 mt-1">Manage your ID card generation projects.</p>
        </div>
        <button
          onClick={onCreateProject}
          className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg font-medium shadow-sm transition-colors"
        >
          + Create Project
        </button>
      </div>

      {projects.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-12 text-center shadow-sm">
          <div className="text-5xl mb-4">🗂️</div>
          <h3 className="text-lg font-bold text-slate-800 mb-2">No projects yet</h3>
          <p className="text-slate-500 mb-6">Create a project from a template to start generating cards.</p>
          <button
            onClick={onCreateProject}
            className="bg-indigo-50 text-indigo-700 hover:bg-indigo-100 px-4 py-2 rounded-lg font-medium transition-colors"
          >
            Create Project
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {projects.map((project) => (
            <div
              key={project.id}
              className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow flex flex-col"
            >
              <div className="p-5 flex-1">
                <h3 className="font-bold text-slate-800 text-lg mb-1 truncate" title={project.name}>
                  {project.name}
                </h3>
                <div className="text-xs text-slate-500 mb-4 flex items-center space-x-2">
                  <span className={`px-2 py-0.5 rounded-full ${project.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-700'}`}>
                    {project.status}
                  </span>
                  <span>•</span>
                  <span>{new Date(project.created_at).toLocaleDateString()}</span>
                </div>
              </div>
              <div className="border-t border-slate-100 p-4 bg-slate-50 flex justify-end">
                <button
                  onClick={() => onOpenProject(project.id)}
                  className="text-indigo-600 font-medium hover:text-indigo-800 transition-colors"
                >
                  Open Workspace &rarr;
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ProjectList;
