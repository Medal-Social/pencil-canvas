import { useCallback, useRef, useState } from 'react';
import type { PenNode } from './types';
import { parseNodeTree } from './parser';
import { resolveLayout } from './layout';
import { RenderNode } from './renderers/nodes';

interface PenViewerProps {
  data: unknown[];
  width?: number;
  height?: number;
  className?: string;
}

export function PenViewer({ data, width = 1440, height = 900, className }: PenViewerProps) {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const isDragging = useRef(false);
  const lastPos = useRef({ x: 0, y: 0 });

  const nodes = parseNodeTree(data);
  const resolved = nodes.map((node) => resolveLayout(node, 0, 0, width, height));

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    setZoom((z) => Math.max(0.1, Math.min(5, z * (e.deltaY > 0 ? 0.9 : 1.1))));
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    isDragging.current = true;
    lastPos.current = { x: e.clientX, y: e.clientY };
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging.current) return;
    setPan((p) => ({ x: p.x + e.clientX - lastPos.current.x, y: p.y + e.clientY - lastPos.current.y }));
    lastPos.current = { x: e.clientX, y: e.clientY };
  }, []);

  const handleMouseUp = useCallback(() => { isDragging.current = false; }, []);

  return (
    <div className={className} style={{ overflow: 'hidden', cursor: 'grab' }}
      onWheel={handleWheel} onMouseDown={handleMouseDown} onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp}>
      <div style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: '0 0' }}>
        <svg viewBox={`0 0 ${width} ${height}`} width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
          {resolved.map((node) => <RenderNode key={node.id} node={node} />)}
        </svg>
      </div>
    </div>
  );
}
