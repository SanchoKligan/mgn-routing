import { GraphEdge, UserProfile } from '../../models/types';

export function isEdgeAllowed(edge: GraphEdge, profile: UserProfile): boolean {
  const c = profile.hardConstraints;
  const a = edge.attrs;

  if (a.dynamic.closed) return false;
  if (a.slopePercent > c.maxSlopePercent) return false;
  if (a.curbHeightCm > c.maxCurbHeightCm) return false;
  if (a.widthM < c.minWidthM) return false;
  if (a.hasStairs && !c.allowStairs) return false;

  return true;
}
