import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const backendDir = path.resolve(scriptDir, '..');
const projectRoot = path.resolve(backendDir, '..');

const sourcePath = path.join(
  projectRoot,
  'frontend',
  'public',
  'data',
  'moscow-quarter-all.geojson'
);
const outputPath = path.join(
  backendDir,
  'src',
  'data',
  'route-graph.manual.geojson'
);

const pedestrianHighways = new Set([
  'footway',
  'path',
  'pedestrian',
  'living_street',
  'steps',
  'service',
]);

const vehicleHighways = new Set([
  'secondary',
  'secondary_link',
  'tertiary',
  'tertiary_link',
  'residential',
  'unclassified',
  'construction',
]);

const DEFAULT_STAIR_INCLINE_PERCENT = 12;
const DEFAULT_RAMP_INCLINE_PERCENT = 8;
const SLOPED_ELEVATION_WEIGHT = 12;
const FLAT_ELEVATION_WEIGHT = 1;
const ELEVATION_RELAXATION_ITERATIONS = 1200;

function coordKey(coord) {
  return `${Number(coord[0]).toFixed(7)},${Number(coord[1]).toFixed(7)}`;
}

function toNumber(value, fallback = 0) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const normalized = value.trim().replace(',', '.').replace(/m$/i, '');
    const parsed = Number(normalized);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function toNullableString(value) {
  return value === undefined || value === null ? null : String(value);
}

function parseSignedInclinePercent(value, highway) {
  if (value === undefined || value === null) {
    return highway === 'steps' ? DEFAULT_STAIR_INCLINE_PERCENT : 0;
  }

  const raw = String(value).trim().toLowerCase();
  if (raw === 'up') {
    return highway === 'steps'
      ? DEFAULT_STAIR_INCLINE_PERCENT
      : DEFAULT_RAMP_INCLINE_PERCENT;
  }
  if (raw === 'down') {
    return highway === 'steps'
      ? -DEFAULT_STAIR_INCLINE_PERCENT
      : -DEFAULT_RAMP_INCLINE_PERCENT;
  }

  const parsed = toNumber(raw.replace('%', ''), Number.NaN);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseInclinePercent(value, highway) {
  return Math.abs(parseSignedInclinePercent(value, highway));
}

function normalizeSurface(props) {
  const raw = String(props.surface ?? props.material ?? '').toLowerCase();
  const smoothness = String(props.smoothness ?? '').toLowerCase();

  if (raw === 'asphalt') return 'asphalt';
  if (raw === 'ground' || raw === 'dirt' || raw === 'earth') return 'ground';
  if (
    raw === 'unhewn_cobblestone' ||
    raw === 'fine_gravel' ||
    raw === 'gravel' ||
    raw === 'sand' ||
    smoothness === 'very_bad' ||
    smoothness === 'bad'
  ) {
    return 'rough';
  }

  return 'tile';
}

function parseWidthMeters(props) {
  const explicit = toNumber(props.width, Number.NaN);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;

  if (props.highway === 'steps') return 1.2;
  if (props.highway === 'service') return 2.5;
  if (vehicleHighways.has(props.highway)) return 3.5;
  return 1.8;
}

function parseCurbHeightCm(props) {
  const explicit =
    props['kerb:height'] ??
    props.kerb_height ??
    props.curbHeightCm ??
    props.kerb;

  if (explicit !== undefined && explicit !== null) {
    const raw = String(explicit).trim().toLowerCase();
    if (raw === 'flush' || raw === 'lowered' || raw === 'no') return 0;
    if (raw === 'rolled') return 2;
    if (raw === 'raised' || raw === 'yes') return 6;

    const numeric = toNumber(raw, Number.NaN);
    if (Number.isFinite(numeric)) {
      return numeric <= 0.5 ? Math.round(numeric * 100) : numeric;
    }
  }

  if (props.footway === 'crossing' || props.highway === 'crossing') return 2;
  return 0;
}

function hasRamp(props) {
  return (
    props.ramp === 'yes' ||
    props['ramp:wheelchair'] === 'yes' ||
    props.wheelchair === 'yes'
  );
}

function isClosedForRouting(props) {
  if (props.highway === 'construction') return true;
  if (props.access === 'no' || props.access === 'private') return true;
  if (props.foot === 'no') return true;
  if (props.highway === 'cycleway' && props.foot !== 'yes') return true;
  if (vehicleHighways.has(props.highway) && props.foot !== 'yes') return true;
  return false;
}

function distanceMeters(a, b) {
  const earthRadiusM = 6371008.8;
  const lon1 = (a[0] * Math.PI) / 180;
  const lat1 = (a[1] * Math.PI) / 180;
  const lon2 = (b[0] * Math.PI) / 180;
  const lat2 = (b[1] * Math.PI) / 180;
  const dLon = lon2 - lon1;
  const dLat = lat2 - lat1;

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;

  return 2 * earthRadiusM * Math.asin(Math.sqrt(h));
}

function roundElevationMeters(value) {
  return Math.round(value * 100) / 100;
}

function isCandidateLine(feature) {
  if (feature.geometry?.type !== 'LineString') return false;
  if (!Array.isArray(feature.geometry.coordinates)) return false;
  if (feature.geometry.coordinates.length < 2) return false;

  const props = feature.properties ?? {};
  return Boolean(props.highway || props['area:highway'] === 'footway');
}

function readExistingNodes() {
  if (!fs.existsSync(outputPath)) return new Map();

  const existing = JSON.parse(fs.readFileSync(outputPath, 'utf-8'));
  const nodes = new Map();

  for (const feature of existing.features ?? []) {
    if (feature.properties?.graphType !== 'node') continue;
    if (feature.geometry?.type !== 'Point') continue;
    nodes.set(coordKey(feature.geometry.coordinates), feature);
  }

  return nodes;
}

function createNodeRecord(coord, existingNode) {
  const props = existingNode?.properties ?? {};

  return {
    id: props.id,
    lon: Number(coord[0]),
    lat: Number(coord[1]),
    z: toNumber(coord[2], toNumber(props.z, 0)),
    previousType: props.nodeType,
    incident: [],
    points: [],
  };
}

function nodeTypeFor(record) {
  const allProps = [...record.incident, ...record.points];

  if (
    allProps.some(
      (props) =>
        props.highway === 'crossing' ||
        props.footway === 'crossing' ||
        props.crossing !== undefined
    )
  ) {
    return 'crosswalk';
  }

  if (allProps.some((props) => props.highway === 'steps')) return 'stairs';
  if (allProps.some((props) => props.entrance !== undefined)) return 'entrance';
  if (allProps.some((props) => props.elevator === 'yes')) return 'elevator';
  if (allProps.some((props) => hasRamp(props))) return 'ramp';

  return record.previousType ?? 'intersection';
}

function nodeAttrsFor(record) {
  const allProps = [...record.incident, ...record.points];

  return {
    tactileSupport: allProps.some((props) => props.tactile_paving === 'yes'),
    soundSignal: allProps.some((props) => {
      const sound = props['traffic_signals:sound'];
      return sound === 'yes' || sound === 'walk';
    }),
    elevator: allProps.some((props) => props.elevator === 'yes'),
    trafficLight: allProps.some(
      (props) =>
        props.crossing === 'traffic_signals' ||
        props.highway === 'traffic_signals'
    ),
  };
}

function compareNodeIds(a, b) {
  const aNum = Number(String(a.properties.id).replace(/^n/, ''));
  const bNum = Number(String(b.properties.id).replace(/^n/, ''));
  return aNum - bNum;
}

const source = JSON.parse(fs.readFileSync(sourcePath, 'utf-8'));
const existingNodesByCoord = readExistingNodes();
const nodeRecordsByCoord = new Map();

let nextNodeNumber = 1;
for (const feature of existingNodesByCoord.values()) {
  const id = String(feature.properties.id ?? '');
  const numeric = Number(id.replace(/^n/, ''));
  if (Number.isFinite(numeric)) {
    nextNodeNumber = Math.max(nextNodeNumber, numeric + 1);
  }
}

function ensureNode(coord) {
  const key = coordKey(coord);
  const existing = existingNodesByCoord.get(key);
  let record = nodeRecordsByCoord.get(key);

  if (!record) {
    record = createNodeRecord(coord, existing);
    if (!record.id) {
      record.id = `n${nextNodeNumber}`;
      nextNodeNumber += 1;
    }
    nodeRecordsByCoord.set(key, record);
  }

  return record;
}

function buildElevationConstraints(lineFeatures, recordIndexById) {
  const constraints = [];

  for (const feature of lineFeatures) {
    const props = feature.properties ?? {};
    const coords = feature.geometry.coordinates;

    for (let i = 0; i < coords.length - 1; i += 1) {
      const from = ensureNode(coords[i]);
      const to = ensureNode(coords[i + 1]);
      if (from.id === to.id) continue;

      const fromIndex = recordIndexById.get(from.id);
      const toIndex = recordIndexById.get(to.id);
      if (fromIndex === undefined || toIndex === undefined) continue;

      const signedInclinePercent = parseSignedInclinePercent(
        props.incline,
        props.highway
      );
      const deltaM =
        (distanceMeters(coords[i], coords[i + 1]) * signedInclinePercent) / 100;

      constraints.push({
        fromIndex,
        toIndex,
        deltaM,
        weight:
          signedInclinePercent === 0
            ? FLAT_ELEVATION_WEIGHT
            : SLOPED_ELEVATION_WEIGHT,
      });
    }
  }

  return constraints;
}

function buildConnectedComponents(nodeCount, constraints) {
  const adjacency = Array.from({ length: nodeCount }, () => []);

  for (const constraint of constraints) {
    adjacency[constraint.fromIndex].push(constraint.toIndex);
    adjacency[constraint.toIndex].push(constraint.fromIndex);
  }

  const seen = new Set();
  const components = [];

  for (let i = 0; i < nodeCount; i += 1) {
    if (seen.has(i)) continue;

    const component = [];
    const stack = [i];
    seen.add(i);

    while (stack.length > 0) {
      const current = stack.pop();
      component.push(current);

      for (const next of adjacency[current]) {
        if (seen.has(next)) continue;
        seen.add(next);
        stack.push(next);
      }
    }

    components.push(component);
  }

  return components;
}

function normalizeElevationBaselines(zValues, components) {
  for (const component of components) {
    let min = Number.POSITIVE_INFINITY;

    for (const index of component) {
      min = Math.min(min, zValues[index]);
    }

    if (!Number.isFinite(min)) continue;

    for (const index of component) {
      zValues[index] -= min;
    }
  }
}

function inferNodeElevations(lineFeatures) {
  const records = [...nodeRecordsByCoord.values()];
  if (records.length === 0) return;

  const recordIndexById = new Map(
    records.map((record, index) => [record.id, index])
  );
  const constraints = buildElevationConstraints(lineFeatures, recordIndexById);
  if (constraints.length === 0) return;

  // Solve relative node heights from incline constraints. Absolute zero is
  // arbitrary, so each connected component is normalized to its local minimum.
  const components = buildConnectedComponents(records.length, constraints);
  const zValues = Array(records.length).fill(0);
  const nextZValues = Array(records.length).fill(0);
  const weightSums = Array(records.length).fill(0);

  for (
    let iteration = 0;
    iteration < ELEVATION_RELAXATION_ITERATIONS;
    iteration += 1
  ) {
    nextZValues.fill(0);
    weightSums.fill(0);

    for (const constraint of constraints) {
      const { fromIndex, toIndex, deltaM, weight } = constraint;

      nextZValues[fromIndex] += weight * (zValues[toIndex] - deltaM);
      weightSums[fromIndex] += weight;

      nextZValues[toIndex] += weight * (zValues[fromIndex] + deltaM);
      weightSums[toIndex] += weight;
    }

    let maxDiff = 0;

    for (let i = 0; i < zValues.length; i += 1) {
      if (weightSums[i] === 0) continue;

      const nextZ = nextZValues[i] / weightSums[i];
      maxDiff = Math.max(maxDiff, Math.abs(nextZ - zValues[i]));
      zValues[i] = nextZ;
    }

    if (iteration % 25 === 0) {
      normalizeElevationBaselines(zValues, components);
    }

    if (maxDiff < 0.000001) break;
  }

  normalizeElevationBaselines(zValues, components);

  for (let i = 0; i < records.length; i += 1) {
    records[i].z = roundElevationMeters(zValues[i]);
  }
}

const lineFeatures = source.features.filter(isCandidateLine);

for (const feature of lineFeatures) {
  const props = feature.properties ?? {};

  for (const coord of feature.geometry.coordinates) {
    ensureNode(coord).incident.push(props);
  }
}

for (const feature of source.features ?? []) {
  if (feature.geometry?.type !== 'Point') continue;
  ensureNode(feature.geometry.coordinates).points.push(feature.properties ?? {});
}

inferNodeElevations(lineFeatures);

const nodeFeatures = [...nodeRecordsByCoord.values()]
  .map((record) => ({
    type: 'Feature',
    geometry: {
      type: 'Point',
      coordinates: [record.lon, record.lat, record.z],
    },
    properties: {
      graphType: 'node',
      id: record.id,
      nodeType: nodeTypeFor(record),
      z: record.z,
      ...nodeAttrsFor(record),
    },
  }))
  .sort(compareNodeIds);

const edges = [];
let nextEdgeNumber = 1;

for (const feature of lineFeatures) {
  const props = feature.properties ?? {};
  const coords = feature.geometry.coordinates;
  const sourceOsmId = props['@id'] ?? feature.id ?? null;

  for (let i = 0; i < coords.length - 1; i += 1) {
    const from = ensureNode(coords[i]);
    const to = ensureNode(coords[i + 1]);
    if (from.id === to.id) continue;

    const id = `e${nextEdgeNumber}`;
    nextEdgeNumber += 1;

    const horizontalLengthM = distanceMeters(coords[i], coords[i + 1]);
    const lengthM = Math.sqrt(horizontalLengthM ** 2 + (to.z - from.z) ** 2);

    edges.push({
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates: [
          [from.lon, from.lat, from.z],
          [to.lon, to.lat, to.z],
        ],
      },
      properties: {
        graphType: 'edge',
        id,
        sourceOsmId,
        sourceSegmentIndex: i,
        from: from.id,
        to: to.id,
        bidirectional: true,
        lengthM: Math.round(lengthM * 10) / 10,
        slopePercent: parseInclinePercent(props.incline, props.highway),
        widthM: parseWidthMeters(props),
        curbHeightCm: parseCurbHeightCm(props),
        surface: normalizeSurface(props),
        hasRamp: hasRamp(props),
        hasStairs: props.highway === 'steps',
        closed: isClosedForRouting(props),
        snow: 0,
        ice: 0,
        repair: props.highway === 'construction' ? 1 : 0,
        crowd: 0,
        highway: toNullableString(props.highway ?? props['area:highway']),
        footway: toNullableString(props.footway),
        incline: toNullableString(props.incline),
        wheelchair: toNullableString(props.wheelchair),
        bridge: toNullableString(props.bridge),
        layer: toNullableString(props.layer),
        surfaceRaw: toNullableString(props.surface ?? props.material),
        lit: toNullableString(props.lit),
        smoothness: toNullableString(props.smoothness),
        crossing: toNullableString(props.crossing),
        foot: toNullableString(props.foot),
        access: toNullableString(props.access),
        oneway: toNullableString(props.oneway),
        name: toNullableString(props.name ?? props['name:ru']),
      },
    });
  }
}

const output = {
  type: 'FeatureCollection',
  features: [...nodeFeatures, ...edges],
};

fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`, 'utf-8');

console.log(
  `Generated ${nodeFeatures.length} nodes and ${edges.length} edges from ${lineFeatures.length} source lines.`
);
