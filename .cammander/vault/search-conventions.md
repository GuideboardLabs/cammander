---
title: Search Conventions
tags: [vault, search, convention]
created: "2026-06-06T23:12:06.613Z"
updated: "2026-06-06T23:12:06.613Z"
---

# Search Conventions

Cammander v0.2 auto-detects search depth from query complexity.

- **quick** — short queries, keyword match only, no graph walking
- **balanced** — medium queries, 1-hop wikilink traversal, facts included
- **deep** — complex queries, 2-hop graph walk, full context

The mode is chosen per-call based on keyword count, code blocks, and question marks.