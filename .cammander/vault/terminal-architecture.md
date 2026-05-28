---
title: Terminal Gateway Architecture
tags: [terminal, socket-io, websocket, architecture, pitfall]
created: 2026-05-27T00:00:00.000Z
updated: 2026-05-27T00:00:00.000Z
---

# Terminal Gateway Architecture

## Socket.IO Configuration
- NestJS `@WebSocketGateway({ namespace: '/terminal', path: '/terminal', transports: ['polling', 'websocket'] })`
- Both `namespace` and `path` MUST be `/terminal`. Missing either one = dead terminal.
- Client: `io(url + '/terminal', { path: '/terminal' })`

## Slot-Based Persistent Sessions
- PTY processes keyed by slot ID (`"default"`, `"1"`, `"2"`, `"3"`) not client socket IDs.
- Max 4 slots enforced in frontend reducer.
- Client disconnect only detaches — PTY keeps running.
- Reaper interval: kills sessions with 0 clients for >30 min.
- `terminal:attach` reconnects to existing slot. `terminal:kill` explicitly kills PTY.
- `terminal:list` returns all active slot IDs for reconnection discovery.

## Venv Auto-Detection
- `detectVenv(cwd)` checks for `.venv/`, `venv/`, `env/` subdirectories containing `bin/activate`.
- Injects `source .venv/bin/activate` into PTY stdin after spawn.
- Only checks workspace root — does NOT search parent directories.

## Frontend Persistence
- Tab list saved to `localStorage('cammander:terminal-tabs')`.
- On page load: `terminal:list` discovers active backend slots, then `terminal:attach` for each tab.
- Per-tab xterm instances hidden via `display: none` on tab switch (not destroyed) to preserve scrollback.

## Proxy Requirements
- `http-proxy` with `ws: true` on `/terminal` route — raw `http.createServer` does NOT proxy WebSocket `upgrade` events.
- Vite proxy also needs `ws: true` on `/terminal` route.