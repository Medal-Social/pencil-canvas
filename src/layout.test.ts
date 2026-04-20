import { describe, expect, it } from 'vitest';
import { resolveLayout } from './layout';
import type { PenNode } from './types';

describe('resolveLayout', () => {
  it('resolves a fixed-size node', () => {
    const node: PenNode = { id: 'a', type: 'frame', width: 100, height: 50, x: 10, y: 20 };
    const resolved = resolveLayout(node, 0, 0, 1000, 1000);
    expect(resolved.resolvedX).toBe(10);
    expect(resolved.resolvedY).toBe(20);
    expect(resolved.resolvedWidth).toBe(100);
    expect(resolved.resolvedHeight).toBe(50);
  });

  it('resolves horizontal layout with gap', () => {
    const node: PenNode = {
      id: 'row', type: 'frame', width: 200, height: 50,
      layout: 'horizontal', gap: 10,
      children: [
        { id: 'a', type: 'rectangle', width: 50, height: 30 },
        { id: 'b', type: 'rectangle', width: 50, height: 30 },
      ],
    };
    const resolved = resolveLayout(node, 0, 0, 1000, 1000);
    expect(resolved.children![0].resolvedX).toBe(0);
    expect(resolved.children![1].resolvedX).toBe(60);
  });

  it('resolves vertical layout with gap', () => {
    const node: PenNode = {
      id: 'col', type: 'frame', width: 100, height: 200,
      layout: 'vertical', gap: 8,
      children: [
        { id: 'a', type: 'rectangle', width: 80, height: 40 },
        { id: 'b', type: 'rectangle', width: 80, height: 40 },
      ],
    };
    const resolved = resolveLayout(node, 0, 0, 1000, 1000);
    expect(resolved.children![0].resolvedY).toBe(0);
    expect(resolved.children![1].resolvedY).toBe(48);
  });

  it('resolves padding', () => {
    const node: PenNode = {
      id: 'padded', type: 'frame', width: 200, height: 100,
      layout: 'vertical', padding: 16,
      children: [{ id: 'child', type: 'rectangle', width: 50, height: 30 }],
    };
    const resolved = resolveLayout(node, 0, 0, 1000, 1000);
    expect(resolved.children![0].resolvedX).toBe(16);
    expect(resolved.children![0].resolvedY).toBe(16);
  });

  it('resolves fill_container width', () => {
    const node: PenNode = {
      id: 'parent', type: 'frame', width: 300, height: 100,
      layout: 'vertical', padding: 20,
      children: [{ id: 'child', type: 'frame', width: 'fill_container', height: 40 }],
    };
    const resolved = resolveLayout(node, 0, 0, 1000, 1000);
    expect(resolved.children![0].resolvedWidth).toBe(260);
  });
});
