import { UserCategory } from '../types/api';

interface Props {
  profile: UserCategory;
  setProfile: (value: UserCategory) => void;
  onBuild: () => void;
  status: string;
}

export function ControlPanel({ profile, setProfile, onBuild, status }: Props) {
  return (
    <div
      style={{
        position: 'absolute',
        top: 16,
        left: 16,
        zIndex: 10,
        background: 'white',
        padding: 16,
        borderRadius: 12,
        width: 280,
        boxShadow: '0 4px 16px rgba(0,0,0,0.15)'
      }}
    >
      <h3>MGN Routing</h3>

      <label>Профиль</label>
      <select
        value={profile}
        onChange={(e) => setProfile(e.target.value as UserCategory)}
        style={{ width: '100%', marginTop: 8, marginBottom: 12 }}
      >
        <option value="wheelchair">Wheelchair</option>
        <option value="visual_impaired">Visual impaired</option>
        <option value="elderly">Elderly</option>
        <option value="parent_with_stroller">Parent with stroller</option>
      </select>

      <button onClick={onBuild} style={{ width: '100%' }}>
        Построить маршрут
      </button>

      <div style={{ marginTop: 12, fontSize: 14 }}>{status}</div>
    </div>
  );
}