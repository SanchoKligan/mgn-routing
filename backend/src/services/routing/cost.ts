import { GraphEdge, UserProfile } from '../../models/types';

const surfacePenalty: Record<string, number> = {
  asphalt: 0.1,
  tile: 0.3,
  rough: 0.6,
  ground: 0.8,
};

export function edgeCost(edge: GraphEdge, profile: UserProfile): number {
  const w = profile.weights;
  const a = edge.attrs;

  const dynamicPenalty =
    (a.dynamic.snow ?? 0) * 0.8 +
    (a.dynamic.ice ?? 0) * 1.2 +
    (a.dynamic.repair ?? 0) * 0.9 +
    (a.dynamic.crowd ?? 0) * 0.4;

  return (
    w.distance * a.lengthM +
    w.slope * a.slopePercent * 12 +
    w.surface * (surfacePenalty[a.surface] ?? 0.5) * 100 +
    w.curb * a.curbHeightCm * 10 +
    w.stairs * (a.hasStairs ? 600 : 0) +
    w.dynamic * dynamicPenalty * 120
  );
}
