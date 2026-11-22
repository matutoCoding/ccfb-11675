import { useState } from 'react';
import { useActiveShow } from './state/store';
import { ShowsPage } from './pages/ShowsPage';
import { ScenePage } from './pages/ScenePage';
import { ProjectionPage } from './pages/ProjectionPage';
import { SeatsPage } from './pages/SeatsPage';
import { ExportPage } from './pages/ExportPage';
import { SettingsPage } from './pages/SettingsPage';

type PageKey =
  | 'shows'
  | 'scene'
  | 'projection'
  | 'seats'
  | 'export'
  | 'settings';

const NAV: Array<{ key: PageKey; label: string }> = [
  { key: 'shows', label: '节目列表' },
  { key: 'scene', label: '场景编排' },
  { key: 'projection', label: '投影校正' },
  { key: 'seats', label: '座位预览' },
  { key: 'export', label: '渲染导出' },
  { key: 'settings', label: '设置' },
];

const App = () => {
  const [page, setPage] = useState<PageKey>('scene');
  const show = useActiveShow();

  return (
    <div className="app">
      <header className="topbar">
        <span className="brand">
          球幕工作室
          <small>Domemaster Preview &amp; Calibration</small>
        </span>
        {NAV.map((n) => (
          <button
            key={n.key}
            className={`nav-btn ${page === n.key ? 'active' : ''}`}
            onClick={() => setPage(n.key)}
          >
            {n.label}
          </button>
        ))}
        <span className="spacer" />
        <span className="pill">
          {show.name} · FOV {show.settings.fov}° · 倾角 {show.settings.domeTiltDeg}°
        </span>
      </header>

      <main>
        {page === 'shows' && <ShowsPage />}
        {page === 'scene' && <ScenePage />}
        {page === 'projection' && <ProjectionPage />}
        {page === 'seats' && <SeatsPage />}
        {page === 'export' && <ExportPage />}
        {page === 'settings' && <SettingsPage />}
      </main>
    </div>
  );
};

export default App;
