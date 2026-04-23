import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { resolveLayout } from './layout';
import { parseNodeTree } from './parser';
import { RenderNode, resetDefCounter } from './renderers/nodes';
import type { ResolvedNode } from './types';

interface PenViewerProps {
  data: unknown[];
  width?: number;
  height?: number;
  className?: string;
  style?: React.CSSProperties;
  showToolbar?: boolean;
  variables?: Record<string, string>;
}

function triggerDownload(blob: Blob, filename: string) {
  const a = document.createElement('a');
  a.download = filename;
  a.href = URL.createObjectURL(blob);
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  requestAnimationFrame(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  });
}

function computeBounds(nodes: ResolvedNode[]) {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
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

function findNodeById(nodes: ResolvedNode[], id: string): ResolvedNode | undefined {
  for (const n of nodes) {
    if (n.id === id) return n;
    if (n.children) {
      const found = findNodeById(n.children, id);
      if (found) return found;
    }
  }
  return undefined;
}

function nodeMatchesSearch(node: ResolvedNode, query: string): boolean {
  const label = (node.name || node.id).toLowerCase();
  return label.includes(query);
}

function hasMatchingDescendant(node: ResolvedNode, query: string): boolean {
  if (nodeMatchesSearch(node, query)) return true;
  return node.children?.some((c) => hasMatchingDescendant(c, query)) ?? false;
}

const ZOOM_PRESETS: { label: string; value: number | 'fit'; shortcut?: string }[] = [
  { label: 'Zoom to fit', value: 'fit', shortcut: '1' },
  { label: 'Zoom to 50%', value: 0.5 },
  { label: 'Zoom to 100%', value: 1, shortcut: '0' },
  { label: 'Zoom to 200%', value: 2 },
];

type SidebarTab = 'layers' | 'components' | 'libraries';

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------

function NodeIcon({ type }: { type: string }) {
  const s = { width: 14, height: 14, flexShrink: 0 as const, opacity: 0.5 };
  switch (type) {
    case 'frame':
      return (
        <svg {...s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="3" width="18" height="18" rx="2" />
        </svg>
      );
    case 'group':
      return (
        <svg {...s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="2" y="2" width="8" height="8" rx="1" />
          <rect x="14" y="14" width="8" height="8" rx="1" />
          <path d="M10 6h4M6 10v4M14 18h-4M18 14v-4" strokeDasharray="2 2" />
        </svg>
      );
    case 'text':
      return (
        <svg {...s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="4 7 4 4 20 4 20 7" />
          <line x1="12" y1="4" x2="12" y2="20" />
          <line x1="8" y1="20" x2="16" y2="20" />
        </svg>
      );
    case 'ellipse':
      return (
        <svg {...s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <ellipse cx="12" cy="12" rx="10" ry="8" />
        </svg>
      );
    case 'rectangle':
      return (
        <svg {...s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="5" width="18" height="14" rx="2" />
        </svg>
      );
    default:
      return (
        <svg {...s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polygon points="12 2 2 7 12 12 22 7 12 2" />
        </svg>
      );
  }
}

// ---------------------------------------------------------------------------
// Layer row
// ---------------------------------------------------------------------------

function LayerRow({
  node,
  depth,
  hiddenIds,
  expandedIds,
  selectedId,
  searchQuery,
  onToggle,
  onToggleExpand,
  onSelect,
}: {
  node: ResolvedNode;
  depth: number;
  hiddenIds: Set<string>;
  expandedIds: Set<string>;
  selectedId: string | null;
  searchQuery: string;
  onToggle: (id: string) => void;
  onToggleExpand: (id: string) => void;
  onSelect: (id: string) => void;
}) {
  const hidden = hiddenIds.has(node.id);
  const hasChildren = node.children && node.children.length > 0;
  const expanded = expandedIds.has(node.id);
  const isSelected = selectedId === node.id;
  const label = node.name || `${node.type} (${node.id.slice(0, 6)})`;

  if (searchQuery && !hasMatchingDescendant(node, searchQuery)) return null;
  const forceExpand = searchQuery.length > 0;

  return (
    <>
      <div
        className={`flex items-center w-full h-7 gap-0.5 cursor-pointer transition-colors ${
          isSelected
            ? 'bg-[var(--sidebar-accent)] text-[var(--foreground)]'
            : 'hover:bg-[var(--sidebar-accent)] text-[var(--sidebar-foreground)]'
        }`}
        style={{ paddingLeft: 4 + depth * 16, paddingRight: 4 }}
        onClick={(e) => {
          e.stopPropagation();
          onSelect(node.id);
        }}
      >
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            hasChildren && onToggleExpand(node.id);
          }}
          className="bg-transparent border-none p-0 w-4 h-4 flex items-center justify-center text-[var(--muted-foreground)] shrink-0"
          style={{ cursor: hasChildren ? 'pointer' : 'default', opacity: hasChildren ? 1 : 0 }}
        >
          <svg
            width="10"
            height="10"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            style={{
              transform: expanded || forceExpand ? 'rotate(90deg)' : 'rotate(0deg)',
              transition: 'transform 0.1s',
            }}
          >
            <polyline points="9 6 15 12 9 18" />
          </svg>
        </button>
        <NodeIcon type={node.type} />
        <span
          className={`flex-1 truncate text-[11px] pl-1 ${
            hidden ? 'opacity-40 italic' : isSelected ? 'text-[var(--foreground)]' : ''
          }`}
        >
          {label}
        </span>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggle(node.id);
          }}
          className={`bg-transparent border-none p-0 w-5 h-5 flex items-center justify-center shrink-0 cursor-pointer transition-colors ${
            hidden
              ? 'text-[var(--muted-foreground)] opacity-50'
              : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
          }`}
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            {hidden ? (
              <>
                <line x1="1" y1="1" x2="23" y2="23" />
                <path d="M6.7 6.7C3.8 8.6 2 12 2 12s4 7 10 7c1.7 0 3.3-.5 4.7-1.3M17.3 17.3C20.2 15.4 22 12 22 12s-4-7-10-7c-1.7 0-3.3.5-4.7 1.3" />
              </>
            ) : (
              <>
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                <circle cx="12" cy="12" r="3" />
              </>
            )}
          </svg>
        </button>
      </div>
      {hasChildren &&
        (expanded || forceExpand) &&
        node.children?.map((child) => (
          <LayerRow
            key={child.id}
            node={child}
            depth={depth + 1}
            hiddenIds={hiddenIds}
            expandedIds={expandedIds}
            selectedId={selectedId}
            searchQuery={searchQuery}
            onToggle={onToggle}
            onToggleExpand={onToggleExpand}
            onSelect={onSelect}
          />
        ))}
    </>
  );
}

// ---------------------------------------------------------------------------
// Inspector panel
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Right panel components (Pencil-style inspector using Tailwind)
// ---------------------------------------------------------------------------

const fieldCls =
  'bg-[var(--input)] rounded-md h-7 px-2.5 text-[11px] text-[var(--foreground)] font-mono tabular-nums w-full truncate flex items-center';

function Field({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-center gap-1">
      <span className="text-[11px] text-[var(--muted-foreground)] w-5 shrink-0">{label}</span>
      <div className={fieldCls}>{value}</div>
    </div>
  );
}

function SectionHeader({ title }: { title: string }) {
  return (
    <div className="flex items-center justify-between border-t border-[var(--sidebar-border)] px-4 pt-4 pb-2">
      <span className="text-xs font-medium text-[var(--muted-foreground)]">{title}</span>
    </div>
  );
}

function InspectPanel({ node }: { node: ResolvedNode }) {
  const fillColor = typeof node.fill === 'string' ? node.fill : undefined;
  const gradientFill =
    typeof node.fill === 'object' && node.fill?.type === 'gradient' ? node.fill : undefined;
  const hasStroke = node.stroke?.thickness;
  const hasLayout = node.layout && node.layout !== 'none';
  const effects = node.effect ? (Array.isArray(node.effect) ? node.effect : [node.effect]) : [];

  return (
    <div className="text-[var(--foreground)]">
      {/* Node header */}
      <div className="flex items-center gap-2.5 px-4 py-3 border-b border-[var(--sidebar-border)]">
        <NodeIcon type={node.type} />
        <span className="text-sm font-semibold truncate flex-1">{node.name || node.id}</span>
      </div>

      {/* Position */}
      <SectionHeader title="Position" />
      <div className="px-4 pb-3 grid grid-cols-2 gap-2">
        <Field label="X" value={Math.round(node.resolvedX)} />
        <Field label="Y" value={Math.round(node.resolvedY)} />
      </div>

      {/* Dimensions */}
      <SectionHeader title="Dimensions" />
      <div className="px-4 pb-3 space-y-2">
        <div className="grid grid-cols-2 gap-2">
          <Field label="W" value={Math.round(node.resolvedWidth)} />
          <Field label="H" value={Math.round(node.resolvedHeight)} />
        </div>
        {(typeof node.width === 'string' || typeof node.height === 'string') && (
          <div className="flex gap-3 text-[10px]">
            {typeof node.width === 'string' && (
              <span className="text-[var(--ring)]">
                {node.width === 'fill_container' ? 'Fill Width' : 'Hug Width'}
              </span>
            )}
            {typeof node.height === 'string' && (
              <span className="text-[var(--ring)]">
                {node.height === 'fill_container' ? 'Fill Height' : 'Hug Height'}
              </span>
            )}
          </div>
        )}
        {node.clip && (
          <div className="flex items-center gap-1.5 text-[10px] text-[var(--muted-foreground)]">
            <svg
              width="10"
              height="10"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <rect x="3" y="3" width="18" height="18" rx="2" />
            </svg>
            Clip Content
          </div>
        )}
      </div>

      {/* Flex Layout */}
      {hasLayout && (
        <>
          <SectionHeader title="Flex Layout" />
          <div className="px-4 pb-3 space-y-2">
            <div className="flex gap-1">
              {(['horizontal', 'vertical'] as const).map((dir) => (
                <div
                  key={dir}
                  className={`flex-1 py-1 rounded-md text-center text-[10px] ${
                    node.layout === dir
                      ? 'bg-[var(--accent)] text-[var(--foreground)]'
                      : 'bg-[var(--input)] text-[var(--muted-foreground)]'
                  }`}
                >
                  {dir === 'horizontal' ? '→' : '↓'} {dir}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2">
              {node.gap !== undefined && <Field label="G" value={node.gap} />}
              {node.justifyContent && (
                <Field label="J" value={node.justifyContent.replace('_', ' ')} />
              )}
              {node.alignItems && <Field label="A" value={node.alignItems} />}
            </div>
          </div>
        </>
      )}

      {/* Padding */}
      {node.padding !== undefined && (
        <>
          <SectionHeader title="Padding" />
          <div className="px-4 pb-3">
            {typeof node.padding === 'number' ? (
              <div className={fieldCls}>{node.padding}</div>
            ) : Array.isArray(node.padding) && node.padding.length === 2 ? (
              <div className="grid grid-cols-2 gap-2">
                <Field label="↔" value={node.padding[0]} />
                <Field label="↕" value={node.padding[1]} />
              </div>
            ) : Array.isArray(node.padding) && node.padding.length === 4 ? (
              <div className="grid grid-cols-2 gap-2">
                <Field label="T" value={node.padding[0]} />
                <Field label="R" value={node.padding[1]} />
                <Field label="B" value={node.padding[2]} />
                <Field label="L" value={node.padding[3]} />
              </div>
            ) : null}
          </div>
        </>
      )}

      {/* Appearance */}
      <SectionHeader title="Appearance" />
      <div className="px-4 pb-3 grid grid-cols-2 gap-2">
        <Field
          label="%"
          value={node.opacity !== undefined ? Math.round(node.opacity * 100) : 100}
        />
        {node.cornerRadius !== undefined && (
          <Field
            label="◜"
            value={
              typeof node.cornerRadius === 'number'
                ? node.cornerRadius
                : node.cornerRadius.join(', ')
            }
          />
        )}
      </div>

      {/* Typography */}
      {node.type === 'text' && (
        <>
          <SectionHeader title="Typography" />
          <div className="px-4 pb-3 space-y-2">
            {node.fontFamily && <div className={fieldCls}>{node.fontFamily}</div>}
            <div className="grid grid-cols-2 gap-2">
              {node.fontSize && <Field label="Sz" value={node.fontSize} />}
              {node.fontWeight && <Field label="Wt" value={node.fontWeight} />}
              {node.lineHeight && <Field label="Lh" value={node.lineHeight} />}
              {node.letterSpacing ? <Field label="Ls" value={node.letterSpacing} /> : null}
            </div>
            {node.textAlign && (
              <div className="flex gap-0.5">
                {(['left', 'center', 'right'] as const).map((a) => (
                  <div
                    key={a}
                    className={`flex-1 py-1 rounded text-center text-[10px] ${
                      node.textAlign === a
                        ? 'bg-[var(--accent)] text-[var(--foreground)]'
                        : 'text-[var(--muted-foreground)]'
                    }`}
                  >
                    {a}
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* Fill */}
      {(fillColor || gradientFill) && (
        <>
          <SectionHeader title="Fill" />
          <div className="px-4 pb-3">
            {fillColor && !fillColor.startsWith('$') ? (
              <div className="flex items-center gap-2">
                <span
                  className="w-6 h-6 rounded-md border border-[var(--sidebar-border)] shrink-0"
                  style={{ background: fillColor }}
                />
                <div className={`${fieldCls} flex-1`}>{fillColor}</div>
                <span className="text-[10px] text-[var(--muted-foreground)] tabular-nums">
                  100 %
                </span>
              </div>
            ) : fillColor?.startsWith('$') ? (
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-md border border-dashed border-[var(--border)] shrink-0 flex items-center justify-center text-[10px] text-[var(--muted-foreground)]">
                  $
                </span>
                <div className={`${fieldCls} flex-1 text-[var(--muted-foreground)]`}>
                  {fillColor}
                </div>
              </div>
            ) : gradientFill ? (
              <div className="flex items-center gap-2">
                <span
                  className="w-6 h-6 rounded-md border border-[var(--sidebar-border)] shrink-0"
                  style={{
                    background: `linear-gradient(${gradientFill.rotation ?? 0}deg, ${gradientFill.colors?.map((c) => c.color).join(', ') ?? '#333'})`,
                  }}
                />
                <div className={`${fieldCls} flex-1`}>
                  {gradientFill.gradientType ?? 'linear'} gradient
                </div>
              </div>
            ) : null}
          </div>
        </>
      )}

      {/* Stroke */}
      {hasStroke && (
        <>
          <SectionHeader title="Stroke" />
          <div className="px-4 pb-3 space-y-2">
            {node.stroke?.fill && (
              <div className="flex items-center gap-2">
                <span
                  className="w-6 h-6 rounded-md border border-[var(--sidebar-border)] shrink-0"
                  style={{ background: node.stroke?.fill }}
                />
                <div className={`${fieldCls} flex-1`}>{node.stroke?.fill}</div>
                <span className="text-[10px] text-[var(--muted-foreground)] tabular-nums">
                  100 %
                </span>
              </div>
            )}
            <div className="grid grid-cols-2 gap-2">
              {node.stroke?.align && <div className={fieldCls}>{node.stroke?.align}</div>}
              {node.stroke?.thickness !== undefined && (
                <Field label="W" value={node.stroke.thickness} />
              )}
            </div>
          </div>
        </>
      )}

      {/* Effects — only show if present */}
      {effects.length > 0 && (
        <>
          <SectionHeader title="Effects" />
          <div className="px-4 pb-3 space-y-2">
            {effects.map((e, i) => (
              <div key={i} className="flex items-center gap-2">
                {e.color && (
                  <span
                    className="w-4 h-4 rounded border border-[var(--sidebar-border)] shrink-0"
                    style={{ background: e.color }}
                  />
                )}
                <div className="flex-1">
                  <div className="text-[11px]">
                    {e.type === 'shadow' ? `${e.shadowType ?? 'outer'} shadow` : e.type}
                  </div>
                  <div className="text-[10px] text-[var(--muted-foreground)]">
                    blur: {e.blur ?? 0}
                    {e.spread ? ` spread: ${e.spread}` : ''}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function countVisibleLayers(nodes: ResolvedNode[], hiddenIds: Set<string>): number {
  let count = 0;
  function walk(n: ResolvedNode) {
    if (!hiddenIds.has(n.id)) {
      count++;
      n.children?.forEach(walk);
    }
  }
  nodes.forEach(walk);
  return count;
}

function countTotalLayers(nodes: ResolvedNode[]): number {
  let count = 0;
  function walk(n: ResolvedNode) {
    count++;
    n.children?.forEach(walk);
  }
  nodes.forEach(walk);
  return count;
}

function collectAllIds(nodes: ResolvedNode[]): Set<string> {
  const ids = new Set<string>();
  function walk(n: ResolvedNode) {
    if (n.children && n.children.length > 0) ids.add(n.id);
    n.children?.forEach(walk);
  }
  nodes.forEach(walk);
  return ids;
}

function collectNamedFrames(nodes: ResolvedNode[]): ResolvedNode[] {
  const result: ResolvedNode[] = [];
  function walk(n: ResolvedNode) {
    if ((n.type === 'frame' || n.type === 'group') && n.name) result.push(n);
    n.children?.forEach(walk);
  }
  nodes.forEach(walk);
  return result;
}

type ExportFormat = 'svg' | 'png';

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function PenViewer({
  data,
  width = 1440,
  height = 900,
  className,
  style,
  showToolbar = true,
  variables,
}: PenViewerProps) {
  const [zoom, setZoom] = useState(1);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const [showZoomMenu, setShowZoomMenu] = useState(false);
  const [exportScale, setExportScale] = useState<1 | 2 | 3>(2);
  const [exportFormat, setExportFormat] = useState<ExportFormat>('svg');
  const [sidebarTab, setSidebarTab] = useState<SidebarTab | null>(null);
  const [showRightPanel, setShowRightPanel] = useState(true);
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [layerSearch, setLayerSearch] = useState('');
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const dragging = useRef(false);
  const dragMoved = useRef(false);
  const lastMouse = useRef({ x: 0, y: 0 });
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const expandedInit = useRef(false);

  const resolved = useMemo(() => {
    resetDefCounter();
    return parseNodeTree(data).map((n) => resolveLayout(n, 0, 0, width, height));
  }, [data, width, height]);

  useEffect(() => {
    if (!expandedInit.current && resolved.length > 0) {
      expandedInit.current = true;
      setExpandedIds(collectAllIds(resolved));
    }
  }, [resolved]);

  const selectedNode = useMemo(
    () => (selectedNodeId ? findNodeById(resolved, selectedNodeId) : undefined),
    [resolved, selectedNodeId]
  );

  const hoveredNode = useMemo(
    () =>
      hoveredNodeId && hoveredNodeId !== selectedNodeId
        ? findNodeById(resolved, hoveredNodeId)
        : undefined,
    [resolved, hoveredNodeId, selectedNodeId]
  );

  const namedFrames = useMemo(() => collectNamedFrames(resolved), [resolved]);

  const nodeIndex = useMemo(() => {
    const map = new Map<string, ResolvedNode>();
    function walk(n: ResolvedNode) {
      map.set(n.id, n);
      n.children?.forEach(walk);
    }
    resolved.forEach(walk);
    return map;
  }, [resolved]);

  const visibleCount = useMemo(
    () => countVisibleLayers(resolved, hiddenIds),
    [resolved, hiddenIds]
  );
  const totalCount = useMemo(() => countTotalLayers(resolved), [resolved]);

  const showToast = useCallback((msg: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(msg);
    toastTimer.current = setTimeout(() => setToast(null), 2500);
  }, []);

  const toggleLayer = useCallback((id: string) => {
    setHiddenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleExpand = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectNode = useCallback((id: string) => {
    setSelectedNodeId((prev) => (prev === id ? null : id));
  }, []);

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

  const setZoomTo = useCallback(
    (v: number | 'fit') => {
      if (v === 'fit') fitToScreen();
      else {
        setZoom(v);
        setPanX(0);
        setPanY(0);
      }
      setShowZoomMenu(false);
    },
    [fitToScreen]
  );

  // Pan: track whether mouse actually moved to distinguish click from drag
  const onMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    dragging.current = true;
    dragMoved.current = false;
    lastMouse.current = { x: e.clientX, y: e.clientY };
    e.preventDefault();
  }, []);

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragging.current) return;
    const dx = e.clientX - lastMouse.current.x;
    const dy = e.clientY - lastMouse.current.y;
    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) dragMoved.current = true;
    setPanX((p) => p + dx);
    setPanY((p) => p + dy);
    lastMouse.current = { x: e.clientX, y: e.clientY };
  }, []);

  const onMouseUp = useCallback(() => {
    dragging.current = false;
  }, []);

  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const factor = e.deltaY > 0 ? 0.92 : 1.08;
    setZoom((z) => Math.max(0.05, Math.min(20, z * factor)));
  }, []);

  const onDoubleClick = useCallback(() => {
    setZoom((z) => Math.min(20, z * 1.5));
  }, []);

  // Click on canvas background → deselect
  const onCanvasClick = useCallback(() => {
    if (!dragMoved.current) setSelectedNodeId(null);
  }, []);

  // Click on a node in SVG → select it
  const onNodeClick = useCallback((id: string) => {
    if (!dragMoved.current) {
      setSelectedNodeId(id);
    }
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      if (
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
      ) {
        if (e.key === 'Escape') (target as HTMLElement).blur();
        return;
      }
      if (
        !containerRef.current?.contains(document.activeElement) &&
        document.activeElement !== document.body
      )
        return;
      if (e.key === 'Escape') {
        if (selectedNodeId) {
          setSelectedNodeId(null);
          return;
        }
        if (fullscreen) {
          setFullscreen(false);
          return;
        }
      }
      if (e.key === '1' && !e.metaKey && !e.ctrlKey) fitToScreen();
      if (e.key === '0' && !e.metaKey && !e.ctrlKey) {
        setZoom(1);
        setPanX(0);
        setPanY(0);
      }
      if (e.key === '/' && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        setSidebarTab('layers');
        requestAnimationFrame(() => searchRef.current?.focus());
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [fullscreen, fitToScreen, selectedNodeId]);

  const doExport = useCallback(
    (format: ExportFormat, scale: number = 2) => {
      const svg = svgRef.current;
      if (!svg) return;
      const name = selectedNode?.name ?? 'pencil-export';
      showToast(`Exporting ${name} as ${format.toUpperCase()} @${scale}x...`);
      const clone = svg.cloneNode(true) as SVGSVGElement;
      const overlay = clone.querySelector('[data-selection-overlay]');
      overlay?.remove();
      const hitTargets = clone.querySelector('[data-hit-targets]');
      hitTargets?.remove();

      if (format === 'png') {
        clone.setAttribute('width', String((contentW + pad * 2) * scale));
        clone.setAttribute('height', String((contentH + pad * 2) * scale));
        const svgStr = new XMLSerializer().serializeToString(clone);
        const blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          canvas.width = (contentW + pad * 2) * scale;
          canvas.height = (contentH + pad * 2) * scale;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.fillStyle = '#0a0a0a';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          }
          URL.revokeObjectURL(url);
          canvas.toBlob((b) => {
            if (!b) return;
            triggerDownload(b, `${name}.png`);
            showToast(`Exported ${name}.png`);
          }, 'image/png');
        };
        img.crossOrigin = 'anonymous';
        img.src = url;
      } else {
        clone.setAttribute('width', String(contentW + pad * 2));
        clone.setAttribute('height', String(contentH + pad * 2));
        const str = new XMLSerializer().serializeToString(clone);
        const blob = new Blob([str], { type: 'image/svg+xml;charset=utf-8' });
        triggerDownload(blob, `${name}.svg`);
        showToast(`Exported ${name}.svg`);
      }
    },
    [contentW, contentH, selectedNode, showToast]
  );

  const wrapStyle: React.CSSProperties = fullscreen
    ? { position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', flexDirection: 'row' }
    : { position: 'relative', display: 'flex', flexDirection: 'row', ...style };

  const sidebarOpen = sidebarTab !== null;
  const rightPanelVisible = showRightPanel && selectedNode;
  const searchLower = layerSearch.toLowerCase();

  const SIDEBAR_TABS: { key: SidebarTab; label: string }[] = [
    { key: 'layers', label: 'Layers' },
    { key: 'components', label: 'Components' },
  ];
  if (variables && Object.keys(variables).length > 0) {
    SIDEBAR_TABS.push({ key: 'libraries', label: 'Libraries' });
  }

  return (
    <div
      ref={containerRef}
      className={`bg-[var(--background)] ${className ?? ''}`}
      style={wrapStyle}
    >
      {/* Left sidebar */}
      <div
        className="shrink-0 overflow-hidden bg-[var(--sidebar)] flex flex-col transition-[width] duration-150 ease-in-out"
        style={{
          width: sidebarOpen ? 240 : 0,
          borderRight: sidebarOpen ? '1px solid var(--sidebar-border)' : 'none',
        }}
      >
        {/* Tab bar */}
        <div
          className="flex items-center border-b border-[var(--sidebar-border)] overflow-x-auto"
          style={{ minWidth: 240 }}
        >
          {SIDEBAR_TABS.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => setSidebarTab(sidebarTab === key ? null : key)}
              className={`bg-transparent border-none px-3 py-2 text-[11px] font-medium cursor-pointer whitespace-nowrap transition-colors ${
                sidebarTab === key
                  ? 'text-[var(--foreground)] border-b-2 border-b-[var(--foreground)]'
                  : 'text-[var(--muted-foreground)] border-b-2 border-b-transparent hover:text-[var(--sidebar-primary)]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* LAYERS TAB */}
        {sidebarTab === 'layers' && (
          <div className="flex-1 overflow-y-auto flex flex-col" style={{ minWidth: 240 }}>
            {/* Search */}
            <div className="px-2 pt-2 pb-1">
              <div className="flex items-center gap-2 h-8 rounded-md bg-[var(--input)] px-2.5 text-[var(--muted-foreground)] focus-within:ring-1 focus-within:ring-[var(--ring)]">
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  className="shrink-0"
                >
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <input
                  ref={searchRef}
                  type="text"
                  placeholder="Search layers..."
                  value={layerSearch}
                  onChange={(e) => setLayerSearch(e.target.value)}
                  className="flex-1 bg-transparent border-none text-[11px] text-[var(--foreground)] outline-none placeholder:text-[var(--muted-foreground)] min-w-0"
                />
                {layerSearch && (
                  <button
                    type="button"
                    onClick={() => setLayerSearch('')}
                    className="bg-transparent border-none text-[var(--muted-foreground)] cursor-pointer text-sm leading-none hover:text-[var(--foreground)] shrink-0"
                  >
                    &times;
                  </button>
                )}
              </div>
            </div>
            {/* Layer count */}
            <div className="flex items-center justify-between px-3 py-1.5 bg-[var(--sidebar-accent)]">
              <span className="text-[10px] text-[var(--muted-foreground)]">
                {visibleCount === totalCount
                  ? `${totalCount} layers`
                  : `${visibleCount} / ${totalCount} visible`}
              </span>
              {hiddenIds.size > 0 && (
                <button
                  type="button"
                  onClick={() => setHiddenIds(new Set())}
                  className="bg-transparent border-none text-[var(--muted-foreground)] text-[10px] cursor-pointer px-1.5 py-0.5 rounded hover:text-[var(--foreground)]"
                >
                  Show all
                </button>
              )}
            </div>
            {/* Tree */}
            <div className="flex-1 overflow-y-auto py-0.5">
              {resolved.map((node) => (
                <LayerRow
                  key={node.id}
                  node={node}
                  depth={0}
                  hiddenIds={hiddenIds}
                  expandedIds={expandedIds}
                  selectedId={selectedNodeId}
                  searchQuery={searchLower}
                  onToggle={toggleLayer}
                  onToggleExpand={toggleExpand}
                  onSelect={(id) => {
                    selectNode(id);
                  }}
                />
              ))}
            </div>
          </div>
        )}

        {/* COMPONENTS TAB */}
        {sidebarTab === 'components' && (
          <div className="flex-1 overflow-y-auto" style={{ minWidth: 240 }}>
            <div className="px-2 py-1.5 border-b border-[var(--sidebar-border)]">
              <span className="text-[10px] text-[var(--muted-foreground)]">
                {namedFrames.length} components
              </span>
            </div>
            <div className="py-0.5">
              {namedFrames.map((frame) => (
                <button
                  key={frame.id}
                  type="button"
                  onClick={() => {
                    setSelectedNodeId(frame.id);
                  }}
                  className={`flex items-center gap-1.5 w-full px-2.5 py-1.5 border-none text-[11px] cursor-pointer text-left transition-colors ${
                    selectedNodeId === frame.id
                      ? 'bg-[var(--sidebar-accent)] text-[var(--foreground)]'
                      : 'bg-transparent text-[var(--sidebar-foreground)] hover:bg-[var(--sidebar-accent)]'
                  }`}
                >
                  <NodeIcon type={frame.type} />
                  <span className="flex-1 truncate">{frame.name}</span>
                  <span className="text-[9px] text-[var(--muted-foreground)]">
                    {Math.round(frame.resolvedWidth)}&times;{Math.round(frame.resolvedHeight)}
                  </span>
                </button>
              ))}
              {namedFrames.length === 0 && (
                <div className="p-4 text-[var(--muted-foreground)] text-[11px] text-center">
                  No named frames found
                </div>
              )}
            </div>
          </div>
        )}

        {/* LIBRARIES TAB */}
        {sidebarTab === 'libraries' && variables && (
          <div className="flex-1 overflow-y-auto" style={{ minWidth: 240 }}>
            <div className="px-2 py-1.5 border-b border-[var(--sidebar-border)]">
              <span className="text-[10px] text-[var(--muted-foreground)]">
                {Object.keys(variables).length} tokens
              </span>
            </div>
            <div style={{ padding: '4px 0' }}>
              {Object.entries(variables).map(([key, value]) => (
                <div
                  key={key}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 10px' }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = '#222';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'none';
                  }}
                >
                  {/* Color swatch if it looks like a color */}
                  {value.startsWith('#') && (
                    <span
                      style={{
                        width: 14,
                        height: 14,
                        borderRadius: 4,
                        background: value,
                        border: '1px solid #333',
                        flexShrink: 0,
                      }}
                    />
                  )}
                  <div style={{ flex: 1, overflow: 'hidden' }}>
                    <div
                      style={{
                        fontSize: 11,
                        color: '#bbb',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {key.startsWith('$') ? key : `$${key}`}
                    </div>
                    <div style={{ fontSize: 10, color: '#666' }}>{value}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Main canvas + toolbar area */}
      <div className="flex-1 flex flex-col relative min-w-0">
        {/* Canvas */}
        <div
          className="flex-1 overflow-hidden relative"
          style={{ cursor: dragging.current ? 'grabbing' : 'grab' }}
          onWheel={onWheel}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onMouseLeave={onMouseUp}
          onDoubleClick={onDoubleClick}
          onClick={onCanvasClick}
        >
          <div
            style={{
              transform: `translate(${panX}px, ${panY}px) scale(${zoom})`,
              transformOrigin: 'center center',
              width: '100%',
              height: '100%',
              willChange: 'transform',
            }}
          >
            <svg
              ref={svgRef}
              viewBox={vb}
              width="100%"
              height="100%"
              xmlns="http://www.w3.org/2000/svg"
              preserveAspectRatio="xMidYMid meet"
            >
              {resolved.map(
                (node) =>
                  !hiddenIds.has(node.id) && (
                    <RenderNode
                      key={node.id}
                      node={node}
                      hiddenIds={hiddenIds}
                      variables={variables}
                      nodeIndex={nodeIndex}
                    />
                  )
              )}

              {/* Hit targets for click-to-select */}
              <g data-hit-targets="true" style={{ pointerEvents: 'all' }}>
                {resolved.map(function renderHitTargets(node: ResolvedNode): React.ReactNode {
                  if (hiddenIds.has(node.id)) return null;
                  return (
                    <g key={node.id}>
                      <rect
                        x={node.resolvedX}
                        y={node.resolvedY}
                        width={Math.max(0, node.resolvedWidth)}
                        height={Math.max(0, node.resolvedHeight)}
                        fill="transparent"
                        stroke="none"
                        cursor="pointer"
                        onClick={(e) => {
                          e.stopPropagation();
                          onNodeClick(node.id);
                        }}
                        onMouseEnter={() => setHoveredNodeId(node.id)}
                        onMouseLeave={() =>
                          setHoveredNodeId((prev) => (prev === node.id ? null : prev))
                        }
                      />
                      {node.children?.map(renderHitTargets)}
                    </g>
                  );
                })}
              </g>

              {/* Selection highlight */}
              {selectedNode && (
                <g data-selection-overlay="true" style={{ pointerEvents: 'none' }}>
                  <rect
                    x={selectedNode.resolvedX - 1}
                    y={selectedNode.resolvedY - 1}
                    width={selectedNode.resolvedWidth + 2}
                    height={selectedNode.resolvedHeight + 2}
                    fill="none"
                    stroke="#4A9FD8"
                    strokeWidth={1.5}
                    strokeDasharray="4 2"
                  />
                  {/* Dimension label */}
                  <rect
                    x={selectedNode.resolvedX}
                    y={selectedNode.resolvedY + selectedNode.resolvedHeight + 4}
                    width={Math.max(
                      60,
                      String(
                        `${Math.round(selectedNode.resolvedWidth)} × ${Math.round(selectedNode.resolvedHeight)}`
                      ).length *
                        6 +
                        12
                    )}
                    height={16}
                    rx={3}
                    fill="#4A9FD8"
                  />
                  <text
                    x={selectedNode.resolvedX + 6}
                    y={selectedNode.resolvedY + selectedNode.resolvedHeight + 15}
                    fill="#fff"
                    fontSize={9}
                    fontFamily="monospace"
                  >
                    {Math.round(selectedNode.resolvedWidth)} &times;{' '}
                    {Math.round(selectedNode.resolvedHeight)}
                  </text>
                </g>
              )}

              {/* Hover highlight + measurement lines */}
              {hoveredNode && (
                <g data-selection-overlay="true" style={{ pointerEvents: 'none' }}>
                  {/* Hover outline */}
                  <rect
                    x={hoveredNode.resolvedX - 0.5}
                    y={hoveredNode.resolvedY - 0.5}
                    width={hoveredNode.resolvedWidth + 1}
                    height={hoveredNode.resolvedHeight + 1}
                    fill="none"
                    stroke="#4A9FD8"
                    strokeWidth={0.75}
                    opacity={0.6}
                  />
                  {/* Measurement lines when a node is selected */}
                  {selectedNode &&
                    (() => {
                      const s = selectedNode;
                      const h = hoveredNode;
                      const sRight = s.resolvedX + s.resolvedWidth;
                      const sBottom = s.resolvedY + s.resolvedHeight;
                      const hRight = h.resolvedX + h.resolvedWidth;
                      const hBottom = h.resolvedY + h.resolvedHeight;

                      const lines: React.ReactNode[] = [];
                      const sMidY = s.resolvedY + s.resolvedHeight / 2;
                      const hMidY = h.resolvedY + h.resolvedHeight / 2;
                      const sMidX = s.resolvedX + s.resolvedWidth / 2;
                      const hMidX = h.resolvedX + h.resolvedWidth / 2;

                      // Horizontal distance
                      let hDist = 0;
                      let hx1 = 0,
                        hx2 = 0,
                        hy = 0;
                      if (hRight <= s.resolvedX) {
                        hDist = s.resolvedX - hRight;
                        hx1 = hRight;
                        hx2 = s.resolvedX;
                        hy = (sMidY + hMidY) / 2;
                      } else if (h.resolvedX >= sRight) {
                        hDist = h.resolvedX - sRight;
                        hx1 = sRight;
                        hx2 = h.resolvedX;
                        hy = (sMidY + hMidY) / 2;
                      }
                      if (hDist > 0) {
                        const label = String(Math.round(hDist));
                        lines.push(
                          <line
                            key="h-line"
                            x1={hx1}
                            y1={hy}
                            x2={hx2}
                            y2={hy}
                            stroke="#E74C3C"
                            strokeWidth={0.75}
                          />,
                          <rect
                            key="h-bg"
                            x={(hx1 + hx2) / 2 - label.length * 3 - 4}
                            y={hy - 8}
                            width={label.length * 6 + 8}
                            height={14}
                            rx={3}
                            fill="#E74C3C"
                          />,
                          <text
                            key="h-txt"
                            x={(hx1 + hx2) / 2}
                            y={hy + 1}
                            fill="#fff"
                            fontSize={8}
                            fontFamily="monospace"
                            textAnchor="middle"
                          >
                            {label}
                          </text>
                        );
                      }

                      // Vertical distance
                      let vDist = 0;
                      let vy1 = 0,
                        vy2 = 0,
                        vx = 0;
                      if (hBottom <= s.resolvedY) {
                        vDist = s.resolvedY - hBottom;
                        vy1 = hBottom;
                        vy2 = s.resolvedY;
                        vx = (sMidX + hMidX) / 2;
                      } else if (h.resolvedY >= sBottom) {
                        vDist = h.resolvedY - sBottom;
                        vy1 = sBottom;
                        vy2 = h.resolvedY;
                        vx = (sMidX + hMidX) / 2;
                      }
                      if (vDist > 0) {
                        const label = String(Math.round(vDist));
                        lines.push(
                          <line
                            key="v-line"
                            x1={vx}
                            y1={vy1}
                            x2={vx}
                            y2={vy2}
                            stroke="#E74C3C"
                            strokeWidth={0.75}
                          />,
                          <rect
                            key="v-bg"
                            x={vx + 4}
                            y={(vy1 + vy2) / 2 - 7}
                            width={label.length * 6 + 8}
                            height={14}
                            rx={3}
                            fill="#E74C3C"
                          />,
                          <text
                            key="v-txt"
                            x={vx + 4 + label.length * 3 + 4}
                            y={(vy1 + vy2) / 2 + 2}
                            fill="#fff"
                            fontSize={8}
                            fontFamily="monospace"
                            textAnchor="middle"
                          >
                            {label}
                          </text>
                        );
                      }

                      return lines.length > 0 ? lines : null;
                    })()}
                </g>
              )}
            </svg>
          </div>
        </div>

        {/* Floating bottom toolbar */}
        {showToolbar && (
          <div
            style={{
              position: 'absolute',
              bottom: 16,
              left: '50%',
              transform: 'translateX(-50%)',
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              background: '#1a1a1a',
              borderRadius: 12,
              border: '1px solid #2a2a2a',
              padding: '4px 4px',
              boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
              zIndex: 10,
            }}
          >
            {/* Sidebar toggle */}
            <button
              type="button"
              onClick={() => setSidebarTab(sidebarTab ? null : 'layers')}
              style={{
                ...btnStyle,
                color: sidebarOpen ? '#fff' : '#999',
                background: sidebarOpen ? '#333' : 'none',
              }}
              onMouseEnter={hoverIn}
              onMouseLeave={hoverOut}
              title="Toggle sidebar"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <line x1="9" y1="3" x2="9" y2="21" />
              </svg>
            </button>

            <div style={{ width: 1, height: 20, background: '#333', margin: '0 4px' }} />

            <button
              type="button"
              onClick={() => setZoom((z) => Math.max(0.05, z * 0.7))}
              style={btnStyle}
              onMouseEnter={hoverIn}
              onMouseLeave={hoverOut}
              title="Zoom out"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </button>

            <div style={{ position: 'relative' }}>
              <button
                type="button"
                onClick={() => setShowZoomMenu(!showZoomMenu)}
                style={{
                  ...btnStyle,
                  width: 'auto',
                  padding: '0 10px',
                  fontSize: 12,
                  fontWeight: 500,
                  fontVariantNumeric: 'tabular-nums',
                  minWidth: 52,
                }}
                onMouseEnter={hoverIn}
                onMouseLeave={hoverOut}
              >
                {Math.round(zoom * 100)}%
              </button>
              {showZoomMenu && (
                <div
                  style={{
                    position: 'absolute',
                    bottom: 40,
                    left: '50%',
                    transform: 'translateX(-50%)',
                    background: '#1a1a1a',
                    border: '1px solid #2a2a2a',
                    borderRadius: 10,
                    padding: '4px',
                    minWidth: 160,
                    boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
                  }}
                >
                  {ZOOM_PRESETS.map((p) => (
                    <button
                      key={p.label}
                      type="button"
                      onClick={() => setZoomTo(p.value)}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        width: '100%',
                        padding: '8px 12px',
                        background: 'none',
                        border: 'none',
                        color: '#ccc',
                        fontSize: 13,
                        cursor: 'pointer',
                        borderRadius: 6,
                        textAlign: 'left',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = '#2a2a2a';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'none';
                      }}
                    >
                      <span>{p.label}</span>
                      {p.shortcut && (
                        <span
                          style={{
                            fontSize: 11,
                            color: '#666',
                            background: '#2a2a2a',
                            padding: '1px 6px',
                            borderRadius: 4,
                            fontFamily: 'monospace',
                          }}
                        >
                          {p.shortcut}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => setZoom((z) => Math.min(20, z * 1.3))}
              style={btnStyle}
              onMouseEnter={hoverIn}
              onMouseLeave={hoverOut}
              title="Zoom in"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </button>

            <div style={{ width: 1, height: 20, background: '#333', margin: '0 4px' }} />

            <button
              type="button"
              onClick={() => setFullscreen(!fullscreen)}
              style={btnStyle}
              onMouseEnter={hoverIn}
              onMouseLeave={hoverOut}
              title={fullscreen ? 'Exit fullscreen (Esc)' : 'Fullscreen'}
            >
              {fullscreen ? (
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              ) : (
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <polyline points="15 3 21 3 21 9" />
                  <polyline points="9 21 3 21 3 15" />
                  <line x1="21" y1="3" x2="14" y2="10" />
                  <line x1="3" y1="21" x2="10" y2="14" />
                </svg>
              )}
            </button>

            <div style={{ width: 1, height: 20, background: '#333', margin: '0 4px' }} />

            {/* Right panel toggle */}
            <button
              type="button"
              onClick={() => setShowRightPanel(!showRightPanel)}
              style={{
                ...btnStyle,
                color: showRightPanel ? '#fff' : '#999',
                background: showRightPanel ? '#333' : 'none',
              }}
              onMouseEnter={hoverIn}
              onMouseLeave={hoverOut}
              title="Toggle inspector"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <line x1="15" y1="3" x2="15" y2="21" />
              </svg>
            </button>
          </div>
        )}

        {/* Right panel — Pencil-style inspector */}
        {rightPanelVisible && (
          <div className="absolute inset-y-0 right-0 w-72 bg-[var(--sidebar)] border-l border-[var(--sidebar-border)] flex flex-col z-10">
            <div className="flex-1 overflow-y-auto">
              <InspectPanel node={selectedNode} />

              {/* Variables */}
              {variables &&
                typeof selectedNode.fill === 'string' &&
                selectedNode.fill.startsWith('$') && (
                  <>
                    <SectionHeader title="Variables" />
                    <div className="px-4 pb-3">
                      {(() => {
                        const resolved =
                          variables[selectedNode.fill] ?? variables[selectedNode.fill.slice(1)];
                        return resolved ? (
                          <div className="flex items-center gap-2">
                            <span
                              className="w-4 h-4 rounded border border-[var(--sidebar-border)] shrink-0"
                              style={{ background: resolved }}
                            />
                            <div className="flex-1 text-[11px]">
                              <div className="text-[var(--foreground)]">{selectedNode.fill}</div>
                              <div className="text-[var(--muted-foreground)]">{resolved}</div>
                            </div>
                          </div>
                        ) : (
                          <div className="text-[11px] text-[var(--muted-foreground)]">
                            {selectedNode.fill} (unresolved)
                          </div>
                        );
                      })()}
                    </div>
                  </>
                )}
            </div>

            {/* Export — pinned bottom */}
            <div className="border-t border-[var(--sidebar-border)] px-4 py-3 shrink-0 space-y-2.5">
              <span className="text-xs font-medium text-[var(--muted-foreground)]">Export</span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setExportScale(exportScale === 1 ? 2 : exportScale === 2 ? 3 : 1)}
                  className="flex-1 h-8 flex items-center justify-center gap-1 rounded-md bg-[var(--input)] text-[var(--foreground)] text-[11px] font-mono border-none cursor-pointer hover:bg-[var(--sidebar-accent)] transition-colors"
                >
                  {exportScale}x
                </button>
                <button
                  type="button"
                  onClick={() => setExportFormat(exportFormat === 'svg' ? 'png' : 'svg')}
                  className="flex-1 h-8 flex items-center justify-center gap-1 rounded-md bg-[var(--input)] text-[var(--foreground)] text-[11px] font-mono border-none cursor-pointer hover:bg-[var(--sidebar-accent)] transition-colors"
                >
                  {exportFormat.toUpperCase()}
                </button>
              </div>
              <button
                type="button"
                onClick={() => doExport(exportFormat, exportScale)}
                className="w-full h-8 bg-[var(--input)] hover:bg-[var(--sidebar-accent)] text-[var(--foreground)] text-[11px] font-medium rounded-md border-none transition-colors cursor-pointer"
              >
                Export {selectedNode.name || 'Design'}
              </button>
            </div>
          </div>
        )}

        {/* Toast */}
        {toast && (
          <div
            style={{
              position: 'absolute',
              bottom: 64,
              left: '50%',
              transform: 'translateX(-50%)',
              background: '#1a1a1a',
              border: '1px solid #2a2a2a',
              borderRadius: 10,
              padding: '10px 16px',
              boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
              zIndex: 20,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontSize: 13,
              color: '#ccc',
              whiteSpace: 'nowrap',
            }}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              style={{ flexShrink: 0 }}
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="16" x2="12" y2="12" />
              <line x1="12" y1="8" x2="12.01" y2="8" />
            </svg>
            {toast}
          </div>
        )}
      </div>
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
