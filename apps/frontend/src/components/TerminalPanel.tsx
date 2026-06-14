import { useEffect, useRef, useCallback } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { io, Socket } from 'socket.io-client';
import { useWorkspace } from '@/stores';
import type { TerminalTab } from '@/types';
import '@xterm/xterm/css/xterm.css';
import './TerminalPanel.css';

const WS_PROTOCOL = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const WS_URL = `${WS_PROTOCOL}//${window.location.host}`;
const MAX_TABS = 4;

/** Xterm theme (Catppuccin Mocha) */
const XTERM_THEME = {
  background: '#11111b',
  foreground: '#cdd6f4',
  cursor: '#f5e0dc',
  cursorAccent: '#11111b',
  selectionBackground: 'rgba(203, 166, 247, 0.3)',
  selectionForeground: '#cdd6f4',
  black: '#45475a',
  red: '#f38ba8',
  green: '#a6e3a1',
  yellow: '#f9e2af',
  blue: '#89b4fa',
  magenta: '#f5c2e7',
  cyan: '#94e2d5',
  white: '#bac2de',
  brightBlack: '#585b70',
  brightRed: '#f38ba8',
  brightGreen: '#a6e3a1',
  brightYellow: '#f9e2af',
  brightBlue: '#89b4fa',
  brightMagenta: '#f5c2e7',
  brightCyan: '#94e2d5',
  brightWhite: '#a6adc8',
};

interface TerminalPanelProps {
  onClose?: () => void;
}

/**
 * Each active slot gets its own xterm instance + socket connection.
 * Managed via refs keyed by slotId so they survive across tab switches.
 */
export function TerminalPanel({ onClose }: TerminalPanelProps) {
  const { state, dispatch } = useWorkspace();
  const { terminalTabs, activeTerminal } = state;

  // Per-slot refs
  const termInstances = useRef<Map<string, { xterm: Terminal; fitAddon: FitAddon; socket: Socket; container: HTMLDivElement }>>(new Map());
  const containerRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  // Generate next slot label
  const nextLabel = useCallback(() => {
    for (let i = 1; i <= MAX_TABS; i++) {
      const label = `Terminal ${i}`;
      if (!terminalTabs.some((t) => t.label === label)) return label;
    }
    return `Terminal ${terminalTabs.length + 1}`;
  }, [terminalTabs]);

  // Generate next slot ID
  const nextSlotId = useCallback(() => {
    for (let i = 1; i <= MAX_TABS; i++) {
      const id = `term-${i}`;
      if (!terminalTabs.some((t) => t.slotId === id)) return id;
    }
    return `term-${Date.now()}`;
  }, [terminalTabs]);

  // Spawn xterm + socket for a slot
  const spawnTerminal = useCallback((slotId: string, cwd?: string) => {
    const container = containerRefs.current.get(slotId);
    if (!container) return;

    // Already spawned? Skip
    if (termInstances.current.has(slotId)) return;

    const xterm = new Terminal({
      cursorBlink: true,
      cursorStyle: 'bar',
      fontSize: 13,
      fontFamily: "'SF Mono', 'Fira Code', 'Cascadia Code', Consolas, monospace",
      theme: XTERM_THEME,
      allowProposedApi: true,
    });

    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();
    xterm.loadAddon(fitAddon);
    xterm.loadAddon(webLinksAddon);
    xterm.open(container);
    fitAddon.fit();

    const socket = io(`${WS_URL}/terminal`, {
      path: '/terminal',
      transports: ['polling', 'websocket'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: Infinity,
      reconnectionDelayMax: 10000,
    });

    socket.on('connect', () => {
      dispatch({ type: 'UPDATE_TERMINAL_TAB', slotId, updates: { connected: true } });
      const attachCwd = cwd || state.root?.path || undefined;
      socket.emit('terminal:attach', {
        slot: slotId,
        cwd: attachCwd,
        cols: xterm.cols,
        rows: xterm.rows,
      });
    });

    socket.on('terminal:ready', (data: { cwd: string; pid: number; slot: string; reattached: boolean }) => {
      dispatch({ type: 'UPDATE_TERMINAL_TAB', slotId, updates: { pid: data.pid, connected: true } });
      if (data.reattached) {
        xterm.write('\x1b[90m[Reconnected to persistent terminal]\x1b[0m\r\n');
        socket.emit('terminal:resize', { cols: xterm.cols, rows: xterm.rows });
      }
    });

    socket.on('terminal:reset', () => {
      xterm.clear();
      xterm.write('\x1b[90m[Terminal reset]\x1b[0m\r\n');
      dispatch({ type: 'UPDATE_TERMINAL_TAB', slotId, updates: { pid: null, connected: false } });
    });

    socket.on('terminal:data', (data: string) => {
      xterm.write(data);
    });

    socket.on('terminal:exit', (data: { exitCode: number }) => {
      xterm.write(`\r\n\x1b[90m[Process exited with code ${data.exitCode}]\x1b[0m\r\n`);
      dispatch({ type: 'UPDATE_TERMINAL_TAB', slotId, updates: { pid: null, connected: false } });
    });

    socket.on('disconnect', () => {
      dispatch({ type: 'UPDATE_TERMINAL_TAB', slotId, updates: { connected: false } });
      xterm.write('\x1b[90m[Disconnected — terminal persists, reconnecting...]\x1b[0m\r\n');
    });

    // Input
    xterm.onData((data: string) => {
      if (socket.connected) {
        socket.emit('terminal:input', { data });
      }
    });

    // Resize observer
    const resizeObserver = new ResizeObserver(() => {
      fitAddon.fit();
      if (socket.connected) {
        socket.emit('terminal:resize', { cols: xterm.cols, rows: xterm.rows });
      }
    });
    resizeObserver.observe(container);

    termInstances.current.set(slotId, { xterm, fitAddon, socket, container });

    // Cleanup function stored but not called until slot is killed
    (container as any).__cleanup = () => {
      resizeObserver.disconnect();
      xterm.dispose();
      socket.disconnect();
      termInstances.current.delete(slotId);
    };
  }, [state.root?.path, dispatch]);

  // On mount: if no tabs exist, create the first one. If tabs exist (restored), re-spawn them.
  useEffect(() => {
    if (terminalTabs.length === 0) {
      // Auto-create first terminal
      const slotId = 'term-1';
      const tab: TerminalTab = { slotId, label: 'Terminal 1', connected: false, pid: null };
      dispatch({ type: 'ADD_TERMINAL_TAB', tab });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Re-spawn terminals when tabs change (e.g. after persistence restore)
  useEffect(() => {
    for (const tab of terminalTabs) {
      const container = containerRefs.current.get(tab.slotId);
      if (container && !termInstances.current.has(tab.slotId)) {
        spawnTerminal(tab.slotId);
      }
    }
  }, [terminalTabs, spawnTerminal]);

  // Visibility: hide inactive terminals, show active one
  useEffect(() => {
    for (const [slotId, instance] of termInstances.current.entries()) {
      const container = instance.container;
      if (slotId === activeTerminal) {
        container.style.display = '';
        // Re-fit when becoming visible
        setTimeout(() => {
          instance.fitAddon.fit();
          if (instance.socket.connected) {
            instance.socket.emit('terminal:resize', { cols: instance.xterm.cols, rows: instance.xterm.rows });
          }
        }, 0);
      } else {
        container.style.display = 'none';
      }
    }
  }, [activeTerminal]);

  // Window resize
  useEffect(() => {
    const handleResize = () => {
      const instance = activeTerminal ? termInstances.current.get(activeTerminal) : undefined;
      if (instance) {
        instance.fitAddon.fit();
        if (instance.socket.connected) {
          instance.socket.emit('terminal:resize', { cols: instance.xterm.cols, rows: instance.xterm.rows });
        }
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [activeTerminal]);

  // Add new terminal tab
  const handleAddTab = useCallback(() => {
    if (terminalTabs.length >= MAX_TABS) return;
    const slotId = nextSlotId();
    const label = nextLabel();
    const tab: TerminalTab = { slotId, label, connected: false, pid: null };
    dispatch({ type: 'ADD_TERMINAL_TAB', tab });
  }, [terminalTabs.length, nextSlotId, nextLabel, dispatch]);

  // Close/kill a terminal tab
  const handleCloseTab = useCallback((slotId: string) => {
    const instance = termInstances.current.get(slotId);
    if (instance) {
      instance.socket.emit('terminal:kill', { slot: slotId });
      const cleanup = (instance.container as any).__cleanup;
      if (cleanup) cleanup();
    }
    dispatch({ type: 'REMOVE_TERMINAL_TAB', slotId });
  }, [dispatch]);

  // Restart current terminal
  const handleRestart = useCallback(() => {
    const instance = activeTerminal ? termInstances.current.get(activeTerminal) : undefined;
    if (!instance) return;
    instance.xterm.clear();
    instance.socket.emit('terminal:kill', { slot: activeTerminal });
    const cwd = state.root?.path || undefined;
    // Reattach will trigger the server to spawn a fresh PTY since the old one is gone
    instance.socket.emit('terminal:attach', {
      slot: activeTerminal,
      cwd,
      cols: instance.xterm.cols,
      rows: instance.xterm.rows,
    });
  }, [activeTerminal, state.root?.path]);

  // Register container ref callback
  const setContainerRef = useCallback((slotId: string, el: HTMLDivElement | null) => {
    if (el) {
      containerRefs.current.set(slotId, el);
      // Auto-spawn if not yet running
      if (!termInstances.current.has(slotId)) {
        const tab = terminalTabs.find((t) => t.slotId === slotId);
        if (tab) {
          spawnTerminal(slotId);
        }
      }
    } else {
      const instance = termInstances.current.get(slotId);
      if (instance) {
        const cleanup = (instance.container as any).__cleanup;
        if (cleanup) cleanup();
      }
      containerRefs.current.delete(slotId);
    }
  }, [terminalTabs, spawnTerminal]);

  const canAdd = terminalTabs.length < MAX_TABS;

  return (
    <div className="terminal-panel">
      <div className="terminal-header">
        <div className="terminal-tab-bar">
          {terminalTabs.map((tab) => (
            <button
              key={tab.slotId}
              className={`terminal-tab${tab.slotId === activeTerminal ? ' terminal-tab--active' : ''}`}
              onClick={() => dispatch({ type: 'SET_ACTIVE_TERMINAL', slotId: tab.slotId })}
            >
              <span className="terminal-tab-label">{tab.label}</span>
              <span className={`terminal-status-dot${tab.connected ? ' terminal-status-dot--on' : ''}`} />
              {terminalTabs.length > 1 && (
                <span
                  className="terminal-tab-close"
                  onClick={(e) => { e.stopPropagation(); handleCloseTab(tab.slotId); }}
                  title={`Close ${tab.label}`}
                >
                  ✕
                </span>
              )}
            </button>
          ))}
          {canAdd && (
            <button className="terminal-tab terminal-tab--add" onClick={handleAddTab} title="New terminal">
              +
            </button>
          )}
        </div>
        <div className="terminal-header-actions">
          <button className="terminal-btn" onClick={handleRestart} title="Restart terminal">
            ↻
          </button>
          {onClose && (
            <button className="terminal-btn" onClick={onClose} title="Close">
              ✕
            </button>
          )}
        </div>
      </div>
      {/* Render a container div per tab — only the active one is visible */}
      {terminalTabs.map((tab) => (
        <div
          key={tab.slotId}
          ref={(el) => setContainerRef(tab.slotId, el)}
          className={`terminal-body${tab.slotId === activeTerminal ? '' : ' terminal-body--hidden'}`}
        />
      ))}
    </div>
  );
}