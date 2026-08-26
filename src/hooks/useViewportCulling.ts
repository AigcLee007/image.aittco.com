import { useMemo } from 'react';
import { NodeData, CanvasState } from '../../types';

interface ViewportCullingOptions {
  nodes: NodeData[];
  canvasState: CanvasState;
  stageSize: { width: number; height: number };
  buffer?: number;
}

export const filterNodesToViewport = (
  nodes: NodeData[],
  canvasState: CanvasState,
  stageSize: { width: number; height: number },
  buffer: number,
) => {
  const viewportX = -canvasState.offset.x / canvasState.scale;
  const viewportY = -canvasState.offset.y / canvasState.scale;
  const viewportW = stageSize.width / canvasState.scale;
  const viewportH = stageSize.height / canvasState.scale;
  return nodes.filter(node =>
    node.x + node.width > viewportX - buffer &&
    node.x < viewportX + viewportW + buffer &&
    node.y + node.height > viewportY - buffer &&
    node.y < viewportY + viewportH + buffer,
  );
};

/**
 * Filters nodes to returns only those currently visible in the viewport (plus a buffer)
 */
export const useViewportCulling = ({
  nodes,
  canvasState,
  stageSize,
  buffer = 500
}: ViewportCullingOptions) => {
  const visibleNodes = useMemo(() => {
    return filterNodesToViewport(nodes, canvasState, stageSize, buffer);
  }, [nodes, canvasState, stageSize, buffer]);

  return visibleNodes;
};
