import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Server as SocketIOServer } from 'socket.io';
import * as pty from 'node-pty';
import { buildTerminalInit } from './modules/terminal/venv-detect';
import * as http from 'http';

interface PtySession {
  pty: pty.IPty;
  cwd: string;
}

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

  // ── Manually create Socket.IO server for terminal ──
  const httpServer = app.getHttpServer() as http.Server;
  const io = new SocketIOServer(httpServer, {
    cors: { origin: '*', credentials: true },
    path: '/terminal',
    transports: ['polling', 'websocket'],
  });

  const sessions = new Map<string, PtySession>();

  io.on('connection', (client) => {
    console.log(`[terminal] Client connected: ${client.id}`);

    client.on('terminal:create', (payload: { cwd?: string; cols?: number; rows?: number }) => {
      // Kill existing session for this client
      const existing = sessions.get(client.id);
      if (existing) {
        existing.pty.kill();
        sessions.delete(client.id);
      }

      const cwd = payload.cwd || process.env.HOME || '/tmp';
      const cols = payload.cols || 80;
      const rows = payload.rows || 24;
      const shell = process.env.SHELL || '/bin/bash';

      console.log(`[terminal] Spawning PTY for ${client.id} in ${cwd}`);

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

      // PTY output → client
      ptyProcess.onData((data: string) => {
        client.emit('terminal:data', data);
      });

      ptyProcess.onExit(({ exitCode }: { exitCode: number }) => {
        client.emit('terminal:exit', { exitCode });
        sessions.delete(client.id);
      });

      sessions.set(client.id, { pty: ptyProcess, cwd });
      client.emit('terminal:ready', { cwd, pid: ptyProcess.pid });
    });

    client.on('terminal:input', (payload: { data: string }) => {
      const session = sessions.get(client.id);
      if (session) {
        session.pty.write(payload.data);
      }
    });

    client.on('terminal:resize', (payload: { cols: number; rows: number }) => {
      const session = sessions.get(client.id);
      if (session) {
        session.pty.resize(payload.cols, payload.rows);
      }
    });

    client.on('terminal:kill', () => {
      const session = sessions.get(client.id);
      if (session) {
        session.pty.kill();
        sessions.delete(client.id);
      }
    });

    client.on('disconnect', () => {
      console.log(`[terminal] Client disconnected: ${client.id}`);
      const session = sessions.get(client.id);
      if (session) {
        session.pty.kill();
        sessions.delete(client.id);
      }
    });
  });

  console.log(`Backend listening on http://0.0.0.0:${port}`);
  console.log(`Terminal WebSocket on ws://0.0.0.0:${port}/terminal`);
}
bootstrap();