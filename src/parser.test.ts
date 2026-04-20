import { describe, expect, it } from 'vitest';
import { parseNodeTree } from './parser';

describe('parseNodeTree', () => {
  it('parses a simple frame', () => {
    const input = [{ id: 'a', type: 'frame', width: 100, height: 50, children: [] }];
    const result = parseNodeTree(input);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('a');
    expect(result[0].type).toBe('frame');
  });

  it('parses nested children', () => {
    const input = [{
      id: 'parent', type: 'frame', width: 200, height: 100,
      children: [{ id: 'child', type: 'text', content: 'Hello' }]
    }];
    const result = parseNodeTree(input);
    expect(result[0].children).toHaveLength(1);
    expect(result[0].children![0].id).toBe('child');
  });

  it('handles nodes without children', () => {
    const input = [{ id: 'rect', type: 'rectangle', width: 50, height: 50 }];
    const result = parseNodeTree(input);
    expect(result[0].children).toBeUndefined();
  });

  it('drops nullish export fields that should fall back to resolver defaults', () => {
    const input = [{
      id: 'frame-1',
      type: 'frame',
      width: 'fill_container',
      layout: null,
      padding: null,
      justifyContent: null,
      alignItems: null,
      children: [],
    }];

    const result = parseNodeTree(input);

    expect(result[0].layout).toBeUndefined();
    expect(result[0].padding).toBeUndefined();
    expect(result[0].justifyContent).toBeUndefined();
    expect(result[0].alignItems).toBeUndefined();
  });
});
