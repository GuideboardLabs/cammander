import { useEffect, useRef, useCallback, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { io, Socket } from 'socket.io-client';
import { useWorkspace } from '@/stores';
import '@xterm/xterm/css/xterm.css';
import './TerminalPanel.css';

const WS_PROTOCOL = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const WS_URL = `${WS_PROTOCOL}//${window.location.host}`;

interface TerminalPanelProps {
  onClose?: () => void;
}

export function TerminalPanel({ onClose }: TerminalPanelProps) {
  const { state } = useWorkspace();
  const termRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [pid, setPid] = useState<number | null>(null);
  const [reattached, setReattached] = useState(false);

  // Initialize terminal + socket
  useEffect(() => {
    if (!termRef.current) return;

    const xterm = new Terminal({
      cursorBlink: true,
      cursorStyle: 'bar',
      fontSize: 13,
      fontFamily: "'SF Mono', 'Fira Code', 'Cascadia Code', Consolas, monospace",
      theme: {
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
      },
      allowProposedApi: true,
    });

    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();

    xterm.loadAddon(fitAddon);
    xterm.loadAddon(webLinksAddon);
    xterm.open(termRef.current);
    fitAddon.fit();

    xtermRef.current = xterm;
    fitAddonRef.current = fitAddon;

    // Connect to backend WebSocket
    const socket = io(WS_URL, {
      path: '/terminal',
      transports: ['polling', 'websocket'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: Infinity,  // keep trying forever
      reconnectionDelayMax: 10000,
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      setConnected(true);
      // Attach to persistent session (creates if doesn't exist)
      const cwd = state.root?.path || undefined;
      socket.emit('terminal:attach', {
        slot: 'default',
        cwd,
        cols: xterm.cols,
        rows: xterm.rows,
      });
    });

    socket.on('terminal:ready', (data: { cwd: string; pid: number; slot: string; reattached: boolean }) => {
      setPid(data.pid);
      setReattached(data.reattached);
      if (data.reattached) {
        // Clear and show a brief reconnect notice
        xterm.write('\x1b[90m[Reconnected to persistent terminal]\x1b[0m\r\n');
        // Re-sync size
        socket.emit('terminal:resize', { cols: xterm.cols, rows: xterm.rows });
      }
    });

    socket.on('terminal:data', (data: string) => {
      xterm.write(data);
    });

    socket.on('terminal:exit', (data: { exitCode: number }) => {
      xterm.write(`\r\n\x1b[90m[Process exited with code ${data.exitCode}]\x1b[0m\r\n`);
      setPid(null);
      setReattached(false);
    });

    socket.on('disconnect', () => {
      setConnected(false);
      // Don't clear pid — the PTY is still alive server-side
      xterm.write('\x1b[90m[Disconnected — terminal persists, reconnecting...]\x1b[0m\r\n');
    });

    // Terminal input → socket
    const inputDisposable = xterm.onData((data: string) => {
      if (socket.connected) {
        socket.emit('terminal:input', { data });
      }
    });

    // Resize handling
    const resizeObserver = new ResizeObserver(() => {
      fitAddon.fit();
      if (socket.connected) {
        socket.emit('terminal:resize', { cols: xterm.cols, rows: xterm.rows });
      }
    });
    resizeObserver.observe(termRef.current);

    return () => {
      resizeObserver.disconnect();
      inputDisposable.dispose();
      // Don't kill the PTY on unmount — just disconnect
      // PTY persists server-side and can be reattached
      socket.disconnect();
      xterm.dispose();
      xtermRef.current = null;
      fitAddonRef.current = null;
      socketRef.current = null;
    };
  }, [state.root?.path]); // Re-spawn when workspace changes

  // Handle window resize
  useEffect(() => {
    const handleResize = () => {
      if (fitAddonRef.current && xtermRef.current) {
        fitAddonRef.current.fit();
        socketRef.current?.emit('terminal:resize', {
          cols: xtermRef.current.cols,
          rows: xtermRef.current.rows,
        });
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleRestart = useCallback(() => {
    const socket = socketRef.current;
    const xterm = xtermRef.current;
    if (!socket || !xterm) return;
    xterm.clear();
    // Kill the persistent session and create a fresh one
    socket.emit('terminal:kill', { slot: 'default' });
    const cwd = state.root?.path || undefined;
    socket.emit('terminal:attach', {
      slot: 'default',
      cwd,
      cols: xterm.cols,
      rows: xterm.rows,
    });
  }, [state.root?.path]);

  return (
    <div className="terminal-panel">
      <div className="terminal-header">
        <span className="terminal-header-title">Terminal</span>
        {state.root && (
          <span className="terminal-header-cwd">{state.root.name}</span>
        )}
        {pid !== null && (
          <span className="terminal-header-badge">
            PID {pid}{reattached ? ' · reattached' : ''}
          </span>
        )}
        <div className="terminal-header-status">
          <span className={`terminal-status-dot${connected ? ' terminal-status-dot--on' : ''}`} />
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
      <div className="terminal-body" ref={termRef} />
    </div>
  );
}