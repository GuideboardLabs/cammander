# cammander

<p align="center">
  <img src="https://raw.githubusercontent.com/GuideboardLabs/cammander/main/assets/logo-128.png" width="80" alt="cammander" />
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-0.1.0-teal?style=flat-square" alt="Version" />
  <img src="https://img.shields.io/badge/license-MIT-blue?style=flat-square" alt="License" />
  <img src="https://img.shields.io/badge/node-%3E%3D%2020-green?style=flat-square&logo=node.js" alt="Node.js" />
  <img src="https://img.shields.io/badge/NestJS-11-red?style=flat-square&logo=nestjs&logoColor=red" alt="NestJS" />
  <img src="https://img.shields.io/badge/React-19-blue?style=flat-square&logo=react" alt="React" />
  <img src="https://img.shields.io/badge/TypeScript-5.6-blue?style=flat-square&logo=typescript" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Vite-6-646CFF?style=flat-square&logo=vite&logoColor=white" alt="Vite" />
  <img src="https://img.shields.io/badge/xterm.js-5.5-black?style=flat-square" alt="xterm.js" />
  <img src="https://img.shields.io/badge/Socket.IO-4.8-gray?style=flat-square" alt="Socket.IO" />
  <img src="https://img.shields.io/badge/Monaco%20Editor-latest-blue?style=flat-square" alt="Monaco" />
</p>

---

Browser-based AI coding harness with real PTY terminal, streaming LLM chat with native tool-calling, and persistent code editor. NestJS backend. Socket.IO transport. Ollama Cloud support.

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                         Browser                               │
│  ┌────────────────────────────────────────────────────────┐   │
│  │  prototype.html (primary)  │  React + Vite (secondary) │   │
│  │  Single-file HTML/CSS/JS    │  NestJS module federation  │   │
│  └────────────────────┬───────────────────────────────────┘   │
└───────────────────────┼───────────────────────────────────────┘
                        │ proxy.js (port 3001)
                        │ HTTP static + WebSocket upgrade + /api proxy
                        ▼
┌──────────────────────────────────────────────────────────────┐
│                      Backend (port 3002)                      │
│  ┌─────────────────┐ ┌─────────────────┐ ┌──────────────┐   │
│  │ Chat Controller │ │ TerminalGateway │ │ Files API    │   │
│  │ └─ SSE stream   │ │ └─ Socket.IO WS │ │ └─ CRUD      │   │
│  │ └─ Tool loop    │ │ └─ node-pty     │ │              │   │
│  └─────────────────┘ └─────────────────┘ └──────────────┘   │
│  ┌─────────────────┐ ┌─────────────────┐ ┌──────────────┐   │
│  │ Session Store   │ │ Settings API    │ │ Model Gateway│   │
│  │ └─ In-memory    │ │ └─ Provider cfg │ │ └─ Routing   │   │
│  └─────────────────┘ └─────────────────┘ └──────────────┘   │
│  ┌─────────────────┐ ┌─────────────────┐                    │
│  │ Git Controller  │ │ Project API     │                    │
│  │ └─ Status/branch│ │ └─ Discovery    │                    │
│  └─────────────────┘ └─────────────────┘                    │
└──────────────────────────────────────────────────────────────┘
```

## Components

### Frontend

- **Primary**: `prototype.html` — self-contained HTML/CSS/JS application
  - File tree sidebar (`FileTree.tsx` API-compatible)
  - Slide-in editor with syntax highlighting (TSX, Python, Rust, Go, Shell, YAML, TOML, CSV, Markdown, SQL, JSON, Dockerfile, dotenv)
  - Collapsible terminal panel (240px expanded, 34px collapsed, 100% maximized)
  - Streaming chat panel with tool-call cards
  - Web apps auto-discovery panel
  - Spreadsheet viewer (CSV/XLSX)
  - Settings panel (provider/model configuration)
  - Always-dark editor regardless of theme mode

- **Secondary**: React 19 + Vite application in `apps/frontend/`
  - Not actively maintained; `prototype.html` is the reference implementation

### Backend

NestJS monolith at `apps/backend/src/`. Module structure:

| Module | Endpoint | Function |
|--------|----------|---------|
| `chat` | `POST /api/chat` | SSE streaming, multi-turn tool loop |
| `terminal` | `WS /terminal` | node-pty over Socket.IO (namespace `/terminal`) |
| `tools` | Internal | `bash`, `read_file`, `write_file`, `grep`, `list_files` |
| `sessions` | `GET/POST/DELETE /api/sessions` | Chat session CRUD |
| `settings` | `GET/PUT /api/settings` | Provider/model configuration |
| `files` | `GET/POST/PUT/DELETE /api/files` | Workspace file operations |
| `git` | `GET /api/git/*` | Status, branch, log |
| `project` | `GET /api/project/apps` | Web app discovery |
| `model-gateway` | `POST /api/model-gateway/*` | LLM API routing |
| `model-routing` | Internal | Model selection logic |
| `searxng-search` | Internal | SearXNG integration |
| `filesystem` | Internal | FS abstractions |
| `tool-registry` | Internal | Tool schema and discovery |
| `agent-orchestrator` | Internal | Agent coordination |
| `cloak-browser` | Internal | Headless browser automation (Puppeteer) |

### Proxy

`proxy.js` — Node.js HTTP server on port 3001:
- Static file serving for `prototype.html`, CSS, assets
- WebSocket upgrade to backend port 3002 (`/terminal` namespace)
- HTTP proxy for `/api/*` routes to port 3002
- CORS preflight handling

## Data Flow

1. User types in terminal → xterm.js `onData` → Socket.IO `terminal:input` → node-pty → shell process → PTY output → Socket.IO `terminal:data` → xterm.js write
2. User sends chat message → `POST /api/chat` (SSE) → LLM API → Server-Sent Events response → tool call parsed → tool executed → result appended → loop until completion
3. File open → `GET /api/files?path=` → file content → rendered in editor with syntax highlighting
4. Tool execution (from chat) → `tools.service.ts` → `list_files`, `read_file`, `write_file`, `grep`, `bash` → result serialized to SSE stream

## Environment

### Requirements

- Node.js >= 20
- npm >= 10
- Unix shell (Bash or Zsh) for PTY terminal
- OS: macOS, Linux, Windows (WSL2)

### Dependencies (Backend)

- `@nestjs/common` / `@nestjs/core` / `@nestjs/platform-express` ^11.0.0
- `@nestjs/platform-socket.io` / `@nestjs/websockets` ^11.0.0
- `@nestjs/config` ^4.0.0
- `socket.io` ^4.8.0
- `node-pty` ^1.0.0
- `simple-git` ^3.27.0
- `puppeteer` ^24.0.0 + plugins
- `uuid` ^11.0.0
- `axios` ^1.7.0
- `ws` ^8.18.0

### Dependencies (Frontend)

- `react` ^19.1.0 / `react-dom` ^19.1.0
- `@xterm/xterm` ^6.0.0 + `@xterm/addon-fit` ^0.11.0 + `@xterm/addon-web-links` ^0.12.0
- `socket.io-client` ^4.8.3
- `@monaco-editor/react` ^4.7.0
- `xlsx` ^0.18.5

## Configuration

### Provider Settings

Stored in `data/settings.json`:

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

Ollama Cloud endpoint must use `https://ollama.com/v1`. `https://api.ollama.com` returns a 301 redirect that drops the `Authorization` header.

### Environment Variables

Optional `.env` in `apps/backend/`:

```
PORT=3002
FRONTEND_PORT=3001
OLLAMA_CLOUD_API_KEY=sk-...
OLLAMA_CLOUD_BASE_URL=https://ollama.com/v1
OLLAMA_CLOUD_DEFAULT_MODEL=deepseek-v4-flash
DEFAULT_WORKSPACE=/home/user/projects
```

### Project Soul (System Prompt)

cammander auto-discovers and loads system prompts from the workspace root, in priority order:

1. `HQ.md`
2. `AGENTS.md`
3. `CLAUSE.md`

Loaded by `chat.controller.ts` and prepended to the LLM conversation context.

## Build

```bash
# Root dependencies
npm install

# Backend
cd apps/backend && npm install
npx nest build

# Proxy (root)
cd ../..
node proxy.js &
```

## Run

```bash
# Terminal 1: Backend
cd apps/backend && PORT=3002 node dist/main.js

# Terminal 2: Proxy
cd /path/to/cammander
node proxy.js

# Access
open http://localhost:3001
```

Alternative: `node proxy.js` in background, then `PORT=3002 node apps/backend/dist/main.js`.

## Project Structure

```
cammander/
├── prototype.html              Primary frontend
├── proxy.js                    HTTP + WS proxy (port 3001 → 3002)
├── new-features.css            Incremental UI patches
├── HQ.md                       Project system prompt
├── manifest.json               PWA manifest
├── package.json                Root workspace (npm workspaces)
├── apps/
│   ├── backend/
│   │   ├── src/
│   │   │   ├── main.ts
│   │   │   ├── app.module.ts
│   │   │   ├── modules/
│   │   │   │   ├── chat/
│   │   │   │   ├── terminal/
│   │   │   │   ├── tools/
│   │   │   │   ├── sessions/
│   │   │   │   ├── settings/
│   │   │   │   ├── files/
│   │   │   │   ├── git/
│   │   │   │   ├── project/
│   │   │   │   ├── model-gateway/
│   │   │   │   ├── model-routing/
│   │   │   │   ├── searxng-search/
│   │   │   │   ├── filesystem/
│   │   │   │   ├── tool-registry/
│   │   │   │   ├── agent-orchestrator/
│   │   │   │   └── cloak-browser/
│   │   │   └── gateway/
│   │   └── dist/               Compiled output
│   └── frontend/
│       ├── src/
│       │   └── components/
│       │       ├── FileTree.tsx
│       │       ├── EditorTabs.tsx
│       │       ├── EditorPane.tsx
│       │       ├── WebAppsPanel.tsx
│       │       └── SpreadsheetViewer.tsx
│       └── vite.config.ts
├── shared/
│   └── tsconfig.json
└── assets/
    ├── logo-32.png
    ├── logo-64.png
    ├── logo-128.png
    ├── apple-touch-icon.png
    ├── icon-192.png
    └── icon-512.png
```

## API Endpoints

### Chat

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/chat` | SSE stream, accepts `{ message, sessionId?, stream? }` |

### Sessions

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/sessions` | List all sessions |
| POST | `/api/sessions` | Create session `{ title }` |
| DELETE | `/api/sessions/:id` | Delete session |

### Files

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/files?path=` | Read file |
| POST | `/api/files` | Create `{ path, content }` |
| PUT | `/api/files` | Update `{ path, content }` |
| DELETE | `/api/files?path=` | Delete |

### Settings

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/settings` | Read settings |
| PUT | `/api/settings` | Update settings |

### Git

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/git/status` | Working tree status |
| GET | `/api/git/branch` | Current branch |
| GET | `/api/git/log` | Recent commits |

### Project

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/project/apps` | Auto-detected + configured web apps |

## Terminal WebSocket Events

Namespace: `/terminal`

| Event | Direction | Payload | Description |
|-------|-----------|---------|-------------|
| `terminal:create` | Client → Server | `{ cwd?, cols?, rows? }` | Spawn PTY session |
| `terminal:input` | Client → Server | `{ data: string }` | STDIN input |
| `terminal:resize` | Client → Server | `{ cols, rows }` | Resize PTY |
| `terminal:data` | Server → Client | `{ data: string }` | STDOUT/STDERR output |
| `terminal:exit` | Server → Client | `{ exitCode: number }` | Process exit |

## Mobile Keyboard Behavior

`prototype.html` includes visual viewport detection (`window.visualViewport`) for mobile soft keyboards. When the keyboard opens while terminal is expanded:

1. Keyboard height calculated: `window.innerHeight - visualViewport.height`
2. Terminal panel receives `terminal-panel--keyboard-overlay` class
3. Panel fixed to `bottom: ${keyboardHeight}px` with `height: 45vh`
4. `xtermInstance.scrollToBottom()` called on every keystroke
5. Panel exits overlay mode when keyboard closes

## Web Apps Discovery

Auto-detection: scans workspace for processes on ports 3000, 5173, 8080, etc.

Explicit: `cammander.json` in workspace root:

```json
{
  "webApps": [
    { "name": "Frontend", "url": "http://localhost:5173", "description": "Vite dev" }
  ]
}
```

## License

[MIT](./LICENSE) — Copyright (c) 2026 Guideboard Labs
