import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import { VaultNote, VaultNoteSummary, CreateVaultNoteDto, UpdateVaultNoteDto } from './vault.types';

// Lightweight YAML frontmatter parsing (no dependency needed)
function parseFrontmatter(raw: string): { frontmatter: Record<string, any>; body: string } {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) return { frontmatter: {}, body: raw };

  const frontmatter: Record<string, any> = {};
  const lines = match[1].split('\n');
  for (const line of lines) {
    const kv = line.match(/^(\w[\w\s]*?):\s*(.+?)\s*$/);
    if (!kv) continue;
    const key = kv[1].trim();
    let value: any = kv[2].trim();

    // Parse arrays: [tag1, tag2]
    if (value.startsWith('[') && value.endsWith(']')) {
      value = value.slice(1, -1).split(',').map((s: string) => s.trim().replace(/['"]/g, '')).filter(Boolean);
    }
    // Unquote strings
    else if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    frontmatter[key] = value;
  }

  return { frontmatter, body: match[2] };
}

function stringifyFrontmatter(data: Record<string, any>): string {
  const lines: string[] = [];
  for (const [key, val] of Object.entries(data)) {
    if (Array.isArray(val)) {
      lines.push(`${key}: [${val.join(', ')}]`);
    } else if (typeof val === 'string' && /[:\s\[\]]/.test(val)) {
      lines.push(`${key}: "${val}"`);
    } else {
      lines.push(`${key}: ${val}`);
    }
  }
  return `---\n${lines.join('\n')}\n---\n`;
}

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64) || 'untitled';
}

@Injectable()
export class VaultService {
  private readonly logger = new Logger(VaultService.name);
  private vaultDir: string;

  constructor(private config: ConfigService) {
    const workspaceRoot = this.config.get<string>('WORKSPACE_ROOT', '/tmp');
    this.vaultDir = path.join(workspaceRoot, '.cammander', 'vault');
  }

  private ensureDir() {
    if (!fs.existsSync(this.vaultDir)) {
      fs.mkdirSync(this.vaultDir, { recursive: true });
      this.logger.log(`Created vault directory: ${this.vaultDir}`);
    }
  }

  private notePath(subPath: string, id: string): string {
    const base = path.join(this.vaultDir, subPath || '');
    return path.join(base, `${id}.md`);
  }

  private readNote(subPath: string, id: string): VaultNote | null {
    const fp = this.notePath(subPath, id);
    if (!fs.existsSync(fp)) return null;

    const stat = fs.statSync(fp);
    const raw = fs.readFileSync(fp, 'utf-8');
    const { frontmatter, body } = parseFrontmatter(raw);

    const relPath = subPath ? `${subPath}/${id}` : id;

    // Resolve backlinks: find all notes that contain [[id]]
    const backlinks = this.findBacklinks(id);

    return {
      id,
      title: frontmatter.title || id,
      content: body.trim(),
      tags: frontmatter.tags || [],
      path: relPath,
      filePath: fp,
      createdAt: frontmatter.created || stat.birthtime.toISOString(),
      updatedAt: frontmatter.updated || stat.mtime.toISOString(),
      backlinks,
    };
  }

  private findBacklinks(targetId: string): string[] {
    const backlinks: string[] = [];
    this.walkDir('', (subDir, file) => {
      const noteId = file.replace(/\.md$/, '');
      if (noteId === targetId) return;
      const fp = this.notePath(subDir, noteId);
      try {
        const content = fs.readFileSync(fp, 'utf-8');
        if (content.includes(`[[${targetId}]]`)) {
          backlinks.push(noteId);
        }
      } catch { /* skip */ }
    });
    return backlinks;
  }

  private walkDir(subDir: string, fn: (subDir: string, file: string) => void) {
    const dir = path.join(this.vaultDir, subDir || '');
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const next = subDir ? `${subDir}/${entry.name}` : entry.name;
        this.walkDir(next, fn);
      } else if (entry.name.endsWith('.md')) {
        fn(subDir, entry.name);
      }
    }
  }

  list(): VaultNoteSummary[] {
    this.ensureDir();
    const notes: VaultNoteSummary[] = [];

    this.walkDir('', (subDir, file) => {
      const id = file.replace(/\.md$/, '');
      const fp = this.notePath(subDir, id);
      const stat = fs.statSync(fp);
      const raw = fs.readFileSync(fp, 'utf-8');
      const { frontmatter } = parseFrontmatter(raw);
      notes.push({
        id,
        title: frontmatter.title || id,
        tags: frontmatter.tags || [],
        path: subDir ? `${subDir}/${id}` : id,
        createdAt: frontmatter.created || stat.birthtime.toISOString(),
        updatedAt: frontmatter.updated || stat.mtime.toISOString(),
      });
    });

    // Sort by updatedAt descending
    notes.sort((a, b) => (b.updatedAt > a.updatedAt ? 1 : -1));
    return notes;
  }

  get(id: string, subPath?: string): VaultNote | null {
    this.ensureDir();

    // If no subPath given, search all subdirectories
    if (!subPath) {
      let found: VaultNote | null = null;
      let foundSub = '';
      this.walkDir('', (sd) => {
        if (found) return;
        const n = this.readNote(sd, id);
        if (n) { found = n; foundSub = sd; }
      });
      return found;
    }

    return this.readNote(subPath, id);
  }

  create(dto: CreateVaultNoteDto): VaultNote {
    this.ensureDir();

    const id = slugify(dto.title);
    const subPath = dto.path || '';
    const fp = this.notePath(subPath, id);

    // Handle duplicate slug: append counter
    let finalId = id;
    let counter = 1;
    while (fs.existsSync(this.notePath(subPath, finalId))) {
      finalId = `${id}-${counter++}`;
    }

    const now = new Date().toISOString();
    const frontmatter: Record<string, any> = {
      title: dto.title,
      tags: dto.tags || [],
      created: now,
      updated: now,
    };
    const body = dto.content || '';
    const content = stringifyFrontmatter(frontmatter) + '\n' + body;

    const dir = path.dirname(this.notePath(subPath, finalId));
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    fs.writeFileSync(this.notePath(subPath, finalId), content, 'utf-8');
    this.logger.log(`Created note: ${finalId}`);

    return this.readNote(subPath, finalId)!;
  }

  update(id: string, dto: UpdateVaultNoteDto, subPath?: string): VaultNote | null {
    this.ensureDir();

    const note = this.get(id, subPath);
    if (!note) return null;

    const now = new Date().toISOString();
    const frontmatter: Record<string, any> = {
      title: dto.title || note.title,
      tags: dto.tags !== undefined ? dto.tags : note.tags,
      created: note.createdAt,
      updated: now,
    };

    const body = dto.content !== undefined ? dto.content : note.content;
    const content = stringifyFrontmatter(frontmatter) + '\n' + body;
    fs.writeFileSync(note.filePath, content, 'utf-8');

    // If title changed, rename the file
    if (dto.title && slugify(dto.title) !== id) {
      const newId = slugify(dto.title);
      const newFp = note.filePath.replace(new RegExp(`/${id}\\.md$`), `/${newId}.md`);
      if (!fs.existsSync(newFp)) {
        fs.renameSync(note.filePath, newFp);
        this.logger.log(`Renamed ${id} -> ${newId}`);
        return this.get(newId);
      }
    }

    return this.get(id);
  }

  delete(id: string): boolean {
    const note = this.get(id);
    if (!note) return false;
    fs.unlinkSync(note.filePath);
    this.logger.log(`Deleted note: ${id}`);
    return true;
  }

  search(query: string): VaultNoteSummary[] {
    this.ensureDir();
    const results: { summary: VaultNoteSummary; score: number }[] = [];
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (terms.length === 0) return [];

    this.walkDir('', (subDir, file) => {
      const id = file.replace(/\.md$/, '');
      const fp = this.notePath(subDir, id);
      const stat = fs.statSync(fp);
      const raw = fs.readFileSync(fp, 'utf-8');
      const { frontmatter, body } = parseFrontmatter(raw);

      const title = (frontmatter.title || id).toLowerCase();
      const tags = (frontmatter.tags || []).join(' ').toLowerCase();
      const content = body.toLowerCase();

      // Score: each term that matches adds weight (title > tag > content)
      let score = 0;
      for (const term of terms) {
        if (title.includes(term)) score += 5;
        else if (tags.includes(term)) score += 3;
        else if (content.includes(term)) score += 1;
      }

      if (score > 0) {
        results.push({
          summary: {
            id,
            title: frontmatter.title || id,
            tags: frontmatter.tags || [],
            path: subDir ? `${subDir}/${id}` : id,
            createdAt: frontmatter.created || stat.birthtime.toISOString(),
            updatedAt: frontmatter.updated || stat.mtime.toISOString(),
          },
          score,
        });
      }
    });

    // Sort by score descending, then by recency
    results.sort((a, b) => b.score - a.score || (b.summary.updatedAt > a.summary.updatedAt ? 1 : -1));
    return results.map((r) => r.summary);
  }

  getBacklinks(targetId: string): string[] {
    return this.findBacklinks(targetId);
  }

  /**
   * Context-relevant vault lookup for chat system prompts.
   * Extracts keywords from the user message and workspace path,
   * extracts markdown headings for section-level matching,
   * scores and returns the most relevant vault notes.
   * Budget: maxChars total content to inject (default 6000).
   */
  contextRelevant(userMessage: string, workspacePath: string, maxChars = 6000): VaultNote[] {
    this.ensureDir();
    const allNotes = this.listWithContent();

    if (allNotes.length === 0) return [];

    const query = `${userMessage} ${workspacePath}`.toLowerCase();
    const keywords = this.extractKeywords(query);
    const pathSegments = workspacePath.split('/').filter(Boolean).map(s => s.toLowerCase());
    const projectFolder = pathSegments[pathSegments.length - 1] || '';

    // Map folder names to related tags for automatic domain boosting
    const folderTagMap: Record<string, string[]> = {
      'cammander': ['architecture', 'pitfall', 'terminal', 'socket-io', 'design', 'api', 'chat', 'vault', 'nestjs', 'ui'],
      'backend': ['api', 'architecture', 'config', 'database', 'nestjs'],
      'frontend': ['design', 'ui', 'css', 'theme', 'react', 'mobile'],
    };

    // Collect domain tags from the project folder name
    const domainTags = new Set<string>();
    for (const seg of pathSegments) {
      if (folderTagMap[seg]) {
        for (const t of folderTagMap[seg]) domainTags.add(t);
      }
    }

    const scored = allNotes.map(note => {
      let score = 0;
      const titleLower = note.title.toLowerCase();
      const contentLower = note.content.toLowerCase();
      const tagsLower = note.tags.map(t => t.toLowerCase());

      // Extract markdown headings for section-level matching
      const headings = contentLower.split('\n')
        .filter(line => line.startsWith('#'))
        .map(h => h.replace(/^#+\s*/, '').trim());

      // Keyword matches in title (highest value)
      for (const kw of keywords) {
        if (titleLower.includes(kw)) score += 10;
        if (tagsLower.some(t => t.includes(kw))) score += 7;
        if (headings.some(h => h.includes(kw))) score += 5;
        if (contentLower.includes(kw)) score += 2;
      }

      // Path segment matches — notes mentioning project-specific terms
      for (const seg of pathSegments) {
        if (seg.length < 2) continue;
        if (titleLower.includes(seg)) score += 4;
        if (tagsLower.some(t => t.includes(seg))) score += 3;
        if (contentLower.includes(seg)) score += 1;
      }

      // Project folder name match (specialized knowledge about this project)
      if (projectFolder && (titleLower.includes(projectFolder) || contentLower.includes(projectFolder))) {
        score += 6;
      }

      // Domain tag boosting — if note tags match the project's domain, it's more relevant
      for (const t of tagsLower) {
        if (domainTags.has(t)) score += 3;
      }

      // Recency bonus (notes updated in last 7 days get a small boost)
      const ageDays = (Date.now() - new Date(note.updatedAt).getTime()) / (1000 * 60 * 60 * 24);
      if (ageDays < 7) score += 3;
      if (ageDays < 1) score += 2;

      // Category tags that map to common dev tasks
      const devTags = ['architecture', 'api', 'bug', 'config', 'convention', 'debug', 'design', 'error', 'fix', 'pitfall', 'pattern', 'stack', 'troubleshoot'];
      for (const t of tagsLower) {
        if (devTags.includes(t)) score += 2;
      }

      // Wikilink bonus: notes that link to other notes get a small authority boost
      const wikilinks = (note.content.match(/\[\[([^\]]+)\]\]/g) || []);
      if (wikilinks.length > 0) score += 1;

      return { note, score };
    });

    // Sort by relevance score descending, take notes until budget exhausted
    scored.sort((a, b) => b.score - a.score);

    const result: VaultNote[] = [];
    let totalChars = 0;

    for (const { note, score } of scored) {
      if (score === 0) continue; // skip irrelevant notes
      const noteLen = note.content.length + note.title.length + 50; // overhead
      if (totalChars + noteLen > maxChars) continue; // skip notes that blow budget
      result.push(note);
      totalChars += noteLen;
    }

    return result;
  }

  /** List all notes with full content (for context-relevant lookup) */
  private listWithContent(): VaultNote[] {
    this.ensureDir();
    const notes: VaultNote[] = [];
    this.walkDir('', (subDir, file) => {
      const id = file.replace(/\.md$/, '');
      const note = this.readNote(subDir, id);
      if (note) notes.push(note);
    });
    return notes;
  }

  /** Extract meaningful keywords from a query string */
  private extractKeywords(query: string): string[] {
    // Stop words to ignore
    const stopWords = new Set([
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
      'of', 'with', 'by', 'from', 'is', 'it', 'that', 'this', 'was', 'are',
      'be', 'been', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
      'could', 'should', 'may', 'might', 'can', 'how', 'what', 'when', 'where',
      'who', 'which', 'why', 'not', 'no', 'so', 'if', 'then', 'than', 'too',
      'very', 'just', 'about', 'also', 'some', 'all', 'any', 'each', 'every',
      'into', 'over', 'after', 'before', 'between', 'under', 'again', 'there',
      'here', 'own', 'same', 'other', 'such', 'only', 'same', 'being', 'because',
      'those', 'these', 'their', 'they', 'them', 'we', 'you', 'he', 'she', 'me',
      'my', 'your', 'his', 'her', 'its', 'our', 'us', 'am', 'more', 'most',
      'much', 'many', 'few', 'less', 'least', 'up', 'out', 'off', 'down',
      'going', 'get', 'got', 'make', 'like', 'want', 'need', 'know', 'think',
      'see', 'look', 'come', 'take', 'find', 'give', 'tell', 'use', 'try',
      'help', 'let', 'put', 'set', 'keep', 'seem', 'show', 'run', 'add',
      'change', 'work', 'play', 'move', 'turn', 'good', 'new', 'way', 'code',
      'file', 'just', 'thing', 'please', 'thanks', 'yeah', 'yep', 'ok',
    ]);

    // Extract tokens: split on non-alphanumeric, filter short/stop words
    const tokens = query.toLowerCase().split(/[^a-z0-9._-]+/).filter(t => {
      return t.length >= 2 && !stopWords.has(t);
    });

    // Deduplicate
    return [...new Set(tokens)];
  }
}
