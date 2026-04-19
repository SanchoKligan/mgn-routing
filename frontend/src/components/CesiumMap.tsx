import { useEffect, useRef, useState } from 'react';
import {
  Cartesian2,
  Cartesian3,
  Cartographic,
  Color,
  ColorMaterialProperty,
  ConstantProperty,
  GeoJsonDataSource,
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
import type { GraphNode, RouteResponse } from '../types/api';

type CesiumMapProps = {
  nodes: GraphNode[];
  route: RouteResponse | null;
  startNodeId: string | null;
  endNodeId: string | null;
  onSelectStart: (nodeId: string) => void;
  onSelectEnd: (nodeId: string) => void;
};

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
  maxDistanceM = 35
): GraphNode | null {
  let best: GraphNode | null = null;
  let bestDist = Number.POSITIVE_INFINITY;

  for (const node of nodes) {
    const d = distance2D(lat, lon, node.lat, node.lon);
    if (d < bestDist) {
      bestDist = d;
      best = node;
    }
  }

  if (best && bestDist <= maxDistanceM) return best;
  return null;
}

export function CesiumMap({
  nodes,
  route,
  startNodeId,
  endNodeId,
  onSelectStart,
  onSelectEnd,
}: CesiumMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewerRef = useRef<Viewer | null>(null);
  const clickHandlerRef = useRef<ScreenSpaceEventHandler | null>(null);
  const dynamicEntityIdsRef = useRef<string[]>([]);

  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [popupPosition, setPopupPosition] = useState<{ x: number; y: number } | null>(null);

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

  // Статические слои — один раз
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
      viewer.dataSources.add(groundDs);

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
            entity.polyline.width = new ConstantProperty(6);
            entity.polyline.material = new ColorMaterialProperty(Color.RED);
            continue;
          }

          if (highway === 'crossing' || footway === 'crossing') {
            entity.polyline.width = new ConstantProperty(6);
            entity.polyline.material = new ColorMaterialProperty(Color.YELLOW);
            continue;
          }

          if (
            highway === 'footway' ||
            highway === 'path' ||
            highway === 'pedestrian' ||
            highway === 'living_street' ||
            footway
          ) {
            let color = Color.LIGHTGRAY;

            if (surface === 'paving_stones') {
              color = Color.SILVER;
            }

            entity.polyline.width = new ConstantProperty(4);
            entity.polyline.material = new ColorMaterialProperty(color);
            continue;
          }

          if (
            highway === 'secondary' ||
            highway === 'primary' ||
            highway === 'tertiary' ||
            highway === 'residential' ||
            highway === 'service' ||
            highway === 'unclassified'
          ) {
            entity.polyline.width = new ConstantProperty(2);
            entity.polyline.material = new ColorMaterialProperty(
              Color.DARKGRAY.withAlpha(0.65)
            );
            continue;
          }

          entity.polyline.width = new ConstantProperty(2);
          entity.polyline.material = new ColorMaterialProperty(
            Color.WHITE.withAlpha(0.25)
          );
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

        return findNearestNode(lat, lon, nodes);
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

      clickHandlerRef.current = handler;
    })();

    return () => {
      cancelled = true;
    };
  }, [nodes]);

  // Динамика: только маршрут
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;

    for (const id of dynamicEntityIdsRef.current) {
      viewer.entities.removeById(id);
    }
    dynamicEntityIdsRef.current = [];

    if (route) {
      for (const edge of route.edges) {
        const positions = edge.geometry.flatMap(([lat, lon]) => [lon, lat]);
        const id = `route-edge-${edge.id}`;

        viewer.entities.add({
          id,
          polyline: {
            positions: Cartesian3.fromDegreesArray(positions),
            width: 7,
            material: Color.LIMEGREEN,
            clampToGround: true,
          },
        });

        dynamicEntityIdsRef.current.push(id);
      }
    }
  }, [route]);

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
          <div><b>ID:</b> {selectedNode.id}</div>
          <div><b>Тип:</b> {selectedNode.type}</div>
          <div><b>Широта:</b> {selectedNode.lat.toFixed(6)}</div>
          <div><b>Долгота:</b> {selectedNode.lon.toFixed(6)}</div>
          <div><b>Z:</b> {selectedNode.z}</div>

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