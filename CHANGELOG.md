# Changelog

All notable changes to cammander are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.12.0] — Grilled to Perfection — 2026-06-13

### Added

- **Streaming chat**: frontend `ChatPanel` now consumes `POST /api/chat/stream` via Server-Sent Events for token-by-token rendering.
- **Workspace tree summary**: `WorkspaceTreeService` and `GET /api/workspaces/tree` provide a compact ASCII tree; the summary is injected into the chat system prompt for every request.
- **Workspace selector UI**: `WorkspaceSelector` component with recent-workspace persistence in the sidebar, making active project scope explicit.
- **Vault content validation**: empty note content is rejected at the controller boundary.
- **Vault context scoring fix**: recency and dev-tag bonuses now only apply after a base keyword/path match, preventing unrelated notes from leaking into context.
- **Backend test scaffold**: `ts-jest` based `jest.config.js`, plus `ToolsService` and `VaultService` specs.
- **Project harness**: chat controller injects a dedicated "Cammander Coding Harness" into the system prompt with rules for read-before-write, plan-before-acting, verify-after-change, and vault memory.

### Changed

- **Canonical soul file**: `CLAUSE.md` is now the first-priority project soul file loaded by `chat.controller.ts`, ahead of `HQ.md`, `AGENTS.md`, and `soul.md`.
- **Default provider**: fresh installs now default to `ollama-local` instead of `ollama-cloud`.
- **Markdown renderer**: replaced hand-rolled parser with `marked`, `highlight.js`, and `dompurify` for full CommonMark/GFM support and safe HTML output.
- **Terminal lifecycle**: added `terminal:reset` event, preserved slot-client mapping across PTY exits to enable reconnects, and ensured proper xterm/socket cleanup when tab containers unmount.

### Removed

- **Dead `SessionModule`**: deleted `apps/backend/src/modules/session/` and removed its import from `app.module.ts`. `SessionsModule` is the single source of truth.
- **Unused `CLAUDE.md` priority**: the chat soul loader no longer references `CLAUDE.md`.

### Fixed

- Backend build/runtime wiring: `WorkspaceModule` is now imported by `ChatModule` so `WorkspaceService` resolves for tree summaries.
- Settings service initialization: `DEFAULT_SETTINGS` seed is applied before loading saved settings, ensuring the new `ollama-local` default wins on fresh installs.
- TypeScript strict-mode errors in `VaultGraph.tsx` and `VaultPanel.tsx`.
- Behavioral-guidelines variable name mismatch in `chat.controller.ts` so the existing behavioral text is actually concatenated.

### Audit

- Full `/grill-check` review executed against the codebase and vault documentation.
- Smoke-tested integrated stack: `/api/settings`, `/api/vault/notes`, `/api/workspaces/tree`, `/api/models`, and `/api/chat/stream` all return expected responses.
- Verification gates: backend tests (8), frontend tests (67), backend build (exit 0), frontend build (exit 0).

[2.12.0]: https://github.com/GuideboardLabs/cammander/releases/tag/v2.12.0
