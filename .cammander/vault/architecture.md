---
title: Architecture Overview
tags: [architecture, stack, convention]
created: 2026-05-27T00:00:00.000Z
updated: 2026-05-27T00:00:00.000Z
---

# Cammander Architecture

## Stack
- **Prototype frontend**: Single-file `prototype.html` (~3400 lines, all HTML/CSS/JS inline). This IS the product right now.
- **Backend**: NestJS (TypeScript) on port 3002. REST API + Socket.IO for terminal.
- **Proxy**: Node HTTP proxy on port 3001. Serves static files + proxies `/api/*` to backend + `/terminal` WebSocket.
- **React app**: In `apps/frontend/`. ON HOLD. Uses Catppuccin Mocha dark theme (NOT the warm prototype palette — never mix them).
- **Terminal**: xterm.js + node-pty via Socket.IO (namespace `/terminal`, path `/terminal` — BOTH required).

## Layout Model
- `main-split` is a CSS grid (`grid-template-columns: 1fr auto; grid-template-rows: 1fr auto`).
- Direct children: vault-panel, content-area, terminal-panel, chat-panel. Terminal is a SIBLING of content-area, not a child.
- `updateMainLayout()` toggles classes on every panel open/close. Must be called after every state change.

## Module Map
- `chat/` — POST /chat, POST /chat/stream. Multi-turn agent loop with tool calling (8 round cap).
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