import { MarkerType } from '@xyflow/react';
import { NODE_CONFIG } from '@/components/funil/nodeConfig';

export function getNodeEdgeColor(node) {
  if (!node?.data?.type) return '#64748B';
  const cfg = NODE_CONFIG[node.data.type] || {};
  return cfg.borderColor || cfg.bg || cfg.ctaColor || '#64748B';
}

export function buildColoredEdge(params, nodes) {
  const sourceNode = nodes.find((n) => n.id === params.source);
  const color = getNodeEdgeColor(sourceNode);

  return {
    ...params,
    type: 'smoothstep',
    markerEnd: { type: MarkerType.ArrowClosed, color, width: 14, height: 14 },
    style: { stroke: color, strokeWidth: 2 },
  };
}

export function colorizeEdges(edges, nodes) {
  if (!edges?.length) return [];

  return edges.map((edge) => {
    const sourceNode = nodes.find((n) => n.id === edge.source);
    const color = getNodeEdgeColor(sourceNode);

    return {
      ...edge,
      type: edge.type || 'smoothstep',
      markerEnd: { type: MarkerType.ArrowClosed, color, width: 14, height: 14 },
      style: {
        ...(edge.style || {}),
        stroke: color,
        strokeWidth: edge.style?.strokeWidth || 2,
      },
    };
  });
}
