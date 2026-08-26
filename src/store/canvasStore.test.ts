import { describe, expect, it } from 'vitest';
import { appendCanvasNodes } from './canvasStore';
import type { NodeData } from '../../types';

const node = (id: string): NodeData => ({
  id, type: 'IMAGE', x: 0, y: 0, width: 1, height: 1, src: '', locked: false,
});

describe('appendCanvasNodes', () => {
  it('merges a batch without mutating the existing node list', () => {
    const existing = [node('one')];
    const result = appendCanvasNodes(existing, [node('two'), node('three')]);
    expect(result.map((item) => item.id)).toEqual(['one', 'two', 'three']);
    expect(existing.map((item) => item.id)).toEqual(['one']);
  });
});
