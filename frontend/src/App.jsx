import React, { useState, useEffect, useRef } from 'react';
import { Sparkles, ArrowLeft, Cloud, CloudOff, Info } from 'lucide-react';
import './App.css';
import CanvasEditor from './components/CanvasEditor';
import Toolbar from './components/Toolbar';
import ProjectList from './components/ProjectList';

const API_URL = 'http://localhost:5000/api/projects';

function App() {
  // Navigation State
  const [projects, setProjects] = useState([]);
  const [activeProject, setActiveProject] = useState(null);
  const [isLoadingProjects, setIsLoadingProjects] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isBackendConnected, setIsBackendConnected] = useState(true);

  // Editor States
  const [activeTool, setActiveTool] = useState('pencil');
  const [activeColor, setActiveColor] = useState('#3b82f6');
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [showGrid, setShowGrid] = useState(true);
  const [hoveredPixel, setHoveredPixel] = useState(null);
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 });
  const [projectName, setProjectName] = useState('Untitled Project');

  const editorRef = useRef(null);

  // Check health and connection to backend, then fetch projects
  const checkBackendAndFetch = async () => {
    setIsLoadingProjects(true);
    try {
      // Quick health check
      const healthRes = await fetch('http://localhost:5000/api/health').catch(() => null);
      if (!healthRes || !healthRes.ok) {
        throw new Error('Backend server offline');
      }
      
      const res = await fetch(API_URL);
      if (res.ok) {
        const data = await res.json();
        setProjects(data);
        setIsBackendConnected(true);
      } else {
        throw new Error('Failed to load projects');
      }
    } catch (err) {
      console.warn('Backend unavailable, switching to local offline mode. Details:', err.message);
      setIsBackendConnected(false);
      // Load offline projects from localStorage if available
      const localProjects = localStorage.getItem('pixelplay_local_projects');
      if (localProjects) {
        setProjects(JSON.parse(localProjects));
      }
    } finally {
      setIsLoadingProjects(false);
    }
  };

  useEffect(() => {
    checkBackendAndFetch();
  }, []);

  // Keyboard Shortcuts (Undo/Redo)
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey) {
        if (e.key === 'z' || e.key === 'Z') {
          e.preventDefault();
          editorRef.current?.undo();
        } else if (e.key === 'y' || e.key === 'Y') {
          e.preventDefault();
          editorRef.current?.redo();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Upload a new image
  const handleUploadImage = async (newProjectData) => {
    // If backend is active, save to MongoDB
    if (isBackendConnected) {
      try {
        const res = await fetch(API_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: newProjectData.name,
            originalImage: newProjectData.originalImage,
            imageData: newProjectData.originalImage,
            width: newProjectData.width,
            height: newProjectData.height,
            totalPixels: newProjectData.totalPixels
          })
        });

        if (res.ok) {
          const savedProject = await res.json();
          // Reload project list
          checkBackendAndFetch();
          loadProjectIntoEditor(savedProject);
        } else {
          throw new Error('Failed to save project to server');
        }
      } catch (err) {
        console.error(err);
        alert('Server upload failed. Opening project in temporary sandbox mode.');
        openLocalProject(newProjectData);
      }
    } else {
      // Local sandbox mode
      openLocalProject(newProjectData);
    }
  };

  const openLocalProject = (data) => {
    const localProj = {
      _id: 'local_' + Date.now(),
      name: data.name,
      originalImage: data.originalImage,
      imageData: data.originalImage,
      width: data.width,
      height: data.height,
      totalPixels: data.totalPixels,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    loadProjectIntoEditor(localProj);
  };

  // Load project workspace into editor
  const loadProjectIntoEditor = (project) => {
    setActiveProject(project);
    setProjectName(project.name);
    setImageSize({ width: project.width, height: project.height });
  };

  // Select project from list
  const handleSelectProject = async (id) => {
    if (id.startsWith('local_')) {
      const localProjects = JSON.parse(localStorage.getItem('pixelplay_local_projects') || '[]');
      const found = localProjects.find(p => p._id === id);
      if (found) loadProjectIntoEditor(found);
      return;
    }

    try {
      const res = await fetch(`${API_URL}/${id}`);
      if (res.ok) {
        const project = await res.json();
        loadProjectIntoEditor(project);
      } else {
        alert('Failed to load project details from server');
      }
    } catch (err) {
      alert('Could not connect to server to load project.');
    }
  };

  // Delete project
  const handleDeleteProject = async (id) => {
    if (id.startsWith('local_')) {
      const localProjects = JSON.parse(localStorage.getItem('pixelplay_local_projects') || '[]');
      const updated = localProjects.filter(p => p._id !== id);
      localStorage.setItem('pixelplay_local_projects', JSON.stringify(updated));
      setProjects(updated);
      return;
    }

    try {
      const res = await fetch(`${API_URL}/${id}`, { method: 'DELETE' });
      if (res.ok) {
        checkBackendAndFetch();
      } else {
        alert('Failed to delete project on server');
      }
    } catch (err) {
      alert('Could not delete project. Server connection failed.');
    }
  };

  // Save current modifications
  const handleSaveProject = async () => {
    if (!activeProject || !editorRef.current) return;
    setIsSaving(true);

    const currentCanvasDataUrl = editorRef.current.getImageDataUrl();
    const isLocal = activeProject._id.startsWith('local_');

    if (isBackendConnected && !isLocal) {
      try {
        const res = await fetch(`${API_URL}/${activeProject._id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: projectName,
            imageData: currentCanvasDataUrl
          })
        });

        if (res.ok) {
          const updated = await res.json();
          // Update local workspace reference
          setActiveProject(updated);
          checkBackendAndFetch();
        } else {
          throw new Error('Server rejected save');
        }
      } catch (err) {
        alert('Failed to save to database. Saving locally in browser storage instead.');
        saveProjectLocally(currentCanvasDataUrl);
      } finally {
        setIsSaving(false);
      }
    } else {
      saveProjectLocally(currentCanvasDataUrl);
      setIsSaving(false);
    }
  };

  const saveProjectLocally = (canvasDataUrl) => {
    const localProjects = JSON.parse(localStorage.getItem('pixelplay_local_projects') || '[]');
    const isNew = !localProjects.some(p => p._id === activeProject._id);

    const updatedProject = {
      ...activeProject,
      name: projectName,
      imageData: canvasDataUrl,
      updatedAt: new Date().toISOString()
    };

    let nextProjects;
    if (isNew) {
      nextProjects = [updatedProject, ...localProjects];
    } else {
      nextProjects = localProjects.map(p => p._id === activeProject._id ? updatedProject : p);
    }

    localStorage.setItem('pixelplay_local_projects', JSON.stringify(nextProjects));
    setActiveProject(updatedProject);
    setProjects(nextProjects);
  };

  return (
    <div className="app-container">
      {/* Top Header */}
      <header className="app-header glass">
        <div className="logo-section">
          {activeProject && (
            <button 
              className="btn-icon" 
              onClick={() => {
                if (confirm('Go back to dashboard? Make sure you saved your changes.')) {
                  setActiveProject(null);
                  checkBackendAndFetch();
                }
              }}
              style={{ marginRight: '0.5rem', color: '#cbd5e1' }}
            >
              <ArrowLeft size={20} />
            </button>
          )}
          <Sparkles className="logo-icon" size={24} />
          <span className="app-title">PixelPlay</span>
        </div>

        {activeProject && (
          <div style={{ pointerEvents: 'auto' }}>
            <input
              type="text"
              className="project-name-input"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              title="Click to rename project"
            />
          </div>
        )}

        <div className="header-actions">
          {isBackendConnected ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: 'var(--success)', fontSize: '0.8rem', fontWeight: 600 }}>
              <Cloud size={16} />
              <span>Database Connected</span>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: 'var(--warning)', fontSize: '0.8rem', fontWeight: 600 }} title="Backend is offline. Edits will be saved to your browser cache.">
              <CloudOff size={16} />
              <span>Local Sandbox Mode</span>
            </div>
          )}
        </div>
      </header>

      {/* Main Workspace / Dashboard Switcher */}
      {activeProject ? (
        <div className="editor-workspace">
          {/* Sidebar controls */}
          <Toolbar
            activeTool={activeTool}
            setActiveTool={setActiveTool}
            activeColor={activeColor}
            setActiveColor={setActiveColor}
            showGrid={showGrid}
            setShowGrid={setShowGrid}
            hoveredPixel={hoveredPixel}
            imageSize={imageSize}
            onUndo={() => editorRef.current?.undo()}
            onRedo={() => editorRef.current?.redo()}
            canUndo={editorRef.current?.canUndo}
            canRedo={editorRef.current?.canRedo}
            onSave={handleSaveProject}
            onDownload={() => editorRef.current?.download(`${projectName.toLowerCase().replace(/\s+/g, '-')}-edited.png`)}
            onResetView={() => editorRef.current?.resetViewport()}
            isSaving={isSaving}
          />

          {/* Canvas workspace area */}
          <div style={{ flex: 1, position: 'relative', display: 'flex', height: '100%', overflow: 'hidden' }}>
            <CanvasEditor
              ref={editorRef}
              imageSrc={activeProject.imageData || activeProject.originalImage}
              activeTool={activeTool}
              activeColor={activeColor}
              setActiveColor={setActiveColor}
              zoom={zoom}
              setZoom={setZoom}
              pan={pan}
              setPan={setPan}
              showGrid={showGrid}
              onPixelHover={setHoveredPixel}
              onImageLoaded={setImageSize}
            />

            {/* Bottom Floating Info HUD overlay */}
            <div className="viewport-footer-hud">
              <div className="zoom-controls glass">
                <button 
                  className="zoom-btn"
                  onClick={() => setZoom(z => Math.max(0.1, z / 1.2))}
                >
                  -
                </button>
                <input
                  type="range"
                  className="zoom-slider"
                  min="0.1"
                  max="80"
                  step="0.1"
                  value={zoom}
                  onChange={(e) => setZoom(parseFloat(e.target.value))}
                />
                <button 
                  className="zoom-btn"
                  onClick={() => setZoom(z => Math.min(80, z * 1.2))}
                >
                  +
                </button>
                <span className="zoom-percentage">{(zoom * 100).toFixed(0)}%</span>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <ProjectList
          projects={projects}
          onSelectProject={handleSelectProject}
          onDeleteProject={handleDeleteProject}
          onUploadImage={handleUploadImage}
          isLoading={isLoadingProjects}
        />
      )}
    </div>
  );
}

export default App;
