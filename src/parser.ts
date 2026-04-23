import type { PenNode } from './types';

export function parseNodeTree(data: unknown[]): PenNode[] {
  return data.map(parseNode);
}

function parseNode(raw: unknown): PenNode {
  const obj = raw as Record<string, unknown>;
  const node: PenNode = {
    id: String(obj.id ?? ''),
    type: String(obj.type ?? 'frame') as PenNode['type'],
  };

  const props = [
    'name',
    'x',
    'y',
    'width',
    'height',
    'fill',
    'stroke',
    'opacity',
    'cornerRadius',
    'layout',
    'gap',
    'padding',
    'justifyContent',
    'alignItems',
    'content',
    'fontFamily',
    'fontSize',
    'fontWeight',
    'letterSpacing',
    'textAlign',
    'lineHeight',
    'textGrowth',
    'iconFontFamily',
    'iconFontName',
    'iconCodepoint',
    'geometry',
    'viewBox',
    'clip',
    'effect',
    'src',
    'points',
    'fontStyle',
    'refId',
  ] as const;

  for (const prop of props) {
    if (obj[prop] !== undefined && obj[prop] !== null) {
      (node as unknown as Record<string, unknown>)[prop] = obj[prop];
    }
  }

  if (Array.isArray(obj.children)) {
    node.children = obj.children.map(parseNode);
  }

  return node;
}
