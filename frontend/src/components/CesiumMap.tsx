import { useEffect, useRef } from 'react';
import {
  Cartesian3,
  Color,
  ColorMaterialProperty,
  ConstantProperty,
  GeoJsonDataSource,
  Ion,
  Math as CesiumMath,
  Terrain,
  Viewer,
  createOsmBuildingsAsync,
} from 'cesium';
import 'cesium/Build/Cesium/Widgets/widgets.css';
import type { GraphEdge, GraphNode, RouteResponse } from '../types/api';

type CesiumMapProps = {
  nodes: GraphNode[];
  edges: GraphEdge[];
  route: RouteResponse | null;
};

function getStringProp(entity: any, name: string): string | undefined {
  const raw = entity.properties?.[name]?.getValue?.();
  if (raw === undefined || raw === null) return undefined;
  return String(raw);
}

export function CesiumMap({ nodes, edges, route }: CesiumMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewerRef = useRef<Viewer | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    Ion.defaultAccessToken = import.meta.env.VITE_CESIUM_ION_TOKEN ?? '';

    let destroyed = false;

    (async () => {
      const viewer = new Viewer(containerRef.current!, {
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

      if (destroyed) {
        viewer.destroy();
        return;
      }

      viewerRef.current = viewer;

      viewer.camera.setView({
        destination: Cartesian3.fromDegrees(37.6053, 55.7452, 900),
        orientation: {
          heading: CesiumMath.toRadians(25),
          pitch: CesiumMath.toRadians(-45),
          roll: 0,
        },
      });

      const osmBuildings = await createOsmBuildingsAsync();

      if (destroyed) return;

      viewer.scene.primitives.add(osmBuildings);

      const groundDs = await GeoJsonDataSource.load('/data/moscow-quarter-all.geojson', {
        clampToGround: true,
      });

      if (destroyed) return;

      viewer.dataSources.add(groundDs);

      for (const entity of groundDs.entities.values) {
        entity.label = undefined;
        entity.billboard = undefined;
        entity.point = undefined;

        const highway = getStringProp(entity, 'highway');
        const footway = getStringProp(entity, 'footway');
        const surface = getStringProp(entity, 'surface');
        const building = getStringProp(entity, 'building');

        // Здания из GeoJSON скрываем, потому что здания уже рисует Cesium OSM Buildings
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

      for (const node of nodes) {
        viewer.entities.add({
          id: `graph-node-${node.id}`,
          position: Cartesian3.fromDegrees(node.lon, node.lat, node.z),
          point: {
            pixelSize: 10,
            color: Color.CYAN,
          },
        });
      }

      for (const edge of edges) {
        const positions = edge.geometry.flatMap(([lat, lon, z]) => [lon, lat, z]);

        viewer.entities.add({
          id: `graph-edge-${edge.id}`,
          polyline: {
            positions: Cartesian3.fromDegreesArrayHeights(positions),
            width: 3,
            material: edge.attrs.hasStairs ? Color.DARKRED : Color.DODGERBLUE,
          },
        });
      }

      if (route) {
        for (const edge of route.edges) {
          const positions = edge.geometry.flatMap(([lat, lon, z]) => [lon, lat, z]);

          viewer.entities.add({
            id: `route-edge-${edge.id}`,
            polyline: {
              positions: Cartesian3.fromDegreesArrayHeights(positions),
              width: 7,
              material: Color.LIMEGREEN,
            },
          });
        }
      }
    })();

    return () => {
      destroyed = true;
      viewerRef.current?.destroy();
      viewerRef.current = null;
    };
  }, [nodes, edges, route]);

  return <div ref={containerRef} style={{ width: '100%', height: '100vh' }} />;
}