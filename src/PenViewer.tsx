import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { resolveLayout } from './layout';
import { parseNodeTree } from './parser';
import { resetDefCounter, RenderNode } from './renderers/nodes';
import type { ResolvedNode } from './types';

interface PenViewerProps {
  data: unknown[];
  width?: number;
  height?: number;
  className?: string;
  style?: React.CSSProperties;
  showToolbar?: boolean;
}

function computeBounds(nodes: ResolvedNode[]) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  function walk(node: ResolvedNode) {
    minX = Math.min(minX, node.resolvedX);
    minY = Math.min(minY, node.resolvedY);
    maxX = Math.max(maxX, node.resolvedX + node.resolvedWidth);
    maxY = Math.max(maxY, node.resolvedY + node.resolvedHeight);
    node.children?.forEach(walk);
  }
  for (const n of nodes) walk(n);
  if (!isFinite(minX)) return { minX: 0, minY: 0, maxX: 100, maxY: 100 };
  return { minX, minY, maxX, maxY };
}

const ZOOM_PRESETS: { label: string; value: number | 'fit'; shortcut?: string }[] = [
  { label: 'Zoom to fit', value: 'fit', shortcut: '1' },
  { label: 'Zoom to 50%', value: 0.5 },
  { label: 'Zoom to 100%', value: 1, shortcut: '0' },
  { label: 'Zoom to 200%', value: 2 },
];

export function PenViewer({
  data, width = 1440, height = 900, className, style, showToolbar = true,
}: PenViewerProps) {
  const [zoom, setZoom] = useState(1);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const [showZoomMenu, setShowZoomMenu] = useState(false);
  const dragging = useRef(false);
  const lastMouse = useRef({ x: 0, y: 0 });
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const resolved = useMemo(() => {
    resetDefCounter();
    return parseNodeTree(data).map((n) => resolveLayout(n, 0, 0, width, height));
  }, [data, width, height]);

  const bounds = useMemo(() => computeBounds(resolved), [resolved]);
  const contentW = bounds.maxX - bounds.minX;
  const contentH = bounds.maxY - bounds.minY;
  const pad = 40;
  const vb = `${bounds.minX - pad} ${bounds.minY - pad} ${contentW + pad * 2} ${contentH + pad * 2}`;

  const fitToScreen = useCallback(() => {
    setZoom(1);
    setPanX(0);
    setPanY(0);
  }, []);

  const setZoomTo = useCallback((v: number | 'fit') => {
    if (v === 'fit') { fitToScreen(); }
    else { setZoom(v); setPanX(0); setPanY(0); }
    setShowZoomMenu(false);
  }, [fitToScreen]);

  // Mouse pan
  const onMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    dragging.current = true;
    lastMouse.current = { x: e.clientX, y: e.clientY };
    e.preventDefault();
  }, []);

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragging.current) return;
    const dx = e.clientX - lastMouse.current.x;
    const dy = e.clientY - lastMouse.current.y;
    setPanX((p) => p + dx);
    setPanY((p) => p + dy);
    lastMouse.current = { x: e.clientX, y: e.clientY };
  }, []);

  const onMouseUp = useCallback(() => { dragging.current = false; }, []);

  // Scroll zoom
  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const factor = e.deltaY > 0 ? 0.92 : 1.08;
    setZoom((z) => Math.max(0.05, Math.min(20, z * factor)));
  }, []);

  // Double-click zoom
  const onDoubleClick = useCallback(() => {
    setZoom((z) => Math.min(20, z * 1.5));
  }, []);

  // Keyboard shortcuts — scoped to when viewer container has focus
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
      if (!containerRef.current?.contains(document.activeElement) && document.activeElement !== document.body) return;
      if (e.key === 'Escape' && fullscreen) setFullscreen(false);
      if (e.key === '1' && !e.metaKey && !e.ctrlKey) fitToScreen();
      if (e.key === '0' && !e.metaKey && !e.ctrlKey) { setZoom(1); setPanX(0); setPanY(0); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [fullscreen, fitToScreen]);

  // Export PNG
  const exportPNG = useCallback(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const clone = svg.cloneNode(true) as SVGSVGElement;
    clone.setAttribute('width', String((contentW + pad * 2) * 2));
    clone.setAttribute('height', String((contentH + pad * 2) * 2));
    const svgStr = new XMLSerializer().serializeToString(clone);
    const blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = (contentW + pad * 2) * 2;
      canvas.height = (contentH + pad * 2) * 2;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#0a0a0a';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      }
      URL.revokeObjectURL(url);
      canvas.toBlob((b) => {
        if (!b) return;
        const a = document.createElement('a');
        a.download = 'pencil-export.png';
        a.href = URL.createObjectURL(b);
        a.click();
        URL.revokeObjectURL(a.href);
      }, 'image/png');
    };
    img.crossOrigin = 'anonymous';
    img.src = url;
  }, [contentW, contentH, pad]);

  // Export SVG
  const exportSVG = useCallback(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const clone = svg.cloneNode(true) as SVGSVGElement;
    clone.setAttribute('width', String(contentW + pad * 2));
    clone.setAttribute('height', String(contentH + pad * 2));
    const str = new XMLSerializer().serializeToString(clone);
    const blob = new Blob([str], { type: 'image/svg+xml;charset=utf-8' });
    const a = document.createElement('a');
    a.download = 'pencil-export.svg';
    a.href = URL.createObjectURL(blob);
    a.click();
    URL.revokeObjectURL(a.href);
  }, [contentW, contentH, pad]);

  const wrapStyle: React.CSSProperties = fullscreen
    ? { position: 'fixed', inset: 0, zIndex: 9999, background: '#0a0a0a', display: 'flex', flexDirection: 'column' }
    : { position: 'relative', display: 'flex', flexDirection: 'column', ...style };

  return (
    <div ref={containerRef} className={className} style={wrapStyle}>
      {/* Canvas area */}
      <div
        style={{ flex: 1, overflow: 'hidden', cursor: dragging.current ? 'grabbing' : 'grab', position: 'relative' }}
        onWheel={onWheel}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
        onDoubleClick={onDoubleClick}
      >
        <div style={{
          transform: `translate(${panX}px, ${panY}px) scale(${zoom})`,
          transformOrigin: 'center center',
          width: '100%', height: '100%',
          willChange: 'transform',
        }}>
          <svg ref={svgRef} viewBox={vb} width="100%" height="100%"
            xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
            {resolved.map((node) => <RenderNode key={node.id} node={node} />)}
          </svg>
        </div>
      </div>

      {/* Floating bottom toolbar — Pencil/Figma style */}
      {showToolbar && (
        <div style={{
          position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)',
          display: 'flex', alignItems: 'center', gap: 1,
          background: '#1a1a1a', borderRadius: 12, border: '1px solid #2a2a2a',
          padding: '4px 4px', boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
          zIndex: 10,
        }}>
          {/* Zoom out */}
          <button type="button" onClick={() => setZoom((z) => Math.max(0.05, z * 0.7))}
            style={btnStyle} onMouseEnter={hoverIn} onMouseLeave={hoverOut} title="Zoom out">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
          </button>

          {/* Zoom percentage — clickable for presets menu */}
          <div style={{ position: 'relative' }}>
            <button type="button" onClick={() => setShowZoomMenu(!showZoomMenu)}
              style={{ ...btnStyle, width: 'auto', padding: '0 10px', fontSize: 12, fontWeight: 500, fontVariantNumeric: 'tabular-nums', minWidth: 52 }}
              onMouseEnter={hoverIn} onMouseLeave={hoverOut}>
              {Math.round(zoom * 100)}%
            </button>

            {/* Zoom presets dropdown */}
            {showZoomMenu && (
              <div style={{
                position: 'absolute', bottom: 40, left: '50%', transform: 'translateX(-50%)',
                background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 10,
                padding: '4px', minWidth: 160, boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
              }}>
                {ZOOM_PRESETS.map((p) => (
                  <button key={p.label} type="button"
                    onClick={() => setZoomTo(p.value)}
                    style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%',
                      padding: '8px 12px', background: 'none', border: 'none', color: '#ccc',
                      fontSize: 13, cursor: 'pointer', borderRadius: 6, textAlign: 'left',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = '#2a2a2a'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; }}>
                    <span>{p.label}</span>
                    {p.shortcut && (
                      <span style={{ fontSize: 11, color: '#666', background: '#2a2a2a', padding: '1px 6px', borderRadius: 4, fontFamily: 'monospace' }}>
                        {p.shortcut}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Zoom in */}
          <button type="button" onClick={() => setZoom((z) => Math.min(20, z * 1.3))}
            style={btnStyle} onMouseEnter={hoverIn} onMouseLeave={hoverOut} title="Zoom in">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
          </button>

          {/* Separator */}
          <div style={{ width: 1, height: 20, background: '#333', margin: '0 4px' }} />

          {/* Export */}
          <button type="button" onClick={exportSVG}
            style={{ ...btnStyle, width: 'auto', padding: '0 8px', fontSize: 11, fontWeight: 600 }}
            onMouseEnter={hoverIn} onMouseLeave={hoverOut} title="Export SVG">
            SVG
          </button>
          <button type="button" onClick={exportPNG}
            style={{ ...btnStyle, width: 'auto', padding: '0 8px', fontSize: 11, fontWeight: 600 }}
            onMouseEnter={hoverIn} onMouseLeave={hoverOut} title="Export PNG">
            PNG
          </button>

          {/* Separator */}
          <div style={{ width: 1, height: 20, background: '#333', margin: '0 4px' }} />

          {/* Fullscreen */}
          <button type="button" onClick={() => setFullscreen(!fullscreen)}
            style={btnStyle} onMouseEnter={hoverIn} onMouseLeave={hoverOut}
            title={fullscreen ? 'Exit fullscreen (Esc)' : 'Fullscreen'}>
            {fullscreen ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/>
                <line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/>
              </svg>
            )}
          </button>
        </div>
      )}
    </div>
  );
}

const btnStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: '#999',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 32,
  height: 32,
  borderRadius: 8,
  padding: 0,
  transition: 'all 0.1s',
};

function hoverIn(e: React.MouseEvent<HTMLButtonElement>) {
  e.currentTarget.style.background = '#2a2a2a';
  e.currentTarget.style.color = '#fff';
}
function hoverOut(e: React.MouseEvent<HTMLButtonElement>) {
  e.currentTarget.style.background = 'none';
  e.currentTarget.style.color = '#999';
}
