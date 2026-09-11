import React, { useState, useEffect } from 'react';
import { getTemplateSamplePreview } from '../../services/cardApi';

export default function CardVisualPreview({ templateId = 'school-modern-blue', side = 'front', scale = 1.0, isInteractive = false, isVertical = false }) {
  const [currentSide, setCurrentSide] = useState(side);
  const [htmlContent, setHtmlContent] = useState('');
  const [loading, setLoading] = useState(true);

  // Sync side if prop changes
  useEffect(() => {
    setCurrentSide(side);
  }, [side]);

  // Fetch HTML preview from backend
  useEffect(() => {
    let isMounted = true;
    const fetchPreview = async () => {
      setLoading(true);
      try {
        const html = await getTemplateSamplePreview(templateId, currentSide);
        if (isMounted) {
          setHtmlContent(html);
        }
      } catch (err) {
        console.error("Failed to fetch template preview:", err);
        if (isMounted) {
          setHtmlContent('<div style="color:red; padding: 20px;">Failed to load preview</div>');
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };
    fetchPreview();
    return () => { isMounted = false; };
  }, [templateId, currentSide]);

  // Determine standard CR80 dimensions
  // Horizontal: 85.6mm x 53.98mm -> ratio ~ 1.58
  // Vertical: 53.98mm x 85.6mm
  // We use CSS pixels representing mm * 4 for visual size
  const cardWidth = isVertical ? '216px' : '342px';
  const cardHeight = isVertical ? '342px' : '216px';

  return (
    <div className="relative select-none flex flex-col items-center">
      {/* Interactive Flip Toggle Button (If interactive) */}
      {isInteractive && (
        <div className="mb-2 flex items-center gap-1 bg-slate-900/90 p-1 rounded-xl border border-slate-800 shadow-md">
          <button
            type="button"
            onClick={() => setCurrentSide('front')}
            className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
              currentSide === 'front'
                ? 'bg-cyan-500 text-slate-950 shadow'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Front Side
          </button>
          <button
            type="button"
            onClick={() => setCurrentSide('back')}
            className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
              currentSide === 'back'
                ? 'bg-cyan-500 text-slate-950 shadow'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Back Side
          </button>
        </div>
      )}

      {/* Card Wrapper */}
      <div
        className="rounded-2xl shadow-2xl overflow-hidden border border-slate-700/60 relative transition-transform duration-300 bg-white"
        style={{
          width: cardWidth,
          height: cardHeight,
          transform: `scale(${scale})`,
          transformOrigin: 'top center',
          boxShadow: '0 12px 30px -5px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(255, 255, 255, 0.08)',
        }}
      >
        {loading ? (
          <div className="w-full h-full flex items-center justify-center bg-slate-100">
            <div className="w-6 h-6 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin"></div>
          </div>
        ) : (
          <iframe
            title="Template Preview"
            srcDoc={htmlContent}
            className="w-full h-full border-none"
            style={{ pointerEvents: 'none' }}
          />
        )}
      </div>
    </div>
  );
}

