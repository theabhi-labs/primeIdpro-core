/**
 * Utility to convert between Fabric.js state and PrimeIdPro V2 Semantic Schema.
 * DO NOT store raw fabric JSON in the database.
 */

// Generate a random stable ID for elements
export const generateElementId = () => {
  return 'el_' + Math.random().toString(36).substr(2, 9);
};

export const serializeTemplate = (fabricCanvas, templateMeta) => {
  if (!fabricCanvas) return null;

  const objects = fabricCanvas.getObjects();
  
  const elements = objects
    .filter(obj => !obj.isGridLine && obj.id !== 'card-boundary')
    .map((obj, index) => {
      const el = serializeElement(obj);
      el.z_index = index;
      return el;
    });

  return {
    ...templateMeta,
    elements: elements,
    schema_version: templateMeta.schema_version || 1,
  };
};

const serializeElement = (obj) => {
  const base = {
    id: obj.id || generateElementId(),
    type: obj.semanticType || obj.type, // Map fabric type to semantic type
    x: obj.left,
    y: obj.top,
    width: obj.width * obj.scaleX,
    height: obj.height * obj.scaleY,
    rotation: obj.angle || 0,
    z_index: obj.zIndex || 0,
    visible: obj.visible !== false,
    locked: obj.lockMovementX === true,
    opacity: obj.opacity !== undefined ? obj.opacity : 1,
    bind: obj.bind || null,
    style: {},
    metadata: {}
  };

  if (base.type === 'text') {
    base.static_text = obj.text || "";
    base.style = {
      fontFamily: obj.fontFamily,
      fontSize: obj.fontSize,
      fontWeight: obj.fontWeight,
      fontStyle: obj.fontStyle,
      textAlign: obj.textAlign,
      color: obj.fill,
    };
  } else if (base.type === 'image') {
    // image is a placeholder
    base.style = {
      fit: obj.fit || 'contain',
    };
  } else if (base.type === 'rect') {
    base.style = {
      fill: obj.fill,
      stroke: obj.stroke,
      strokeWidth: obj.strokeWidth,
    };
  } else if (base.type === 'circle') {
    base.style = {
      fill: obj.fill,
      stroke: obj.stroke,
      strokeWidth: obj.strokeWidth,
    };
  } else if (base.type === 'line') {
    base.style = {
      stroke: obj.stroke,
      strokeWidth: obj.strokeWidth,
    };
  }

  return base;
};


export const deserializeTemplate = (templateSchema) => {
  // Returns an array of options suitable for fabric canvas initialization
  if (!templateSchema || !templateSchema.elements) return [];

  return templateSchema.elements.map(el => deserializeElement(el)).sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0));
};

const deserializeElement = (el) => {
  const common = {
    id: el.id,
    semanticType: el.type,
    left: el.x,
    top: el.y,
    width: el.width,
    height: el.height,
    angle: el.rotation,
    zIndex: el.z_index,
    visible: el.visible,
    opacity: el.opacity !== undefined ? el.opacity : 1,
    bind: el.bind,
    lockMovementX: el.locked,
    lockMovementY: el.locked,
    lockRotation: el.locked,
    lockScalingX: el.locked,
    lockScalingY: el.locked,
  };

  if (el.type === 'text') {
    return {
      ...common,
      type: 'text', // fabric type
      text: el.static_text || (el.bind ? `[${el.bind}]` : 'Text'),
      fontFamily: el.style?.fontFamily || 'Arial',
      fontSize: el.style?.fontSize || 20,
      fontWeight: el.style?.fontWeight || 'normal',
      fontStyle: el.style?.fontStyle || 'normal',
      textAlign: el.style?.textAlign || 'left',
      fill: el.style?.color || '#000000',
    };
  } else if (el.type === 'image') {
    return {
      ...common,
      type: 'rect', // We render image placeholders as rects for now in canvas
      fill: '#e2e8f0', // slate-200
      stroke: '#94a3b8',
      strokeWidth: 2,
      strokeDashArray: [5, 5],
      fit: el.style?.fit || 'contain',
    };
  } else if (el.type === 'rect') {
    return {
      ...common,
      type: 'rect',
      fill: el.style?.fill || '#cccccc',
      stroke: el.style?.stroke || null,
      strokeWidth: el.style?.strokeWidth || 0,
    };
  } else if (el.type === 'circle') {
    // Fabric circle uses radius
    return {
      ...common,
      type: 'circle',
      radius: el.width / 2, // approximation
      fill: el.style?.fill || '#cccccc',
      stroke: el.style?.stroke || null,
      strokeWidth: el.style?.strokeWidth || 0,
    };
  } else if (el.type === 'line') {
    return {
      ...common,
      type: 'rect', // fallback for easy resizing
      fill: el.style?.stroke || '#000000',
      height: el.style?.strokeWidth || 2, // actual height is stroke
    };
  }

  return common;
};
