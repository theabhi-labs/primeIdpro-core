import React, { useEffect, useRef, useState } from 'react';
import { fabric } from 'fabric';

const CanvasWorkspace = ({ 
  elements, 
  cardDimensions, 
  onElementSelect, 
  onCanvasChange, 
  gridEnabled = false,
  snapEnabled = false,
  zoomLevel = 1
}) => {
  const canvasContainerRef = useRef(null);
  const canvasRef = useRef(null);
  const fabricRef = useRef(null);
  const isInitializing = useRef(true);

  // Initialize Fabric.js
  useEffect(() => {
    if (!canvasRef.current || !canvasContainerRef.current) return;

    // We make the canvas large enough to hold the workspace, zooming handles the rest
    const containerWidth = canvasContainerRef.current.clientWidth;
    const containerHeight = canvasContainerRef.current.clientHeight;

    const fabricCanvas = new fabric.Canvas(canvasRef.current, {
      width: containerWidth,
      height: containerHeight,
      backgroundColor: '#f1f5f9', // slate-100 backdrop
      preserveObjectStacking: true,
      selection: true,
    });

    fabricRef.current = fabricCanvas;

    // Draw the card boundary (clip path or background rect)
    const cardRect = new fabric.Rect({
      left: (containerWidth - cardDimensions.width) / 2,
      top: (containerHeight - cardDimensions.height) / 2,
      width: cardDimensions.width,
      height: cardDimensions.height,
      fill: '#ffffff',
      selectable: false,
      evented: false,
      id: 'card-boundary',
      shadow: new fabric.Shadow({
        color: 'rgba(0,0,0,0.1)',
        blur: 10,
        offsetX: 0,
        offsetY: 5
      })
    });
    
    // Grid Lines
    if (gridEnabled) {
       const gridSize = 20;
       for (let i = 0; i < (containerWidth / gridSize); i++) {
         fabricCanvas.add(new fabric.Line([ i * gridSize, 0, i * gridSize, containerHeight], { stroke: '#e2e8f0', selectable: false, isGridLine: true }));
       }
       for (let i = 0; i < (containerHeight / gridSize); i++) {
         fabricCanvas.add(new fabric.Line([ 0, i * gridSize, containerWidth, i * gridSize], { stroke: '#e2e8f0', selectable: false, isGridLine: true }));
       }
    }

    fabricCanvas.add(cardRect);
    fabricCanvas.sendToBack(cardRect);

    // Event Listeners
    fabricCanvas.on('selection:created', (e) => handleSelection(e));
    fabricCanvas.on('selection:updated', (e) => handleSelection(e));
    fabricCanvas.on('selection:cleared', () => onElementSelect(null));

    fabricCanvas.on('object:modified', (e) => {
      if (!isInitializing.current) onCanvasChange(fabricCanvas);
    });

    fabricCanvas.on('object:moving', (e) => {
      if (snapEnabled) {
         const obj = e.target;
         obj.set({
           left: Math.round(obj.left / 10) * 10,
           top: Math.round(obj.top / 10) * 10
         });
      }
    });

    // Cleanup
    return () => {
      fabricCanvas.dispose();
      fabricRef.current = null;
    };
  }, [cardDimensions.width, cardDimensions.height, gridEnabled]);

  // Handle Zoom
  useEffect(() => {
     if (fabricRef.current) {
        fabricRef.current.setZoom(zoomLevel);
     }
  }, [zoomLevel]);

  // Load Elements
  useEffect(() => {
    if (!fabricRef.current || !elements) return;
    
    isInitializing.current = true;
    
    const canvas = fabricRef.current;
    
    // Clear existing objects EXCEPT boundary and grid
    const objects = canvas.getObjects();
    objects.forEach(obj => {
       if (obj.id !== 'card-boundary' && !obj.isGridLine) {
          canvas.remove(obj);
       }
    });

    // Add new elements
    const cardBoundary = objects.find(o => o.id === 'card-boundary');
    const offsetX = cardBoundary ? cardBoundary.left : 0;
    const offsetY = cardBoundary ? cardBoundary.top : 0;

    elements.forEach(el => {
      let fabricObj;
      const options = {
         ...el,
         left: offsetX + el.left,
         top: offsetY + el.top,
      };

      if (el.type === 'text') {
        fabricObj = new fabric.IText(el.text, options);
      } else if (el.type === 'rect') {
        fabricObj = new fabric.Rect(options);
      } else if (el.type === 'circle') {
        fabricObj = new fabric.Circle(options);
      }

      if (fabricObj) {
         canvas.add(fabricObj);
      }
    });
    
    canvas.renderAll();
    
    isInitializing.current = false;
  }, [elements]);

  const handleSelection = (e) => {
    if (e.selected && e.selected.length === 1) {
       onElementSelect(e.selected[0]);
    } else {
       onElementSelect(null);
    }
  };

  return (
    <div ref={canvasContainerRef} className="w-full h-full overflow-hidden relative bg-slate-200">
      <canvas ref={canvasRef} />
    </div>
  );
};

export default CanvasWorkspace;
