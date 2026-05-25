import { useState, useEffect, useCallback } from 'react';
import type { WebApp } from '@/types';
import './WebAppsPanel.css';

interface WebAppsPanelProps {
  workspaceRoot: string;
}

export function WebAppsPanel({ workspaceRoot }: WebAppsPanelProps) {
  const [apps, setApps] = useState<WebApp[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);

  const fetchApps = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/project/apps');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setApps(data);
    } catch (e: any) {
      setError(e.message);
      setApps([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch apps when workspace changes
  useEffect(() => {
    if (workspaceRoot) {
      fetchApps();
    }
  }, [workspaceRoot, fetchApps]);

  const handleOpen = useCallback((url: string) => {
    window.open(url, '_blank', 'noopener,noreferrer');
  }, []);

  const configApps = apps.filter(a => a.source === 'config');
  const autoApps = apps.filter(a => a.source === 'auto');

  return (
    <div className="webapps-panel">
      <div
        className="webapps-header"
        onClick={() => setCollapsed(!collapsed)}
        role="button"
        tabIndex={0}
        aria-expanded={!collapsed}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setCollapsed(!collapsed); }}
      >
        <span className="webapps-caret">{collapsed ? '▸' : '▾'}</span>
        <span className="webapps-title">Web Apps</span>
        {apps.length > 0 && <span className="webapps-count">{apps.length}</span>}
      </div>

      {!collapsed && (
        <div className="webapps-list">
          {loading && (
            <div className="webapps-loading">Scanning for apps…</div>
          )}

          {error && (
            <div className="webapps-error">⚠ {error}</div>
          )}

          {!loading && apps.length === 0 && (
            <div className="webapps-empty">
              <p>No web apps detected</p>
              <p className="webapps-hint">
                Add a <code>cammander.json</code> to your project root:
              </p>
              <pre className="webapps-example">{`{
  "webApps": [
    {
      "name": "Frontend",
      "url": "http://localhost:5173"
    }
  ]
}`}</pre>
            </div>
          )}

          {/* Config apps (explicit in cammander.json) */}
          {configApps.length > 0 && (
            <div className="webapps-group">
              <span className="webapps-group-label">Configured</span>
              {configApps.map((app, i) => (
                <div key={`cfg-${i}`} className="webapp-item">
                  <div className="webapp-info">
                    <span className="webapp-name">{app.name}</span>
                    {app.description && <span className="webapp-desc">{app.description}</span>}
                    <span className="webapp-url">{app.url}</span>
                  </div>
                  <button
                    className="webapp-open-btn"
                    onClick={() => handleOpen(app.url)}
                    title={`Open ${app.name}`}
                  >
                    ↗
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Auto-detected apps */}
          {autoApps.length > 0 && (
            <div className="webapps-group">
              <span className="webapps-group-label">Auto-detected</span>
              {autoApps.map((app, i) => (
                <div key={`auto-${i}`} className="webapp-item">
                  <div className="webapp-info">
                    <span className="webapp-name">{app.name}</span>
                    {app.description && <span className="webapp-desc">{app.description}</span>}
                    <span className="webapp-url">{app.url}</span>
                  </div>
                  <button
                    className="webapp-open-btn"
                    onClick={() => handleOpen(app.url)}
                    title={`Open ${app.name}`}
                  >
                    ↗
                  </button>
                </div>
              ))}
            </div>
          )}

          <button className="webapps-refresh-btn" onClick={fetchApps} disabled={loading}>
            {loading ? 'Scanning…' : 'Refresh'}
          </button>
        </div>
      )}
    </div>
  );
}
