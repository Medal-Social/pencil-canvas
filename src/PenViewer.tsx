import { useCallback, useMemo, useRef, useState } from 'react';
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
}

function computeBounds(nodes: ResolvedNode[]): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
} {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  function walk(node: ResolvedNode) {
    minX = Math.min(minX, node.resolvedX);
    minY = Math.min(minY, node.resolvedY);
    maxX = Math.max(maxX, node.resolvedX + node.resolvedWidth);
    maxY = Math.max(maxY, node.resolvedY + node.resolvedHeight);
    node.children?.forEach(walk);
  }

  for (const n of nodes) walk(n);

  if (!Number.isFinite(minX)) return { minX: 0, minY: 0, maxX: 100, maxY: 100 };
  return { minX, minY, maxX, maxY };
}

export function PenViewer({
  data,
  width = 1440,
  height = 900,
  className,
  style,
}: PenViewerProps) {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const isDragging = useRef(false);
  const lastPos = useRef({ x: 0, y: 0 });

  const resolved = useMemo(() => {
    resetDefCounter();
    const nodes = parseNodeTree(data);
    return nodes.map((node) => resolveLayout(node, 0, 0, width, height));
  }, [data, width, height]);

  const bounds = useMemo(() => computeBounds(resolved), [resolved]);
  const padding = 20;
  const viewBox = `${bounds.minX - padding} ${bounds.minY - padding} ${bounds.maxX - bounds.minX + padding * 2} ${bounds.maxY - bounds.minY + padding * 2}`;

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
    setPan((p) => ({
      x: p.x + e.clientX - lastPos.current.x,
      y: p.y + e.clientY - lastPos.current.y,
    }));
    lastPos.current = { x: e.clientX, y: e.clientY };
  }, []);

  const handleMouseUp = useCallback(() => {
    isDragging.current = false;
  }, []);

  return (
    <div
      className={className}
      style={{
        overflow: 'hidden',
        cursor: isDragging.current ? 'grabbing' : 'grab',
        ...style,
      }}
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      <div
        style={{
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          transformOrigin: 'center center',
          width: '100%',
          height: '100%',
        }}
      >
        <svg
          viewBox={viewBox}
          width="100%"
          height="100%"
          xmlns="http://www.w3.org/2000/svg"
          preserveAspectRatio="xMidYMid meet"
        >
          {resolved.map((node) => (
            <RenderNode key={node.id} node={node} />
          ))}
        </svg>
      </div>
    </div>
  );
}
