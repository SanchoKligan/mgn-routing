import { useEffect, useState } from 'react';
import { buildRoute, fetchGraph } from './api/client';
import { CesiumMap } from './components/CesiumMap';
import type {
  GraphEdge,
  GraphNode,
  RouteResponse,
  UserCategory,
} from './types/api';

export default function App() {
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [edges, setEdges] = useState<GraphEdge[]>([]);
  const [route, setRoute] = useState<RouteResponse | null>(null);

  const [profile, setProfile] = useState<UserCategory>('wheelchair');
  const [status, setStatus] = useState('Загрузка графа...');
  const [startNodeId, setStartNodeId] = useState<string | null>(null);
  const [endNodeId, setEndNodeId] = useState<string | null>(null);

  useEffect(() => {
    fetchGraph()
      .then((data) => {
        setNodes(data.nodes);
        setEdges(data.edges);
        setStatus('Кликните по карте и выберите узел как старт или финиш.');
      })
      .catch((err) => {
        setStatus(err.message);
      });
  }, []);

  const handleSelectStart = (nodeId: string) => {
    setStartNodeId(nodeId);
    setRoute(null);
    setStatus(`Старт выбран: ${nodeId}`);
  };

  const handleSelectEnd = (nodeId: string) => {
    setEndNodeId(nodeId);
    setRoute(null);
    setStatus(`Финиш выбран: ${nodeId}`);
  };

  const handleReset = () => {
    setStartNodeId(null);
    setEndNodeId(null);
    setRoute(null);
    setStatus('Выбор сброшен. Кликните по карте и выберите узел как старт или финиш.');
  };

  const handleBuildRoute = async () => {
    if (!startNodeId || !endNodeId) {
      setStatus('Нужно выбрать старт и финиш.');
      return;
    }

    try {
      setStatus('Построение маршрута...');
      const result = await buildRoute(startNodeId, endNodeId, profile);
      setRoute(result);
      setStatus(`Маршрут найден: ${Math.round(result.distanceM)} м`);
    } catch (err) {
      setRoute(null);
      setStatus(err instanceof Error ? err.message : 'Ошибка');
    }
  };

  return (
    <>
      <div
        style={{
          position: 'absolute',
          zIndex: 20,
          top: 16,
          left: 16,
          background: '#fff',
          padding: 12,
          borderRadius: 10,
          width: 320,
          boxShadow: '0 4px 18px rgba(0,0,0,0.18)',
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ marginBottom: 10, fontWeight: 600 }}>
          MGN Routing
        </div>

        <div style={{ fontSize: 14, marginBottom: 10 }}>
          <div><b>Старт:</b> {startNodeId ?? 'не выбран'}</div>
          <div><b>Финиш:</b> {endNodeId ?? 'не выбран'}</div>
        </div>

        <div style={{ marginBottom: 10 }}>
          <label style={{ display: 'block', marginBottom: 6 }}>Профиль</label>
          <select
            value={profile}
            onChange={(e) => setProfile(e.target.value as UserCategory)}
            style={{ width: '100%' }}
          >
            <option value="wheelchair">Колясочник</option>
            <option value="visual_impaired">Слабовидящий</option>
            <option value="elderly">Пожилой</option>
            <option value="parent_with_stroller">Родитель с коляской</option>
          </select>
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
          <button
            onClick={handleBuildRoute}
            disabled={!startNodeId || !endNodeId}
            style={{ flex: 1 }}
          >
            Построить
          </button>
          <button onClick={handleReset} style={{ flex: 1 }}>
            Сброс
          </button>
        </div>

        <div style={{ fontSize: 13, lineHeight: 1.4, color: '#333' }}>
          {status}
        </div>
      </div>

      <CesiumMap
        nodes={nodes}
        edges={edges}
        route={route}
        startNodeId={startNodeId}
        endNodeId={endNodeId}
        onSelectStart={handleSelectStart}
        onSelectEnd={handleSelectEnd}
      />
    </>
  );
}
