import { useState, useEffect, useCallback } from 'react';
import './WorkspacePicker.css';

interface FolderEntry {
  name: string;
  path: string;
  isProject?: boolean;
  hasGit?: boolean;
}

interface WorkspacePickerProps {
  open: boolean;
  onClose: () => void;
  onSelect: (path: string) => void;
}

export function WorkspacePicker({ open, onClose, onSelect }: WorkspacePickerProps) {
  const [folders, setFolders] = useState<FolderEntry[]>([]);
  const [selected, setSelected] = useState<FolderEntry | null>(null);
  const [manualPath, setManualPath] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [browsePath, setBrowsePath] = useState('');
  const [mode, setMode] = useState<'home' | 'browse'>('home');

  const loadHomeFolders = useCallback(async (basePath?: string) => {
    setLoading(true);
    setError('');
    setSelected(null);
    try {
      const params = basePath ? `?base=${encodeURIComponent(basePath)}` : '';
      const res = await fetch(`/api/workspaces/home-folders${params}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setFolders(data);
      setMode('home');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const browse = useCallback(async (dirPath: string) => {
    setLoading(true);
    setError('');
    setSelected(null);
    setBrowsePath(dirPath);
    try {
      const params = dirPath ? `?path=${encodeURIComponent(dirPath)}` : '';
      const res = await fetch(`/api/workspaces/browse${params}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const parentPath = data.path.split('/').slice(0, -1).join('/') || '/';
      const entries: FolderEntry[] = [];
      // Add "up" entry if not at root
      if (data.path !== '/') {
        entries.push({ name: '..', path: parentPath, isProject: false });
      }
      for (const e of data.entries) {
        entries.push(e);
      }
      setFolders(entries);
      setMode('browse');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      loadHomeFolders();
      setManualPath('');
    }
  }, [open, loadHomeFolders]);

  const handleSelect = (entry: FolderEntry) => {
    if (entry.name === '..') {
      browse(entry.path);
      return;
    }
    setSelected(entry);
  };

  const handleDoubleClick = (entry: FolderEntry) => {
    if (entry.name === '..') {
      browse(entry.path);
      return;
    }
    // If it's a folder, navigate into it
    browse(entry.path);
  };

  const handleOpen = () => {
    if (selected) {
      onSelect(selected.path);
      onClose();
    } else if (manualPath.trim()) {
      onSelect(manualPath.trim());
      onClose();
    }
  };

  if (!open) return null;

  return (
    <div className="wpicker-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="wpicker-modal">
        <div className="wpicker-header">
          <span className="wpicker-title">Open Workspace</span>
          <button className="wpicker-close-btn" onClick={onClose}>✕</button>
        </div>
        <div className="wpicker-body">
          {/* Manual path input */}
          <div className="wpicker-path-bar">
            <input
              className="wpicker-path-input"
              type="text"
              value={mode === 'browse' ? browsePath : manualPath}
              onChange={e => {
                if (mode === 'browse') setBrowsePath(e.target.value);
                else setManualPath(e.target.value);
              }}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  const p = mode === 'browse' ? browsePath : manualPath;
                  if (p.trim()) browse(p.trim());
                }
              }}
              placeholder="Enter path or browse below…"
            />
            <button
              className="wpicker-browse-btn"
              onClick={() => {
                const p = mode === 'browse' ? browsePath : manualPath;
                if (p.trim()) browse(p.trim());
              }}
            >
              Go
            </button>
            {mode === 'browse' && (
              <button className="wpicker-home-btn" onClick={() => loadHomeFolders()}>
                Home
              </button>
            )}
          </div>

          {/* Folder list */}
          <div className="wpicker-list">
            {loading && <div className="wpicker-empty">Loading…</div>}
            {error && <div className="wpicker-empty wpicker-empty--err">Error: {error}</div>}
            {!loading && !error && folders.length === 0 && (
              <div className="wpicker-empty">No folders found. Try a different path.</div>
            )}
            {!loading && !error && folders.map((f, i) => (
              <div
                key={`${f.path}-${i}`}
                className={`wpicker-item${selected?.path === f.path ? ' wpicker-item--selected' : ''}${f.name === '..' ? ' wpicker-item--up' : ''}`}
                onClick={() => handleSelect(f)}
                onDoubleClick={() => handleDoubleClick(f)}
              >
                <span className="wpicker-item-icon">
                  {f.name === '..' ? '⬆' : f.isProject ? '📦' : '📁'}
                </span>
                <div className="wpicker-item-info">
                  <div className="wpicker-item-name">{f.name}</div>
                  <div className="wpicker-item-path">{f.path}</div>
                </div>
                {f.hasGit && <span className="wpicker-item-badge wpicker-item-badge--git">git</span>}
              </div>
            ))}
          </div>

          {/* Open button */}
          <div className="wpicker-footer">
            <button
              className="wpicker-open-btn"
              onClick={handleOpen}
              disabled={!selected && !manualPath.trim()}
            >
              {selected ? `Open ${selected.name}` : manualPath.trim() ? 'Open path' : 'Select a folder'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}