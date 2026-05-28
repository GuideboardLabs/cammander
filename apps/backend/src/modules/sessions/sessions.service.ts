import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { ChatSession, ChatMessage } from './session.types';

@Injectable()
export class SessionsService {
  private readonly logger = new Logger(SessionsService.name);
  private sessions: ChatSession[] = [];
  private filePath: string;

  constructor(private config: ConfigService) {
    const dataDir = this.config.get<string>('DATA_DIR') || path.join(this.config.get<string>('WORKSPACE_ROOT') || '/home/sc/cammander', '.cammander', 'data');
    this.filePath = path.resolve(dataDir, 'sessions.json');
    this.load();
  }

  private load() {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf-8');
        this.sessions = JSON.parse(raw);
        this.logger.log(`Loaded ${this.sessions.length} sessions`);
      } else {
        this.sessions = [];
        this.save();
      }
    } catch (e: any) {
      this.logger.error(`Failed to load sessions: ${e.message}`);
      this.sessions = [];
    }
  }

  private save() {
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(this.filePath, JSON.stringify(this.sessions, null, 2), 'utf-8');
  }

  create(title?: string): ChatSession {
    const session: ChatSession = {
      id: uuidv4(),
      title: title || 'New Chat',
      model: '',
      provider: '',
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    this.sessions.unshift(session);
    this.save();
    this.logger.log(`Created session ${session.id}`);
    return session;
  }

  list(): Pick<ChatSession, 'id' | 'title' | 'model' | 'provider' | 'createdAt' | 'updatedAt'>[] {
    return this.sessions.map(({ id, title, model, provider, createdAt, updatedAt }) => ({
      id,
      title,
      model,
      provider,
      createdAt,
      updatedAt,
    }));
  }

  get(id: string): ChatSession | null {
    return this.sessions.find((s) => s.id === id) || null;
  }

  addMessage(id: string, message: Omit<ChatMessage, 'timestamp'>): ChatSession | null {
    const session = this.get(id);
    if (!session) return null;
    const msg: ChatMessage = { ...message, timestamp: Date.now() };
    session.messages.push(msg);
    session.updatedAt = Date.now();
    // Auto-title from first user message
    if (msg.role === 'user' && session.title === 'New Chat' && msg.content.trim()) {
      session.title = msg.content.trim().slice(0, 60);
    }
    if (msg.role === 'assistant' && msg.model && !session.model) {
      session.model = msg.model;
    }
    this.save();
    return session;
  }

  updateTitle(id: string, title: string): ChatSession | null {
    const session = this.get(id);
    if (!session) return null;
    session.title = title;
    session.updatedAt = Date.now();
    this.save();
    return session;
  }

  delete(id: string): boolean {
    const idx = this.sessions.findIndex((s) => s.id === id);
    if (idx === -1) return false;
    this.sessions.splice(idx, 1);
    this.save();
    return true;
  }
}