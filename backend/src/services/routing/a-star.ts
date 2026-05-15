import { GraphEdge, GraphNode, UserProfile } from '../../models/types';
import { edgeCost } from './cost';
import { heuristic3D } from './heuristic';
import { isEdgeAllowed } from './constraints';

function getLowest(openSet: Set<string>, fScore: Map<string, number>): string {
  let bestId = '';
  let bestScore = Number.POSITIVE_INFINITY;

  for (const id of openSet) {
    const score = fScore.get(id) ?? Number.POSITIVE_INFINITY;
    if (score < bestScore) {
      bestScore = score;
      bestId = id;
    }
  }

  return bestId;
}

export function aStarSearch(
  startId: string,
  goalId: string,
  nodesMap: Map<string, GraphNode>,
  adjacency: Map<string, GraphEdge[]>,
  profile: UserProfile
) {
  const openSet = new Set<string>([startId]);
  const cameFromNode = new Map<string, string>();
  const cameFromEdge = new Map<string, GraphEdge>();

  const gScore = new Map<string, number>();
  const fScore = new Map<string, number>();

  for (const id of nodesMap.keys()) {
    gScore.set(id, Number.POSITIVE_INFINITY);
    fScore.set(id, Number.POSITIVE_INFINITY);
  }

  gScore.set(startId, 0);
  fScore.set(startId, heuristic3D(nodesMap.get(startId)!, nodesMap.get(goalId)!));

  while (openSet.size > 0) {
    const current = getLowest(openSet, fScore);

    if (current === goalId) {
      const nodeIds: string[] = [current];
      const edgeIds: string[] = [];
      const edges: GraphEdge[] = [];

      let walk = current;
      while (cameFromNode.has(walk)) {
        const edge = cameFromEdge.get(walk)!;
        edges.unshift(edge);
        edgeIds.unshift(edge.id);
        walk = cameFromNode.get(walk)!;
        nodeIds.unshift(walk);
      }

      const distanceM = edges.reduce((acc, e) => acc + e.attrs.lengthM, 0);

      return {
        nodeIds,
        edgeIds,
        edges,
        totalCost: gScore.get(goalId)!,
        distanceM,
      };
    }

    openSet.delete(current);
    const currentEdges = adjacency.get(current) ?? [];

    for (const edge of currentEdges) {
      if (!isEdgeAllowed(edge, profile)) continue;

      const tentative = (gScore.get(current) ?? Infinity) + edgeCost(edge, profile);
      const neighbor = edge.to;

      if (tentative < (gScore.get(neighbor) ?? Infinity)) {
        cameFromNode.set(neighbor, current);
        cameFromEdge.set(neighbor, edge);
        gScore.set(neighbor, tentative);
        fScore.set(
          neighbor,
          tentative + heuristic3D(nodesMap.get(neighbor)!, nodesMap.get(goalId)!)
        );
        openSet.add(neighbor);
      }
    }
  }

  return null;
}
