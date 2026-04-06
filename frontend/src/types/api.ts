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
    hasRamp: boolean;
    hasStairs: boolean;
  };
}

export interface GraphResponse {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface RouteResponse {
  nodeIds: string[];
  edgeIds: string[];
  edges: GraphEdge[];
  totalCost: number;
  distanceM: number;
}