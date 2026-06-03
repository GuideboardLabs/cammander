---
title: Chat Agent and Vault Memory
tags: [chat, agent, tools, vault, memory, convention]
created: 2026-05-27T00:00:00.000Z
updated: 2026-05-27T00:00:00.000Z
---

# Chat Agent and Vault Memory

## System Prompt Chain
1. Load soul file (HQ.md > CLAUSE.md > AGENTS.md > soul.md) from workspace root
2. Build system prompt: soul content + workspace context + current date
3. If vault notes are relevant: append `---\nProject Knowledge (from vault notes):\n<section per note>`
4. Vault context budget: 6000 chars max (tunable via `maxChars` param)

## Context-Relevant Vault Lookup
- `VaultService.contextRelevant(userMessage, workspacePath, maxChars)`
- Extracts keywords from user message + workspace path
- Scores notes by: title matches (10pts), tag matches (7pts), content matches (2pts), path segment matches (4/3/1pts), recency bonus (3pts <7d, +2 <1d), dev-tag bonus (2pts)
- Returns top-scoring notes that fit within character budget
- Notes with score 0 are excluded

## Vault Note Tool
- The LLM has a `vault_note` tool to create/update notes during chat sessions.
- Tag categories that boost relevance: architecture, api, bug, config, convention, debug, design, error, fix, pitfall, pattern, stack, troubleshoot
- The agent should save important decisions, pitfalls, and conventions to vault notes so future sessions benefit.

## How It Grows
1. **Seed notes** (manual): Architecture, pitfalls, design system, API endpoints, terminal arch — written once, updated as the codebase changes.
2. **Agent writes** (automatic): The LLM uses `vault_note` tool during chat to save discoveries, pitfalls, and decisions.
3. **Context-relevant retrieval**: Every chat message triggers `contextRelevant()` which pulls the most relevant notes into the system prompt.

## Best Practices for Note Writing
- Titles should be specific: "Terminal Socket.IO Setup" not "Notes"
- Tags should use the dev-tag categories for relevance boosting
- Content should be concise — keyword-rich, not prose
- Use `[[wikilinks]]` to cross-reference related notes