---
title: API Endpoints
tags: [api, backend, rest, convention]
created: 2026-05-27T00:00:00.000Z
updated: 2026-05-27T00:00:00.000Z
---

# API Endpoints

## Chat
- `POST /chat` — `{sessionId, message, model?, workspaceRoot?}` — Multi-turn agent loop (non-streaming)
- `POST /chat/stream` — Same body — SSE streaming variant. Events: `token`, `tool_call`, `done`, `error`

## Sessions
- `GET /sessions` — List (no messages)
- `POST /sessions` — Create
- `GET /sessions/:id` — Full session with messages
- `DELETE /sessions/:id` — Delete

## Settings
- `GET /settings` — Returns masked API keys (`••••XXXX`)
- `PUT /settings` — Merges partial update. Detects `••••` prefix and preserves existing key.

## Terminal (WebSocket)
- Namespace: `/terminal`, Path: `/terminal`
- Events: `terminal:attach` `{slot, cwd, cols, rows}`, `terminal:input`, `terminal:resize`, `terminal:kill`, `terminal:list`
- Server sends: `terminal:ready`, `terminal:data`, `terminal:exit`, `terminal:slots`

## Files
- `GET /files?path=<dirPath>` — List directory entries
- `GET /files/read?path=<filePath>` — Read file (text or image base64)
- `POST /files/create?path=<dirPath>` — `{name, type?, content?}`
- `PUT /files/write?path=<filePath>` — `{content}` — Overwrite
- `POST /files/archive` — `{path}` — Move to `.archive/`

## Vault
- `GET /vault/notes` — List all (summary)
- `GET /vault/notes/:id` — Full note with backlinks
- `POST /vault/notes` — `{title, content?, tags?, path?}`
- `PUT /vault/notes/:id` — `{title?, content?, tags?}`
- `DELETE /vault/notes/:id`
- `GET /vault/search?q=<query>` — Full-text search
- `GET /vault/links?target=<id>` — Backlinks

## Workspace
- `GET /workspaces/home-folders?base=<path>` — Scan home for project folders
- `GET /workspaces/browse?path=<path>` — Browse subdirectories

## Git
- `GET /git/status` — Branch, ahead/behind, changed files
- `GET /git/diff?file=<path>` — Unified diff
- `POST /git/stage` — `{file}`
- `POST /git/unstage` — `{file}`
- `POST /git/commit` — `{message}`