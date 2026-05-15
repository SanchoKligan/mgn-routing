import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Cartesian2,
  Cartesian3,
  Cartographic,
  Color,
  ColorMaterialProperty,
  ConstantProperty,
  GeoJsonDataSource,
  HeightReference,
  Ion,
  Math as CesiumMath,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  Terrain,
  Viewer,
  createOsmBuildingsAsync,
  defined,
} from 'cesium';
import 'cesium/Build/Cesium/Widgets/widgets.css';
import type { GraphEdge, GraphNode, RouteResponse } from '../types/api';

type CesiumMapProps = {
  nodes: GraphNode[];
  edges: GraphEdge[];
  route: RouteResponse | null;
  startNodeId: string | null;
  endNodeId: string | null;
  onSelectStart: (nodeId: string) => void;
  onSelectEnd: (nodeId: string) => void;
};

const vehicleHighways = new Set([
  'primary',
  'primary_link',
  'secondary',
  'secondary_link',
  'tertiary',
  'tertiary_link',
  'residential',
  'unclassified',
  'service',
  'construction',
]);

const routeColorCss = '#22c55e';

function getStringProp(entity: any, name: string): string | undefined {
  const raw = entity.properties?.[name]?.getValue?.();
  if (raw === undefined || raw === null) return undefined;
  return String(raw);
}

function distance2D(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const dx = (aLat - bLat) * 111320;
  const dy = (aLon - bLon) * 111320;
  return Math.sqrt(dx * dx + dy * dy);
}

function findNearestNode(
  lat: number,
  lon: number,
  nodes: GraphNode[],
  selectableNodeIds: Set<string>,
  maxDistanceM = 35
): GraphNode | null {
  let best: GraphNode | null = null;
  let bestDist = Number.POSITIVE_INFINITY;

  for (const node of nodes) {
    if (!selectableNodeIds.has(node.id)) continue;

    const d = distance2D(lat, lon, node.lat, node.lon);
    if (d < bestDist) {
      bestDist = d;
      best = node;
    }
  }

  if (best && bestDist <= maxDistanceM) return best;
  return null;
}

function findNodeById(nodes: GraphNode[], nodeId: string | null): GraphNode | null {
  if (!nodeId) return null;
  return nodes.find((node) => node.id === nodeId) ?? null;
}

function isVehicleRoadEdge(edge: GraphEdge): boolean {
  if (edge.attrs.footway) return false;

  const highway = edge.attrs.highway ?? '';
  return vehicleHighways.has(highway);
}

function isSelectableEdge(edge: GraphEdge): boolean {
  if (edge.attrs.dynamic?.closed) return false;
  return !isVehicleRoadEdge(edge);
}

export function CesiumMap({
  nodes,
  edges,
  route,
  startNodeId,
  endNodeId,
  onSelectStart,
  onSelectEnd,
}: CesiumMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewerRef = useRef<Viewer | null>(null);
  const clickHandlerRef = useRef<ScreenSpaceEventHandler | null>(null);
  const nodesRef = useRef<GraphNode[]>([]);
  const selectableNodeIdsRef = useRef<Set<string>>(new Set());
  const groundDataSourceRef = useRef<GeoJsonDataSource | null>(null);
  const routeEntityIdsRef = useRef<string[]>([]);
  const markerEntityIdsRef = useRef<string[]>([]);

  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [groundLayerReady, setGroundLayerReady] = useState(false);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [popupPosition, setPopupPosition] = useState<{ x: number; y: number } | null>(
    null
  );

  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);

  const selectableNodeIds = useMemo(() => {
    const ids = new Set<string>();

    for (const edge of edges) {
      if (!isSelectableEdge(edge)) continue;

      ids.add(edge.from);
      ids.add(edge.to);
    }

    return ids;
  }, [edges]);

  useEffect(() => {
    selectableNodeIdsRef.current = selectableNodeIds;
  }, [selectableNodeIds]);

  // Viewer создаётся один раз
  useEffect(() => {
    if (!containerRef.current) return;
    if (viewerRef.current) return;

    Ion.defaultAccessToken = import.meta.env.VITE_CESIUM_ION_TOKEN ?? '';

    const viewer = new Viewer(containerRef.current, {
      terrain: Terrain.fromWorldTerrain(),
      animation: false,
      timeline: false,
      baseLayerPicker: false,
      geocoder: false,
      homeButton: false,
      sceneModePicker: false,
      navigationHelpButton: false,
      fullscreenButton: false,
      vrButton: false,
      infoBox: false,
      selectionIndicator: false,
      shouldAnimate: false,
    });

    viewer.camera.setView({
      destination: Cartesian3.fromDegrees(37.6, 55.74, 900),
      orientation: {
        heading: CesiumMath.toRadians(25),
        pitch: CesiumMath.toRadians(-45),
        roll: 0,
      },
    });

    viewer.cesiumWidget.screenSpaceEventHandler.removeInputAction(
      ScreenSpaceEventType.LEFT_DOUBLE_CLICK
    );

    viewerRef.current = viewer;

    return () => {
      clickHandlerRef.current?.destroy();
      clickHandlerRef.current = null;
      viewer.destroy();
      viewerRef.current = null;
    };
  }, []);

  // Статические слои и обработчики карты — один раз
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;

    let cancelled = false;

    (async () => {
      const osmBuildings = await createOsmBuildingsAsync();
      if (cancelled) return;
      viewer.scene.primitives.add(osmBuildings);

      const groundDs = await GeoJsonDataSource.load('/data/moscow-quarter-all.geojson', {
        clampToGround: true,
      });

      if (cancelled) return;
      await viewer.dataSources.add(groundDs);
      if (cancelled) return;
      groundDataSourceRef.current = groundDs;
      setGroundLayerReady(true);

      for (const entity of groundDs.entities.values) {
        entity.label = undefined;
        entity.billboard = undefined;
        entity.point = undefined;

        const highway = getStringProp(entity, 'highway');
        const footway = getStringProp(entity, 'footway');
        const surface = getStringProp(entity, 'surface');
        const building = getStringProp(entity, 'building');

        if (building) {
          entity.show = false;
          continue;
        }

        if (entity.polygon) {
          entity.show = false;
          continue;
        }

        if (entity.polyline) {
          if (highway === 'steps') {
            entity.polyline.width = new ConstantProperty(7);
            entity.polyline.material = new ColorMaterialProperty(
              Color.fromCssColorString('#ef4444')
            );
            entity.polyline.zIndex = new ConstantProperty(30);
            continue;
          }

          if (highway === 'crossing' || footway === 'crossing') {
            entity.polyline.width = new ConstantProperty(7);
            entity.polyline.material = new ColorMaterialProperty(
              Color.fromCssColorString('#facc15')
            );
            entity.polyline.zIndex = new ConstantProperty(30);
            continue;
          }

          if (
            highway === 'footway' ||
            highway === 'path' ||
            highway === 'pedestrian' ||
            highway === 'living_street' ||
            footway
          ) {
            let color = Color.WHITE.withAlpha(0.92);

            if (surface === 'paving_stones') {
              color = Color.fromCssColorString('#e2e8f0').withAlpha(0.95);
            }

            entity.polyline.width = new ConstantProperty(5);
            entity.polyline.material = new ColorMaterialProperty(color);
            entity.polyline.zIndex = new ConstantProperty(20);
            continue;
          }

          if (highway && vehicleHighways.has(highway)) {
            entity.show = false;
            continue;
          }

          entity.polyline.width = new ConstantProperty(2.5);
          entity.polyline.material = new ColorMaterialProperty(
            Color.WHITE.withAlpha(0.35)
          );
          entity.polyline.zIndex = new ConstantProperty(5);
        } else {
          entity.show = false;
        }
      }

      const handler = new ScreenSpaceEventHandler(viewer.scene.canvas);

      const pickNearestNode = (position: Cartesian2): GraphNode | null => {
        let cartesian: Cartesian3 | undefined;

        if (viewer.scene.pickPositionSupported) {
          const picked = viewer.scene.pickPosition(position);
          if (defined(picked)) {
            cartesian = picked;
          }
        }

        if (!cartesian) {
          const ray = viewer.camera.getPickRay(position);
          if (!ray) return null;

          const globePicked = viewer.scene.globe.pick(ray, viewer.scene);
          if (!defined(globePicked)) return null;

          cartesian = globePicked;
        }

        const cartographic = Cartographic.fromCartesian(cartesian);
        const lon = CesiumMath.toDegrees(cartographic.longitude);
        const lat = CesiumMath.toDegrees(cartographic.latitude);

        return findNearestNode(lat, lon, nodesRef.current, selectableNodeIdsRef.current);
      };

      handler.setInputAction((event: { position: Cartesian2 }) => {
        const nearest = pickNearestNode(event.position);

        if (!nearest) {
          setSelectedNode(null);
          setPopupPosition(null);
          return;
        }

        setSelectedNode(nearest);
        setPopupPosition({
          x: event.position.x,
          y: event.position.y,
        });
      }, ScreenSpaceEventType.LEFT_CLICK);

      handler.setInputAction((event: { endPosition: Cartesian2 }) => {
        const nearest = pickNearestNode(event.endPosition);
        const nextNodeId = nearest?.id ?? null;

        viewer.scene.canvas.style.cursor = nextNodeId ? 'pointer' : '';

        setHoveredNodeId((currentNodeId) =>
          currentNodeId === nextNodeId ? currentNodeId : nextNodeId
        );
      }, ScreenSpaceEventType.MOUSE_MOVE);

      clickHandlerRef.current = handler;
    })();

    return () => {
      cancelled = true;
      groundDataSourceRef.current = null;
    };
  }, []);

  // Динамика: маршрут
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;

    let cancelled = false;

    for (const id of routeEntityIdsRef.current) {
      viewer.entities.removeById(id);
      groundDataSourceRef.current?.entities.removeById(id);
    }
    routeEntityIdsRef.current = [];

    if (!route) {
      return () => {
        cancelled = true;
      };
    }

    (async () => {
      if (cancelled || viewerRef.current !== viewer) return;
      const routeEntities = groundDataSourceRef.current?.entities ?? viewer.entities;

      for (const edge of route.edges) {
        const lineId = `route-edge-${edge.id}`;
        const routeColor = Color.fromCssColorString(routeColorCss);
        const positions = edge.geometry.flatMap(([lat, lon]) => [lon, lat]);

        routeEntities.add({
          id: lineId,
          polyline: {
            positions: Cartesian3.fromDegreesArray(positions),
            width: 10,
            material: routeColor,
            clampToGround: true,
            zIndex: 100_000,
          },
        });

        routeEntityIdsRef.current.push(lineId);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [groundLayerReady, route]);

  // Динамика: выбранные узлы и предпросмотр наведения
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;

    for (const id of markerEntityIdsRef.current) {
      viewer.entities.removeById(id);
    }
    markerEntityIdsRef.current = [];

    const addNodeMarker = (
      node: GraphNode | null,
      kind: 'start' | 'end' | 'hover',
      color: Color,
      pixelSize: number
    ) => {
      if (!node) return;

      const id = `route-${kind}-node-${node.id}`;

      viewer.entities.add({
        id,
        position: Cartesian3.fromDegrees(node.lon, node.lat),
        point: {
          pixelSize,
          color,
          outlineColor: Color.WHITE,
          outlineWidth: kind === 'hover' ? 3 : 4,
          heightReference: HeightReference.CLAMP_TO_GROUND,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
      });

      markerEntityIdsRef.current.push(id);
    };

    const startNode = findNodeById(nodes, startNodeId);
    const endNode = findNodeById(nodes, endNodeId);
    const hoveredNode = findNodeById(nodes, hoveredNodeId);
    const hoveredNodeIsSelected =
      hoveredNodeId !== null &&
      (hoveredNodeId === startNodeId || hoveredNodeId === endNodeId);

    addNodeMarker(startNode, 'start', Color.LIMEGREEN, 18);
    addNodeMarker(endNode, 'end', Color.ORANGERED, 18);

    if (!hoveredNodeIsSelected) {
      addNodeMarker(hoveredNode, 'hover', Color.CYAN.withAlpha(0.85), 14);
    }
  }, [endNodeId, hoveredNodeId, nodes, startNodeId]);

  return (
    <>
      <div ref={containerRef} style={{ width: '100%', height: '100vh' }} />

      {selectedNode && popupPosition && (
        <div
          style={{
            position: 'absolute',
            left: popupPosition.x + 12,
            top: popupPosition.y + 12,
            zIndex: 30,
            background: 'white',
            borderRadius: 10,
            padding: 12,
            minWidth: 220,
            boxShadow: '0 4px 18px rgba(0,0,0,0.2)',
            fontFamily: 'sans-serif',
            fontSize: 13,
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: 8 }}>Узел графа</div>
          <div>
            <b>ID:</b> {selectedNode.id}
          </div>
          <div>
            <b>Тип:</b> {selectedNode.type}
          </div>
          <div>
            <b>Широта:</b> {selectedNode.lat.toFixed(6)}
          </div>
          <div>
            <b>Долгота:</b> {selectedNode.lon.toFixed(6)}
          </div>
          <div>
            <b>Z:</b> {selectedNode.z}
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button
              style={{ flex: 1 }}
              onClick={() => {
                onSelectStart(selectedNode.id);
                setSelectedNode(null);
                setPopupPosition(null);
              }}
            >
              Выбрать как старт
            </button>

            <button
              style={{ flex: 1 }}
              onClick={() => {
                onSelectEnd(selectedNode.id);
                setSelectedNode(null);
                setPopupPosition(null);
              }}
            >
              Выбрать как финиш
            </button>
          </div>

          <button
            style={{ marginTop: 8, width: '100%' }}
            onClick={() => {
              setSelectedNode(null);
              setPopupPosition(null);
            }}
          >
            Закрыть
          </button>

          {(startNodeId === selectedNode.id || endNodeId === selectedNode.id) && (
            <div style={{ marginTop: 8, color: '#555' }}>
              {startNodeId === selectedNode.id && <div>Текущий старт</div>}
              {endNodeId === selectedNode.id && <div>Текущий финиш</div>}
            </div>
          )}
        </div>
      )}
    </>
  );
}
