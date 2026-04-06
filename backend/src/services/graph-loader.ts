import nodes from '../data/nodes.json' with { type: 'json' };
import edges from '../data/edges.json' with { type: 'json' };
import { GraphEdge, GraphNode } from '../models/types';

export function loadGraph(): {
  nodes: GraphNode[];
  edges: GraphEdge[];
  nodesMap: Map<string, GraphNode>;
  adjacency: Map<string, GraphEdge[]>;
} {
  const typedNodes = nodes as GraphNode[];
  const typedEdges = edges as GraphEdge[];

  const nodesMap = new Map<string, GraphNode>();
  const adjacency = new Map<string, GraphEdge[]>();

  for (const node of typedNodes) {
    nodesMap.set(node.id, node);
    adjacency.set(node.id, []);
  }

  for (const edge of typedEdges) {
    adjacency.get(edge.from)?.push(edge);

    if (edge.bidirectional) {
      adjacency.get(edge.to)?.push({
        ...edge,
        id: `${edge.id}_rev`,
        from: edge.to,
        to: edge.from,
        geometry: [...edge.geometry].reverse() as Array<[number, number, number]>,
      });
    }
  }

  return {
    nodes: typedNodes,
    edges: typedEdges,
    nodesMap,
    adjacency,
  };
}