import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Server as SocketIOServer, Socket } from 'socket.io';
import * as pty from 'node-pty';
import { buildTerminalInit } from './modules/terminal/venv-detect';
import * as http from 'http';

interface PtySession {
  pty: pty.IPty;
  cwd: string;
  createdAt: number;
  lastActivityAt: number;
}

const REAPER_INTERVAL_MS = 5 * 60 * 1000;   // check every 5 min
const ABANDON_TIMEOUT_MS = 30 * 60 * 1000;    // kill after 30 min with no client

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { cors: true });
  const config = app.get(ConfigService);

  app.enableCors({
    origin: config.get<string>('CORS_ORIGIN') || '*',
    credentials: true,
  });

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  const port = config.get<number>('PORT') || 3000;
  await app.listen(port, '0.0.0.0');

  // ── Persistent PTY sessions keyed by slot ID ──
  // Slots: "default", "1", "2", ... (for future multi-terminal)
  const sessions = new Map<string, PtySession>();

  // ── Manually create Socket.IO server for terminal ──
  const httpServer = app.getHttpServer() as http.Server;
  const io = new SocketIOServer(httpServer, {
    cors: { origin: '*', credentials: true },
    path: '/terminal',
    transports: ['polling', 'websocket'],
  });

  // Track which client is attached to which slot
  const clientSlot = new Map<string, string>();   // clientId → slotId
  const slotClients = new Map<string, Set<string>>(); // slotId → client ids

  // ── Reaper: kill sessions with no clients for too long ──
  setInterval(() => {
    const now = Date.now();
    for (const [slotId, session] of sessions.entries()) {
      const clients = slotClients.get(slotId);
      if (!clients || clients.size === 0) {
        if (now - session.lastActivityAt > ABANDON_TIMEOUT_MS) {
          console.log(`[terminal] Reaper: killing abandoned session ${slotId}`);
          session.pty.kill();
          sessions.delete(slotId);
          slotClients.delete(slotId);
        }
      }
    }
  }, REAPER_INTERVAL_MS);

  io.on('connection', (client: Socket) => {
    console.log(`[terminal] Client connected: ${client.id}`);

    // ── terminal:attach — attach to existing or new session ──
    client.on('terminal:attach', (payload: { slot?: string; cwd?: string; cols?: number; rows?: number }) => {
      const slotId = payload.slot || 'default';
      clientSlot.set(client.id, slotId);

      if (!slotClients.has(slotId)) {
        slotClients.set(slotId, new Set());
      }
      slotClients.get(slotId)!.add(client.id);

      let session = sessions.get(slotId);

      if (session) {
        // Reattach: resize and send ready
        console.log(`[terminal] Client ${client.id} reattaching to existing session ${slotId}`);
        if (payload.cols && payload.rows) {
          session.pty.resize(payload.cols, payload.rows);
        }
        session.lastActivityAt = Date.now();
        client.emit('terminal:ready', { cwd: session.cwd, pid: session.pty.pid, slot: slotId, reattached: true });
      } else {
        // Create new PTY
        const cwd = payload.cwd || process.env.HOME || '/tmp';
        const cols = payload.cols || 80;
        const rows = payload.rows || 24;
        const shell = process.env.SHELL || '/bin/bash';

        console.log(`[terminal] Creating PTY for ${client.id} in ${cwd} (slot: ${slotId})`);

        const ptyProcess = pty.spawn(shell, [], {
          name: 'xterm-256color',
          cols,
          rows,
          cwd,
          env: {
            ...process.env,
            TERM: 'xterm-256color',
            COLORTERM: 'truecolor',
          } as Record<string, string>,
        });

        // Init: cd + venv activation
        const init = buildTerminalInit(cwd);
        if (init.command) {
          setTimeout(() => {
            ptyProcess.write(init.command + '\n');
            if (init.info.length > 0) {
              ptyProcess.write(`echo "📂 workspace: ${cwd}"\n`);
              for (const line of init.info) {
                ptyProcess.write(`echo "${line}"\n`);
              }
            }
          }, 300);
        }

        const newSession: PtySession = {
          pty: ptyProcess,
          cwd,
          createdAt: Date.now(),
          lastActivityAt: Date.now(),
        };
        sessions.set(slotId, newSession);

        // PTY output → all attached clients
        ptyProcess.onData((data: string) => {
          const clients = slotClients.get(slotId);
          if (clients) {
            for (const cid of clients) {
              io.to(cid).emit('terminal:data', data);
            }
          }
        });

        ptyProcess.onExit(({ exitCode }: { exitCode: number }) => {
          const clients = slotClients.get(slotId);
          if (clients) {
            for (const cid of clients) {
              io.to(cid).emit('terminal:exit', { exitCode });
            }
          }
          sessions.delete(slotId);
          slotClients.delete(slotId);
        });

        client.emit('terminal:ready', { cwd, pid: ptyProcess.pid, slot: slotId, reattached: false });
      }
    });

    // ── terminal:create — legacy: creates in default slot ──
    client.on('terminal:create', (payload: { cwd?: string; cols?: number; rows?: number }) => {
      client.emit('terminal:attach', { ...payload, slot: 'default' });
    });

    // ── terminal:input → PTY ──
    client.on('terminal:input', (payload: { data: string }) => {
      const slotId = clientSlot.get(client.id);
      if (!slotId) return;
      const session = sessions.get(slotId);
      if (session) {
        session.pty.write(payload.data);
        session.lastActivityAt = Date.now();
      }
    });

    // ── terminal:resize ──
    client.on('terminal:resize', (payload: { cols: number; rows: number }) => {
      const slotId = clientSlot.get(client.id);
      if (!slotId) return;
      const session = sessions.get(slotId);
      if (session) {
        session.pty.resize(payload.cols, payload.rows);
        session.lastActivityAt = Date.now();
      }
    });

    // ── terminal:kill — explicitly kill a slot ──
    client.on('terminal:kill', (payload?: { slot?: string }) => {
      const slotId = payload?.slot || clientSlot.get(client.id);
      if (!slotId) return;
      const session = sessions.get(slotId);
      if (session) {
        console.log(`[terminal] Killing session ${slotId} by client ${client.id}`);
        session.pty.kill();
        sessions.delete(slotId);
        slotClients.delete(slotId);
      }
    });

    // ── Disconnect: detach from slot but keep PTY alive ──
    client.on('disconnect', () => {
      console.log(`[terminal] Client disconnected: ${client.id}`);
      const slotId = clientSlot.get(client.id);
      if (slotId) {
        const clients = slotClients.get(slotId);
        if (clients) {
          clients.delete(client.id);
        }
        clientSlot.delete(client.id);
      }
      // PTY stays alive — reaper will clean up abandoned sessions
    });
  });

  console.log(`Backend listening on http://0.0.0.0:${port}`);
  console.log(`Terminal WebSocket on ws://0.0.0.0:${port}/terminal`);
  console.log(`Terminal sessions persist for ${ABANDON_TIMEOUT_MS / 60000} min after disconnect`);
}
bootstrap();