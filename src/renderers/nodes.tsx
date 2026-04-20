import type { EffectDef, GradientFill, ResolvedNode, StrokeDef } from '../types';

let defId = 0;

export function resetDefCounter() {
  defId = 0;
}

// ---------------------------------------------------------------------------
// Variable resolution
// ---------------------------------------------------------------------------

function resolveVar(value: string, vars?: Record<string, string>): string | undefined {
  if (!value.startsWith('$')) return value;
  if (!vars) return undefined;
  return vars[value] ?? vars[value.slice(1)] ?? undefined;
}

// ---------------------------------------------------------------------------
// Fill
// ---------------------------------------------------------------------------

function resolveFill(
  fill: string | GradientFill | undefined,
  vars?: Record<string, string>,
): { attr: string; defs: React.ReactNode | null } {
  if (!fill) return { attr: 'none', defs: null };
  if (typeof fill === 'string') {
    if (fill.startsWith('$')) {
      const resolved = resolveVar(fill, vars);
      return { attr: resolved ?? 'none', defs: null };
    }
    return { attr: fill, defs: null };
  }
  if (fill.type === 'gradient' && fill.colors) {
    const id = `g${++defId}`;
    const stops = fill.colors.map((c, i) => {
      let color = c.color;
      if (typeof color === 'string' && color.startsWith('$')) {
        color = resolveVar(color, vars) ?? '#888';
      }
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

// ---------------------------------------------------------------------------
// Stroke (with alignment geometry offsets)
// ---------------------------------------------------------------------------

interface ResolvedStroke {
  strokeAttr: string;
  strokeWidth: number;
  /** Geometry inset: positive = shrink shape, negative = expand */
  inset: number;
}

function resolveStroke(stroke: StrokeDef | undefined, vars?: Record<string, string>): ResolvedStroke {
  if (!stroke) return { strokeAttr: 'none', strokeWidth: 0, inset: 0 };
  const thickness = typeof stroke.thickness === 'number' ? stroke.thickness : 0;
  if (thickness === 0) return { strokeAttr: 'none', strokeWidth: 0, inset: 0 };
  let fill = '#333';
  if (typeof stroke.fill === 'string') {
    if (stroke.fill.startsWith('$')) {
      fill = resolveVar(stroke.fill, vars) ?? '#333';
    } else {
      fill = stroke.fill;
    }
  }
  // Geometry offset to simulate inside/outside stroke alignment
  let inset = 0;
  if (stroke.align === 'inside') inset = thickness / 2;
  else if (stroke.align === 'outside') inset = -(thickness / 2);
  return { strokeAttr: fill, strokeWidth: thickness, inset };
}

// ---------------------------------------------------------------------------
// Corner radius helpers
// ---------------------------------------------------------------------------

function isUniformRadius(cr: number | [number, number, number, number] | undefined): boolean {
  if (!cr) return true;
  if (typeof cr === 'number') return true;
  return cr[0] === cr[1] && cr[1] === cr[2] && cr[2] === cr[3];
}

function getUniformRx(cr: number | [number, number, number, number] | undefined): number {
  if (typeof cr === 'number') return cr;
  if (Array.isArray(cr)) return cr[0];
  return 0;
}

function roundedRectPath(
  x: number, y: number, w: number, h: number,
  [tl, tr, br, bl]: [number, number, number, number],
): string {
  // Clamp radii so they don't exceed half the side length
  const maxH = w / 2;
  const maxV = h / 2;
  const rtl = Math.min(tl, maxH, maxV);
  const rtr = Math.min(tr, maxH, maxV);
  const rbr = Math.min(br, maxH, maxV);
  const rbl = Math.min(bl, maxH, maxV);
  return [
    `M${x + rtl},${y}`,
    `H${x + w - rtr}`,
    rtr > 0 ? `A${rtr},${rtr} 0 0 1 ${x + w},${y + rtr}` : '',
    `V${y + h - rbr}`,
    rbr > 0 ? `A${rbr},${rbr} 0 0 1 ${x + w - rbr},${y + h}` : '',
    `H${x + rbl}`,
    rbl > 0 ? `A${rbl},${rbl} 0 0 1 ${x},${y + h - rbl}` : '',
    `V${y + rtl}`,
    rtl > 0 ? `A${rtl},${rtl} 0 0 1 ${x + rtl},${y}` : '',
    'Z',
  ].join('');
}

// ---------------------------------------------------------------------------
// Effects (shadow, blur, background_blur)
// ---------------------------------------------------------------------------

function resolveEffects(effect: EffectDef | EffectDef[] | undefined): {
  filterAttr: string | undefined;
  defs: React.ReactNode | null;
} {
  if (!effect) return { filterAttr: undefined, defs: null };
  const effects = Array.isArray(effect) ? effect : [effect];
  if (effects.length === 0) return { filterAttr: undefined, defs: null };

  const filterId = `f${++defId}`;
  const primitives: React.ReactNode[] = [];

  for (let i = 0; i < effects.length; i++) {
    const e = effects[i];
    if (e.type === 'shadow') {
      const dx = e.offset?.x ?? 0;
      const dy = e.offset?.y ?? 0;
      const blur = e.blur ?? 4;
      const color = e.color ?? 'rgba(0,0,0,0.3)';

      if (e.shadowType === 'inner') {
        // Inner shadow: flood + composite in + blur + composite atop
        const sfx = `is${i}`;
        primitives.push(
          <feFlood key={`${sfx}-flood`} floodColor={color} result={`${sfx}flood`} />,
          <feComposite key={`${sfx}-comp1`} in={`${sfx}flood`} in2="SourceAlpha" operator="in" result={`${sfx}clip`} />,
          <feGaussianBlur key={`${sfx}-blur`} in={`${sfx}clip`} stdDeviation={blur / 2} result={`${sfx}blur`} />,
          <feOffset key={`${sfx}-off`} in={`${sfx}blur`} dx={dx} dy={dy} result={`${sfx}off`} />,
          <feComposite key={`${sfx}-comp2`} in={`${sfx}off`} in2="SourceAlpha" operator="in" result={`${sfx}inner`} />,
          <feComposite key={`${sfx}-merge`} in={`${sfx}inner`} in2="SourceGraphic" operator="over" />,
        );
      } else {
        // Outer shadow via feDropShadow
        // Parse alpha from color if hex+alpha (e.g., #4A9FD830)
        let floodColor = color;
        let floodOpacity = 1;
        if (color.length === 9 && color.startsWith('#')) {
          floodColor = color.slice(0, 7);
          floodOpacity = Number.parseInt(color.slice(7), 16) / 255;
        }
        primitives.push(
          <feDropShadow
            key={`ds${i}`}
            dx={dx} dy={dy}
            stdDeviation={blur / 2}
            floodColor={floodColor}
            floodOpacity={floodOpacity}
          />,
        );
      }
    } else if (e.type === 'blur') {
      const blur = e.blur ?? 4;
      primitives.push(
        <feGaussianBlur key={`bl${i}`} in="SourceGraphic" stdDeviation={blur / 2} />,
      );
    }
    // background_blur: limited SVG support, skip gracefully
  }

  if (primitives.length === 0) return { filterAttr: undefined, defs: null };

  const filterDef = (
    <filter id={filterId} x="-50%" y="-50%" width="200%" height="200%">
      {primitives}
    </filter>
  );

  return { filterAttr: `url(#${filterId})`, defs: filterDef };
}

// ---------------------------------------------------------------------------
// Rect/shape renderer helpers (apply stroke inset + corner radius)
// ---------------------------------------------------------------------------

function renderRect(
  x: number, y: number, w: number, h: number,
  cr: number | [number, number, number, number] | undefined,
  fillAttr: string, strokeAttr: string, strokeWidth: number,
  inset: number, opacity: number | undefined,
  filterAttr: string | undefined,
) {
  const ix = x + inset;
  const iy = y + inset;
  const iw = Math.max(0, w - inset * 2);
  const ih = Math.max(0, h - inset * 2);

  if (!isUniformRadius(cr) && Array.isArray(cr)) {
    const d = roundedRectPath(ix, iy, iw, ih, cr);
    return (
      <path d={d} fill={fillAttr} stroke={strokeAttr} strokeWidth={strokeWidth}
        opacity={opacity} filter={filterAttr} />
    );
  }
  const rx = getUniformRx(cr);
  return (
    <rect x={ix} y={iy} width={iw} height={ih} rx={rx}
      fill={fillAttr} stroke={strokeAttr} strokeWidth={strokeWidth}
      opacity={opacity} filter={filterAttr} />
  );
}

// ---------------------------------------------------------------------------
// Main render
// ---------------------------------------------------------------------------

export function RenderNode({ node, hiddenIds, variables, nodeIndex, _refDepth = 0 }: {
  node: ResolvedNode;
  hiddenIds?: Set<string>;
  variables?: Record<string, string>;
  nodeIndex?: Map<string, ResolvedNode>;
  _refDepth?: number;
}) {
  if (hiddenIds?.has(node.id)) return null;

  const { attr: fillAttr, defs: fillDefs } = resolveFill(node.fill, variables);
  const { strokeAttr, strokeWidth, inset } = resolveStroke(node.stroke, variables);
  const { filterAttr, defs: filterDefs } = resolveEffects(node.effect);

  switch (node.type) {
    case 'rectangle':
      return (
        <>
          {fillDefs}
          {filterDefs && <defs>{filterDefs}</defs>}
          {renderRect(
            node.resolvedX, node.resolvedY, node.resolvedWidth, node.resolvedHeight,
            node.cornerRadius, fillAttr, strokeAttr, strokeWidth, inset, node.opacity, filterAttr,
          )}
        </>
      );

    case 'ellipse': {
      const hw = Math.max(0, node.resolvedWidth / 2);
      const hh = Math.max(0, node.resolvedHeight / 2);
      return (
        <>
          {fillDefs}
          {filterDefs && <defs>{filterDefs}</defs>}
          <ellipse
            cx={node.resolvedX + node.resolvedWidth / 2}
            cy={node.resolvedY + node.resolvedHeight / 2}
            rx={Math.max(0, hw - inset)}
            ry={Math.max(0, hh - inset)}
            fill={fillAttr}
            stroke={strokeAttr}
            strokeWidth={strokeWidth}
            opacity={node.opacity}
            filter={filterAttr}
          />
        </>
      );
    }

    case 'text': {
      let textColor = '#ffffff';
      if (typeof node.fill === 'string') {
        if (node.fill.startsWith('$')) {
          textColor = resolveVar(node.fill, variables) ?? '#ffffff';
        } else {
          textColor = node.fill;
        }
      }
      return (
        <foreignObject
          x={node.resolvedX}
          y={node.resolvedY}
          width={Math.max(node.resolvedWidth, 20)}
          height={Math.max(node.resolvedHeight, 14)}
          filter={filterAttr}
        >
          {filterDefs}
          <div
            {...{ xmlns: 'http://www.w3.org/1999/xhtml' } as React.HTMLAttributes<HTMLDivElement>}
            style={{
              fontFamily: node.fontFamily || 'sans-serif',
              fontSize: node.fontSize || 14,
              fontWeight: node.fontWeight || 'normal',
              fontStyle: (node.fontStyle as string) || 'normal',
              color: textColor,
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
    }

    case 'icon_font': {
      const iconColor = typeof node.fill === 'string' && !node.fill.startsWith('$')
        ? node.fill
        : resolveVar(node.fill as string, variables) ?? '#4A9FD8';
      const iconW = node.resolvedWidth || 24;
      const iconH = node.resolvedHeight || 24;
      const iconContent = node.iconCodepoint ?? node.iconFontName;
      if (iconContent && node.iconFontFamily) {
        return (
          <foreignObject x={node.resolvedX} y={node.resolvedY} width={iconW} height={iconH} filter={filterAttr}>
            <div
              {...{ xmlns: 'http://www.w3.org/1999/xhtml' } as React.HTMLAttributes<HTMLDivElement>}
              style={{
                fontFamily: node.iconFontFamily,
                fontSize: Math.min(iconW, iconH),
                color: iconColor,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: '100%', height: '100%',
                lineHeight: 1,
              }}>
              {iconContent}
            </div>
          </foreignObject>
        );
      }
      return (
        <rect x={node.resolvedX} y={node.resolvedY} width={iconW} height={iconH}
          rx={4} fill={iconColor} opacity={0.6} filter={filterAttr} />
      );
    }

    case 'image': {
      const w = Math.max(0, node.resolvedWidth);
      const h = Math.max(0, node.resolvedHeight);
      const clipId = `img-clip-${node.id}`;
      const rx = getUniformRx(node.cornerRadius);
      const hasClip = rx > 0 || (!isUniformRadius(node.cornerRadius) && Array.isArray(node.cornerRadius));
      if (node.src) {
        return (
          <>
            {hasClip && (
              <defs>
                <clipPath id={clipId}>
                  {!isUniformRadius(node.cornerRadius) && Array.isArray(node.cornerRadius) ? (
                    <path d={roundedRectPath(node.resolvedX, node.resolvedY, w, h, node.cornerRadius)} />
                  ) : (
                    <rect x={node.resolvedX} y={node.resolvedY} width={w} height={h} rx={rx} />
                  )}
                </clipPath>
              </defs>
            )}
            <image
              href={node.src}
              x={node.resolvedX} y={node.resolvedY}
              width={w} height={h}
              preserveAspectRatio="xMidYMid slice"
              clipPath={hasClip ? `url(#${clipId})` : undefined}
              opacity={node.opacity}
              filter={filterAttr}
            />
          </>
        );
      }
      // Placeholder for missing image
      return (
        <g filter={filterAttr}>
          <rect x={node.resolvedX} y={node.resolvedY} width={w} height={h} rx={rx} fill="#1a1a1a" stroke="#333" strokeWidth={1} opacity={node.opacity} />
          <svg x={node.resolvedX + w / 2 - 10} y={node.resolvedY + h / 2 - 10} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#555" strokeWidth="1.5">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <polyline points="21 15 16 10 5 21" />
          </svg>
        </g>
      );
    }

    case 'line': {
      if (node.points && node.points.length >= 2) {
        const [[x1, y1], [x2, y2]] = node.points;
        return (
          <>
            {filterDefs && <defs>{filterDefs}</defs>}
            <line
              x1={node.resolvedX + x1} y1={node.resolvedY + y1}
              x2={node.resolvedX + x2} y2={node.resolvedY + y2}
              stroke={strokeAttr !== 'none' ? strokeAttr : fillAttr}
              strokeWidth={strokeWidth || 1}
              opacity={node.opacity}
              filter={filterAttr}
            />
          </>
        );
      }
      if (node.geometry) {
        return (
          <>
            {filterDefs && <defs>{filterDefs}</defs>}
            <g transform={`translate(${node.resolvedX},${node.resolvedY})`} filter={filterAttr}>
              <path d={node.geometry} fill="none" stroke={strokeAttr !== 'none' ? strokeAttr : fillAttr} strokeWidth={strokeWidth || 1} opacity={node.opacity} />
            </g>
          </>
        );
      }
      return null;
    }

    case 'polygon': {
      if (!node.points || node.points.length < 3) return null;
      const pts = node.points.map(([px, py]) => `${node.resolvedX + px},${node.resolvedY + py}`).join(' ');
      return (
        <>
          {fillDefs}
          {filterDefs && <defs>{filterDefs}</defs>}
          <polygon
            points={pts}
            fill={fillAttr}
            stroke={strokeAttr}
            strokeWidth={strokeWidth}
            opacity={node.opacity}
            filter={filterAttr}
          />
        </>
      );
    }

    case 'path':
      if (!node.geometry || node.geometry === '...') return null;
      return (
        <>
          {fillDefs}
          {filterDefs && <defs>{filterDefs}</defs>}
          <g transform={`translate(${node.resolvedX},${node.resolvedY})`} filter={filterAttr}>
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
      const rx = getUniformRx(node.cornerRadius);
      return (
        <g opacity={node.opacity} filter={filterAttr}>
          {fillDefs}
          {filterDefs && <defs>{filterDefs}</defs>}
          {clipId && (
            <defs>
              <clipPath id={clipId}>
                {!isUniformRadius(node.cornerRadius) && Array.isArray(node.cornerRadius) ? (
                  <path d={roundedRectPath(
                    node.resolvedX, node.resolvedY,
                    Math.max(0, node.resolvedWidth), Math.max(0, node.resolvedHeight),
                    node.cornerRadius,
                  )} />
                ) : (
                  <rect
                    x={node.resolvedX} y={node.resolvedY}
                    width={Math.max(0, node.resolvedWidth)}
                    height={Math.max(0, node.resolvedHeight)}
                    rx={rx}
                  />
                )}
              </clipPath>
            </defs>
          )}
          {node.type === 'frame' && renderRect(
            node.resolvedX, node.resolvedY, node.resolvedWidth, node.resolvedHeight,
            node.cornerRadius, fillAttr, strokeAttr, strokeWidth, inset, undefined, undefined,
          )}
          <g clipPath={clipId ? `url(#${clipId})` : undefined}>
            {node.children?.map((child) => (
              <RenderNode key={child.id} node={child} hiddenIds={hiddenIds} variables={variables} nodeIndex={nodeIndex} _refDepth={_refDepth} />
            ))}
          </g>
        </g>
      );
    }

    case 'ref': {
      if (!node.refId || !nodeIndex || _refDepth > 4) return null;
      const target = nodeIndex.get(node.refId);
      if (!target) return null;
      // Render the target subtree translated to this ref's position
      const dx = node.resolvedX - target.resolvedX;
      const dy = node.resolvedY - target.resolvedY;
      return (
        <g transform={`translate(${dx},${dy})`} opacity={node.opacity}>
          <RenderNode node={target} hiddenIds={hiddenIds} variables={variables} nodeIndex={nodeIndex} _refDepth={_refDepth + 1} />
        </g>
      );
    }

    default:
      return null;
  }
}
