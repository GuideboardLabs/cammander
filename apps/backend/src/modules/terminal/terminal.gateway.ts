import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import * as pty from 'node-pty';
import * as http from 'http';
import { buildTerminalInit } from './venv-detect';

interface PtyProcess {
  pty: pty.IPty;
  workspaceRoot: string;
  createdAt: number;
  lastActivityAt: number;
}

const ABANDON_TIMEOUT_MS = 30 * 60 * 1000; // 30 min
const REAPER_INTERVAL_MS = 5 * 60 * 1000;   // 5 min

@WebSocketGateway({
  cors: { origin: '*', credentials: true },
  namespace: '/terminal',
  path: '/terminal',
  transports: ['polling', 'websocket'],
})
export class TerminalGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(TerminalGateway.name);
  private sessions = new Map<string, PtyProcess>();         // slotId → PTY
  private clientSlot = new Map<string, string>();           // clientId → slotId
  private slotClients = new Map<string, Set<string>>();     // slotId → clientIds

  private reaperTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    // Reaper: kill sessions abandoned for too long
    this.reaperTimer = setInterval(() => {
      const now = Date.now();
      for (const [slotId, session] of this.sessions.entries()) {
        const clients = this.slotClients.get(slotId);
        if (!clients || clients.size === 0) {
          if (now - session.lastActivityAt > ABANDON_TIMEOUT_MS) {
            this.logger.log(`Reaper: killing abandoned session ${slotId}`);
            session.pty.kill();
            this.sessions.delete(slotId);
            this.slotClients.delete(slotId);
          }
        }
      }
    }, REAPER_INTERVAL_MS);
  }

  /** Manually attach a Socket.IO server if needed */
  attachToServer(httpServer: http.Server) {
    this.server = new Server(httpServer, {
      cors: { origin: '*', credentials: true },
      path: '/terminal',
      transports: ['polling', 'websocket'],
    });
    this.server.on('connection', (client) => this.handleConnection(client));
    this.logger.log('TerminalGateway manually attached to HTTP server');
  }

  afterInit(server: Server) {
    this.logger.log('TerminalGateway afterInit');
    this.server = server;
  }

  handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
    // Detach from slot but keep PTY alive for reconnection
    const slotId = this.clientSlot.get(client.id);
    if (slotId) {
      const clients = this.slotClients.get(slotId);
      if (clients) {
        clients.delete(client.id);
      }
      this.clientSlot.delete(client.id);
    }
    // PTY stays alive — reaper cleans up abandoned sessions
  }

  @SubscribeMessage('terminal:attach')
  handleAttach(client: Socket, payload: { slot?: string; cwd?: string; cols?: number; rows?: number }) {
    const slotId = payload.slot || 'default';
    this.clientSlot.set(client.id, slotId);

    if (!this.slotClients.has(slotId)) {
      this.slotClients.set(slotId, new Set());
    }
    this.slotClients.get(slotId)!.add(client.id);

    const existing = this.sessions.get(slotId);

    if (existing) {
      // Reattach to existing session
      this.logger.log(`Client ${client.id} reattaching to session ${slotId}`);
      if (payload.cols && payload.rows) {
        existing.pty.resize(payload.cols, payload.rows);
      }
      existing.lastActivityAt = Date.now();
      client.emit('terminal:ready', { cwd: existing.workspaceRoot, pid: existing.pty.pid, slot: slotId, reattached: true });
    } else {
      // Create new PTY
      this.spawnPty(client, slotId, payload);
    }
  }

  @SubscribeMessage('terminal:create')
  handleCreate(client: Socket, payload: { cwd?: string; cols?: number; rows?: number }) {
    // Legacy: route to attach with default slot
    this.handleAttach(client, { ...payload, slot: 'default' });
  }

  @SubscribeMessage('terminal:input')
  handleInput(client: Socket, payload: { data: string }) {
    const slotId = this.clientSlot.get(client.id);
    if (!slotId) return;
    const session = this.sessions.get(slotId);
    if (session) {
      session.pty.write(payload.data);
      session.lastActivityAt = Date.now();
    }
  }

  @SubscribeMessage('terminal:resize')
  handleResize(client: Socket, payload: { cols: number; rows: number }) {
    const slotId = this.clientSlot.get(client.id);
    if (!slotId) return;
    const session = this.sessions.get(slotId);
    if (session) {
      session.pty.resize(payload.cols, payload.rows);
      session.lastActivityAt = Date.now();
    }
  }

  @SubscribeMessage('terminal:kill')
  handleKill(client: Socket, payload?: { slot?: string }) {
    const slotId = payload?.slot || this.clientSlot.get(client.id);
    if (!slotId) return;
    this.killSlot(slotId);
  }

  private spawnPty(client: Socket, slotId: string, payload: { cwd?: string; cols?: number; rows?: number }) {
    const cwd = payload.cwd || process.env.HOME || '/tmp';
    const cols = payload.cols || 80;
    const rows = payload.rows || 24;
    const shell = process.env.SHELL || '/bin/bash';

    this.logger.log(`Creating PTY for ${client.id} in ${cwd} (slot: ${slotId})`);

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

    // PTY output → all attached clients
    ptyProcess.onData((data: string) => {
      const clients = this.slotClients.get(slotId);
      if (clients) {
        for (const cid of clients) {
          this.server.to(cid).emit('terminal:data', data);
        }
      }
    });

    ptyProcess.onExit(({ exitCode }: { exitCode: number }) => {
      const clients = this.slotClients.get(slotId);
      if (clients) {
        for (const cid of clients) {
          this.server.to(cid).emit('terminal:exit', { exitCode });
        }
      }
      this.sessions.delete(slotId);
      this.slotClients.delete(slotId);
    });

    const session: PtyProcess = {
      pty: ptyProcess,
      workspaceRoot: cwd,
      createdAt: Date.now(),
      lastActivityAt: Date.now(),
    };
    this.sessions.set(slotId, session);
    client.emit('terminal:ready', { cwd, pid: ptyProcess.pid, slot: slotId, reattached: false });
  }

  private killSlot(slotId: string) {
    const session = this.sessions.get(slotId);
    if (session) {
      this.logger.log(`Killing session ${slotId}`);
      session.pty.kill();
      this.sessions.delete(slotId);
      this.slotClients.delete(slotId);
    }
  }
}