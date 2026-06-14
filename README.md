# cammander

<p align="center">
  <img src="https://raw.githubusercontent.com/GuideboardLabs/cammander/main/assets/logo-128.png" width="80" alt="cammander" />
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-2.12.0--grilled_to_perfection-teal?style=flat-square" alt="Version" />
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

<p align="center">
  <em>v2.12.0 — Grilled to Perfection</em><br/>
  Complete docs and backend audit. Streaming chat, hardened terminal, vault memory, and a system prompt driven by <code>CLAUSE.md</code>.
</p>

---

Browser-based AI coding harness with real PTY terminal, streaming LLM chat with native tool-calling, persistent code editor, and project memory vault.

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                         Browser                               │
│  ┌────────────────────────────────────────────────────────┐   │
│  │  React + Vite frontend    │  prototype.html (legacy)   │   │
│  │  File tree, editor, chat, terminal, vault panels       │   │
│  └────────────────────┬───────────────────────────────────┘   │
└───────────────────────┼───────────────────────────────────────┘
                        │ proxy.js (port 3001)
                        │ HTTP static + /api proxy + /terminal upgrade
                        ▼
┌──────────────────────────────────────────────────────────────┐
│                      Backend (port 3002)                      │
│  ┌─────────────────┐ ┌─────────────────┐ ┌──────────────┐   │
│  │ Chat Controller │ │ TerminalGateway │ │ Files API    │   │
│  │ └─ SSE stream   │ │ └─ Socket.IO WS │ │ └─ CRUD      │   │
│  │ └─ Tool loop    │ │ └─ node-pty     │ │              │   │
│  │ └─ Vault memory │ │ └─ PTY reset/   │ │              │   │
│  │ └─ Tree context │ │    reconnect    │ │              │   │
│  └─────────────────┘ └─────────────────┘ └──────────────┘   │
│  ┌─────────────────┐ ┌─────────────────┐ ┌──────────────┐   │
│  │ Session Store   │ │ Settings API    │ │ Model Gateway│   │
│  │ └─ In-memory    │ │ └─ Provider cfg │ │ └─ Routing   │   │
│  └─────────────────┘ └─────────────────┘ └──────────────┘   │
│  ┌─────────────────┐ ┌─────────────────┐ ┌──────────────┐   │
│  │ Git Controller  │ │ Project API     │ │ Vault API    │   │
│  │ └─ Status/branch│ │ └─ Discovery    │ │ └─ Notes/CAG │   │
│  └─────────────────┘ └─────────────────┘ └──────────────┘   │
│  ┌─────────────────┐                                         │
│  │ Workspace API   │ ── compact file-tree summaries          │
│  └─────────────────┘                                         │
└──────────────────────────────────────────────────────────────┘
```

## Components

### Frontend

React 19 + Vite application in `apps/frontend/`:

- File tree sidebar
- Slide-in editor with syntax highlighting (TSX, Python, Rust, Go, Shell, YAML, TOML, CSV, Markdown, SQL, JSON, Dockerfile, dotenv)
- Collapsible terminal panel with persistent PTY tabs
- Streaming chat panel with tool-call cards
- Vault panel for project memory (gbrain-style notes)
- Workspace selector with recent-workspace persistence
- Web apps auto-discovery panel
- Spreadsheet viewer (CSV/XLSX)
- Settings panel (provider/model configuration)
- Always-dark editor regardless of theme mode

`prototype.html` remains in the repo as the original single-file reference but is no longer the primary runtime UI.

### Backend

NestJS monolith at `apps/backend/src/`. Module structure:

| Module | Endpoint | Function |
|--------|----------|---------|
| `chat` | `POST /api/chat`, `POST /api/chat/stream` | SSE streaming, multi-turn tool loop, vault + tree context |
| `terminal` | `WS /terminal` | node-pty over Socket.IO with reset/reconnect lifecycle |
| `tools` | Internal | `bash`, `read_file`, `write_file`, `grep`, `list_files` |
| `sessions` | `GET/POST/DELETE /api/sessions` | Chat session CRUD |
| `settings` | `GET/PUT /api/settings` | Provider/model configuration |
| `files` | `GET/POST/PUT/DELETE /api/files` | Workspace file operations |
| `git` | `GET /api/git/*` | Status, branch, log |
| `project` | `GET /api/project/apps` | Web app discovery |
| `vault` | `GET/POST/PUT/DELETE /api/vault/*` | Project memory notes + context ranking |
| `workspace` | `GET /api/workspaces/tree` | Compact file-tree summary |
| `model-gateway` | `POST /api/model-gateway/*` | LLM API routing |
| `model-routing` | Internal | Model selection logic |
| `searxng-search` | Internal | SearXNG integration |
| `filesystem` | Internal | FS abstractions |
| `tool-registry` | Internal | Tool schema and discovery |
| `agent-orchestrator` | Internal | Agent coordination |
| `cloak-browser` | Internal | Headless browser automation (Puppeteer) |

### Proxy

`proxy.js` — Node.js HTTP server on port 3001:
- Static file serving for the built React app (dist)
- WebSocket upgrade to backend port 3002 (`/terminal` namespace)
- HTTP proxy for `/api/*` routes to port 3002
- CORS preflight handling

## Data Flow

1. User types in terminal → xterm.js `onData` → Socket.IO `terminal:input` → node-pty → shell process → PTY output → Socket.IO `terminal:data` → xterm.js write
2. User sends chat message → `POST /api/chat/stream` (SSE) → system prompt (CLAUSE.md + harness + workspace tree + vault context) → LLM API → Server-Sent Events response → tool call parsed → tool executed → result appended → loop until completion
3. File open → `GET /api/files?path=` → file content → rendered in Monaco editor
4. Tool execution (from chat) → `tools.service.ts` → `list_files`, `read_file`, `write_file`, `grep`, `bash` → result serialized to SSE stream
5. Vault note created/updated during chat → persisted to `.cammander/vault/` and indexed for future context retrieval

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
- `marked`, `highlight.js`, `dompurify` (frontend)

### Dependencies (Frontend)

- `react` ^19.1.0 / `react-dom` ^19.1.0
- `@xterm/xterm` ^6.0.0 + `@xterm/addon-fit` ^0.11.0 + `@xterm/addon-web-links` ^0.12.0
- `socket.io-client` ^4.8.3
- `@monaco-editor/react` ^4.7.0
- `xlsx` ^0.18.5
- `marked` ^15.x
- `highlight.js` ^11.x
- `dompurify` ^3.x

## Configuration

### Provider Settings

Stored in `<DATA_DIR>/settings.json`:

```json
{
  "activeProvider": "ollama-local",
  "ollamaLocal": {
    "host": "localhost",
    "port": 11434
  },
  "defaultModel": "qwen2.5-coder:14b"
}
```

Supported providers: `ollama-local`, `ollama-cloud`, `openai-compat`, `llama-cpp`, `vllm`, `lm-studio`.

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

1. `CLAUSE.md`
2. `HQ.md`
3. `AGENTS.md`
4. `soul.md`

`CLAUSE.md` is the canonical project harness. It carries behavioral guidelines and is intentionally named to signal independence from any single provider's brand. Loaded by `chat.controller.ts` and combined with a Cammander Coding Harness, workspace tree summary, vault context, and project layout before each LLM call.

## Build

```bash
# Root dependencies
npm install

# Full build (shared + backend + frontend)
npm run build

# Backend only
npm run build:backend

# Frontend only
npm run build:frontend

# Tests
npm run test
```

## Run

```bash
# Terminal 1: Backend
cd apps/backend && PORT=3002 node dist/apps/backend/src/main.js

# Terminal 2: Proxy
cd /path/to/cammander
node proxy.js

# Access
open http://localhost:3001
```

Alternative: `node proxy.js` in background, then `PORT=3002 node apps/backend/dist/apps/backend/src/main.js`.

## Project Structure

```
cammander/
├── prototype.html              Legacy single-file reference
├── proxy.js                    HTTP + WS proxy (port 3001 → 3002)
├── new-features.css            Incremental UI patches
├── HQ.md                       Project system prompt
├── CLAUSE.md                   Canonical coding-harness guidelines
├── manifest.json               PWA manifest
├── package.json                Root workspace (npm workspaces)
├── CHANGELOG.md                Release notes
├── docs/
│   └── plans/                  Implementation plans
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
│   │   │   │   ├── vault/
│   │   │   │   ├── workspace/
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
│       │   ├── components/
│       │   │   ├── ChatPanel.tsx
│       │   │   ├── TerminalPanel.tsx
│       │   │   ├── VaultPanel.tsx
│       │   │   ├── WorkspaceSelector.tsx
│       │   │   ├── FileTree.tsx
│       │   │   ├── EditorTabs.tsx
│       │   │   ├── EditorPane.tsx
│       │   │   ├── WebAppsPanel.tsx
│       │   │   └── SpreadsheetViewer.tsx
│       │   ├── stores/
│       │   ├── hooks/
│       │   └── utils/
│       │       └── renderMarkdown.ts
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
| POST | `/api/chat` | Non-streaming chat (kept for compatibility) |
| POST | `/api/chat/stream` | SSE streaming chat, accepts `{ message, sessionId?, model?, workspaceRoot? }` |

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

### Vault

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/vault/notes` | List notes |
| POST | `/api/vault/notes` | Create note |
| PUT | `/api/vault/notes/:id` | Update note |
| DELETE | `/api/vault/notes/:id` | Delete note |
| POST | `/api/vault/context` | Rank relevant notes for a query |

### Workspace

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/workspaces` | List saved workspaces |
| GET | `/api/workspaces/home-folders?base=` | Scan a directory for project folders |
| GET | `/api/workspaces/tree?path=` | Compact ASCII file-tree summary |
| GET | `/api/workspaces/browse?path=` | Browse directory entries |

### Project

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/project/apps` | Auto-detected + configured web apps |

## Terminal WebSocket Events

Namespace: `/terminal`

| Event | Direction | Payload | Description |
|-------|-----------|---------|-------------|
| `terminal:attach` | Client → Server | `{ slot?, cwd?, cols?, rows? }` | Attach to or spawn PTY session |
| `terminal:create` | Client → Server | `{ cwd?, cols?, rows? }` | Legacy spawn (default slot) |
| `terminal:input` | Client → Server | `{ data: string }` | STDIN input |
| `terminal:resize` | Client → Server | `{ cols, rows }` | Resize PTY |
| `terminal:kill` | Client → Server | `{ slot? }` | Kill PTY |
| `terminal:reset` | Client → Server | `{ slot? }` | Kill and clear PTY slot |
| `terminal:data` | Server → Client | `{ data: string }` | STDOUT/STDERR output |
| `terminal:exit` | Server → Client | `{ exitCode: number }` | Process exit |
| `terminal:ready` | Server → Client | `{ cwd, pid, slot, reattached }` | PTY ready |
| `terminal:reset` | Server → Client | `{}` | PTY was reset |
| `terminal:slots` | Server → Client | `{ slots: string[] }` | Active session IDs |

## v2.12.0 — Grilled to Perfection

This release is the result of a full `/grill-check` docs-and-code audit. See `CHANGELOG.md` for the complete list of changes.

Highlights:
- Streaming chat via `/api/chat/stream` replaces the synchronous endpoint as the primary UX.
- Workspace file-tree summary is injected into every chat system prompt.
- `CLAUSE.md` is the canonical project soul file.
- Vault notes are validated, context-ranked, and covered by tests.
- Terminal PTY supports reset, reconnect, and explicit cleanup.
- Default provider is now `ollama-local` for local-first use.
- Markdown rendering uses `marked` + `highlight.js` + `dompurify`.
- Backend tests exist for `ToolsService` and `VaultService`.
- Dead `SessionModule` removed; `SessionsModule` is the single session source of truth.

## License

[MIT](./LICENSE) — Copyright (c) 2026 Guideboard Labs
