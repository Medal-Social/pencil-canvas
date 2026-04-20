import type { ResolvedNode, GradientFill } from '../types';

let defId = 0;

function resolveFill(fill: string | GradientFill | undefined): { attr: string; defs: React.ReactNode | null } {
  if (!fill) return { attr: 'none', defs: null };
  if (typeof fill === 'string') return { attr: fill, defs: null };
  if (fill.type === 'gradient' && fill.colors) {
    const id = `g${++defId}`;
    const stops = fill.colors.map((c, i) => <stop key={i} offset={`${c.position * 100}%`} stopColor={c.color} />);
    const el = fill.gradientType === 'radial'
      ? <radialGradient id={id}>{stops}</radialGradient>
      : <linearGradient id={id} gradientTransform={`rotate(${fill.rotation ?? 0})`}>{stops}</linearGradient>;
    return { attr: `url(#${id})`, defs: el };
  }
  return { attr: 'none', defs: null };
}

export function RenderNode({ node }: { node: ResolvedNode }) {
  const { attr: fillAttr, defs } = resolveFill(node.fill);

  switch (node.type) {
    case 'rectangle':
      return <>{defs}<rect x={node.resolvedX} y={node.resolvedY} width={node.resolvedWidth} height={node.resolvedHeight} rx={typeof node.cornerRadius === 'number' ? node.cornerRadius : 0} fill={fillAttr} opacity={node.opacity} /></>;

    case 'ellipse':
      return <>{defs}<ellipse cx={node.resolvedX + node.resolvedWidth / 2} cy={node.resolvedY + node.resolvedHeight / 2} rx={node.resolvedWidth / 2} ry={node.resolvedHeight / 2} fill={fillAttr} opacity={node.opacity} /></>;

    case 'text':
      return <foreignObject x={node.resolvedX} y={node.resolvedY} width={node.resolvedWidth || 500} height={node.resolvedHeight || 100}>
        <div style={{ fontFamily: node.fontFamily, fontSize: node.fontSize, fontWeight: node.fontWeight, color: typeof node.fill === 'string' ? node.fill : undefined, letterSpacing: node.letterSpacing, textAlign: node.textAlign, lineHeight: node.lineHeight }}>{node.content}</div>
      </foreignObject>;

    case 'path':
      return <>{defs}<path d={node.geometry ?? ''} fill={fillAttr} transform={`translate(${node.resolvedX},${node.resolvedY})`} opacity={node.opacity} /></>;

    case 'frame':
    case 'group':
      return <g>
        {defs}
        {node.type === 'frame' && <rect x={node.resolvedX} y={node.resolvedY} width={node.resolvedWidth} height={node.resolvedHeight} rx={typeof node.cornerRadius === 'number' ? node.cornerRadius : 0} fill={fillAttr} opacity={node.opacity} />}
        {node.children?.map((child) => <RenderNode key={child.id} node={child} />)}
      </g>;

    default:
      return null;
  }
}
