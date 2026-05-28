---
title: Design System
tags: [design, css, theme, color, convention, ui]
created: 2026-05-27T00:00:00.000Z
updated: 2026-05-27T00:00:00.000Z
---

# Design System (Dual Theme)

## Accent
- **Teal**: `#14b8a6` (dark), `#0d9488` (light). NEVER orange, NEVER purple.

## Light Theme (`:root`)
| Token | Value | Usage |
|-------|-------|-------|
| `--bg` | `#f7f4ed` | Warm cream background |
| `--bg-elevated` | `#fcfbf8` | Cards, modals |
| `--ink` | `#1c1c1c` | Primary text |
| `--ink-muted` | `#5f5f5d` | Secondary text |
| `--border-passive` | `#eceae4` | Default borders |
| `--border-active` | `rgba(28,28,28,0.4)` | Focused borders |

## Dark Theme (`[data-theme="dark"]`)
| Token | Value | Usage |
|-------|-------|-------|
| `--bg` | `#1a1a2e` | Deep navy |
| `--bg-elevated` | `#222240` | Cards |
| `--ink` | `#e4e4ef` | Primary text |
| `--ink-muted` | `#8b8ba7` | Secondary |
| `--border-passive` | `#2e2e4a` | Borders |
| `--accent` | `#14b8a6` | Teal (same hue, lighter on dark) |

## Code Areas (ALWAYS DARK, both themes)
- `background: #1a1a2e !important; color: #e4e4ef !important`
- Syntax tokens: `.kw` (#7c3aed light / #c4b5fd dark), `.str` (#16a34a / #86efac), `.num` (#2563eb / #93c5fd), `.cm` (#9ca3af / #6b7280), `.fn` (#db2777 / #f9a8d4)
- Line numbers: `color: #5a5a7a` (hardcoded, not theme var)

## Rules
- NO dotted/dashed borders. Solid 1px only.
- Flat SVG icons for toolbar buttons, not text labels.
- Logo: image-only far left. Settings gear far right.
- Theme toggle persists in `localStorage('cammander-theme')`: `'light'`, `'dark'`, or `'system'`.
- Mobile viewport lock: `position: fixed; inset: 0; overscroll-behavior: none`.

## Catppuccin Mocha (React app ONLY)
- Base: `#1e1e2e`, Surface0: `#313244`, Text: `#cdd6f4`, Peach: `#fab387`, Blue: `#89b4fa`.
- NEVER mix Catppuccin tokens with prototype warm palette tokens.