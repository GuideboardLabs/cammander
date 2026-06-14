# INSTALL.md — cammander Setup Guide

Complete installation and first-run guide for cammander `v2.12.0` (Grilled to Perfection).

For the full list of changes in this release, see [`CHANGELOG.md`](./CHANGELOG.md).

---

## Table of Contents

1. [Requirements](#requirements)
2. [Quick Install](#quick-install)
3. [Step-by-Step Install](#step-by-step-install)
4. [First Run](#first-run)
5. [Configuration](#configuration)
6. [Troubleshooting](#troubleshooting)
7. [Deployment](#deployment)
8. [Updating](#updating)

---

## Requirements

| Dependency | Version | Purpose |
|------------|---------|---------|
| **Node.js** | `>= 20` | Runtime for backend, proxy, and build tools |
| **npm** | `>= 10` | Package manager |
| **Git** | any | Cloning and git module endpoints |
| **Unix shell** | Bash or Zsh | PTY terminal requires a real shell |

**Supported platforms:** macOS (Intel & Apple Silicon), Linux x64/ARM, Windows (WSL).

**PTY limitation:** Windows PowerShell/CMD are not supported by `node-pty`. Use WSL2 on Windows.

---

## Quick Install

One-liner if you have Node.js 20+ and git:

```bash
git clone https://github.com/GuideboardLabs/cammander.git
cd cammander
chmod +x install.sh 2>/dev/null; ./install.sh 2>/dev/null || true
npm install
cd apps/backend && npm install && cd ../..
npm run build:shared && npm run build:backend
PORT=3002 node apps/backend/dist/main.js &
node proxy.js &
```

Open http://localhost:3001 — you should see the cammander workspace.

---

## Step-by-Step Install

### 1. Clone the repository

```bash
git clone https://github.com/GuideboardLabs/cammander.git
cd cammander
```

### 2. Install root dependencies

```bash
npm install
```

This installs `concurrently`, `prettier`, `eslint`, and `http-proxy` in the root workspace.

### 3. Install backend dependencies

```bash
cd apps/backend
npm install
cd ../..
```

Key backend packages:
- `@nestjs/common`, `@nestjs/core`, `@nestjs/platform-express`, `@nestjs/websockets`
- `socket.io`, `node-pty`, `simple-git`
- `puppeteer`, `puppeteer-extra`, `puppeteer-extra-plugin-stealth`

### 4. (Optional) Install frontend React app

```bash
cd apps/frontend
npm install
cd ../..
```

> Note: The React + Vite app under `apps/frontend` is the current primary UI as of v2.12.0. `prototype.html` remains a legacy single-file reference. If you only want the backend, skip the frontend build and point a browser at the proxy on port 3001 after building the frontend at least once.

### 5. Build the backend

```bash
npm run build:shared
npm run build:backend
```

Or manually:

```bash
cd apps/backend
npx nest build
cd ../..
```

### 6. Verify the build

```bash
cd apps/backend
ls dist/modules/
```

You should see directories like `chat/`, `terminal/`, `tools/`, `settings/`, `sessions/`.

---

## First Run

### Start the backend

```bash
cd apps/backend
PORT=3002 node dist/main.js
```

You should see NestJS bootstrap output:

```
[Nest] 12345  - 05/25/2026, 3:00:00 PM     LOG [NestFactory] Starting Nest application...
[Nest] 12345  - 05/25/2026, 3:00:00 PM     LOG [WebSocketsModule] Gateway loaded: TerminalGateway
```

### Start the proxy (in another terminal)

```bash
cd /path/to/cammander
node proxy.js
```

You should see:

```
Proxy running on port 3001 → backend 3002
```

### Open in browser

```bash
open http://localhost:3001
```

Default page serves the built React app from `apps/frontend/dist/`.

### Test the terminal

1. Click the **Terminal** button or press the terminal shortcut
2. You should get a Bash prompt: `user@host:~$`
3. Type `ls` — you should see real directory listings from your server

### Test the chat

1. Open the **Chat** panel
2. Configure your provider in Settings (gear icon). Default is `ollama-local` (`http://localhost:11434`) as of v2.12.0.
3. Type "what files are in the current directory?"
4. The AI should call the `list_files` tool and show results

---

## Configuration

### API Key Storage

Keys are stored in `data/settings.json`. On first run, the backend auto-creates `data/`.

```json
{
  "activeProvider": "ollama-cloud",
  "ollamaCloud": {
    "baseUrl": "https://ollama.com/v1",
    "apiKey": "sk-..."
  },
  "defaultModel": "deepseek-v4-flash",
  "workspace": "/home/sc/projects"
}
```

### Environment Variables

Backend reads from `.env` (optional):

```bash
PORT=3002
FRONTEND_PORT=3001
OLLAMA_CLOUD_API_KEY=sk-...
OLLAMA_CLOUD_BASE_URL=https://ollama.com/v1
OLLAMA_CLOUD_DEFAULT_MODEL=deepseek-v4-flash
DEFAULT_WORKSPACE=/home/user/projects
```

### Project Soul (System Prompt)

cammander auto-discovers these files in the workspace root and loads them as the AI's system prompt:

| Priority | File | Purpose |
|----------|------|---------|
| 1st | `HQ.md` | Project soul, architecture, conventions |
| 2nd | `AGENTS.md` | Agent role definitions |
| 3rd | `CLAUSE.md` | Clause-specific instructions |

Create one in your project root to give the AI context about your codebase.

### Web Apps Discovery

cammander auto-detects running dev servers on common ports (`3000`, `5173`, `8080`, etc.). You can also declare apps explicitly in `cammander.json` at your workspace root:

```json
{
  "webApps": [
    {
      "name": "Frontend Dev",
      "url": "http://localhost:5173",
      "description": "Vite dev server"
    }
  ]
}
```

---

## Troubleshooting

### "Backend unreachable" / 502 error

**Cause:** Backend not running or wrong port.

**Fix:**
```bash
# Check if anything is on port 3002
lsof -i :3002

# If nothing, start the backend
cd apps/backend && PORT=3002 node dist/main.js
```

### Terminal shows "Disconnected" / no prompt

**Cause:** WebSocket not connecting to `/terminal`.

**Fix:**
```bash
# Verify proxy.js is running
lsof -i :3001

# Check browser console for WS errors
# Make sure proxy.js is proxying /terminal to port 3002
```

### node-pty fails to build (gyp errors)

**Cause:** Missing Python / C++ build tools.

**Fix (macOS):**
```bash
xcode-select --install
```

**Fix (Ubuntu/Debian):**
```bash
sudo apt-get install -y python3 make g++
```

**Fix (Windows):** Use WSL2. Run `npm install` inside WSL, not from Windows.

### "Error: Cannot find module 'reflect-metadata'"

**Fix:**
```bash
cd apps/backend && npm install
cd apps/backend && npm run build
```

### AI models not responding / "No provider configured"

**Fix:** Open Settings (gear icon), set provider to `ollama-cloud`, enter your API key, choose a model.

**Verify key works:**
```bash
curl https://ollama.com/v1/models \
  -H "Authorization: Bearer sk-YOUR_KEY" \
  -H "Content-Type: application/json"
```

### Proxy fails with EACCES

**Fix:** Check `proxy.js` has correct paths. If running as a different user, update `STATIC_DIR`:

```javascript
const STATIC_DIR = '/your/actual/cammander/path';
```

### React frontend won't build

**Fix:** The React frontend is now the primary UI as of v2.12.0. Build it:

```bash
cd apps/frontend && npm run build
```

If you prefer the legacy single-file UI, use `http://localhost:3001/prototype.html` directly.

---

## Deployment

### Local Network Access

By default the proxy binds to `127.0.0.1`. To expose to your LAN:

```bash
# In proxy.js, change:
server.listen(STATIC_PORT, '0.0.0.0');

# Start
node proxy.js
# Access via http://YOUR_IP:3001
```

### Reverse Proxy (nginx)

```nginx
server {
    listen 80;
    server_name cammander.local;

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }
}
```

### PM2 (process manager)

```bash
npm install -g pm2

# Backend
pm2 start "PORT=3002 node apps/backend/dist/main.js" --name cammander-backend

# Proxy
pm2 start "node proxy.js" --name cammander-proxy

pm2 save
pm2 startup
```

### Systemd

**Backend service:** `/etc/systemd/system/cammander.service`

```ini
[Unit]
Description=cammander AI harness
After=network.target

[Service]
Type=simple
User=sc
WorkingDirectory=/home/sc/cammander
ExecStart=/usr/bin/node apps/backend/dist/apps/backend/src/main.js
Environment=PORT=3002
Restart=always

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable cammander
sudo systemctl start cammander
```

Repeat for `proxy.js` on a second service or use PM2.

### Docker (self-containerize)

**Dockerfile:**

```dockerfile
FROM node:20-alpine
RUN apk add --no-cache python3 make g++ bash

WORKDIR /app
COPY package*.json ./
COPY apps/backend/package*.json apps/backend/
RUN npm ci

COPY . .
RUN npm run build:shared && npm run build:backend

EXPOSE 3001 3002

CMD ["sh", "-c", "PORT=3002 node apps/backend/dist/main.js & node proxy.js"]
```

**Build & run:**

```bash
docker build -t cammander .
docker run -p 3001:3001 -p 3002:3002 -v $(pwd)/data:/app/data cammander
```

---

## Updating

```bash
cd /home/sc/cammander
git pull origin main
npm install
cd apps/backend && npm install && cd ../..
npm run build:shared && npm run build:backend
```

Restart the backend and proxy services after updating.

---

## Getting Help

- **Raise an issue:** https://github.com/GuideboardLabs/cammander/issues
- **Read the HQ:** `HQ.md` in the repo root — project philosophy and architecture
- **Check settings:** Open the gear icon in the top-right of the UI

---

*Version: 2.12.0 — Grilled to Perfection — cammander by Guideboard Labs*
