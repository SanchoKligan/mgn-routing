import fs from 'node:fs';
import path from 'node:path';
import { GraphEdge, GraphNode } from '../models/types';

type GeoJsonPointGeometry = {
  type: 'Point';
  coordinates: [number, number] | [number, number, number];
};

type GeoJsonLineGeometry = {
  type: 'LineString';
  coordinates: Array<[number, number] | [number, number, number]>;
};

type GeoJsonFeature = {
  type: 'Feature';
  geometry: GeoJsonPointGeometry | GeoJsonLineGeometry;
  properties: Record<string, unknown>;
};

type GeoJsonFeatureCollection = {
  type: 'FeatureCollection';
  features: GeoJsonFeature[];
};

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function toNumber(value: unknown, fallback = 0): number {
  if (isFiniteNumber(value)) return value;

  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }

  return fallback;
}

function toBoolean(value: unknown, fallback = false): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    if (value === 'true' || value === 'yes' || value === '1') return true;
    if (value === 'false' || value === 'no' || value === '0') return false;
  }
  return fallback;
}

function toSurface(value: unknown): 'asphalt' | 'tile' | 'rough' | 'ground' {
  const s = String(value ?? '').toLowerCase();

  if (s === 'asphalt') return 'asphalt';
  if (s === 'tile') return 'tile';
  if (s === 'ground') return 'ground';
  if (s === 'rough') return 'rough';

  return 'asphalt';
}

export function loadGraph(): {
  nodes: GraphNode[];
  edges: GraphEdge[];
  nodesMap: Map<string, GraphNode>;
  adjacency: Map<string, GraphEdge[]>;
} {
  const filePath = path.join(process.cwd(), 'src', 'data', 'route-graph.manual.geojson');

  const raw = fs.readFileSync(filePath, 'utf-8');
  const geo = JSON.parse(raw) as GeoJsonFeatureCollection;

  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];

  for (const feature of geo.features) {
    const props = feature.properties ?? {};
    const graphType = String(props.graphType ?? '');

    if (graphType === 'node' && feature.geometry.type === 'Point') {
      const [lon, lat, z = 0] = feature.geometry.coordinates;

      const node: GraphNode = {
        id: String(props.id),
        lat,
        lon,
        z: toNumber(z, 0),
        type: String(props.nodeType ?? 'intersection') as GraphNode['type'],
        attrs: {
          tactileSupport: toBoolean(props.tactileSupport),
          soundSignal: toBoolean(props.soundSignal),
          elevator: toBoolean(props.elevator),
          trafficLight: toBoolean(props.trafficLight),
        },
      };

      nodes.push(node);
      continue;
    }

    if (graphType === 'edge' && feature.geometry.type === 'LineString') {
      const coords = feature.geometry.coordinates;

      const geometry: Array<[number, number, number]> = coords.map((coord) => {
        const [lon, lat, z = 0] = coord;
        return [lat, lon, toNumber(z, 0)];
      });

      const edge: GraphEdge = {
        id: String(props.id),
        from: String(props.from),
        to: String(props.to),
        bidirectional: toBoolean(props.bidirectional, true),
        geometry,
        attrs: {
          lengthM: toNumber(props.lengthM, 0),
          slopePercent: toNumber(props.slopePercent, 0),
          widthM: toNumber(props.widthM, 1.5),
          curbHeightCm: toNumber(props.curbHeightCm, 0),
          surface: toSurface(props.surface),
          hasRamp: toBoolean(props.hasRamp),
          hasStairs: toBoolean(props.hasStairs),
          highway:
            props.highway === null || props.highway === undefined
              ? null
              : String(props.highway),
          footway:
            props.footway === null || props.footway === undefined
              ? null
              : String(props.footway),
          dynamic: {
            closed: toBoolean(props.closed),
            snow: toNumber(props.snow, 0),
            ice: toNumber(props.ice, 0),
            repair: toNumber(props.repair, 0),
            crowd: toNumber(props.crowd, 0),
          },
        },
      };

      edges.push(edge);
    }
  }

  const nodesMap = new Map<string, GraphNode>();
  const adjacency = new Map<string, GraphEdge[]>();

  for (const node of nodes) {
    nodesMap.set(node.id, node);
    adjacency.set(node.id, []);
  }

  for (const edge of edges) {
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
    nodes,
    edges,
    nodesMap,
    adjacency,
  };
}
