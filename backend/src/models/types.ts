export type UserCategory =
  | 'wheelchair'
  | 'visual_impaired'
  | 'elderly'
  | 'parent_with_stroller';

export interface GraphNode {
  id: string;
  lat: number;
  lon: number;
  z: number;
  type: 'intersection' | 'crosswalk' | 'entrance' | 'elevator' | 'stairs' | 'ramp';
  attrs: {
    tactileSupport?: boolean;
    soundSignal?: boolean;
    elevator?: boolean;
    trafficLight?: boolean;
  };
}

export interface GraphEdge {
  id: string;
  from: string;
  to: string;
  bidirectional: boolean;
  geometry: Array<[number, number, number]>;
  attrs: {
    lengthM: number;
    slopePercent: number;
    widthM: number;
    curbHeightCm: number;
    surface: 'asphalt' | 'tile' | 'rough' | 'ground';
    hasRamp: boolean;
    hasStairs: boolean;
    dynamic: {
      closed?: boolean;
      snow?: number;
      ice?: number;
      repair?: number;
      crowd?: number;
    };
  };
}

export interface UserProfile {
  category: UserCategory;
  hardConstraints: {
    maxSlopePercent: number;
    maxCurbHeightCm: number;
    minWidthM: number;
    allowStairs: boolean;
  };
  weights: {
    distance: number;
    slope: number;
    surface: number;
    curb: number;
    stairs: number;
    dynamic: number;
  };
}