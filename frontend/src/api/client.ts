import { GraphResponse, RouteResponse, UserCategory } from '../types/api';

const API = 'http://localhost:3001/api';

export async function fetchGraph(): Promise<GraphResponse> {
  const res = await fetch(`${API}/graph`);
  if (!res.ok) throw new Error('Failed to load graph');
  return res.json();
}

export async function buildRoute(
  startNodeId: string,
  endNodeId: string,
  profile: UserCategory
): Promise<RouteResponse> {
  const res = await fetch(`${API}/route`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ startNodeId, endNodeId, profile })
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new Error(error.error ?? 'Failed to build route');
  }

  return res.json();
}