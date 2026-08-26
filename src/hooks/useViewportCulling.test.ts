import { describe, expect, it } from 'vitest';
import { filterNodesToViewport } from './useViewportCulling';
import type { NodeData } from '../../types';

const image = (id: string, x: number, y = 0): NodeData => ({
  id, type: 'IMAGE', x, y, width: 100, height: 100, src: '', locked: false,
});

describe('filterNodesToViewport', () => {
  it('includes nodes inside the viewport buffer and excludes distant nodes', () => {
    const visible = filterNodesToViewport(
      [image('near', -250), image('far', -301)],
      { offset: { x: 0, y: 0 }, scale: 1 },
      { width: 500, height: 500 },
      200,
    );
    expect(visible.map((item) => item.id)).toEqual(['near']);
  });
});
