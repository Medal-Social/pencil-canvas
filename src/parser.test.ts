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
});
