import React, { useRef, useState, useEffect } from 'react';
import { Upload, Trash2, Calendar, LayoutGrid, Image as ImageIcon } from 'lucide-react';

const ProjectList = ({ projects, onSelectProject, onDeleteProject, onUploadImage, isLoading }) => {
  const fileInputRef = useRef(null);
  const [isDragActive, setIsDragActive] = useState(false);

  const handleFile = (file) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      alert('Please upload an image file (PNG, JPG, WebP, etc.)');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target.result;
      
      // Get image dimensions
      const img = new Image();
      img.onload = () => {
        onUploadImage({
          name: file.name.substring(0, file.name.lastIndexOf('.')) || file.name,
          originalImage: dataUrl,
          width: img.width,
          height: img.height,
          totalPixels: img.width * img.height
        });
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragActive(true);
  };

  const handleDragLeave = () => {
    setIsDragActive(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const formatDate = (dateString) => {
    const d = new Date(dateString);
    return d.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="dashboard-container">
      {/* Hero Welcome banner */}
      <div className="welcome-hero">
        <h1>PixelPlay Workspace</h1>
        <p>A precision pixel inspector and editor. Upload any image to examine resolution, zoom into the pixel grid, inspect colors, and paint individual pixels.</p>
      </div>

      {/* Upload Dropzone */}
      <div 
        className="upload-dropzone glass"
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <input 
          type="file" 
          ref={fileInputRef} 
          style={{ display: 'none' }} 
          accept="image/*"
          onChange={(e) => e.target.files && handleFile(e.target.files[0])}
        />
        <div className="upload-icon-container">
          <Upload size={32} />
        </div>
        <p>Drag and drop your image here, or click to browse</p>
        <span>Accepts images of any resolution (PNG, JPG, WebP)</span>
      </div>

      {/* Projects List */}
      <div className="projects-section">
        <div className="section-header">
          <LayoutGrid size={18} />
          <h2>Your Projects</h2>
        </div>

        {isLoading ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: '#64748b' }}>
            Loading saved projects...
          </div>
        ) : projects.length === 0 ? (
          <div className="glass" style={{ textAlign: 'center', padding: '3rem', borderRadius: '12px', border: '1px dashed var(--border-color)' }}>
            <ImageIcon size={40} style={{ color: '#334155', marginBottom: '1rem' }} />
            <p style={{ color: '#64748b' }}>No saved projects yet. Upload an image above to start your first session.</p>
          </div>
        ) : (
          <div className="projects-grid">
            {projects.map((project) => (
              <div 
                key={project._id} 
                className="project-card glass"
                onClick={() => onSelectProject(project._id)}
              >
                <div className="project-card-header">
                  <div className="project-card-title">{project.name}</div>
                  <button 
                    className="btn-icon"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (confirm(`Are you sure you want to delete "${project.name}"?`)) {
                        onDeleteProject(project._id);
                      }
                    }}
                    title="Delete project"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
                <div className="project-card-details">
                  <div>Resolution: {project.width} × {project.height}</div>
                  <div>Pixels: {project.totalPixels.toLocaleString()} px</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', marginTop: '0.5rem', color: '#64748b' }}>
                    <Calendar size={12} />
                    <span>Saved: {formatDate(project.updatedAt)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default ProjectList;
