import { GraphNode } from '../../models/types';

export function heuristic3D(a: GraphNode, b: GraphNode): number {
  const dx = (a.lat - b.lat) * 111_320;
  const dy = (a.lon - b.lon) * 111_320;
  const dz = a.z - b.z;

  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}
