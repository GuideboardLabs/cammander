---
title: Mobile UX and Terminal Keyboard
tags: [mobile, terminal, keyboard, ui, convention]
created: 2026-05-27T00:00:00.000Z
updated: 2026-05-27T00:00:00.000Z
---

# Mobile UX and Terminal Keyboard

## Viewport Lock (Critical)
Mobile browsers zoom/scroll the whole page when panels resize. Lock pattern:
```
html, body { height: 100%; overflow: hidden; }
body { position: fixed; inset: 0; overscroll-behavior: none; touch-action: manipulation; }
#app { display: flex; flex-direction: column; height: 100dvh; max-height: 100dvh; overflow: hidden; }
```
Every flex child that needs to shrink MUST have `min-height: 0` and `min-width: 0`.

## Custom Keyboard Keys
- User wants custom keyboard keys to type directly into xterm terminal (NOT the compose input).
- Hold-to-repeat for backspace, centered space bar, d-pad accessible from modifier row.
- iOS soft keyboard overlay handled via `visualViewport` API.

## Mobile Topbar (≤768px)
- Tighter spacing: padding 8px, gap 4px, btn padding 6px, logo 20px.
- Tree view button hidden (`display: none`).
- "Open Folder" switches from text to SVG icon.
- Settings gear gets `flex-shrink: 0`.

## Images
- NEVER serve raw high-res images (640x640 154KB logo).
- Use `<img srcset="logo-32.png 1x, logo-64.png 2x, logo-128.png 3x">`.
- Only sized variants (`-32`, `-64`, `-128`) exist in `/assets/`.