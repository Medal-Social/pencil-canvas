import type { PenNode, ResolvedNode } from './types';

function parsePadding(p: PenNode['padding']): [number, number, number, number] {
  if (p === undefined) return [0, 0, 0, 0];
  if (typeof p === 'number') return [p, p, p, p];
  if (p.length === 2) return [p[0] as number, p[1] as number, p[0] as number, p[1] as number];
  return p as [number, number, number, number];
}

function resolveSize(value: number | string | undefined, parentSize: number): number {
  if (value === undefined) return 0;
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && value.startsWith('fill_container')) return parentSize;
  return 0;
}

export function resolveLayout(
  node: PenNode, parentX: number, parentY: number,
  availableWidth: number, availableHeight: number,
): ResolvedNode {
  const [padTop, padRight, padBottom, padLeft] = parsePadding(node.padding);
  const nodeWidth = resolveSize(node.width, availableWidth);
  const nodeHeight = resolveSize(node.height, availableHeight);

  const resolved: ResolvedNode = {
    ...node,
    resolvedX: parentX + (typeof node.x === 'number' ? node.x : 0),
    resolvedY: parentY + (typeof node.y === 'number' ? node.y : 0),
    resolvedWidth: nodeWidth,
    resolvedHeight: nodeHeight,
  };

  if (!node.children || node.children.length === 0) return resolved;

  const innerWidth = nodeWidth - padLeft - padRight;
  const innerHeight = nodeHeight - padTop - padBottom;
  const gap = typeof node.gap === 'number' ? node.gap : 0;
  const layout = node.layout ?? (node.type === 'frame' ? 'horizontal' : 'none');

  let offsetX = padLeft;
  let offsetY = padTop;

  resolved.children = node.children.map((child) => {
    const childWidth = resolveSize(child.width, innerWidth);
    const childHeight = resolveSize(child.height, innerHeight);

    const childResolved = resolveLayout(
      { ...child, width: childWidth || child.width, height: childHeight || child.height },
      layout === 'none' ? padLeft : offsetX,
      layout === 'none' ? padTop : offsetY,
      innerWidth, innerHeight,
    );

    if (layout === 'horizontal') offsetX += childResolved.resolvedWidth + gap;
    else if (layout === 'vertical') offsetY += childResolved.resolvedHeight + gap;

    return childResolved;
  });

  return resolved;
}
