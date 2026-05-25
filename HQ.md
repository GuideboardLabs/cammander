# HQ.md — cammander soul

## What is cammander
cammander is a browser-based AI coding harness — a warm, flat-design IDE prototype with folder view, slide-in code editor, collapsible terminal, and chat. It is NOT a clone of anything. It has its own identity.

## Tech stack
- Frontend: single HTML prototype (`prototype.html`) with inline CSS/JS, xterm.js, Socket.IO client
- Backend: NestJS on Node (port 3002), node-pty, Socket.IO, Ollama Cloud API
- Proxy: simple Node HTTP/WS proxy at port 3001 → backend 3002
- Tools: bash, read_file, write_file, grep, list_files

## How to build & run
```
# Build backend after source changes
cd apps/backend && npx nest build

# Start backend
cd apps/backend && PORT=3002 node dist/apps/backend/src/main.js

# Start proxy
cd /home/sc/cammander && node proxy.js

# Open in browser
http://localhost:3001   → prototype.html
```

## Design philosophy
- Warm, NOT cold. Inviting, NOT sterile.
- Flat design — NO dotted/dashed borders, NO gradients, NO shadows unless subtle
- Accent color is TEAL (#14b8a6 dark / #0d9488 light) — NEVER orange, NEVER purple
- Flat SVG icons, not text labels for toolbar buttons
- Code editor must ALWAYS be dark — even in light mode. Reading code on white is criminal.
- Clean typography. Rounded corners where appropriate. Generous whitespace.

## Project structure
```
cammander/
├── prototype.html         ← THE source of truth. Single-file frontend.
├── proxy.js               ← Static + API proxy
├── apps/
│   ├── backend/           ← NestJS: chat, terminal, sessions, tools, files, settings
│   │   ├── src/
│   │   │   ├── modules/chat/chat.controller.ts   ← API + system prompt
│   │   │   ├── modules/terminal/terminal.gateway.ts  ← PTY WebSocket
│   │   │   ├── modules/tools/tools.service.ts    ← bash/read/write/grep/list
│   │   │   ├── modules/sessions/sessions.service.ts  ← In-memory session store
│   │   │   ├── modules/settings/settings.service.ts  ← Settings + provider config
│   │   │   └── main.ts
│   │   └── dist/          ← Built output (what proxy.js runs)
│   └── frontend/          ← Optional Vite frontend (prototype.html is primary)
└── data/                  ← Sessions JSON
```

## API
```
POST /api/chat      {"sessionId","message","model","workspaceRoot"}
POST /api/chat/stream  (SSE streaming version)
GET  /api/sessions
POST /api/sessions
GET  /api/sessions/:id
WS   /terminal       (Socket.IO, namespace /terminal, path /terminal)
```

## Provider config
- Ollama Cloud: base URL `https://ollama.com/v1` (NOT api.ollama.com — redirect drops auth)
- Models: `deepseek-v4-flash`, `glm-5.1`, `qwen3-coder` etc

## Conventions
- Prefer patching over rewriting. Small targeted edits.
- Prototype.html is primary — the Vite frontend is secondary
- Terminal uses real PTY via node-pty, not a fake shell
- Use xterm.js with Catppuccin theme, Fira Code mono font
- Socket.IO: namespace AND path must both be set to /terminal for the terminal gateway
- Test with end-to-end verification, not assumptions
- The proxy runs on 3001, backend on 3002. Never swap these.

## Voice & tone
- Direct, practical, no fluff
- When something is broken, diagnose before prescribing
- Show the exact fix, not a lecture
- Prefer code over prose
- If you don't know, say so — don't invent

## Remember
This is a warm, capable IDE. It should feel like a well-worn leather chair, not a sterile lab bench. Every pixel choice should reinforce "I know what I'm doing and I care about the details."
