---
title: Critical Pitfalls
tags: [pitfall, bug, debug, troubleshooting, convention]
created: 2026-05-27T00:00:00.000Z
updated: 2026-05-27T00:00:00.000Z
---

# Critical Pitfalls

## Facts

<!--- cammander:facts:begin -->
| # | claim | kind | confidence | value | unit | source | context |
|---|---|---|---|---|---|---|---|
| 1 | Socket.IO namespace AND path must both be /terminal | pitfall | 1.0 | | | troubleshooting | missing either = dead terminal |
| 2 | Build from apps/backend/, not project root | pitfall | 1.0 | | | troubleshooting | root includes frontend JSX code |
| 3 | Backend entry is dist/apps/backend/src/main.js | pitfall | 1.0 | | | troubleshooting | NOT dist/main.js |
| 4 | Ollama Cloud URL is https://ollama.com/v1 | pitfall | 1.0 | | | troubleshooting | api.ollama.com redirect drops auth header |
| 5 | API key masking: frontend must not save •••• strings back | pitfall | 1.0 | | | troubleshooting | overwrites real key |
| 6 | Settings data dir is CWD-relative | pitfall | 1.0 | | | troubleshooting | can end up at wrong path |
| 7 | Flex children need min-height: 0 | pitfall | 1.0 | | | css | prevents overflow |
| 8 | Code areas ALWAYS use dark background via !important | pitfall | 1.0 | | | css | never remove !important |
| 9 | Chat must pass workspaceRoot to tools | pitfall | 1.0 | | | api | without it tools default to env var |
| 10 | Assistant messages renderMarkdown, user messages escapeHtml | pitfall | 1.0 | | | security | XSS prevention |
<!--- cammander:facts:end -->

## Socket.IO (Terminal)
- **BOTH `namespace` AND `path` must be `/terminal`**: See [[terminal-architecture]] for full gateway details.
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