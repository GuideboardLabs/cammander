import { Injectable } from '@nestjs/common';
import { v4 as uuid } from 'uuid';
import { WorkspaceIndexEntry } from '@shared/types';
import * as fs from 'fs';
import * as path from 'path';

export interface WorkspaceRecord {
  id: string;
  name: string;
  path: string;
  createdAt: string;
}

@Injectable()
export class WorkspaceService {
  private workspaces = new Map<string, WorkspaceRecord>();
  private dataDir = './data/workspaces';

  constructor() {
    if (!fs.existsSync(this.dataDir)) fs.mkdirSync(this.dataDir, { recursive: true });
    this.loadIndex();
  }

  list(): WorkspaceRecord[] {
    return Array.from(this.workspaces.values());
  }

  create(name: string, workspacePath: string): WorkspaceRecord {
    const rec: WorkspaceRecord = { id: uuid(), name, path: workspacePath, createdAt: new Date().toISOString() };
    this.workspaces.set(rec.id, rec);
    this.saveIndex();
    return rec;
  }

  get(id: string): WorkspaceRecord | undefined {
    return this.workspaces.get(id);
  }

  remove(id: string): boolean {
    const ok = this.workspaces.delete(id);
    if (ok) this.saveIndex();
    return ok;
  }

  update(id: string, dto: { name?: string }): WorkspaceRecord | undefined {
    const rec = this.workspaces.get(id);
    if (!rec) return undefined;
    if (dto.name) rec.name = dto.name;
    this.saveIndex();
    return rec;
  }

  async indexPath(dir: string): Promise<WorkspaceIndexEntry[]> {
    const entries: WorkspaceIndexEntry[] = [];
    const stack = [dir];
    while (stack.length) {
      const cur = stack.pop()!;
      const items = await fs.promises.readdir(cur, { withFileTypes: true });
      for (const item of items) {
        const p = path.join(cur, item.name);
        if (item.isDirectory()) {
          entries.push({ path: p, type: 'directory' });
          stack.push(p);
        } else {
          const stat = await fs.promises.stat(p);
          entries.push({ path: p, type: 'file', size: stat.size, mtime: stat.mtime.toISOString() });
        }
      }
    }
    return entries;
  }

  private indexFilePath(): string { return path.join(this.dataDir, 'index.json'); }

  private saveIndex() {
    fs.writeFileSync(this.indexFilePath(), JSON.stringify(Array.from(this.workspaces.values())));
  }

  private loadIndex() {
    if (!fs.existsSync(this.indexFilePath())) return;
    const data = JSON.parse(fs.readFileSync(this.indexFilePath(), 'utf-8')) as WorkspaceRecord[];
    for (const rec of data) this.workspaces.set(rec.id, rec);
  }
}
