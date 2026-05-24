import { Injectable } from '@nestjs/common';
import { WorkspaceSession, PermissionPolicyMap, ToolEvent } from '@shared/types';
import { v4 as uuid } from 'uuid';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class SessionService {
  private sessions = new Map<string, WorkspaceSession>();
  private dataDir = './data/sessions';

  constructor() {
    if (!fs.existsSync(this.dataDir)) fs.mkdirSync(this.dataDir, { recursive: true });
    this.load();
  }

  create(workspaceId: string, name: string, provider: string, model: string): WorkspaceSession {
    const session: WorkspaceSession = {
      id: uuid(),
      name,
      workspacePath: workspaceId,
      provider,
      model,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      messages: [],
      openFiles: [],
      cwd: '/',
      toolHistory: [],
      permissions: {},
    };
    this.sessions.set(session.id, session);
    this.save(session.id);
    return session;
  }

  get(id: string): WorkspaceSession | undefined {
    return this.sessions.get(id);
  }

  list(): WorkspaceSession[] {
    return Array.from(this.sessions.values());
  }

  addMessage(id: string, role: WorkspaceSession['messages'][number]['role'], content: string) {
    const session = this.sessions.get(id);
    if (!session) return;
    session.messages.push({ role, content });
    session.updatedAt = new Date().toISOString();
    this.save(id);
  }

  updatePermissions(id: string, perms: PermissionPolicyMap) {
    const session = this.sessions.get(id);
    if (!session) return;
    session.permissions = { ...session.permissions, ...perms };
    session.updatedAt = new Date().toISOString();
    this.save(id);
  }

  appendToolEvent(id: string, event: ToolEvent) {
    const session = this.sessions.get(id);
    if (!session) return;
    session.toolHistory.push(event);
    session.updatedAt = new Date().toISOString();
    this.save(id);
  }

  deleteSession(id: string): boolean {
    const ok = this.sessions.delete(id);
    const p = this.sessionPath(id);
    if (fs.existsSync(p)) fs.unlinkSync(p);
    return ok;
  }

  private sessionPath(id: string) { return path.join(this.dataDir, `${id}.json`); }

  private save(id: string) {
    const s = this.sessions.get(id);
    if (!s) return;
    fs.writeFileSync(this.sessionPath(id), JSON.stringify(s, null, 2));
  }

  private load() {
    const files = fs.readdirSync(this.dataDir).filter(f => f.endsWith('.json'));
    for (const f of files) {
      const raw = fs.readFileSync(path.join(this.dataDir, f), 'utf-8');
      const s = JSON.parse(raw) as WorkspaceSession;
      this.sessions.set(s.id, s);
    }
  }
}
