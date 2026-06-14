---
title: Terminal Gateway Architecture
tags: [terminal, socket-io, websocket, architecture, pitfall]
created: 2026-05-27T00:00:00.000Z
updated: 2026-05-27T00:00:00.000Z
---

# Terminal Gateway Architecture

## Facts

<!--- cammander:facts:begin -->
| # | claim | kind | confidence | value | unit | source | context |
|---|---|---|---|---|---|---|---|
| 1 | Socket.IO namespace and path both /terminal | fact | 1.0 | | | codebase | both required for terminal to work |
| 2 | Slot-based PTY sessions keyed by slot ID not socket ID | fact | 1.0 | | | codebase | max 4 slots |
| 3 | Client disconnect detaches but PTY keeps running | fact | 1.0 | | | codebase | reaper kills orphaned after 30min |
| 4 | Venv auto-detection checks .venv venv env in cwd | fact | 1.0 | | | codebase | injects source activate into PTY stdin |
| 5 | Terminal tabs saved to localStorage for persistence | fact | 1.0 | | | codebase | cammander:terminal-tabs key |
| 6 | Proxy MUST set ws:true on /terminal route | pitfall | 1.0 | | | troubleshooting | raw http server doesn't proxy upgrade |
| 7 | Max 4 concurrent PTY slots | metric | 1.0 | 4 | slots | codebase | enforced in frontend reducer |
<!--- cammander:facts:end -->

## Socket.IO Configuration
- NestJS `@WebSocketGateway({ namespace: '/terminal', path: '/terminal', transports: ['polling', 'websocket'] })`
- Both `namespace` and `path` MUST be `/terminal`. Missing either one = dead terminal.
- Client: `io(url + '/terminal', { path: '/terminal' })`

## Slot-Based Persistent Sessions
- PTY processes keyed by slot ID (`"default"`, `"1"`, `"2"`, `"3"`) not client socket IDs — see [[architecture]] for the full module map.
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