# Prototype → React Port Tracker

React app is on hold. This file tracks what exists in prototype.html
but not yet in the React app (apps/frontend/), for when we resume.

## Already in React app (partial or complete)
- [x] Monaco editor with tab system
- [x] File tree sidebar with persistence (IndexedDB)
- [x] Chat panel (ChatPanel.tsx)
- [x] Terminal panel (TerminalPanel.tsx) — real xterm.js + WebSocket
- [x] Settings modal (SettingsModal.tsx)
- [x] Workspace picker (WorkspacePicker.tsx)
- [x] XSS-safe markdown renderer (renderMarkdown.ts)

## Still prototype-only (needs porting later)
- [ ] Topbar with logo + flat SVG icons (terminal, chat, settings gear) + adaptive layout
- [ ] App icon (apple-touch-icon, PWA manifest, 192/512 icons)
- [ ] New Workspace creation in workspace picker
- [ ] New file/folder creation dialog
- [ ] File delete/rename actions
- [ ] Drag-and-drop file upload
- [ ] Archive download
- [ ] Archive preview (zip contents listing)
- [ ] Model selector dropdown in chat
- [ ] Chat streaming (SSE) with per-message model override
- [ ] Multiple chat sessions (sidebar list)
- [ ] Warm design system (orange/amber accents in prototype vs Catppuccin in React)
- [ ] Mobile-responsive layout
- [ ] Prototype's folder-view mode (grid/list toggle)
- [ ] Adaptive layout: chat+terminal dual mode (grid), chat-only (sidebar), terminal-only (bottom)
- [ ] Settings modal: orange active tab + checkmark + connection status indicator

## Backend endpoints (shared by both)
- POST /api/chat — AI chat with tool calls
- GET/POST /api/sessions — chat session CRUD
- GET/PUT /api/settings — provider/model config
- GET /api/files?path= — directory listing
- GET /api/files/read?path= — read file
- PUT /api/files — write file
- POST /api/files/create — create file/folder
- DELETE /api/files — delete file
- GET /api/workspaces/home-folders — home folder picker
- GET /api/workspaces/browse?path= — filesystem browser
- WebSocket /terminal — real PTY terminal (Socket.IO, path: '/terminal')