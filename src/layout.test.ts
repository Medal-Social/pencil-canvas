import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveLayout } from './layout';
import { parseNodeTree } from './parser';
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
      id: 'row',
      type: 'frame',
      width: 200,
      height: 50,
      layout: 'horizontal',
      gap: 10,
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
      id: 'col',
      type: 'frame',
      width: 100,
      height: 200,
      layout: 'vertical',
      gap: 8,
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
      id: 'padded',
      type: 'frame',
      width: 200,
      height: 100,
      layout: 'vertical',
      padding: 16,
      children: [{ id: 'child', type: 'rectangle', width: 50, height: 30 }],
    };
    const resolved = resolveLayout(node, 0, 0, 1000, 1000);
    expect(resolved.children![0].resolvedX).toBe(16);
    expect(resolved.children![0].resolvedY).toBe(16);
  });

  it('resolves fill_container width', () => {
    const node: PenNode = {
      id: 'parent',
      type: 'frame',
      width: 300,
      height: 100,
      layout: 'vertical',
      padding: 20,
      children: [{ id: 'child', type: 'frame', width: 'fill_container', height: 40 }],
    };
    const resolved = resolveLayout(node, 0, 0, 1000, 1000);
    expect(resolved.children![0].resolvedWidth).toBe(260);
  });

  it('positions later siblings using the resolved height of auto-sized frames', () => {
    const node: PenNode = {
      id: 'parent',
      type: 'frame',
      width: 320,
      height: 220,
      layout: 'vertical',
      gap: 12,
      children: [
        {
          id: 'auto',
          type: 'frame',
          width: 'fill_container',
          layout: 'vertical',
          padding: 10,
          children: [{ id: 'label', type: 'text', content: 'Hello', fontSize: 20 }],
        },
        { id: 'after', type: 'rectangle', width: 40, height: 24 },
      ],
    };

    const resolved = resolveLayout(node, 0, 0, 1000, 1000);
    const [auto, after] = resolved.children ?? [];

    expect(auto.resolvedHeight).toBeGreaterThan(0);
    expect(after.resolvedY).toBe(auto.resolvedY + auto.resolvedHeight + 12);
  });

  it('clamps fill_container dimensions when padding exceeds the available space', () => {
    const node: PenNode = {
      id: 'tight',
      type: 'frame',
      width: 30,
      height: 30,
      layout: 'vertical',
      padding: 20,
      children: [{ id: 'child', type: 'frame', width: 'fill_container', height: 'fill_container' }],
    };

    const resolved = resolveLayout(node, 0, 0, 1000, 1000);
    const child = resolved.children?.[0];

    expect(child?.resolvedWidth).toBe(0);
    expect(child?.resolvedHeight).toBe(0);
  });

  it('resolves fit_content from nested text inside a fill_container frame', () => {
    const node: PenNode = {
      id: 'root',
      type: 'frame',
      width: 360,
      height: 280,
      layout: 'vertical',
      padding: 20,
      gap: 8,
      children: [
        {
          id: 'content',
          type: 'frame',
          width: 'fill_container',
          layout: 'vertical',
          padding: 12,
          children: [
            {
              id: 'title',
              type: 'text',
              content: 'Line one\nLine two',
              fontSize: 16,
              lineHeight: 1.25,
            },
          ],
        },
        { id: 'footer', type: 'rectangle', width: 40, height: 18 },
      ],
    };

    const resolved = resolveLayout(node, 0, 0, 1000, 1000);
    const [content, footer] = resolved.children ?? [];
    const title = content.children?.[0];
    if (!title) throw new Error('expected title child');

    expect(content.resolvedWidth).toBe(320);
    expect(content.resolvedHeight).toBe(title.resolvedHeight + 24);
    expect(footer.resolvedY).toBe(content.resolvedY + content.resolvedHeight + 8);
  });

  it('keeps real export vertical flow stable when intermediate frames are auto-sized', () => {
    const fixturePath = join(
      __dirname,
      '..',
      '..',
      'dashboard',
      'src',
      'data',
      'pencil-exports',
      'studio.json'
    );
    if (!existsSync(fixturePath)) {
      // Fixture lives in a sibling Picasso workspace that isn't cloned alongside this repo; skip here.
      return;
    }
    const fixture = JSON.parse(readFileSync(fixturePath, 'utf8')) as PenNode[];
    const root = parseNodeTree(fixture)[0];
    const resolved = resolveLayout(root, 0, 0, Number(root.width ?? 0), Number(root.height ?? 0));

    const screen = resolved.children?.find((child) => child.name === 'Screen');
    const timeRow = screen?.children?.find((child) => child.name === 'timeRow');
    const spacer = screen?.children?.find((child) => child.name === 'spacer1');
    const appGrid = screen?.children?.find((child) => child.name === 'App Grid');
    const quickActions = screen?.children?.find((child) => child.name === 'quickActions');

    expect(screen).toBeDefined();
    expect(timeRow).toBeDefined();
    expect(spacer).toBeDefined();
    expect(appGrid).toBeDefined();
    expect(quickActions).toBeDefined();
    expect(timeRow?.resolvedHeight).toBeGreaterThan(0);
    expect(spacer?.resolvedY).toBe(timeRow!.resolvedY + timeRow!.resolvedHeight + 16);
    expect(appGrid?.resolvedY).toBe(spacer!.resolvedY + spacer!.resolvedHeight + 16);
    expect(quickActions?.resolvedY).toBe(appGrid!.resolvedY + appGrid!.resolvedHeight + 16);
  });
});
