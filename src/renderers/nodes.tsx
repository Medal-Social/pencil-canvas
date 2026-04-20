import type { GradientFill, ResolvedNode, StrokeDef } from '../types';

let defId = 0;

export function resetDefCounter() {
  defId = 0;
}

function resolveFill(fill: string | GradientFill | undefined): {
  attr: string;
  defs: React.ReactNode | null;
} {
  if (!fill) return { attr: 'none', defs: null };
  if (typeof fill === 'string') {
    if (fill.startsWith('$')) return { attr: 'none', defs: null }; // unresolved variable
    return { attr: fill, defs: null };
  }
  if (fill.type === 'gradient' && fill.colors) {
    const id = `g${++defId}`;
    const stops = fill.colors.map((c, i) => {
      const color = typeof c.color === 'string' && c.color.startsWith('$') ? '#888' : c.color;
      return <stop key={i} offset={`${c.position * 100}%`} stopColor={color} />;
    });
    const el =
      fill.gradientType === 'radial' ? (
        <radialGradient id={id}>{stops}</radialGradient>
      ) : (
        <linearGradient id={id} gradientTransform={`rotate(${fill.rotation ?? 0})`}>
          {stops}
        </linearGradient>
      );
    return { attr: `url(#${id})`, defs: el };
  }
  return { attr: 'none', defs: null };
}

function resolveStroke(stroke: StrokeDef | undefined): {
  strokeAttr: string;
  strokeWidth: number;
  defs: React.ReactNode | null;
} {
  if (!stroke) return { strokeAttr: 'none', strokeWidth: 0, defs: null };
  const thickness = typeof stroke.thickness === 'number' ? stroke.thickness : 0;
  if (thickness === 0) return { strokeAttr: 'none', strokeWidth: 0, defs: null };
  const fill = typeof stroke.fill === 'string' && !stroke.fill.startsWith('$') ? stroke.fill : '#333';
  return { strokeAttr: fill, strokeWidth: thickness, defs: null };
}

function getRx(cr: number | [number, number, number, number] | undefined): number {
  if (typeof cr === 'number') return cr;
  if (Array.isArray(cr)) return cr[0];
  return 0;
}

export function RenderNode({ node }: { node: ResolvedNode }) {
  const { attr: fillAttr, defs: fillDefs } = resolveFill(node.fill);
  const { strokeAttr, strokeWidth } = resolveStroke(node.stroke);
  const rx = getRx(node.cornerRadius);

  const commonRect = {
    x: node.resolvedX,
    y: node.resolvedY,
    width: Math.max(0, node.resolvedWidth),
    height: Math.max(0, node.resolvedHeight),
    rx,
    fill: fillAttr,
    stroke: strokeAttr,
    strokeWidth,
    opacity: node.opacity,
  };

  switch (node.type) {
    case 'rectangle':
      return (
        <>
          {fillDefs}
          <rect {...commonRect} />
        </>
      );

    case 'ellipse':
      return (
        <>
          {fillDefs}
          <ellipse
            cx={node.resolvedX + node.resolvedWidth / 2}
            cy={node.resolvedY + node.resolvedHeight / 2}
            rx={Math.max(0, node.resolvedWidth / 2)}
            ry={Math.max(0, node.resolvedHeight / 2)}
            fill={fillAttr}
            stroke={strokeAttr}
            strokeWidth={strokeWidth}
            opacity={node.opacity}
          />
        </>
      );

    case 'text':
      return (
        <foreignObject
          x={node.resolvedX}
          y={node.resolvedY}
          width={Math.max(node.resolvedWidth, 20)}
          height={Math.max(node.resolvedHeight, 14)}
        >
          <div
            xmlns="http://www.w3.org/1999/xhtml"
            style={{
              fontFamily: node.fontFamily || 'sans-serif',
              fontSize: node.fontSize || 14,
              fontWeight: node.fontWeight || 'normal',
              fontStyle: node.fontStyle as string || 'normal',
              color:
                typeof node.fill === 'string' && !node.fill.startsWith('$')
                  ? node.fill
                  : '#ffffff',
              letterSpacing: node.letterSpacing,
              textAlign: (node.textAlign || 'left') as 'left' | 'center' | 'right',
              lineHeight: node.lineHeight || 1.4,
              whiteSpace: 'pre-wrap',
              overflow: 'hidden',
            }}
          >
            {node.content}
          </div>
        </foreignObject>
      );

    case 'icon_font':
      // Render as a small colored square placeholder for now
      return (
        <rect
          x={node.resolvedX}
          y={node.resolvedY}
          width={node.resolvedWidth || 24}
          height={node.resolvedHeight || 24}
          rx={4}
          fill={typeof node.fill === 'string' && !node.fill.startsWith('$') ? node.fill : '#4A9FD8'}
          opacity={0.6}
        />
      );

    case 'path':
      if (!node.geometry || node.geometry === '...') return null;
      return (
        <>
          {fillDefs}
          <g transform={`translate(${node.resolvedX},${node.resolvedY})`}>
            {node.viewBox ? (
              <svg
                viewBox={node.viewBox.join(' ')}
                width={node.resolvedWidth}
                height={node.resolvedHeight}
              >
                <path d={node.geometry} fill={fillAttr} stroke={strokeAttr} strokeWidth={strokeWidth} />
              </svg>
            ) : (
              <path d={node.geometry} fill={fillAttr} stroke={strokeAttr} strokeWidth={strokeWidth} />
            )}
          </g>
        </>
      );

    case 'frame':
    case 'group': {
      const clipId = node.clip ? `clip-${node.id}` : undefined;
      return (
        <g opacity={node.opacity}>
          {fillDefs}
          {clipId && (
            <defs>
              <clipPath id={clipId}>
                <rect
                  x={node.resolvedX}
                  y={node.resolvedY}
                  width={Math.max(0, node.resolvedWidth)}
                  height={Math.max(0, node.resolvedHeight)}
                  rx={rx}
                />
              </clipPath>
            </defs>
          )}
          {node.type === 'frame' && (
            <rect {...commonRect} />
          )}
          <g clipPath={clipId ? `url(#${clipId})` : undefined}>
            {node.children?.map((child) => (
              <RenderNode key={child.id} node={child} />
            ))}
          </g>
        </g>
      );
    }

    default:
      return null;
  }
}
