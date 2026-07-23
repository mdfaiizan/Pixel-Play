import React from 'react';
import { Pencil, Pipette, Hand, Undo, Redo, Save, Download, Maximize2, Grid } from 'lucide-react';

const PALETTE = [
  '#ffffff', '#e2e8f0', '#94a3b8', '#475569', '#1e293b', '#000000',
  '#ef4444', '#f97316', '#f59e0b', '#10b981', '#06b6d4', '#3b82f6',
  '#6366f1', '#8b5cf6', '#d946ef', '#ec4899', '#f43f5e', '#a855f7'
];

const Toolbar = ({
  activeTool,
  setActiveTool,
  activeColor,
  setActiveColor,
  showGrid,
  setShowGrid,
  hoveredPixel,
  imageSize,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  onSave,
  onDownload,
  onResetView,
  isSaving
}) => {
  return (
    <aside className="editor-sidebar glass">
      {/* 1. Tools Section */}
      <div className="sidebar-section">
        <h3 className="sidebar-section-title">Tools</h3>
        <div className="tool-grid">
          <button 
            className={`tool-button ${activeTool === 'pencil' ? 'active' : ''}`}
            onClick={() => setActiveTool('pencil')}
            title="Pencil (Draw color on click/drag)"
          >
            <Pencil size={18} />
            <span>Pencil</span>
          </button>
          
          <button 
            className={`tool-button ${activeTool === 'eyedropper' ? 'active' : ''}`}
            onClick={() => setActiveTool('eyedropper')}
            title="Eyedropper (Pick color from canvas)"
          >
            <Pipette size={18} />
            <span>Color Pick</span>
          </button>
          
          <button 
            className={`tool-button ${activeTool === 'pan' ? 'active' : ''}`}
            onClick={() => setActiveTool('pan')}
            title="Pan (Drag canvas to navigate)"
          >
            <Hand size={18} />
            <span>Pan</span>
          </button>
        </div>
      </div>

      {/* 2. Color Palette Section */}
      <div className="sidebar-section">
        <h3 className="sidebar-section-title">Color Palette</h3>
        <div className="color-picker-container">
          <div className="color-palette">
            {PALETTE.map((color) => (
              <div
                key={color}
                className={`color-swatch ${activeColor.toLowerCase() === color.toLowerCase() ? 'active' : ''}`}
                style={{ backgroundColor: color }}
                onClick={() => {
                  setActiveColor(color);
                  if (activeTool !== 'pencil') setActiveTool('pencil');
                }}
              />
            ))}
          </div>
          
          <div className="custom-color-input">
            <input
              type="color"
              className="color-input-picker"
              value={activeColor}
              onChange={(e) => {
                setActiveColor(e.target.value);
                if (activeTool !== 'pencil') setActiveTool('pencil');
              }}
            />
            <input
              type="text"
              className="color-hex-text"
              value={activeColor.toUpperCase()}
              onChange={(e) => {
                const val = e.target.value;
                if (/^#[0-9A-F]{6}$/i.test(val)) {
                  setActiveColor(val);
                } else if (val.length <= 7) {
                  setActiveColor(val); // Allow editing intermediate text
                }
              }}
            />
          </div>
        </div>
      </div>

      {/* 3. Grid & Actions Toggle */}
      <div className="sidebar-section">
        <h3 className="sidebar-section-title">Viewport</h3>
        <div className="history-controls" style={{ marginBottom: '0.75rem' }}>
          <button 
            className={`history-btn ${showGrid ? 'active' : ''}`}
            onClick={() => setShowGrid(!showGrid)}
            style={{ 
              backgroundColor: showGrid ? 'rgba(59, 130, 246, 0.12)' : '',
              borderColor: showGrid ? 'var(--primary)' : ''
            }}
          >
            <Grid size={16} />
            <span>{showGrid ? 'Grid On' : 'Grid Off'}</span>
          </button>
          
          <button className="history-btn" onClick={onResetView}>
            <Maximize2 size={16} />
            <span>Fit View</span>
          </button>
        </div>
        
        <div className="history-controls">
          <button 
            className="history-btn" 
            onClick={onUndo} 
            disabled={!canUndo}
            title="Undo (Ctrl+Z)"
          >
            <Undo size={16} />
            <span>Undo</span>
          </button>
          <button 
            className="history-btn" 
            onClick={onRedo} 
            disabled={!canRedo}
            title="Redo (Ctrl+Y)"
          >
            <Redo size={16} />
            <span>Redo</span>
          </button>
        </div>
      </div>

      {/* 4. Pixel Inspector Section */}
      <div className="sidebar-section">
        <h3 className="sidebar-section-title">Pixel Properties</h3>
        {hoveredPixel ? (
          <div className="inspector-hud">
            <div className="hud-item">
              <span className="info-label">Coordinate</span>
              <span className="info-value">X:{hoveredPixel.x}, Y:{hoveredPixel.y}</span>
            </div>
            <div className="hud-item">
              <span className="info-label">Hex Color</span>
              <span className="info-value">{hoveredPixel.hex}</span>
            </div>
            <div className="hud-item" style={{ alignItems: 'center' }}>
              <span className="info-label">Color Preview</span>
              <span 
                className="color-preview-block" 
                style={{ backgroundColor: hoveredPixel.hex }} 
              />
            </div>
            <div className="hud-item">
              <span className="info-label">RGBA Color</span>
              <span className="info-value">({hoveredPixel.r}, {hoveredPixel.g}, {hoveredPixel.b}, {hoveredPixel.a})</span>
            </div>
          </div>
        ) : (
          <div className="inspector-hud" style={{ alignItems: 'center', justifyContent: 'center', height: '110px' }}>
            <span style={{ fontSize: '0.8rem', color: '#64748b', textAlign: 'center' }}>
              Hover over image pixels to inspect properties
            </span>
          </div>
        )}
      </div>

      {/* 5. Image Info Section */}
      <div className="sidebar-section">
        <h3 className="sidebar-section-title">Image Info</h3>
        <div className="info-table">
          <div className="info-row">
            <span className="info-label">Resolution</span>
            <span className="info-value">{imageSize.width} × {imageSize.height}</span>
          </div>
          <div className="info-row">
            <span className="info-label">Total Pixels</span>
            <span className="info-value">{(imageSize.width * imageSize.height).toLocaleString()} px</span>
          </div>
        </div>
      </div>

      {/* 6. Save & Download actions */}
      <div className="sidebar-section" style={{ borderBottom: 'none', marginTop: 'auto' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <button 
            className="btn-primary" 
            style={{ width: '100%', justifyContent: 'center' }} 
            onClick={onSave}
            disabled={isSaving}
          >
            <Save size={18} />
            <span>{isSaving ? 'Saving...' : 'Save Workspace'}</span>
          </button>
          
          <button 
            className="btn-secondary" 
            style={{ width: '100%', justifyContent: 'center' }}
            onClick={onDownload}
          >
            <Download size={18} />
            <span>Download PNG</span>
          </button>
        </div>
      </div>
    </aside>
  );
};

export default Toolbar;
