import type { PenNode, ResolvedNode } from './types';

type LayoutMode = NonNullable<PenNode['layout']>;

interface Size {
  width: number;
  height: number;
}

interface MeasuredChild {
  node: ResolvedNode;
  source: PenNode;
}

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

function clampSize(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return value;
}

function parsePadding(p: PenNode['padding']): [number, number, number, number] {
  if (p === undefined) return [0, 0, 0, 0];
  if (typeof p === 'number') return [p, p, p, p];
  if (Array.isArray(p) && p.length === 2) {
    return [p[0] as number, p[1] as number, p[0] as number, p[1] as number];
  }
  if (Array.isArray(p) && p.length === 4) {
    return p as [number, number, number, number];
  }
  return [0, 0, 0, 0];
}

function resolveLayoutMode(node: PenNode): LayoutMode {
  return node.layout ?? (node.type === 'frame' ? 'horizontal' : 'none');
}

function isFillContainer(value: number | string | undefined): value is string {
  return typeof value === 'string' && value.startsWith('fill_container');
}

function isFitContent(value: number | string | undefined): value is string {
  return typeof value === 'string' && value.startsWith('fit_content');
}

function parseFitContentFallback(value: string): number {
  const match = value.match(/fit_content\((\d+(?:\.\d+)?)\)/);
  return match ? Number(match[1]) : 0;
}

let measureCanvas: CanvasRenderingContext2D | null | undefined;
const measureCache = new Map<string, number>();

function measureTextWidth(text: string, font: string): number | undefined {
  if (typeof document === 'undefined') return undefined;
  if (measureCanvas === undefined) {
    const el = document.createElement('canvas');
    measureCanvas = el.getContext('2d');
  }
  if (!measureCanvas) return undefined;
  const cacheKey = `${font}|${text}`;
  const cached = measureCache.get(cacheKey);
  if (cached !== undefined) return cached;
  measureCanvas.font = font;
  const w = measureCanvas.measureText(text).width;
  measureCache.set(cacheKey, w);
  return w;
}

function estimateTextSize(node: PenNode): Size {
  const fontSize = typeof node.fontSize === 'number' ? node.fontSize : 14;
  const content = typeof node.content === 'string' ? node.content : '';
  const lines = content.split('\n');
  const lineHeight = typeof node.lineHeight === 'number' ? node.lineHeight : 1.4;
  const fontWeight = node.fontWeight ?? 'normal';
  const fontFamily = node.fontFamily ?? 'sans-serif';
  const font = `${fontWeight} ${fontSize}px ${fontFamily}`;
  const letterSpacing = node.letterSpacing ?? 0;

  let maxLineWidth = 20;
  for (const line of lines) {
    const measured = measureTextWidth(line, font);
    const w = measured !== undefined
      ? measured + line.length * letterSpacing
      : line.length * fontSize * 0.55;
    if (w > maxLineWidth) maxLineWidth = w;
  }

  const height = lines.length * fontSize * lineHeight;
  return {
    width: clampSize(maxLineWidth),
    height: clampSize(Math.max(height, fontSize * lineHeight)),
  };
}

function getIntrinsicSize(node: PenNode): Size {
  if (node.type === 'text') {
    return estimateTextSize(node);
  }
  if (node.type === 'icon_font') {
    return { width: 24, height: 24 };
  }
  if (node.type === 'image') {
    return { width: 100, height: 100 };
  }
  if (node.type === 'line' && node.points && node.points.length >= 2) {
    const xs = node.points.map((p) => p[0]);
    const ys = node.points.map((p) => p[1]);
    return { width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
  }
  return { width: 0, height: 0 };
}

function resolveSizeValue(
  value: number | string | undefined,
  available: number,
  fallback: number,
): number {
  if (typeof value === 'number') return clampSize(value);
  if (isFillContainer(value)) return clampSize(available);
  if (isFitContent(value)) return clampSize(parseFitContentFallback(value) || fallback);
  return clampSize(fallback);
}

function getInitialNodeSize(node: PenNode, availableWidth: number, availableHeight: number): Size {
  const intrinsic = getIntrinsicSize(node);

  return {
    width: resolveSizeValue(node.width, availableWidth, intrinsic.width),
    height: resolveSizeValue(node.height, availableHeight, intrinsic.height),
  };
}

function shouldAutoSizeWidth(node: PenNode): boolean {
  return isFitContent(node.width) || (node.width === undefined && node.type === 'frame');
}

function shouldAutoSizeHeight(node: PenNode): boolean {
  return isFitContent(node.height) || (node.height === undefined && node.type === 'frame');
}

function getInnerSize(width: number, height: number, padding: [number, number, number, number]): Size {
  const [padTop, padRight, padBottom, padLeft] = padding;
  return {
    width: clampSize(width - padLeft - padRight),
    height: clampSize(height - padTop - padBottom),
  };
}

function getMeasuredContentSize(
  layout: LayoutMode,
  children: MeasuredChild[],
  gap: number,
): Size {
  if (children.length === 0) {
    return { width: 0, height: 0 };
  }

  if (layout === 'horizontal') {
    return {
      width: children.reduce((sum, child) => sum + child.node.resolvedWidth, 0) +
        gap * Math.max(0, children.length - 1),
      height: Math.max(...children.map((child) => child.node.resolvedHeight), 0),
    };
  }

  if (layout === 'vertical') {
    return {
      width: Math.max(...children.map((child) => child.node.resolvedWidth), 0),
      height: children.reduce((sum, child) => sum + child.node.resolvedHeight, 0) +
        gap * Math.max(0, children.length - 1),
    };
  }

  return {
    width: Math.max(
      ...children.map((child) =>
        clampSize((typeof child.source.x === 'number' ? child.source.x : 0) + child.node.resolvedWidth)
      ),
      0,
    ),
    height: Math.max(
      ...children.map((child) =>
        clampSize((typeof child.source.y === 'number' ? child.source.y : 0) + child.node.resolvedHeight)
      ),
      0,
    ),
  };
}

function measureChildren(
  children: PenNode[],
  availableWidth: number,
  availableHeight: number,
): MeasuredChild[] {
  return children.map((child) => ({
    source: child,
    node: resolveLayout({ ...child, x: undefined, y: undefined }, 0, 0, availableWidth, availableHeight),
  }));
}

export function resolveLayout(
  node: PenNode,
  parentX: number,
  parentY: number,
  availableWidth: number,
  availableHeight: number,
): ResolvedNode {
  const ownX = typeof node.x === 'number' ? node.x : 0;
  const ownY = typeof node.y === 'number' ? node.y : 0;
  const resolvedX = parentX + ownX;
  const resolvedY = parentY + ownY;
  const padding = parsePadding(node.padding);
  const [padTop, padRight, padBottom, padLeft] = padding;
  const layout = resolveLayoutMode(node);
  const gap = typeof node.gap === 'number' ? node.gap : 0;
  const justify = node.justifyContent ?? 'start';
  const align = node.alignItems ?? 'start';

  let { width: nodeWidth, height: nodeHeight } = getInitialNodeSize(
    node,
    availableWidth,
    availableHeight,
  );
  let innerSize = getInnerSize(nodeWidth, nodeHeight, padding);
  let measuredChildren: MeasuredChild[] = [];

  if (node.children && node.children.length > 0) {
    measuredChildren = measureChildren(node.children, innerSize.width, innerSize.height);

    const contentSize = getMeasuredContentSize(layout, measuredChildren, gap);
    let finalWidth = nodeWidth;
    let finalHeight = nodeHeight;

    if (shouldAutoSizeWidth(node)) {
      finalWidth = clampSize(contentSize.width + padLeft + padRight);
    }

    if (shouldAutoSizeHeight(node)) {
      finalHeight = clampSize(contentSize.height + padTop + padBottom);
    }

    if (finalWidth !== nodeWidth || finalHeight !== nodeHeight) {
      nodeWidth = finalWidth;
      nodeHeight = finalHeight;
      innerSize = getInnerSize(nodeWidth, nodeHeight, padding);
      measuredChildren = measureChildren(node.children, innerSize.width, innerSize.height);
    } else {
      nodeWidth = finalWidth;
      nodeHeight = finalHeight;
    }
  }

  const innerWidth = innerSize.width;
  const innerHeight = innerSize.height;
  let resolvedChildren: ResolvedNode[] | undefined;

  if (measuredChildren.length > 0) {
    const totalChildrenMainSize = layout === 'horizontal'
      ? measuredChildren.reduce((sum, child) => sum + child.node.resolvedWidth, 0) +
        gap * Math.max(0, measuredChildren.length - 1)
      : layout === 'vertical'
      ? measuredChildren.reduce((sum, child) => sum + child.node.resolvedHeight, 0) +
        gap * Math.max(0, measuredChildren.length - 1)
      : 0;

    const mainAxisSpace = layout === 'horizontal' ? innerWidth : layout === 'vertical' ? innerHeight : 0;
    const freeSpace = clampSize(mainAxisSpace - totalChildrenMainSize);

    let mainOffset = 0;
    let extraGap = 0;

    if (layout !== 'none') {
      if (justify === 'center') {
        mainOffset = freeSpace / 2;
      } else if (justify === 'end') {
        mainOffset = freeSpace;
      } else if (justify === 'space_between' && measuredChildren.length > 1) {
        extraGap = freeSpace / (measuredChildren.length - 1);
      }
    }

    resolvedChildren = measuredChildren.map(({ source, node: measuredChild }) => {
      let childLocalX = padLeft;
      let childLocalY = padTop;

      if (layout === 'none') {
        childLocalX = padLeft + (typeof source.x === 'number' ? source.x : 0);
        childLocalY = padTop + (typeof source.y === 'number' ? source.y : 0);
      } else if (layout === 'horizontal') {
        childLocalX = padLeft + mainOffset;
        if (align === 'center') {
          childLocalY = padTop + (innerHeight - measuredChild.resolvedHeight) / 2;
        } else if (align === 'end') {
          childLocalY = padTop + innerHeight - measuredChild.resolvedHeight;
        }
        mainOffset += measuredChild.resolvedWidth + gap + extraGap;
      } else {
        childLocalY = padTop + mainOffset;
        if (align === 'center') {
          childLocalX = padLeft + (innerWidth - measuredChild.resolvedWidth) / 2;
        } else if (align === 'end') {
          childLocalX = padLeft + innerWidth - measuredChild.resolvedWidth;
        }
        mainOffset += measuredChild.resolvedHeight + gap + extraGap;
      }

      return resolveLayout(
        { ...source, x: undefined, y: undefined },
        resolvedX + clampSize(childLocalX),
        resolvedY + clampSize(childLocalY),
        innerWidth,
        innerHeight,
      );
    });
  }

  return {
    ...node,
    resolvedX,
    resolvedY,
    resolvedWidth: nodeWidth,
    resolvedHeight: nodeHeight,
    children: resolvedChildren,
  };
}
