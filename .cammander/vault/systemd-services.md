---
title: Systemd Services
tags: [deploy, systemd, config, convention]
created: 2026-05-27T00:00:00.000Z
updated: 2026-05-27T00:00:00.000Z
---

# Systemd Services (Auto-Start on Boot)

## Backend Service
- Unit: `~/.config/systemd/user/cammander-backend.service`
- `ExecStart=/home/sc/.nvm/versions/node/v22.22.2/bin/node dist/apps/backend/src/main.js`
- `WorkingDirectory=/home/sc/cammander/apps/backend`
- `Environment=PORT=3002`
- MUST include `SupplementaryGroups=` (empty) to avoid WSL exit code 216/GROUP crash

## Proxy Service
- Unit: `~/.config/systemd/user/cammander-proxy.service`
- `ExecStart=/home/sc/.nvm/versions/node/v22.22.2/bin/node proxy.js`
- `WorkingDirectory=/home/sc/cammander`
- `After=cammander-backend.service`

## Management
- `systemctl --user start|stop|restart cammander-backend`
- `systemctl --user start|stop|restart cammander-proxy`
- Logs: `journalctl --user -u cammander-backend -f`
- Linger: `loginctl enable-linger sc`
- Must rebuild + restart after code changes (no hot reload).