# cammander

Mobile-first browser AI coding harness. Single-file prototype with a real PTY terminal, streaming chat with tool-calling, and code editor. NestJS backend, Socket.IO transport, Ollama Cloud.

## Architecture

```
Browser (port 3001)
  |
  proxy.js  ── static files + WS upgrade
  |
  Backend (port 3002)
  ├── /api/chat       ── streaming chat + tool loop
  ├── /api/files      ── read/write/list/delete
  ├── /api/sessions   ── chat session CRUD
  ├── /api/settings   ── provider/model config
  └── WS /terminal    ── real PTY via node-pty
```

## Quick start

```bash
# Install dependencies
npm install
cd apps/backend && npm install && cd ../..
cd apps/frontend && npm install && cd ../..

# Build backend
cd apps/backend && npm run build && cd ../..

# Start backend
cd apps/backend && PORT=3002 node dist/apps/backend/src/main.js &

# Start proxy (serves static + proxies API)
node proxy.js &

# Open
open http://localhost:3001
```

## Features

- **Real PTY terminal** — xterm.js + node-pty + Socket.IO. Not a fake shell.
- **Streaming chat** — SSE-based with multi-turn tool-calling loop (bash, read/write, grep, list)
- **Code editor** — syntax highlighting, multi-tab, persistent file state
- **Workspace picker** — browse and switch projects from the UI
- **Dark/light/system theme** — warm flat design, teal accents
- **Project soul** — auto-loads HQ.md/AGENTS.md/CLAUDE.md from workspace root as system prompt
- **Mobile-first layout** — adaptive grid, touch-friendly, viewport-aware

## Tech stack

| Layer | Tech |
|-------|------|
| Frontend | Vanilla HTML/CSS/JS, xterm.js 5.5, Socket.IO client 4.8 |
| Backend | NestJS 11, Express, Socket.IO 4.8 |
| Terminal | node-pty (real PTY), Catppuccin theme |
| AI | Ollama Cloud API, native fetch tool-calling loop |
| React app | Vite + React 19 (secondary, prototype.html is primary) |

## Project structure

```
cammander/
├── prototype.html          ← Primary frontend (single file)
├── proxy.js                ← HTTP + WebSocket proxy
├── HQ.md                   ← Project soul (loaded as system prompt)
├── apps/
│   ├── backend/            ← NestJS server
│   │   └── src/
│   │       └── modules/
│   │           ├── chat/       ← Chat API + tool loop
│   │           ├── terminal/   ← PTY WebSocket gateway
│   │           ├── tools/      ← bash, read, write, grep, list
│   │           ├── sessions/   ← Session store
│   │           └── settings/   ← Provider config
│   └── frontend/           ← React app (secondary)
├── shared/                 ← Shared TypeScript configs
└── assets/                 ← Icons, manifests
```

## Provider config

Settings panel or `data/settings.json`:

```json
{
  "activeProvider": "ollama-cloud",
  "ollamaCloud": {
    "baseUrl": "https://ollama.com/v1",
    "apiKey": "sk-..."
  },
  "defaultModel": "deepseek-v4-flash"
}
```

Note: use `ollama.com/v1` — `api.ollama.com` drops the auth header on redirect.

## License

MIT
