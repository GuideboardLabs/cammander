import { Injectable } from '@nestjs/common';
import { readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

export interface TreeEntry {
  path: string;
  type: 'file' | 'directory';
  children?: TreeEntry[];
}

const IGNORE_PATTERNS = [
  /^node_modules$/,
  /^\.git$/,
  /^\.cache$/,
  /^dist$/,
  /^build$/,
  /^\.cammander$/,
  /^coverage$/,
];

@Injectable()
export class WorkspaceTreeService {
  summarize(root: string, maxEntries = 200): string {
    const tree = this.scan(root, root, maxEntries);
    return this.format(tree, 0);
  }

  private scan(root: string, dir: string, budget: number): TreeEntry[] {
    if (budget <= 0) return [];
    const entries: TreeEntry[] = [];
    let items: string[];
    try {
      items = readdirSync(dir).sort();
    } catch {
      return [];
    }
    for (const name of items) {
      if (IGNORE_PATTERNS.some((p) => p.test(name))) continue;
      const full = join(dir, name);
      let stat;
      try {
        stat = statSync(full);
      } catch {
        continue;
      }
      const rel = relative(root, full);
      if (stat.isDirectory()) {
        const children = this.scan(root, full, Math.max(0, budget - entries.length));
        entries.push({ path: rel, type: 'directory', children });
      } else {
        entries.push({ path: rel, type: 'file' });
      }
      if (entries.length >= budget) break;
    }
    return entries;
  }

  private format(entries: TreeEntry[], depth: number): string {
    const indent = '  '.repeat(depth);
    let out = '';
    for (const e of entries) {
      if (e.type === 'directory') {
        out += `${indent}${e.path}/\n`;
        if (e.children?.length) {
          out += this.format(e.children, depth + 1);
        }
      } else {
        out += `${indent}${e.path}\n`;
      }
    }
    return out;
  }
}
