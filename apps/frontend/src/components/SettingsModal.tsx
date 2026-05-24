import { useState, useEffect, useCallback } from 'react';
import './SettingsModal.css';

interface Settings {
  activeProvider: 'ollama-cloud' | 'ollama-local';
  ollamaCloud: { apiKey: string; baseUrl: string };
  ollamaLocal: { host: string; port: number };
  defaultModel: string;
}

const DEFAULT_SETTINGS: Settings = {
  activeProvider: 'ollama-cloud',
  ollamaCloud: { apiKey: '', baseUrl: 'https://ollama.com/v1' },
  ollamaLocal: { host: 'localhost', port: 11434 },
  defaultModel: '',
};

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
}

export function SettingsModal({ open, onClose }: SettingsModalProps) {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [status, setStatus] = useState<{ text: string; ok: boolean } | null>(null);

  // Load settings when modal opens
  useEffect(() => {
    if (!open) return;
    setStatus(null);
    (async () => {
      try {
        const res = await fetch('/api/settings');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        setSettings({
          activeProvider: data.activeProvider || 'ollama-cloud',
          ollamaCloud: {
            apiKey: data.ollamaCloud?.apiKey || '',
            baseUrl: data.ollamaCloud?.baseUrl || 'https://ollama.com/v1',
          },
          ollamaLocal: {
            host: data.ollamaLocal?.host || 'localhost',
            port: data.ollamaLocal?.port || 11434,
          },
          defaultModel: data.defaultModel || '',
        });
      } catch {
        // Load from localStorage as fallback
        const saved = JSON.parse(localStorage.getItem('cammander-settings') || '{}');
        setSettings({
          activeProvider: saved.activeProvider || 'ollama-cloud',
          ollamaCloud: {
            apiKey: saved.ollamaCloud?.apiKey || '',
            baseUrl: saved.ollamaCloud?.baseUrl || 'https://ollama.com/v1',
          },
          ollamaLocal: {
            host: saved.ollamaLocal?.host || 'localhost',
            port: saved.ollamaLocal?.port || 11434,
          },
          defaultModel: saved.defaultModel || '',
        });
      }
    })();
  }, [open]);

  const handleSave = useCallback(async () => {
    // Always save to localStorage as backup
    localStorage.setItem('cammander-settings', JSON.stringify(settings));

    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setStatus({ text: '✓ Settings saved', ok: true });
    } catch (e: any) {
      setStatus({ text: `Saved locally (${e.message})`, ok: false });
    }
  }, [settings]);

  const update = <K extends keyof Settings>(key: K, value: Settings[K]) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  if (!open) return null;

  return (
    <div className="settings-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="settings-modal">
        <div className="settings-modal-header">
          <span className="settings-modal-title">Settings</span>
          <button className="settings-close-btn" onClick={onClose}>✕</button>
        </div>
        <div className="settings-modal-body">
          {/* Provider tabs */}
          <div className="settings-section">
            <span className="settings-label">AI Provider</span>
            <div className="settings-provider-tabs">
              <button
                className={`settings-provider-tab${settings.activeProvider === 'ollama-cloud' ? ' settings-provider-tab--active' : ''}`}
                onClick={() => update('activeProvider', 'ollama-cloud')}
              >
                Ollama Cloud
              </button>
              <button
                className={`settings-provider-tab${settings.activeProvider === 'ollama-local' ? ' settings-provider-tab--active' : ''}`}
                onClick={() => update('activeProvider', 'ollama-local')}
              >
                Ollama Local
              </button>
            </div>
          </div>

          {/* Cloud settings */}
          {settings.activeProvider === 'ollama-cloud' && (
            <div className="settings-section">
              <div className="settings-field">
                <label>API Key</label>
                <input
                  className="settings-input"
                  type="password"
                  value={settings.ollamaCloud.apiKey}
                  onChange={e => update('ollamaCloud', { ...settings.ollamaCloud, apiKey: e.target.value })}
                  placeholder="Enter your Ollama Cloud API key"
                />
              </div>
              <div className="settings-field">
                <label>Base URL</label>
                <input
                  className="settings-input"
                  type="text"
                  value={settings.ollamaCloud.baseUrl}
                  onChange={e => update('ollamaCloud', { ...settings.ollamaCloud, baseUrl: e.target.value })}
                  placeholder="https://ollama.com/v1"
                />
              </div>
            </div>
          )}

          {/* Local settings */}
          {settings.activeProvider === 'ollama-local' && (
            <div className="settings-section">
              <div className="settings-field">
                <label>Host</label>
                <input
                  className="settings-input"
                  type="text"
                  value={settings.ollamaLocal.host}
                  onChange={e => update('ollamaLocal', { ...settings.ollamaLocal, host: e.target.value })}
                  placeholder="localhost"
                />
              </div>
              <div className="settings-field">
                <label>Port</label>
                <input
                  className="settings-input"
                  type="number"
                  value={settings.ollamaLocal.port}
                  onChange={e => update('ollamaLocal', { ...settings.ollamaLocal, port: parseInt(e.target.value) || 11434 })}
                  placeholder="11434"
                />
              </div>
            </div>
          )}

          {/* Default model */}
          <div className="settings-section">
            <div className="settings-field">
              <label>Default Model</label>
              <input
                className="settings-input"
                type="text"
                value={settings.defaultModel}
                onChange={e => update('defaultModel', e.target.value)}
                placeholder="e.g. qwen3-coder"
              />
            </div>
          </div>

          <button className="settings-save-btn" onClick={handleSave}>Save Settings</button>
          {status && (
            <div className={`settings-status${status.ok ? ' settings-status--ok' : ' settings-status--err'}`}>
              {status.text}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}