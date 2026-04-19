import { useEffect, useRef } from 'react';
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
import type { GraphNode, RouteResponse } from '../types/api';

type CesiumMapProps = {
  nodes: GraphNode[];
  route: RouteResponse | null;
  startNodeId: string | null;
  endNodeId: string | null;
  onPickNode: (nodeId: string) => void;
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
  onPickNode,
}: CesiumMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewerRef = useRef<Viewer | null>(null);
  const clickHandlerRef = useRef<ScreenSpaceEventHandler | null>(null);
  const dynamicEntityIdsRef = useRef<string[]>([]);
  const pickNodeRef = useRef(onPickNode);

  useEffect(() => {
    pickNodeRef.current = onPickNode;
  }, [onPickNode]);

  // viewer один раз
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
      destination: Cartesian3.fromDegrees(37.6053, 55.7452, 900),
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

  // статические слои один раз
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
        const ray = viewer.camera.getPickRay(position);
        if (!ray) return null;

        const cartesian = viewer.scene.globe.pick(ray, viewer.scene);
        if (!defined(cartesian)) return null;

        const cartographic = Cartographic.fromCartesian(cartesian);
        const lon = CesiumMath.toDegrees(cartographic.longitude);
        const lat = CesiumMath.toDegrees(cartographic.latitude);

        return findNearestNode(lat, lon, nodes);
      };

      handler.setInputAction((event: { endPosition: Cartesian2 }) => {
        const nearest = pickNearestNode(event.endPosition);

        viewer.entities.removeById('hover-preview');

        if (!nearest) return;

        viewer.entities.add({
          id: 'hover-preview',
          position: Cartesian3.fromDegrees(nearest.lon, nearest.lat),
          point: {
            pixelSize: 12,
            color: Color.ORANGE,
            outlineColor: Color.BLACK,
            outlineWidth: 2,
            heightReference: HeightReference.CLAMP_TO_GROUND,
          },
        });
      }, ScreenSpaceEventType.MOUSE_MOVE);

      handler.setInputAction((event: { position: Cartesian2 }) => {
        const nearest = pickNearestNode(event.position);
        if (!nearest) return;
        pickNodeRef.current(nearest.id);
      }, ScreenSpaceEventType.LEFT_CLICK);

      clickHandlerRef.current = handler;
    })();

    return () => {
      cancelled = true;
    };
  }, [nodes]);

  // динамика: только старт/финиш/маршрут
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;

    for (const id of dynamicEntityIdsRef.current) {
      viewer.entities.removeById(id);
    }
    dynamicEntityIdsRef.current = [];

    if (startNodeId) {
      const startNode = nodes.find((n) => n.id === startNodeId);
      if (startNode) {
        const id = `start-${startNode.id}`;
        viewer.entities.add({
          id,
          position: Cartesian3.fromDegrees(startNode.lon, startNode.lat),
          point: {
            pixelSize: 16,
            color: Color.LIMEGREEN,
            outlineColor: Color.BLACK,
            outlineWidth: 2,
            heightReference: HeightReference.CLAMP_TO_GROUND,
          },
        });
        dynamicEntityIdsRef.current.push(id);
      }
    }

    if (endNodeId) {
      const endNode = nodes.find((n) => n.id === endNodeId);
      if (endNode) {
        const id = `end-${endNode.id}`;
        viewer.entities.add({
          id,
          position: Cartesian3.fromDegrees(endNode.lon, endNode.lat),
          point: {
            pixelSize: 16,
            color: Color.RED,
            outlineColor: Color.BLACK,
            outlineWidth: 2,
            heightReference: HeightReference.CLAMP_TO_GROUND,
          },
        });
        dynamicEntityIdsRef.current.push(id);
      }
    }

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
  }, [nodes, route, startNodeId, endNodeId]);

  return <div ref={containerRef} style={{ width: '100%', height: '100vh' }} />;
}