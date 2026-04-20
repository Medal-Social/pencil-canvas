import type { PenNode, ResolvedNode } from './types';

/**
 * Flexbox layout resolver for .pen format.
 *
 * Handles:
 * - Horizontal and vertical layout with gap
 * - Padding (all 4 sides)
 * - fill_container (child fills parent's inner dimension)
 * - fit_content (size from children's total)
 * - Absolute positioning (layout: "none" — uses x/y)
 * - justifyContent (start, center, end, space_between)
 * - alignItems (start, center, end)
 * - Text auto-sizing
 */

function parsePadding(p: PenNode['padding']): [number, number, number, number] {
  if (p === undefined) return [0, 0, 0, 0];
  if (typeof p === 'number') return [p, p, p, p];
  if (Array.isArray(p) && p.length === 2)
    return [p[0] as number, p[1] as number, p[0] as number, p[1] as number];
  if (Array.isArray(p) && p.length === 4)
    return p as [number, number, number, number];
  return [0, 0, 0, 0];
}

function isFillContainer(v: number | string | undefined): boolean {
  return typeof v === 'string' && v.startsWith('fill_container');
}

function isFitContent(v: number | string | undefined): boolean {
  return typeof v === 'string' && v.startsWith('fit_content');
}

function parseFitContentFallback(v: string): number {
  const match = v.match(/fit_content\((\d+)\)/);
  return match ? Number(match[1]) : 0;
}

function estimateTextSize(node: PenNode): { width: number; height: number } {
  const fontSize = (typeof node.fontSize === 'number' ? node.fontSize : 14);
  const content = typeof node.content === 'string' ? node.content : '';
  const lines = content.split('\n');
  const lineHeight = typeof node.lineHeight === 'number' ? node.lineHeight : 1.4;
  const charWidth = fontSize * 0.55;
  const maxLineWidth = Math.max(...lines.map(l => l.length * charWidth), 20);
  const height = lines.length * fontSize * lineHeight;
  return { width: maxLineWidth, height: Math.max(height, fontSize * lineHeight) };
}

function resolveRawSize(
  value: number | string | undefined,
  parentInnerSize: number,
  fallback: number,
): number {
  if (value === undefined) return fallback;
  if (typeof value === 'number') return value;
  if (isFillContainer(value)) return parentInnerSize;
  if (isFitContent(value)) return parseFitContentFallback(value) || fallback;
  return fallback;
}

export function resolveLayout(
  node: PenNode,
  parentX: number,
  parentY: number,
  availableWidth: number,
  availableHeight: number,
): ResolvedNode {
  const [padTop, padRight, padBottom, padLeft] = parsePadding(node.padding);

  // Determine this node's size
  let nodeWidth: number;
  let nodeHeight: number;

  if (node.type === 'text') {
    const textSize = estimateTextSize(node);
    nodeWidth = resolveRawSize(node.width, availableWidth, textSize.width);
    nodeHeight = resolveRawSize(node.height, availableHeight, textSize.height);
  } else if (node.type === 'icon_font') {
    nodeWidth = resolveRawSize(node.width, availableWidth, 24);
    nodeHeight = resolveRawSize(node.height, availableHeight, 24);
  } else {
    nodeWidth = resolveRawSize(node.width, availableWidth, 0);
    nodeHeight = resolveRawSize(node.height, availableHeight, 0);
  }

  const layout = node.layout ?? (node.type === 'frame' ? 'horizontal' : 'none');
  const isAbsolute = layout === 'none';
  const isHorizontal = layout === 'horizontal';
  const gap = typeof node.gap === 'number' ? node.gap : 0;
  const justify = node.justifyContent ?? 'start';
  const align = node.alignItems ?? 'start';

  // Resolve children first to know their sizes
  const innerWidth = nodeWidth - padLeft - padRight;
  const innerHeight = nodeHeight - padTop - padBottom;

  let resolvedChildren: ResolvedNode[] | undefined;

  if (node.children && node.children.length > 0) {
    // First pass: resolve each child's size
    const childSizes = node.children.map((child) => {
      const cw = resolveRawSize(
        child.width,
        innerWidth,
        child.type === 'text' ? estimateTextSize(child).width :
        child.type === 'icon_font' ? (typeof child.width === 'number' ? child.width : 24) : 0,
      );
      const ch = resolveRawSize(
        child.height,
        innerHeight,
        child.type === 'text' ? estimateTextSize(child).height :
        child.type === 'icon_font' ? (typeof child.height === 'number' ? child.height : 24) : 0,
      );
      return { width: cw, height: ch };
    });

    // Calculate total children size in main axis for justifyContent
    const totalChildrenMainSize = isHorizontal
      ? childSizes.reduce((sum, s) => sum + s.width, 0) + gap * Math.max(0, childSizes.length - 1)
      : childSizes.reduce((sum, s) => sum + s.height, 0) + gap * Math.max(0, childSizes.length - 1);

    const mainAxisSpace = isHorizontal ? innerWidth : innerHeight;
    const freeSpace = Math.max(0, mainAxisSpace - totalChildrenMainSize);

    // Calculate starting offset based on justifyContent
    let mainOffset: number;
    let extraGap = 0;

    if (justify === 'center') {
      mainOffset = freeSpace / 2;
    } else if (justify === 'end') {
      mainOffset = freeSpace;
    } else if (justify === 'space_between' && childSizes.length > 1) {
      mainOffset = 0;
      extraGap = freeSpace / (childSizes.length - 1);
    } else {
      mainOffset = 0;
    }

    // Second pass: position each child
    resolvedChildren = node.children.map((child, i) => {
      const cs = childSizes[i];

      if (isAbsolute) {
        // Absolute: child uses its own x/y relative to parent's content area
        return resolveLayout(
          { ...child, x: undefined, y: undefined },
          padLeft + (typeof child.x === 'number' ? child.x : 0),
          padTop + (typeof child.y === 'number' ? child.y : 0),
          cs.width || innerWidth,
          cs.height || innerHeight,
        );
      }

      // Flexbox positioning
      let childX: number;
      let childY: number;

      if (isHorizontal) {
        childX = padLeft + mainOffset;
        // Cross-axis alignment
        if (align === 'center') {
          childY = padTop + (innerHeight - cs.height) / 2;
        } else if (align === 'end') {
          childY = padTop + innerHeight - cs.height;
        } else {
          childY = padTop;
        }
        mainOffset += cs.width + gap + extraGap;
      } else {
        // Vertical
        // Cross-axis alignment
        if (align === 'center') {
          childX = padLeft + (innerWidth - cs.width) / 2;
        } else if (align === 'end') {
          childX = padLeft + innerWidth - cs.width;
        } else {
          childX = padLeft;
        }
        childY = padTop + mainOffset;
        mainOffset += cs.height + gap + extraGap;
      }

      return resolveLayout(
        { ...child, width: cs.width, height: cs.height, x: undefined, y: undefined },
        childX,
        childY,
        cs.width,
        cs.height,
      );
    });

    // If this node is fit_content, compute size from children
    if (isFitContent(node.width) || (node.width === undefined && node.type === 'frame')) {
      if (isHorizontal) {
        const computed = childSizes.reduce((sum, s) => sum + s.width, 0) +
          gap * Math.max(0, childSizes.length - 1) + padLeft + padRight;
        if (isFitContent(node.width)) nodeWidth = computed;
        else if (nodeWidth === 0) nodeWidth = computed;
      } else {
        const maxChildWidth = Math.max(...childSizes.map(s => s.width), 0);
        const computed = maxChildWidth + padLeft + padRight;
        if (isFitContent(node.width)) nodeWidth = computed;
        else if (nodeWidth === 0) nodeWidth = computed;
      }
    }

    if (isFitContent(node.height) || (node.height === undefined && node.type === 'frame')) {
      if (isHorizontal) {
        const maxChildHeight = Math.max(...childSizes.map(s => s.height), 0);
        const computed = maxChildHeight + padTop + padBottom;
        if (isFitContent(node.height)) nodeHeight = computed;
        else if (nodeHeight === 0) nodeHeight = computed;
      } else {
        const computed = childSizes.reduce((sum, s) => sum + s.height, 0) +
          gap * Math.max(0, childSizes.length - 1) + padTop + padBottom;
        if (isFitContent(node.height)) nodeHeight = computed;
        else if (nodeHeight === 0) nodeHeight = computed;
      }
    }
  }

  // Root-level nodes use their own x/y. Children in flexbox are positioned by the parent.
  const ownX = typeof node.x === 'number' ? node.x : 0;
  const ownY = typeof node.y === 'number' ? node.y : 0;

  const resolved: ResolvedNode = {
    ...node,
    resolvedX: parentX + ownX,
    resolvedY: parentY + ownY,
    resolvedWidth: nodeWidth,
    resolvedHeight: nodeHeight,
    children: resolvedChildren,
  };

  return resolved;
}
