---
title: GBrain Patterns
tags: [vault, gbrain, convention, memory]
created: "2026-06-06T23:12:06.614Z"
updated: "2026-06-06T23:12:06.614Z"
---

# GBrain-Inspired Vault Patterns

## Facts Tables

Use `## Facts` heading with a fenced table to store structured knowledge:

```markdown
## Facts

<!--- cammander:facts:begin -->
| # | claim | kind | confidence | value | unit | source | context |
|---|---|---|---|---|---|---|---|
| 1 | Cammander uses NestJS | fact | 1.0 | | | codebase | backend framework |
<!--- cammander:facts:end -->
```

## Graph Walking

[[wikilinks]] are traversed during deep/balanced search. A note with many incoming backlinks becomes a hub — high-connectivity notes get score bumps.

## Session Auto-Write

After each chat session, the agent writes a note to `sessions/` with decisions and tags. This builds persistent project memory without manual note creation.