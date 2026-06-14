---
title: Architecture Overview
tags: [architecture, stack, convention]
created: 2026-05-27T00:00:00.000Z
updated: 2026-06-06T00:00:00.000Z
---

# Cammander Architecture

## Facts

<!--- cammander:facts:begin -->
| # | claim | kind | confidence | value | unit | source | context |
|---|---|---|---|---|---|---|---|
| 1 | Backend is NestJS TypeScript on port 3002 | fact | 1.0 | | | codebase | serves REST + Socket.IO |
| 2 | Proxy on port 3001 serves static + proxies /api + WebSocket | fact | 1.0 | | | codebase | Node http-proxy with ws:true |
| 3 | React frontend uses Catppuccin Mocha dark theme | fact | 1.0 | | | codebase | NOT the warm prototype palette |
| 4 | Terminal via xterm.js + node-pty over Socket.IO | fact | 1.0 | | | codebase | namespace and path both /terminal |
| 5 | Layout is CSS grid with main-split (1fr auto / 1fr auto) | fact | 1.0 | | | codebase | vault, content, terminal, chat |
| 6 | Six providers supported | metric | 1.0 | 6 | providers | codebase | Ollama Cloud/Local, OpenAI, llama.cpp, vLLM, LM Studio |
| 7 | Chat agent loop supports 30 tool call rounds max | metric | 1.0 | 30 | rounds | codebase | default cap |
<!--- cammander:facts:end -->

## Stack

- **Prototype frontend**: Single-file `prototype.html` (~3400 lines, all HTML/CSS/JS inline). This IS the product right now.
- **Backend**: NestJS (TypeScript) on port 3002. REST API + Socket.IO for terminal.
- **Proxy**: Node HTTP proxy on port 3001. Serves static files + proxies `/api/*` to backend + `/terminal` WebSocket.
- **React app**: In `apps/frontend/`. ON HOLD. Uses Catppuccin Mocha dark theme (NOT the warm prototype palette — never mix them).
- **Terminal**: xterm.js + node-pty via Socket.IO — see [[terminal-architecture]] for full details.
- **Vault**: `.cammander/vault/*.md` notes with context injection — see [[vault-index]] and [[gbrain-patterns]].
- **Common issues**: [[pitfalls]] covers build, config, and deployment gotchas.

## Layout Model

- `main-split` is a CSS grid (`grid-template-columns: 1fr auto; grid-template-rows: 1fr auto`).
- Direct children: vault-panel, content-area, terminal-panel, chat-panel. Terminal is a SIBLING of content-area, not a child.
- `updateMainLayout()` toggles classes on every panel open/close. Must be called after every state change.

## Module Map

- `chat/` — POST /chat, POST /chat/stream. Multi-turn agent loop with tool calling (30 round cap).
- `sessions/` — In-memory JSON store at `data/sessions.json`.
- `settings/` — Reads/writes `data/settings.json`. Masks API keys on GET (`/api/` prefix stripped by proxy).
- `tools/` — bash, read_file, write_file, grep, list_files. Scoped to `WORKSPACE_ROOT`.
- `terminal/` — Socket.IO gateway. Slot-based persistent PTY sessions (4 max). Venv auto-detection.
- `vault/` — CRUD for `.cammander/vault/*.md` notes. Context-relevant search for chat system prompts.
- `workspace/` — Folder scanning, project detection.
- `files/` — Read/write/create/archive. Image base64 support.
- `git/` — Status, diff, stage, unstage, commit.

## Key Paths

- Backend entry: `dist/apps/backend/src/main.js` (NOT `dist/main.js`)
- Build from: `apps/backend/` (NOT project root — JSX errors)
- Data dir: `data/` under wherever the backend starts (CWD-relative)

## Providers (6)

Ollama Cloud, Ollama Local, OpenAI Compatible, llama.cpp, vLLM, LM Studio. All use OpenAI `/v1/chat/completions` format. Ollama Cloud URL: `https://ollama.com/v1` (NOT `api.ollama.com`).