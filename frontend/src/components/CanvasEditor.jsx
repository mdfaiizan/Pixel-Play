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
  onImageLoaded,
  onCopiedBufferChange
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
  const [contextMenu, setContextMenu] = useState({ visible: false, x: 0, y: 0, hex: '', targetCoord: null });

  // Box Selection States & Copied Buffer
  const [selectionStart, setSelectionStart] = useState(null);
  const [selectionRect, setSelectionRect] = useState(null);
  const [isSelecting, setIsSelecting] = useState(false);
  const [copiedPixels, setCopiedPixels] = useState(null);

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

  // Copy selected area of pixels to buffer
  const copySelection = (targetRect = selectionRect) => {
    if (!targetRect || !sourceCtxRef.current) return null;
    const { x, y, width, height } = targetRect;
    if (width <= 0 || height <= 0) return null;

    const imageData = sourceCtxRef.current.getImageData(x, y, width, height);
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = width;
    tempCanvas.height = height;
    const tempCtx = tempCanvas.getContext('2d');
    tempCtx.putImageData(imageData, 0, 0);

    const bufferObj = {
      width,
      height,
      imageData,
      tempCanvas
    };

    setCopiedPixels(bufferObj);
    if (onCopiedBufferChange) {
      onCopiedBufferChange({ width, height });
    }
    return bufferObj;
  };

  // Paste copied pixel buffer onto source canvas starting at target pixel coordinate
  const pasteCopiedPixels = (targetCoord, bufferToPaste = copiedPixels) => {
    if (!targetCoord || !bufferToPaste || !sourceCtxRef.current || !sourceCanvasRef.current) return;

    pushToUndoStack();

    const { width: srcW, height: srcH, imageData: srcImageData } = bufferToPaste;
    const destImageData = sourceCtxRef.current.getImageData(0, 0, imageSize.width, imageSize.height);

    const srcData = srcImageData.data;
    const destData = destImageData.data;

    // Direct pixel-for-pixel copy into target destination starting at targetCoord
    for (let sy = 0; sy < srcH; sy++) {
      const dy = targetCoord.y + sy;
      if (dy < 0 || dy >= imageSize.height) continue;

      for (let sx = 0; sx < srcW; sx++) {
        const dx = targetCoord.x + sx;
        if (dx < 0 || dx >= imageSize.width) continue;

        const srcIdx = (sy * srcW + sx) * 4;
        const destIdx = (dy * imageSize.width + dx) * 4;

        destData[destIdx]     = srcData[srcIdx];     // Red
        destData[destIdx + 1] = srcData[srcIdx + 1]; // Green
        destData[destIdx + 2] = srcData[srcIdx + 2]; // Blue
        destData[destIdx + 3] = srcData[srcIdx + 3]; // Alpha
      }
    }

    // Write exact pixel buffer back to offscreen source canvas
    sourceCtxRef.current.putImageData(destImageData, 0, 0);

    // Update selection box outline so it highlights the newly pasted pixels at targetCoord
    const newPastedRect = {
      x: targetCoord.x,
      y: targetCoord.y,
      width: srcW,
      height: srcH
    };
    setSelectionRect(newPastedRect);

    // Redraw main viewport canvas
    draw();
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

    // Highlight selected pixel box rectangle
    if (selectionRect) {
      ctx.save();
      const rectX = pan.x + selectionRect.x * zoom;
      const rectY = pan.y + selectionRect.y * zoom;
      const rectW = selectionRect.width * zoom;
      const rectH = selectionRect.height * zoom;

      ctx.fillStyle = 'rgba(59, 130, 246, 0.25)';
      ctx.fillRect(rectX, rectY, rectW, rectH);

      ctx.strokeStyle = '#3b82f6';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.strokeRect(rectX, rectY, rectW, rectH);
      ctx.restore();
    }
  };

  useEffect(() => {
    draw();
  }, [zoom, pan, imageSize, showGrid, hoveredPixel, selectionRect]);

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

    if (e.button === 1 || e.button === 2) {
      // Middle or right click
      if (activeTool === 'pan' || e.button === 1) {
        setIsPanning(true);
        setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
        e.preventDefault();
      }
    } else if (activeTool === 'pan') {
      setIsPanning(true);
      setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    } else if (activeTool === 'select' && coord) {
      setIsSelecting(true);
      setSelectionStart(coord);
      const initialRect = { x: coord.x, y: coord.y, width: 1, height: 1 };
      setSelectionRect(initialRect);
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
    } else if (isSelecting && activeTool === 'select' && coord && selectionStart) {
      const minX = Math.min(selectionStart.x, coord.x);
      const maxX = Math.max(selectionStart.x, coord.x);
      const minY = Math.min(selectionStart.y, coord.y);
      const maxY = Math.max(selectionStart.y, coord.y);

      const nextRect = {
        x: minX,
        y: minY,
        width: maxX - minX + 1,
        height: maxY - minY + 1
      };
      setSelectionRect(nextRect);
    } else if (isDrawing && coord && activeTool === 'pencil') {
      // Draw pixel if mouse is down and moving over different pixels
      editPixel(coord);
    }
  };

  const handleMouseUp = () => {
    if (isSelecting && selectionRect) {
      // Auto-copy only if a multi-pixel region was dragged (width > 1 or height > 1)
      if (selectionRect.width > 1 || selectionRect.height > 1) {
        copySelection(selectionRect);
      }
    }
    setIsPanning(false);
    setIsDrawing(false);
    setIsSelecting(false);
  };

  const handleMouseLeave = () => {
    if (isSelecting && selectionRect) {
      if (selectionRect.width > 1 || selectionRect.height > 1) {
        copySelection(selectionRect);
      }
    }
    setIsPanning(false);
    setIsDrawing(false);
    setIsSelecting(false);
    setHoveredPixel(null);
    onPixelHover(null);
  };

  // Global keyboard shortcuts for Ctrl+C, Ctrl+V, Esc
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'c' || e.key === 'C')) {
        if (selectionRect) {
          copySelection(selectionRect);
        }
      } else if ((e.ctrlKey || e.metaKey) && (e.key === 'v' || e.key === 'V')) {
        if (copiedPixels) {
          const target = hoveredPixel || contextMenu.targetCoord || { x: 0, y: 0 };
          pasteCopiedPixels(target);
        }
      } else if (e.key === 'Escape') {
        setSelectionRect(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectionRect, copiedPixels, hoveredPixel, contextMenu]);

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
        hex: hexColor,
        targetCoord: coord
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
            minWidth: '180px',
            border: '1px solid var(--border-color)',
            animation: 'fadeIn 0.15s ease-out'
          }}
        >
          {selectionRect && (
            <button
              type="button"
              onClick={() => {
                copySelection(selectionRect);
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
                transition: 'background 0.2s',
                marginBottom: '2px'
              }}
              onMouseOver={(e) => {
                e.target.style.background = 'rgba(59, 130, 246, 0.18)';
              }}
              onMouseOut={(e) => {
                e.target.style.background = 'transparent';
              }}
            >
              Copy Selected Pixels ({selectionRect.width} × {selectionRect.height} px)
            </button>
          )}

          {copiedPixels && contextMenu.targetCoord && (
            <button
              type="button"
              onClick={() => {
                pasteCopiedPixels(contextMenu.targetCoord);
                setContextMenu(prev => ({ ...prev, visible: false }));
              }}
              style={{
                display: 'block',
                width: '100%',
                padding: '8px 12px',
                background: 'transparent',
                border: 'none',
                color: '#3b82f6',
                textAlign: 'left',
                fontSize: '0.85rem',
                fontWeight: '600',
                borderRadius: '6px',
                cursor: 'pointer',
                transition: 'background 0.2s',
                marginBottom: '2px'
              }}
              onMouseOver={(e) => {
                e.target.style.background = 'rgba(59, 130, 246, 0.18)';
              }}
              onMouseOut={(e) => {
                e.target.style.background = 'transparent';
              }}
            >
              Paste Copied Pixels ({copiedPixels.width} × {copiedPixels.height} px at X:{contextMenu.targetCoord.x}, Y:{contextMenu.targetCoord.y})
            </button>
          )}

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
