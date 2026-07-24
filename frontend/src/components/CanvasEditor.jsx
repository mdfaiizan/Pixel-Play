import React, { useRef, useEffect, useState, useImperativeHandle, forwardRef } from 'react';

const CanvasEditor = forwardRef(({
  imageSrc,
  activeTool,
  activeColor,
  setActiveColor,
  zoom,
  setZoom,
  pan,
  setPan,
  showGrid,
  onPixelHover,
  onImageLoaded
}, ref) => {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  
  // Offscreen canvas to hold the original/edited pixel data (source of truth)
  const sourceCanvasRef = useRef(null);
  const sourceCtxRef = useRef(null);

  // States
  const [hoveredPixel, setHoveredPixel] = useState(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 });
  const [contextMenu, setContextMenu] = useState({ visible: false, x: 0, y: 0, hex: '' });

  // Close context menu on global click
  useEffect(() => {
    const closeMenu = () => setContextMenu(prev => prev.visible ? { ...prev, visible: false } : prev);
    window.addEventListener('click', closeMenu);
    return () => window.removeEventListener('click', closeMenu);
  }, []);

  // Undo & Redo stacks
  const undoStackRef = useRef([]);
  const redoStackRef = useRef([]);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  // Expose undo, redo, save, download, and reset handlers to parent
  useImperativeHandle(ref, () => ({
    undo: () => {
      if (undoStackRef.current.length === 0) return;
      const currentImgData = sourceCtxRef.current.getImageData(0, 0, imageSize.width, imageSize.height);
      redoStackRef.current.push(currentImgData);
      
      const previousImgData = undoStackRef.current.pop();
      sourceCtxRef.current.putImageData(previousImgData, 0, 0);
      
      updateHistoryStates();
      draw();
    },
    redo: () => {
      if (redoStackRef.current.length === 0) return;
      const currentImgData = sourceCtxRef.current.getImageData(0, 0, imageSize.width, imageSize.height);
      undoStackRef.current.push(currentImgData);
      
      const nextImgData = redoStackRef.current.pop();
      sourceCtxRef.current.putImageData(nextImgData, 0, 0);
      
      updateHistoryStates();
      draw();
    },
    getImageDataUrl: () => {
      if (!sourceCanvasRef.current) return null;
      return sourceCanvasRef.current.toDataURL('image/png');
    },
    download: (filename = 'pixelplay-edited.png') => {
      if (!sourceCanvasRef.current) return;
      const link = document.createElement('a');
      link.download = filename;
      link.href = sourceCanvasRef.current.toDataURL('image/png');
      link.click();
    },
    resetViewport: () => {
      centerImage();
    },
    canUndo,
    canRedo
  }));

  const updateHistoryStates = () => {
    setCanUndo(undoStackRef.current.length > 0);
    setCanRedo(redoStackRef.current.length > 0);
  };

  const pushToUndoStack = () => {
    if (!sourceCanvasRef.current || !sourceCtxRef.current) return;
    const imgData = sourceCtxRef.current.getImageData(0, 0, imageSize.width, imageSize.height);
    undoStackRef.current.push(imgData);
    
    // Clear redo stack on new action
    redoStackRef.current = [];
    
    // Cap undo stack at 30 items to prevent high memory usage
    if (undoStackRef.current.length > 30) {
      undoStackRef.current.shift();
    }
    updateHistoryStates();
  };

  // Hex to RGBA conversion helper
  const hexToRgb = (hex) => {
    const shorthandRegex = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
    const fullHex = hex.replace(shorthandRegex, (m, r, g, b) => r + r + g + g + b + b);
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(fullHex);
    return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16)
    } : { r: 0, g: 0, b: 0 };
  };

  // Center image inside the viewport container
  const centerImage = () => {
    if (!containerRef.current || imageSize.width === 0) return;
    const containerWidth = containerRef.current.clientWidth;
    const containerHeight = containerRef.current.clientHeight;

    // Determine scale to fit
    const scaleX = (containerWidth - 60) / imageSize.width;
    const scaleY = (containerHeight - 60) / imageSize.height;
    const initialZoom = Math.max(0.1, Math.min(scaleX, scaleY, 15)); // Cap fitting zoom at 15x

    setZoom(initialZoom);
    setPan({
      x: (containerWidth - imageSize.width * initialZoom) / 2,
      y: (containerHeight - imageSize.height * initialZoom) / 2
    });
  };

  // Initialize and load image
  useEffect(() => {
    if (!imageSrc) return;

    const img = new Image();
    // Allow loading cross-origin images safely if needed
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const { width, height } = img;
      setImageSize({ width, height });
      if (onImageLoaded) {
        onImageLoaded({ width, height });
      }

      // Create or configure offscreen source canvas
      const sourceCanvas = document.createElement('canvas');
      sourceCanvas.width = width;
      sourceCanvas.height = height;
      const sourceCtx = sourceCanvas.getContext('2d', { willReadFrequently: true });
      sourceCtx.drawImage(img, 0, 0);

      sourceCanvasRef.current = sourceCanvas;
      sourceCtxRef.current = sourceCtx;

      // Reset undo/redo stacks
      undoStackRef.current = [];
      redoStackRef.current = [];
      setCanUndo(false);
      setCanRedo(false);

      // Trigger center/draw
      setTimeout(() => {
        // Run centering
        const containerWidth = containerRef.current?.clientWidth || 800;
        const containerHeight = containerRef.current?.clientHeight || 600;
        const scaleX = (containerWidth - 60) / width;
        const scaleY = (containerHeight - 60) / height;
        const initialZoom = Math.max(0.1, Math.min(scaleX, scaleY, 15));
        
        setZoom(initialZoom);
        setPan({
          x: (containerWidth - width * initialZoom) / 2,
          y: (containerHeight - height * initialZoom) / 2
        });
      }, 50);
    };
    img.src = imageSrc;
  }, [imageSrc]);

  // Redraw main viewport canvas whenever image properties or pan/zoom changes
  const draw = () => {
    const canvas = canvasRef.current;
    if (!canvas || !sourceCanvasRef.current) return;

    const ctx = canvas.getContext('2d');
    const container = containerRef.current;
    if (!container) return;

    // Resize viewport canvas to container dimensions
    canvas.width = container.clientWidth;
    canvas.height = container.clientHeight;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw the image onto the viewport canvas with pixelated scale styling (non-blurry)
    ctx.imageSmoothingEnabled = false;
    ctx.mozImageSmoothingEnabled = false;
    ctx.webkitImageSmoothingEnabled = false;
    ctx.msImageSmoothingEnabled = false;

    // Draw offscreen source canvas onto viewport canvas
    ctx.drawImage(
      sourceCanvasRef.current,
      pan.x,
      pan.y,
      imageSize.width * zoom,
      imageSize.height * zoom
    );

    // Draw Grid Lines (only when zoomed in enough)
    const showGridThreshold = 8;
    if (zoom >= showGridThreshold && showGrid) {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
      ctx.lineWidth = 0.5;

      const startX = pan.x;
      const startY = pan.y;
      const endX = pan.x + imageSize.width * zoom;
      const endY = pan.y + imageSize.height * zoom;

      // Draw vertical lines
      for (let x = 0; x <= imageSize.width; x++) {
        const lx = startX + x * zoom;
        ctx.beginPath();
        ctx.moveTo(lx, startY);
        ctx.lineTo(lx, endY);
        ctx.stroke();
      }

      // Draw horizontal lines
      for (let y = 0; y <= imageSize.height; y++) {
        const ly = startY + y * zoom;
        ctx.beginPath();
        ctx.moveTo(startX, ly);
        ctx.lineTo(endX, ly);
        ctx.stroke();
      }
    }

    // Highlight hovered pixel
    if (hoveredPixel && zoom >= showGridThreshold) {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(
        pan.x + hoveredPixel.x * zoom,
        pan.y + hoveredPixel.y * zoom,
        zoom,
        zoom
      );
    }
  };

  useEffect(() => {
    draw();
  }, [zoom, pan, imageSize, showGrid, hoveredPixel]);

  // Calculate mouse coordinate relative to canvas image pixels
  const getPixelCoord = (e) => {
    const canvas = canvasRef.current;
    if (!canvas || imageSize.width === 0) return null;

    const rect = canvas.getBoundingClientRect();
    const clientX = e.clientX - rect.left;
    const clientY = e.clientY - rect.top;

    const x = Math.floor((clientX - pan.x) / zoom);
    const y = Math.floor((clientY - pan.y) / zoom);

    if (x >= 0 && x < imageSize.width && y >= 0 && y < imageSize.height) {
      return { x, y };
    }
    return null;
  };

  // Inspect pixel color under mouse
  const inspectPixel = (coord) => {
    if (!coord || !sourceCtxRef.current) {
      onPixelHover(null);
      return;
    }
    
    // Get raw pixel data from the offscreen source canvas
    const pixel = sourceCtxRef.current.getImageData(coord.x, coord.y, 1, 1).data;
    const [r, g, b, a] = pixel;
    
    // Convert to hex
    const componentToHex = (c) => {
      const hex = c.toString(16);
      return hex.length === 1 ? '0' + hex : hex;
    };
    const hex = `#${componentToHex(r)}${componentToHex(g)}${componentToHex(b)}`;

    onPixelHover({
      x: coord.x,
      y: coord.y,
      r,
      g,
      b,
      a: (a / 255).toFixed(2),
      hex
    });
  };

  // Edit single pixel color on offscreen source canvas
  const editPixel = (coord) => {
    if (!coord || !sourceCtxRef.current || !sourceCanvasRef.current) return;
    
    const { r, g, b } = hexToRgb(activeColor);
    
    // Write new pixel color
    const imgData = sourceCtxRef.current.createImageData(1, 1);
    imgData.data[0] = r;
    imgData.data[1] = g;
    imgData.data[2] = b;
    imgData.data[3] = 255; // Solid opacity
    
    sourceCtxRef.current.putImageData(imgData, coord.x, coord.y);
    
    // Refresh inspector data and trigger viewport redraw
    inspectPixel(coord);
    draw();
  };

  // Mouse Handlers
  const handleMouseDown = (e) => {
    const coord = getPixelCoord(e);

    if (activeTool === 'pan' || e.button === 1 || e.button === 2) {
      // Middle or right click, or pan tool: start panning
      setIsPanning(true);
      setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
      e.preventDefault();
    } else if (activeTool === 'pencil' && coord) {
      pushToUndoStack();
      setIsDrawing(true);
      editPixel(coord);
    } else if (activeTool === 'eyedropper' && coord) {
      if (sourceCtxRef.current) {
        const pixel = sourceCtxRef.current.getImageData(coord.x, coord.y, 1, 1).data;
        const [r, g, b] = pixel;
        const rgbToHex = (r, g, b) => '#' + [r, g, b].map(x => {
          const hex = x.toString(16);
          return hex.length === 1 ? '0' + hex : hex;
        }).join('');
        setActiveColor(rgbToHex(r, g, b));
      }
    }
  };

  const handleMouseMove = (e) => {
    const coord = getPixelCoord(e);
    setHoveredPixel(coord);
    inspectPixel(coord);

    if (isPanning) {
      setPan({
        x: e.clientX - panStart.x,
        y: e.clientY - panStart.y
      });
    } else if (isDrawing && coord && activeTool === 'pencil') {
      // Draw pixel if mouse is down and moving over different pixels
      editPixel(coord);
    }
  };

  const handleMouseUp = () => {
    setIsPanning(false);
    setIsDrawing(false);
  };

  const handleMouseLeave = () => {
    setIsPanning(false);
    setIsDrawing(false);
    setHoveredPixel(null);
    onPixelHover(null);
  };

  // Zoom centered around mouse wheel cursor
  const handleWheel = (e) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const zoomStep = 1.15;
    let newZoom = e.deltaY < 0 ? zoom * zoomStep : zoom / zoomStep;

    // Clamp zoom level (0.1x to 100x)
    newZoom = Math.min(Math.max(newZoom, 0.1), 100);

    // Pivot pan position relative to cursor zoom
    const newPanX = mouseX - (mouseX - pan.x) * (newZoom / zoom);
    const newPanY = mouseY - (mouseY - pan.y) * (newZoom / zoom);

    setZoom(newZoom);
    setPan({ x: newPanX, y: newPanY });
  };

  // Right-click to show custom context menu
  const handleContextMenu = (e) => {
    e.preventDefault(); // Prevent standard browser menu
    
    const coord = getPixelCoord(e);
    if (coord && sourceCtxRef.current) {
      // Get pixel data (RGBA) from offscreen canvas at clicked coordinate
      const pixel = sourceCtxRef.current.getImageData(coord.x, coord.y, 1, 1).data;
      const [r, g, b] = pixel;
      
      // Convert RGB values to Hex code string
      const rgbToHex = (r, g, b) => '#' + [r, g, b].map(x => {
        const hex = x.toString(16);
        return hex.length === 1 ? '0' + hex : hex;
      }).join('');
      
      const hexColor = rgbToHex(r, g, b).toUpperCase();
      
      setContextMenu({
        visible: true,
        x: e.clientX,
        y: e.clientY,
        hex: hexColor
      });
    }
  };

  return (
    <div 
      className="canvas-viewport" 
      ref={containerRef}
      onWheel={handleWheel}
      onContextMenu={handleContextMenu}
    >
      <canvas
        ref={canvasRef}
        className={`viewport-canvas-container ${activeTool === 'pan' ? 'pan-mode' : ''}`}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
      />

      {/* Custom Context Menu Option */}
      {contextMenu.visible && (
        <div 
          className="glass"
          style={{
            position: 'fixed',
            top: `${contextMenu.y}px`,
            left: `${contextMenu.x}px`,
            zIndex: 1000,
            borderRadius: '8px',
            padding: '4px',
            boxShadow: '0 10px 25px rgba(0, 0, 0, 0.5)',
            minWidth: '160px',
            border: '1px solid var(--border-color)',
            animation: 'fadeIn 0.15s ease-out'
          }}
        >
          <button
            type="button"
            onClick={() => {
              navigator.clipboard.writeText(contextMenu.hex)
                .then(() => {
                  alert(`Copied Hex Color: ${contextMenu.hex}`);
                })
                .catch(err => console.error('Failed to copy: ', err));
              setContextMenu(prev => ({ ...prev, visible: false }));
            }}
            style={{
              display: 'block',
              width: '100%',
              padding: '8px 12px',
              background: 'transparent',
              border: 'none',
              color: '#fff',
              textAlign: 'left',
              fontSize: '0.85rem',
              fontWeight: '500',
              borderRadius: '6px',
              cursor: 'pointer',
              transition: 'background 0.2s'
            }}
            onMouseOver={(e) => {
              e.target.style.background = 'rgba(59, 130, 246, 0.18)';
            }}
            onMouseOut={(e) => {
              e.target.style.background = 'transparent';
            }}
          >
            Copy Hex Color ({contextMenu.hex})
          </button>
        </div>
      )}
    </div>
  );
});

CanvasEditor.displayName = 'CanvasEditor';

export default CanvasEditor;
