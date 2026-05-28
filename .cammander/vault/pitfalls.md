---
title: Critical Pitfalls
tags: [pitfall, bug, debug, troubleshooting, convention]
created: 2026-05-27T00:00:00.000Z
updated: 2026-05-27T00:00:00.000Z
---

# Critical Pitfalls

## Socket.IO (Terminal)
- **BOTH `namespace` AND `path` must be `/terminal`**: `@WebSocketGateway({ namespace: '/terminal', path: '/terminal' })`. Missing either one = terminal appears connected but accepts no input.
- **Client must connect**: `io(url + '/terminal', { path: '/terminal' })`. The URL MUST include `/terminal`.
- **Vite proxy needs `ws: true`** on the `/terminal` route, or WebSocket upgrade fails.
- **proxy.js needs `http-proxy` with `ws: true`**: A raw `http.createServer` does NOT forward WebSocket `upgrade` events.

## Build & Run
- **Build from `apps/backend/`**, NOT project root. Running `npx nest build` from root includes frontend code and fails on JSX/DOM type errors.
- **Backend entry**: `node dist/apps/backend/src/main.js`. NOT `dist/main.js`.
- **Port 3002**: Default must be PORT=3002. Port 3000 is occupied by Open Web.
- **Must restart backend after code changes**: Compiled JS from `dist/`, no hot reload.

## Ollama Cloud
- **URL must be `https://ollama.com/v1`**: `api.ollama.com` 301-redirects and Node's `fetch` with `redirect: 'follow'` drops the `Authorization` header on cross-origin redirects. Result: 401 with a valid key.

## Settings
- **API key masking**: GET `/settings` returns `••••XXXX`. If frontend saves this back, it overwrites the real key. PUT must detect `••••` prefix and preserve existing.
- **Data dir is CWD-relative**: If started from wrong directory, `data/settings.json` ends up there. Found at `/mnt/c/Users/sc/data/settings.json` when CWD was Windows home.

## Frontend
- **`state.currentPath` is a string**: e.g. `'apps/backend'`, NOT an array. Previous versions used `string[]`.
- **`state.workspaceRoot` is dynamic**: Loaded from `localStorage('cammander-workspace')`. Never hardcode it.
- **Template literal backticks**: In HTML-embedded `<script>`, backticks in template literals containing `` ` `` must be escaped as `\\``. Unescaped backtick kills the entire script — page renders CSS but zero interactivity.
- **Flex children need `min-height: 0`**: Without it, content overflows the viewport. Every flex child that can shrink must have it.
- **Code areas are ALWAYS dark**: `.code-area`, `.editor-textarea-wrap`, `.editor-highlight-backdrop` use `background: #1a1a2e !important`. Do NOT remove `!important` or revert to `var(--bg-elevated)`.
- **No dotted/dashed borders**: User explicitly rejected these. Use solid `1px` borders only.
- **Per-tab xterm**: After refactor from globals, use `getTerminalById(state.activeTerminalTab)`. Grep for old `xtermInstance`/`termFitAddon` globals that still reference the old pattern.

## Systemd on WSL
- **`SupplementaryGroups=`** (empty value) in `[Service]` section — WSL systemd crashes with exit 216/GROUP without it.
- **Absolute node path**: nvm installs to `~/.nvm/versions/node/<version>/bin/node`. Systemd can't resolve `~`.

## Chat
- **Must pass `workspaceRoot`**: Without it, tools default to `WORKSPACE_ROOT` env var, ignoring user's selected workspace.
- **`renderMarkdown` for assistant, `escapeHtml` for user**: Never use `innerHTML` without `renderMarkdown()` for user messages (XSS). Never use `textContent` for assistant messages (kills markdown).