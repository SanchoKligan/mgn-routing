import { useCallback, useEffect, useState } from 'react';
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
        setStatus('Граф загружен. Кликни по карте, чтобы выбрать старт и финиш.');
      })
      .catch((err) => {
        setStatus(err.message);
      });
  }, []);

  const handleMapNodePick = useCallback((nodeId: string) => {
    setRoute(null);

    if (!startNodeId) {
      setStartNodeId(nodeId);
      setStatus(`Старт выбран: ${nodeId}. Теперь выбери финиш.`);
      return;
    }

    if (!endNodeId && nodeId !== startNodeId) {
      setEndNodeId(nodeId);
      setStatus(`Финиш выбран: ${nodeId}. Теперь можно построить маршрут.`);
      return;
    }

    if (nodeId !== startNodeId) {
      setStartNodeId(nodeId);
      setEndNodeId(null);
      setStatus(`Новый старт: ${nodeId}. Теперь выбери новый финиш.`);
    }
  }, [startNodeId, endNodeId]);

  const handleReset = () => {
    setStartNodeId(null);
    setEndNodeId(null);
    setRoute(null);
    setStatus('Выбор сброшен. Кликни по карте, чтобы выбрать старт и финиш.');
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
      setStatus(
        `Маршрут найден: ${Math.round(result.distanceM)} м, cost=${result.totalCost.toFixed(1)}`
      );
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
          zIndex: 10,
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
          MGN Routing Prototype
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
            <option value="wheelchair">Wheelchair</option>
            <option value="visual_impaired">Visual impaired</option>
            <option value="elderly">Elderly</option>
            <option value="parent_with_stroller">Parent with stroller</option>
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
        route={route}
        startNodeId={startNodeId}
        endNodeId={endNodeId}
        onPickNode={handleMapNodePick}
      />
    </>
  );
}