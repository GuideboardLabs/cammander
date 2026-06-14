import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import {
  VaultNote, VaultNoteSummary, VaultFact, FactKind,
  CreateVaultNoteDto, UpdateVaultNoteDto, WriteSessionDto, SessionNote,
  SearchMode, SearchModeConfig,
} from './vault.types';

// ── YAML Frontmatter ────

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
    if (value.startsWith('[') && value.endsWith(']')) {
      value = value.slice(1, -1).split(',').map((s: string) => s.trim().replace(/['"]/g, '')).filter(Boolean);
    } else if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
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
    } else if (typeof val === 'string' && /[:\[\]]/.test(val)) {
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

// ── Facts Fence Parser (gbrain-inspired) ────

const FACTS_BEGIN = '<!--- cammander:facts:begin -->';
const FACTS_END   = '<!--- cammander:facts:end -->';

function parseFactsFence(body: string): VaultFact[] {
  const beginIdx = body.indexOf(FACTS_BEGIN);
  if (beginIdx === -1) return [];

  const endIdx = body.indexOf(FACTS_END, beginIdx);
  if (endIdx === -1) return [];

  const fenceBlock = body.slice(beginIdx + FACTS_BEGIN.length, endIdx).trim();
  const lines = fenceBlock.split('\n').filter(l => l.trim());

  // First 2 lines are header + separator
  const dataLines = lines.filter(l => {
    const trimmed = l.trim();
    return !trimmed.includes('---') && !trimmed.startsWith('| # |') && !trimmed.startsWith('|---');
  });

  const facts: VaultFact[] = [];
  for (const line of dataLines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('|') || !trimmed.endsWith('|')) continue;

    const cells = trimmed.split('|').map(c => c.trim());
    // cells[1] = row number, cells[2] = claim, etc.
    const dataCells = cells.slice(1, -1);
    if (dataCells.length < 4) continue;

    const rowNum = parseInt(dataCells[0], 10);
    if (isNaN(rowNum)) continue;

    const rawClaim = dataCells[1] || '';
    const active = !rawClaim.startsWith('~~') && !rawClaim.endsWith('~~');
    const claim = rawClaim.replace(/^~~|~~$/g, '').trim();

    facts.push({
      rowNum,
      claim,
      kind: (dataCells[2] || 'fact') as FactKind,
      confidence: parseFloat(dataCells[3]) || 0.5,
      value: dataCells[4]?.trim() || undefined,
      unit: dataCells[5]?.trim() || undefined,
      source: dataCells[6]?.trim() || undefined,
      context: dataCells[7]?.trim() || undefined,
      active,
    });
  }

  return facts;
}

// ── Search Mode Config ────

const SEARCH_MODES: Record<SearchMode, SearchModeConfig> = {
  quick: {
    maxResultChars: 2000,
    keywordWeight: 10,
    graphHops: 0,
    graphBump: 0,
    recencyDays: 2,
    includeFacts: false,
  },
  balanced: {
    maxResultChars: 6000,
    keywordWeight: 8,
    graphHops: 1,
    graphBump: 5,
    recencyDays: 7,
    includeFacts: true,
  },
  deep: {
    maxResultChars: 12000,
    keywordWeight: 6,
    graphHops: 2,
    graphBump: 4,
    recencyDays: 30,
    includeFacts: true,
  },
};

function detectSearchMode(userMessage: string, keywords: string[]): SearchMode {
  const wordCount = keywords.length;
  const containsCode = /`[^`]+`/.test(userMessage);
  const containsQuestion = /\?/.test(userMessage);
  const complexity = (containsCode ? 2 : 0) + (containsQuestion ? 1 : 0) + (wordCount > 5 ? 2 : 0);

  if (complexity >= 3 || wordCount > 8) return 'deep';
  if (complexity >= 1 || wordCount > 3) return 'balanced';
  return 'quick';
}

// ── Graph Types ────

export interface GraphNode {
  id: string;
  title: string;
  tags: string[];
  weight: number; // degree centrality (inbound + outbound links)
  factsCount: number;
}

export interface GraphEdge {
  source: string;
  target: string;
  label: string;
}

export interface KnowledgeGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

// ── Service ────

@Injectable()
export class VaultService {
  private readonly logger = new Logger(VaultService.name);
  private vaultDir: string;

  constructor(private config: ConfigService) {
    const workspaceRoot = this.config.get<string>('WORKSPACE_ROOT', '/tmp');
    this.vaultDir = path.join(workspaceRoot, '.cammander', 'vault');
  }

  // ── Knowledge Graph ────

  /** Build the full knowledge graph from all vault notes. */
  getKnowledgeGraph(): KnowledgeGraph {
    this.ensureDir();
    const allNotes = this.listWithContent();
    const nodes: GraphNode[] = [];
    const edges: GraphEdge[] = [];
    const linkCounts = new Map<string, number>(); // inbound link counts

    // Map slug → note
    const noteMap = new Map<string, VaultNote>();
    for (const n of allNotes) noteMap.set(n.id, n);

    // Build edges and count inbound links
    for (const note of allNotes) {
      for (const wikilink of note.wikilinks) {
        const cleanTarget = wikilink.split('|')[0].split('#')[0].trim();
        const targetSlug = slugify(cleanTarget);

        // Resolve target
        let targetId = targetSlug;
        if (!noteMap.has(targetSlug)) {
          for (const [nid, n] of noteMap) {
            if (slugify(n.title) === targetSlug) {
              targetId = nid;
              break;
            }
          }
        }

        if (noteMap.has(targetId)) {
          edges.push({ source: note.id, target: targetId, label: '' });
          linkCounts.set(targetId, (linkCounts.get(targetId) || 0) + 1);
        }
      }
    }

    // Build nodes with degree centrality
    for (const note of allNotes) {
      const outbound = note.wikilinks.filter(w => {
        const target = slugify(w.split('|')[0].split('#')[0].trim());
        return noteMap.has(target) || [...noteMap.keys()].some(k => slugify(noteMap.get(k)!.title) === target);
      }).length;
      const inbound = linkCounts.get(note.id) || 0;
      const facts = parseFactsFence(note.content);

      nodes.push({
        id: note.id,
        title: note.title,
        tags: note.tags,
        weight: inbound + outbound,
        factsCount: facts.filter(f => f.active).length,
      });
    }

    return { nodes, edges };
  }

  // ── Initialization ────

  seedDefaults(): void {
    this.ensureDir();
    const existing = this.list();
    if (existing.length > 0) return;

    const defaults = [
      {
        title: 'Vault Index',
        content: '# Vault Note Index\n\nAuto-generated catalog. Notes use [[wikilinks]] for cross-referencing.\n\n## Facts\n\n<!--- cammander:facts:begin -->\n| # | claim | kind | confidence | value | unit | source | context |\n|---|---|---|---|---|---|---|---|\n| 1 | Vault initialized | event | 1.0 | | | auto | Cammander v0.2 gbrain-inspired upgrade |\n<!--- cammander:facts:end -->',
        tags: ['vault', 'index'],
        path: '',
      },
      {
        title: 'Search Conventions',
        content: '# Search Conventions\n\nCammander v0.2 auto-detects search depth from query complexity.\n\n- **quick** — short queries, keyword match only, no graph walking\n- **balanced** — medium queries, 1-hop wikilink traversal, facts included\n- **deep** — complex queries, 2-hop graph walk, full context\n\nThe mode is chosen per-call based on keyword count, code blocks, and question marks.',
        tags: ['vault', 'search', 'convention'],
        path: '',
      },
      {
        title: 'GBrain Patterns',
        content: '# GBrain-Inspired Vault Patterns\n\n## Facts Tables\n\nUse `## Facts` heading with a fenced table to store structured knowledge:\n\n```markdown\n## Facts\n\n<!--- cammander:facts:begin -->\n| # | claim | kind | confidence | value | unit | source | context |\n|---|---|---|---|---|---|---|---|\n| 1 | Cammander uses NestJS | fact | 1.0 | | | codebase | backend framework |\n<!--- cammander:facts:end -->\n```\n\n## Graph Walking\n\n[[wikilinks]] are traversed during deep/balanced search. A note with many incoming backlinks becomes a hub — high-connectivity notes get score bumps.\n\n## Session Auto-Write\n\nAfter each chat session, the agent writes a note to `sessions/` with decisions and tags. This builds persistent project memory without manual note creation.',
        tags: ['vault', 'gbrain', 'convention', 'memory'],
        path: '',
      },
    ];

    for (const dto of defaults) {
      this.create(dto);
    }
    this.logger.log('Seeded 3 default vault notes (gbrain-inspired)');
  }

  // ── Directory Mgmt ────

  private ensureDir() {
    if (!fs.existsSync(this.vaultDir)) {
      fs.mkdirSync(this.vaultDir, { recursive: true });
      this.logger.log(`Created vault directory: ${this.vaultDir}`);
    }
  }

  private ensureSessionsDir() {
    const sessionsDir = path.join(this.vaultDir, 'sessions');
    if (!fs.existsSync(sessionsDir)) {
      fs.mkdirSync(sessionsDir, { recursive: true });
    }
  }

  private notePath(subPath: string, id: string): string {
    const base = path.join(this.vaultDir, subPath || '');
    return path.join(base, `${id}.md`);
  }

  // ── Wikilink Extraction ────

  private extractWikilinks(body: string): string[] {
    const matches = body.match(/\[\[([^\]]+)\]\]/g);
    if (!matches) return [];
    return matches.map(m => m.slice(2, -2).trim());
  }

  // ── Read / Write Notes ────

  private readNote(subPath: string, id: string): VaultNote | null {
    const fp = this.notePath(subPath, id);
    if (!fs.existsSync(fp)) return null;

    const stat = fs.statSync(fp);
    const raw = fs.readFileSync(fp, 'utf-8');
    const { frontmatter, body } = parseFrontmatter(raw);

    const relPath = subPath ? `${subPath}/${id}` : id;
    const wikilinks = this.extractWikilinks(body);
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
      wikilinks,
    };
  }

  private findBacklinks(targetId: string): string[] {
    const backlinks: string[] = [];
    this.walkDir('', (subDir, file) => {
      const noteId = file.replace(/\.md$/, '');
      if (noteId === targetId) return;
      const fp = this.notePath(subDir, noteId);
      try {
        const raw = fs.readFileSync(fp, 'utf-8');
        const { body } = parseFrontmatter(raw);
        const wikilinkPattern = new RegExp(`\\[\\[${escapeRegex(targetId)}(?:\\|[^\\]]+)?\\]\\]`);
        if (wikilinkPattern.test(body)) {
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

  // ── CRUD ────

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

    notes.sort((a, b) => (b.updatedAt > a.updatedAt ? 1 : -1));
    return notes;
  }

  get(id: string, subPath?: string): VaultNote | null {
    this.ensureDir();

    // 1. Exact path lookup if subPath provided
    if (subPath) {
      return this.readNote(subPath, id);
    }

    // 2. Search by exact id in any sub-directory
    let found: VaultNote | null = null;
    this.walkDir('', (sd) => {
      if (found) return;
      const n = this.readNote(sd, id);
      if (n) { found = n; }
    });
    if (found) return found;

    // 3. Fallback: resolve by title slug (supports [[wikilinks]] that use note titles)
    const allNotes = this.listWithContent();
    const targetSlug = slugify(id);
    for (const n of allNotes) {
      if (n.id === id) return n;
      if (slugify(n.title) === targetSlug) return n;
    }

    return null;
  }

  create(dto: CreateVaultNoteDto): VaultNote {
    this.ensureDir();
    const id = slugify(dto.title);
    const subPath = dto.path || '';
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

    if (dto.title && slugify(dto.title) !== id) {
      const newId = slugify(dto.title);
      const newFp = note.filePath.replace(new RegExp(`/${escapeRegex(id)}\\.md$`), `/${newId}.md`);
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

    results.sort((a, b) => b.score - a.score || (b.summary.updatedAt > a.summary.updatedAt ? 1 : -1));
    return results.map(r => r.summary);
  }

  getBacklinks(targetId: string): string[] {
    return this.findBacklinks(targetId);
  }

  getFacts(id: string): VaultFact[] {
    const note = this.get(id);
    if (!note) return [];
    return parseFactsFence(note.content);
  }

  // ── Session Auto-Write ────

  writeSessionNote(dto: WriteSessionDto): VaultNote {
    this.ensureSessionsDir();

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const id = `session-${timestamp}`;
    const title = `Session: ${dto.summary.slice(0, 60)}${dto.summary.length > 60 ? '...' : ''}`;

    const decisionsSection = dto.decisions && dto.decisions.length > 0
      ? '\n\n## Decisions\n\n' + dto.decisions.map((d, i) => `${i + 1}. ${d}`).join('\n')
      : '';

    const now = new Date().toISOString();
    const frontmatter: Record<string, any> = {
      title,
      tags: [...(dto.tags || []), 'session'],
      sessionId: dto.sessionId,
      created: now,
      updated: now,
    };

    const body = `# ${title}\n\n${dto.summary}${decisionsSection}`;
    const content = stringifyFrontmatter(frontmatter) + '\n' + body;

    const fp = path.join(this.vaultDir, 'sessions', `${id}.md`);
    fs.writeFileSync(fp, content, 'utf-8');
    this.logger.log(`Wrote session note: ${id}`);

    return this.readNote('sessions', id)!;
  }

  // ── GBrain-Inspired Context Retrieval ────

  contextRelevant(
    userMessage: string,
    workspacePath: string,
    maxChars?: number,
    explicitMode?: SearchMode,
  ): { notes: VaultNote[]; facts: { noteId: string; fact: VaultFact }[]; mode: SearchMode } {
    this.ensureDir();
    const allNotes = this.listWithContent();
    if (allNotes.length === 0) return { notes: [], facts: [], mode: 'quick' };

    const query = `${userMessage} ${workspacePath}`.toLowerCase();
    const keywords = this.extractKeywords(query);
    if (keywords.length === 0) return { notes: [], facts: [], mode: 'quick' };

    const mode = explicitMode || detectSearchMode(userMessage, keywords);
    const config = SEARCH_MODES[mode];

    const pathSegments = workspacePath.split('/').filter(Boolean).map(s => s.toLowerCase());
    const projectFolder = pathSegments[pathSegments.length - 1] || '';

    const folderTagMap: Record<string, string[]> = {
      'cammander': ['architecture', 'pitfall', 'terminal', 'socket-io', 'design', 'api', 'chat', 'vault', 'nestjs', 'ui'],
      'backend': ['api', 'architecture', 'config', 'database', 'nestjs'],
      'frontend': ['design', 'ui', 'css', 'theme', 'react', 'mobile'],
    };
    const domainTags = new Set<string>();
    for (const seg of pathSegments) {
      if (folderTagMap[seg]) {
        for (const t of folderTagMap[seg]) domainTags.add(t);
      }
    }

    const noteMap = new Map<string, VaultNote>();
    for (const n of allNotes) noteMap.set(n.id, n);

    const scored = new Map<string, number>();
    const matchedIds = new Set<string>();

    for (const note of allNotes) {
      let baseScore = 0;
      const titleLower = note.title.toLowerCase();
      const contentLower = note.content.toLowerCase();
      const tagsLower = note.tags.map(t => t.toLowerCase());

      for (const kw of keywords) {
        if (titleLower.includes(kw)) baseScore += 10 * (config.keywordWeight / 10);
        if (tagsLower.some(t => t.includes(kw))) baseScore += 7 * (config.keywordWeight / 10);
        if (contentLower.includes(kw)) baseScore += 2 * (config.keywordWeight / 10);
      }

      for (const seg of pathSegments) {
        if (seg.length < 2) continue;
        if (titleLower.includes(seg)) baseScore += 4;
        if (tagsLower.some(t => t.includes(seg))) baseScore += 3;
        if (contentLower.includes(seg)) baseScore += 1;
      }
      if (projectFolder && (titleLower.includes(projectFolder) || contentLower.includes(projectFolder))) {
        baseScore += 6;
      }

      for (const t of tagsLower) {
        if (domainTags.has(t)) baseScore += 3;
      }

      // Only include notes that actually matched the query or project signals
      if (baseScore <= 0) continue;

      let score = baseScore;

      let ageDays = 365;
      try {
        ageDays = (Date.now() - new Date(note.updatedAt).getTime()) / (1000 * 60 * 60 * 24);
      } catch { /* ignore invalid dates */ }
      if (ageDays < config.recencyDays) score += 3;
      if (ageDays < 1) score += 2;

      const devTags = ['architecture', 'api', 'bug', 'config', 'convention', 'debug', 'design', 'error', 'fix', 'pitfall', 'pattern', 'stack', 'troubleshoot'];
      for (const t of tagsLower) {
        if (devTags.includes(t)) score += 2;
      }

      if (note.wikilinks.length > 0) score += 1;

      scored.set(note.id, score);
      matchedIds.add(note.id);
    }

    // Graph walking — only expand from notes that actually matched the query
    if (config.graphHops > 0 && matchedIds.size > 0) {
      const visited = new Set<string>([...matchedIds]);

      for (let hop = 1; hop <= config.graphHops; hop++) {
        const frontier = [...visited];
        for (const id of frontier) {
          const note = noteMap.get(id);
          if (!note || !note.wikilinks) continue;

          for (const linkTarget of note.wikilinks) {
            const cleanTarget = linkTarget.split('|')[0].split('#')[0].trim();
            const targetSlug = slugify(cleanTarget);

            if (visited.has(targetSlug)) continue;

            let linkedNote = noteMap.get(targetSlug);
            if (!linkedNote) {
              for (const [nid, n] of noteMap) {
                if (slugify(n.title) === targetSlug) {
                  linkedNote = n;
                  break;
                }
              }
            }

            if (linkedNote) {
              visited.add(linkedNote.id);
              const existingScore = scored.get(linkedNote.id) || 0;
              scored.set(linkedNote.id, existingScore + (config.graphBump / hop));
            }
          }
        }
      }
    }

    const sorted = [...scored.entries()]
      .filter(([_, s]) => s > 0)
      .sort((a, b) => b[1] - a[1]);

    const notes: VaultNote[] = [];
    const facts: { noteId: string; fact: VaultFact }[] = [];
    const noteIdsIncluded = new Set<string>();
    const effectiveMaxChars = maxChars || config.maxResultChars;
    let totalChars = 0;

    for (const [id] of sorted) {
      const note = noteMap.get(id);
      if (!note || noteIdsIncluded.has(note.id)) continue;

      if (config.includeFacts) {
        const noteFacts = parseFactsFence(note.content);
        for (const f of noteFacts) {
          if (f.active && totalChars < effectiveMaxChars) {
            facts.push({ noteId: id, fact: f });
          }
        }
      }

      const noteLen = note.content.length + note.title.length + 50;
      if (totalChars + noteLen > effectiveMaxChars) break;
      notes.push(note);
      noteIdsIncluded.add(note.id);
      totalChars += noteLen;
    }

    return { notes, facts, mode };
  }

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

  private extractKeywords(query: string): string[] {
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
      'going', 'get', 'got', 'like', 'want', 'need', 'know', 'think',
      'see', 'look', 'come', 'take', 'find', 'give', 'tell', 'use', 'try',
      'help', 'let', 'put', 'set', 'keep', 'seem', 'show', 'run', 'add',
      'change', 'work', 'play', 'move', 'turn', 'good', 'new', 'way', 'code',
      'file', 'thing', 'please', 'thanks', 'yeah', 'yep', 'ok',
    ]);

    const tokens = query.toLowerCase().split(/[^a-z0-9._-]+/).filter(t => {
      return t.length >= 2 && !stopWords.has(t);
    });

    return [...new Set(tokens)];
  }
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}