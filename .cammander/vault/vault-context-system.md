---
title: Vault Context System
tags: [vault, context, memory, architecture, indexing]
created: 2026-05-27T00:00:00Z
updated: 2026-05-27T00:00:00Z
---

# Vault Context System (How It Works)

## Purpose
The vault provides **project knowledge persistence** — the built-in chat agent gets relevant context from vault notes injected into its system prompt, automatically, every request. No Hermes needed.

## Storage
Notes live at `<workspace>/.cammander/vault/*.md` with YAML frontmatter:
```yaml
---
title: My Note
tags: [architecture, config]
created: 2026-05-27T00:00:00Z
updated: 2026-05-27T00:00:00Z
---
Note content in markdown. Links use [[wikilink]] syntax.
```

## Smart Indexing (contextRelevant)
When the chat controller receives a message, it calls `vault.contextRelevant(userMessage, workspacePath, maxChars=6000)`:

1. **Keyword extraction**: User message + workspace path tokenized, stop words removed
2. **Scoring**: Each vault note scored on:
   - Title keyword match: +10
   - Tag keyword match: +7
   - Content keyword match: +2
   - Path segment match (e.g. "cammander" in title): +4
   - Dev-relevant tags (architecture, api, pitfall, etc.): +2
   - Recency: <7 days +3, <1 day +2
3. **Budget**: Notes added by score until 6000 chars total
4. **Inject**: Matched notes appended to system prompt under "Project Knowledge (from vault notes)"

## Agent Can Write Notes
The `vault_note` tool is available to the chat agent. It can:
- **Create**: `{ title, content, tags?, action: "create" }`
- **Update**: `{ id, title, content, tags?, action: "update" }`

This means the agent learns from conversations and saves decisions, pitfalls, and patterns back to the vault for future sessions.

## Seed Notes
Initial vault notes are created with focused, tagged content:
- `architecture-overview` — module map, key patterns, stack summary
- `pitfalls` — common bugs and their fixes
- `design-system` — colors, tokens, CSS rules, icon conventions
- `api-endpoints` — all REST/WebSocket endpoints
- `terminal-architecture` — Socket.IO protocol, slot system, venv activation
- `providers-and-settings` — 6 providers, API key handling, env vars

## Auto-Index Script
`scripts/vault-index.sh` (future) will scan project files for changes and update vault notes, keeping them in sync with the codebase.