import { useEffect, useState } from 'react';
import { buildRoute, fetchGraph } from './api/client';
import { CesiumMap } from './components/CesiumMap';
import type { GraphEdge, GraphNode, RouteResponse, UserCategory } from './types/api';

export default function App() {
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [edges, setEdges] = useState<GraphEdge[]>([]);
  const [route, setRoute] = useState<RouteResponse | null>(null);
  const [profile, setProfile] = useState<UserCategory>('wheelchair');
  const [status, setStatus] = useState('Загрузка графа...');

  useEffect(() => {
    fetchGraph()
      .then((data) => {
        setNodes(data.nodes);
        setEdges(data.edges);
        setStatus('Граф загружен');
      })
      .catch((err) => {
        setStatus(err.message);
      });
  }, []);

  const handleBuild = async () => {
    try {
      setStatus('Построение маршрута...');
      const result = await buildRoute('n1', 'n4', profile);
      setRoute(result);
      setStatus(`Маршрут найден: ${Math.round(result.distanceM)} м`);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Ошибка');
    }
  };

  return (
    <>
      <div
        style={{
          position: 'absolute',
          zIndex: 10,
          top: 16,
          left: 16,
          background: '#fff',
          padding: 12,
          borderRadius: 8,
        }}
      >
        <div style={{ marginBottom: 8 }}>{status}</div>

        <select
          value={profile}
          onChange={(e) => setProfile(e.target.value as UserCategory)}
        >
          <option value="wheelchair">Wheelchair</option>
          <option value="visual_impaired">Visual impaired</option>
          <option value="elderly">Elderly</option>
          <option value="parent_with_stroller">Parent with stroller</option>
        </select>

        <button onClick={handleBuild} style={{ marginLeft: 8 }}>
          Построить маршрут
        </button>
      </div>

      <CesiumMap nodes={nodes} edges={edges} route={route} />
    </>
  );
}