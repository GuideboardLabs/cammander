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
}

@WebSocketGateway({
  cors: { origin: '*', credentials: true },
  namespace: '/terminal',
  transports: ['polling', 'websocket'],
})
export class TerminalGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(TerminalGateway.name);
  private sessions = new Map<string, PtyProcess>();

  /** Manually attach a Socket.IO server if NestWS adapter didn't work */
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
    this.killPty(client.id);
  }

  @SubscribeMessage('terminal:create')
  handleCreate(client: Socket, payload: { cwd?: string; cols?: number; rows?: number }) {
    this.killPty(client.id);

    const cwd = payload.cwd || process.env.HOME || '/tmp';
    const cols = payload.cols || 80;
    const rows = payload.rows || 24;
    const shell = process.env.SHELL || '/bin/bash';

    this.logger.log(`Creating PTY for ${client.id} in ${cwd}`);

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

    // Build init commands (cd + venv activation)
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
      this.sessions.delete(client.id);
    });

    this.sessions.set(client.id, { pty: ptyProcess, workspaceRoot: cwd });
    client.emit('terminal:ready', { cwd, pid: ptyProcess.pid });
  }

  @SubscribeMessage('terminal:input')
  handleInput(client: Socket, payload: { data: string }) {
    const session = this.sessions.get(client.id);
    if (session) {
      session.pty.write(payload.data);
    }
  }

  @SubscribeMessage('terminal:resize')
  handleResize(client: Socket, payload: { cols: number; rows: number }) {
    const session = this.sessions.get(client.id);
    if (session) {
      session.pty.resize(payload.cols, payload.rows);
    }
  }

  @SubscribeMessage('terminal:kill')
  handleKill(client: Socket) {
    this.killPty(client.id);
  }

  private killPty(clientId: string) {
    const session = this.sessions.get(clientId);
    if (session) {
      this.logger.log(`Killing PTY for ${clientId}`);
      session.pty.kill();
      this.sessions.delete(clientId);
    }
  }
}