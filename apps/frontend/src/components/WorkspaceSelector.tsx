import { useEffect, useState } from 'react';
import './WorkspaceSelector.css';

interface WorkspaceSelectorProps {
  current: string;
  onChange: (path: string) => void;
}

const RECENT_KEY = 'cammander:recent-workspaces';

function loadRecent(): string[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
  } catch {
    return [];
  }
}

function saveRecent(path: string) {
  const existing = loadRecent();
  const next = [path, ...existing.filter((p) => p !== path)].slice(0, 5);
  localStorage.setItem(RECENT_KEY, JSON.stringify(next));
}

export function WorkspaceSelector({ current, onChange }: WorkspaceSelectorProps) {
  const [recent, setRecent] = useState<string[]>([]);

  useEffect(() => {
    setRecent(loadRecent());
  }, [current]);

  const options = [current, ...recent.filter((p) => p !== current)].filter(Boolean);

  return (
    <div className="workspace-selector">
      <span className="workspace-selector__label">Project vault:</span>
      <select
        className="workspace-selector__select"
        value={current}
        onChange={(e) => {
          const path = e.target.value;
          saveRecent(path);
          onChange(path);
        }}
      >
        {options.map((p) => (
          <option key={p} value={p}>
            {p.split('/').pop() || p}
          </option>
        ))}
      </select>
    </div>
  );
}
