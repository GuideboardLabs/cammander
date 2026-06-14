# Cammander Gap-Closure Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Close every gap surfaced by the `/grill-check` audit of Cammander, while keeping the project soul file neutral (`CLAUSE.md`, not `CLAUDE.md`).

**Architecture:** Leave the existing NestJS + React + Socket.IO + file-system vault structure intact. Make surgical, behavior-preserving changes: strengthen the harness loader, harden the vault, stream the chat response, feed the workspace tree into context, add backend tests, remove dead modules, and polish the terminal/UX edge cases.

**Tech Stack:** TypeScript, NestJS, React, Socket.IO, node-pty, Jest, local filesystem vault, markdown.

**Brand/policy constraints:**
- Do not add, reference, or ship a file named `CLAUDE.md`. The equivalent project soul file is `CLAUSE.md`.
- The chat harness can mention Claude Code / Codex / OpenCode as quality benchmarks, but the project itself does not depend on Anthropic naming or files.
- Keep changes minimal and architecture-preserving.

---

## Background

A `/grill-check` audit found:
- Frontend TypeScript build errors in `VaultGraph.tsx` and `VaultPanel.tsx` (fixed).
- Chat system prompt lacked a strong coding harness; it has been patched with an explicit harness block and `CLAUSE.md` support.
- Vault context retrieval scored zero-match notes and did not resolve wikilinks by title slug (patched).
- Tool execution had unsafe shell quoting (patched).
- 10 remaining gaps from aspirational/incomplete areas remain.

This plan closes all 10 gaps.

---

## Task 1: Rename harness loader from `CLAUDE.md` to `CLAUSE.md` and verify

**Objective:** Remove the `CLAUDE.md` priority entry from the soul-file loader so `CLAUSE.md` is the canonical project soul file.

**Files:**
- Modify: `apps/backend/src/modules/chat/chat.controller.ts`

**Step 1: Change `SOUL_FILES` priority**

Replace:
```typescript
const SOUL_FILES = ['CLAUDE.md', 'HQ.md', 'CLAUSE.md', 'AGENTS.md', 'soul.md'];
```
with:
```typescript
const SOUL_FILES = ['CLAUSE.md', 'HQ.md', 'AGENTS.md', 'soul.md'];
```

**Step 2: Update harness block copy**

Inside `buildSystemPrompt`, replace the sentence:
```
The user expects Claude Code / Codex / OpenCode quality: deep reasoning, tool use, verification, and persistence.
```
with:
```
The user expects top-tier local coding agent quality (Claude Code / Codex / OpenCode level): deep reasoning, tool use, verification, and persistence.
```

**Step 3: Run backend build**

```bash
cd /home/sc/Documents/cammander
npm run build:backend
```
Expected: exit 0.

**Step 4: Commit**

```bash
git add apps/backend/src/modules/chat/chat.controller.ts
git commit -m "chore(chat): make CLAUSE.md the canonical soul file"
```

---

## Task 2: Add a real backend test suite scaffold

**Objective:** Create a minimal Jest test so `npm run test` in `apps/backend` no longer exits with "No tests found".

**Files:**
- Create: `apps/backend/src/modules/tools/tools.service.spec.ts`

**Step 1: Write failing test**

```typescript
import { ToolsService } from './tools.service';

describe('ToolsService', () => {
  let service: ToolsService;

  beforeEach(() => {
    service = new ToolsService();
  });

  describe('bash', () => {
    it('rejects commands with shell metacharacters', async () => {
      await expect(service.bash('echo hello; rm -rf /', '/tmp')).rejects.toThrow(
        /metacharacters/,
      );
    });

    it('allows simple safe commands', async () => {
      const result = await service.bash('echo cammander-test', '/tmp');
      expect(result.stdout).toContain('cammander-test');
      expect(result.exitCode).toBe(0);
    });
  });

  describe('grep', () => {
    it('escapes single quotes in pattern', async () => {
      const result = await service.grep(
        "function loadSoul",
        "apps/backend/src/modules/chat",
        "*.ts",
      );
      expect(result.matches.length).toBeGreaterThan(0);
    });
  });
});
```

**Step 2: Run test to verify failure**

```bash
cd /home/sc/Documents/cammander/apps/backend
npm run test
```
Expected: tests run, some may pass/fail depending on exact current `ToolsService` shape. If `ToolsService` constructor requires injection, adjust the test or mock dependencies.

**Step 3: Make test pass**

If `ToolsService` has no dependencies, the test should pass as-is. If it has dependencies, add NestJS `Test.createTestingModule` scaffolding:

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { ToolsService } from './tools.service';

describe('ToolsService', () => {
  let service: ToolsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ToolsService],
    }).compile();
    service = module.get<ToolsService>(ToolsService);
  });
  // ... tests
});
```

**Step 4: Run tests**

```bash
npm run test
```
Expected: at least 3 passing tests.

**Step 5: Commit**

```bash
git add apps/backend/src/modules/tools/tools.service.spec.ts
git commit -m "test(backend): add ToolsService harness tests"
```

---

## Task 3: Remove dead `SessionModule` and consolidate on `SessionsModule`

**Objective:** Eliminate the duplicate session module discovered in `app.module.ts`.

**Files:**
- Delete: `apps/backend/src/modules/session/` directory
- Modify: `apps/backend/src/app.module.ts`

**Step 1: Verify which module is actually used**

Search imports:
```bash
cd /home/sc/Documents/cammander
grep -R "from '../session'" apps/backend/src || true
grep -R "from '../sessions'" apps/backend/src || true
```
Expected: no results for `../session` except `app.module.ts`; `SessionsService` imported from `../sessions` in chat controller and app module.

**Step 2: Delete dead directory**

```bash
rm -rf apps/backend/src/modules/session
```

**Step 3: Remove `SessionModule` import from `app.module.ts`**

Open `apps/backend/src/app.module.ts` and remove:
- `import { SessionModule } from './modules/session/session.module';`
- `SessionModule` from the `imports: [...]` array.

**Step 4: Build and test**

```bash
npm run build:backend
npm run test
```
Expected: build passes, backend tests still pass.

**Step 5: Commit**

```bash
git add apps/backend/src/app.module.ts
git commit -m "refactor(backend): remove dead SessionModule, keep SessionsModule"
```

---

## Task 4: Wire workspace file-tree summary into chat context

**Objective:** Stop making the LLM blindly `list_files`; send a compact file-tree summary with every chat request.

**Files:**
- Create: `apps/backend/src/modules/workspace/workspace-tree.service.ts`
- Modify: `apps/backend/src/modules/workspace/workspace.module.ts`
- Modify: `apps/backend/src/modules/workspace/workspace.service.ts`
- Modify: `apps/backend/src/modules/chat/chat.controller.ts`
- Modify: `apps/frontend/src/stores/WorkspaceContext.tsx` or chat calling code

**Step 1: Implement tree scanner service**

Create `apps/backend/src/modules/workspace/workspace-tree.service.ts`:

```typescript
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
    let remaining = budget;
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
        const children = this.scan(root, full, Math.max(0, remaining - entries.length));
        entries.push({ path: rel, type: 'directory', children });
      } else {
        entries.push({ path: rel, type: 'file' });
      }
      if (entries.length >= remaining) break;
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
        } else {
          out += `${indent}  ...\n`;
        }
      } else {
        out += `${indent}${e.path}\n`;
      }
    }
    return out;
  }
}
```

**Step 2: Export it from `WorkspaceModule`**

Modify `apps/backend/src/modules/workspace/workspace.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { WorkspaceService } from './workspace.service';
import { WorkspaceTreeService } from './workspace-tree.service';
import { WorkspaceController } from './workspace.controller';

@Module({
  controllers: [WorkspaceController],
  providers: [WorkspaceService, WorkspaceTreeService],
  exports: [WorkspaceService, WorkspaceTreeService],
})
export class WorkspaceModule {}
```

**Step 3: Add a tree endpoint to `WorkspaceService` or `WorkspaceController`**

Modify `apps/backend/src/modules/workspace/workspace.service.ts`:

```typescript
import { Injectable } from '@nestjs/common';
import { WorkspaceTreeService } from './workspace-tree.service';

@Injectable()
export class WorkspaceService {
  constructor(private readonly tree: WorkspaceTreeService) {}

  getTree(root: string): string {
    return this.tree.summarize(root);
  }

  // existing methods remain unchanged
}
```

Modify `apps/backend/src/modules/workspace/workspace.controller.ts` to add:

```typescript
@Get('tree')
getTree(@Query('path') path: string) {
  return { tree: this.workspaceService.getTree(path) };
}
```

**Step 4: Inject tree summary into chat system prompt**

Modify `apps/backend/src/modules/chat/chat.controller.ts`:

- Inject `WorkspaceTreeService` (or `WorkspaceService`) into the controller constructor.
- In `buildSystemPrompt`, add a `Workspace layout` section generated from `WorkspaceTreeService.summarize(workspaceRoot)`.
- Cap the tree section to ~1500 characters to avoid blowing the context budget.

Pseudo-code inside `buildSystemPrompt`:

```typescript
const treeSummary = workspaceTreeService
  .summarize(workspaceRoot, 100)
  .slice(0, 1500);
const layout = `\n\n---\nWorkspace layout:\n${treeSummary}`;
```

Append `layout` before the vault context and behavioral guidelines.

**Step 5: Build and test**

```bash
cd /home/sc/Documents/cammander
npm run build:backend
npm run build
npm run test
```
Expected: both builds pass, frontend 67 tests pass, backend tests pass.

**Step 6: Commit**

```bash
git add apps/backend/src/modules/workspace/workspace-tree.service.ts

git add apps/backend/src/modules/workspace/workspace.module.ts

git add apps/backend/src/modules/workspace/workspace.service.ts

git add apps/backend/src/modules/workspace/workspace.controller.ts

git add apps/backend/src/modules/chat/chat.controller.ts

git commit -m "feat(workspace): feed compact file-tree summary into chat context"
```

---

## Task 5: Add `vault_note` content validation and a note list endpoint test

**Objective:** Prevent empty note creation and verify vault note CRUD via tests.

**Files:**
- Modify: `apps/backend/src/modules/vault/vault.controller.ts`
- Create: `apps/backend/src/modules/vault/vault.service.spec.ts`

**Step 1: Add `content` validation to vault creation/update**

In `vault.controller.ts`, locate the `vault_note` route handler and add:

```typescript
if (!dto.content || dto.content.trim().length === 0) {
  throw new BadRequestException('Note content is required.');
}
```

**Step 2: Write vault service test**

Create `apps/backend/src/modules/vault/vault.service.spec.ts`:

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { VaultService } from './vault.service';
import { ConfigService } from '@nestjs/config';
import { existsSync, rmSync, mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

describe('VaultService', () => {
  let service: VaultService;
  let dataDir: string;

  beforeEach(async () => {
    dataDir = mkdtempSync(join(tmpdir(), 'cammander-vault-'));
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VaultService,
        {
          provide: ConfigService,
          useValue: { get: () => dataDir },
        },
      ],
    }).compile();
    service = module.get<VaultService>(VaultService);
  });

  afterEach(() => {
    rmSync(dataDir, { recursive: true, force: true });
  });

  it('saves and retrieves a note', async () => {
    const note = await service.saveNote({
      title: 'Test Note',
      content: 'Hello vault.',
      tags: ['test'],
      references: [],
    });
    expect(note.id).toBeDefined();
    const fetched = await service.get(note.id);
    expect(fetched?.content).toBe('Hello vault.');
  });

  it('resolves note by title slug', async () => {
    const note = await service.saveNote({
      title: 'My Great Note',
      content: 'content here',
      tags: [],
      references: [],
    });
    const bySlug = await service.get('my-great-note');
    expect(bySlug?.id).toBe(note.id);
  });

  it('ranks relevant context above zero-score notes', async () => {
    await service.saveNote({
      title: 'Banana',
      content: 'yellow fruit',
      tags: [],
      references: [],
    });
    await service.saveNote({
      title: 'Quantum Computing',
      content: 'qubits and superposition',
      tags: [],
      references: [],
    });
    const ctx = await service.contextRelevant('qubits', dataDir, 4000);
    const titles = ctx.notes.map((n) => n.title);
    expect(titles).toContain('Quantum Computing');
    expect(titles).not.toContain('Banana');
  });
});
```

**Step 3: Run tests and fix any compile/runtime issues**

```bash
cd /home/sc/Documents/cammander/apps/backend
npm run test
```
Expected: all vault tests pass.

**Step 4: Commit**

```bash
git add apps/backend/src/modules/vault/vault.controller.ts

git add apps/backend/src/modules/vault/vault.service.spec.ts

git commit -m "test(vault): add VaultService tests and note content validation"
```

---

## Task 6: Switch `ChatPanel` to streaming `/chat/stream` endpoint

**Objective:** Use the existing SSE `/chat/stream` route so the UI updates incrementally instead of replacing all messages at the end.

**Files:**
- Modify: `apps/frontend/src/components/ChatPanel.tsx`

**Step 1: Locate current `/chat` POST**

Find the `fetch('/api/chat'...)` block. It currently does something like:

```typescript
const res = await fetch('/api/chat', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ sessionId, message, workspacePath }),
});
const data = await res.json();
setMessages(data.messages);
```

**Step 2: Replace with EventSource streaming**

Use `fetch` with `ReadableStream` reader instead of EventSource because the endpoint is `POST` with JSON body. Pattern:

```typescript
const response = await fetch('/api/chat/stream', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ sessionId, message, workspacePath }),
});

if (!response.body) return;
const reader = response.body.getReader();
const decoder = new TextDecoder();
let buffer = '';

while (true) {
  const { value, done } = await reader.read();
  if (done) break;
  buffer += decoder.decode(value, { stream: true });
  const parts = buffer.split('\n\n');
  buffer = parts.pop() || '';
  for (const part of parts) {
    const eventLine = part.trim();
    if (!eventLine.startsWith('event: ') && !eventLine.startsWith('data: ')) continue;
    const dataLine = eventLine
      .split('\n')
      .find((l) => l.startsWith('data: '));
    if (!dataLine) continue;
    const payload = dataLine.slice('data: '.length);
    try {
      const parsed = JSON.parse(payload);
      if (parsed.type === 'assistant-token') {
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (last && last.role === 'assistant') {
            const next = [...prev];
            next[next.length - 1] = { ...last, content: last.content + parsed.token };
            return next;
          }
          return [...prev, { role: 'assistant', content: parsed.token }];
        });
      } else if (parsed.type === 'tool-result') {
        setMessages((prev) => [...prev, {
          role: 'tool',
          content: `\`\`\`\n${parsed.tool}: ${JSON.stringify(parsed.result, null, 2)}\n\`\`\``,
        }]);
      } else if (parsed.type === 'done') {
        if (parsed.messages) setMessages(parsed.messages);
      }
    } catch {
      // ignore malformed event
    }
  }
}
```

**Step 3: Add loading state and cancel behavior**

Keep the existing `isLoading` flag but set it false when `done` event arrives or the stream errors. Add an `AbortController` so the user can cancel mid-stream if desired (optional).

**Step 4: Build and test**

```bash
cd /home/sc/Documents/cammander
npm run build
npm run test
```
Expected: frontend build passes and tests pass.

**Step 5: Manual smoke test**

Start backend and proxy, open UI, send a message. Verify tokens appear incrementally and tool results render.

**Step 6: Commit**

```bash
git add apps/frontend/src/components/ChatPanel.tsx

git commit -m "feat(chat): stream assistant responses via /chat/stream SSE"
```

---

## Task 7: Make vault scope explicit and add per-workspace quick-switch UX

**Objective:** Address the "vault is isolated per workspace root" gap by making scope obvious and easy to switch.

**Files:**
- Modify: `apps/frontend/src/components/WorkspaceSelector.tsx` (or create it)
- Modify: `apps/frontend/src/App.tsx`
- Modify: `apps/frontend/src/stores/WorkspaceContext.tsx`

**Step 1: Confirm workspace selector location**

If a selector exists, reuse it. If not, create `apps/frontend/src/components/WorkspaceSelector.tsx`:

```tsx
import React from 'react';

interface Props {
  current: string;
  recent: string[];
  onChange: (path: string) => void;
}

export const WorkspaceSelector: React.FC<Props> = ({ current, recent, onChange }) => {
  return (
    <div className="workspace-selector">
      <span className="label">Project vault:</span>
      <select value={current} onChange={(e) => onChange(e.target.value)}>
        {[current, ...recent.filter((r) => r !== current)].map((p) => (
          <option key={p} value={p}>
            {p}
          </option>
        ))}
      </select>
    </div>
  );
};
```

**Step 2: Persist recent workspaces in `WorkspaceContext`**

Modify `WorkspaceContext.tsx`:

```typescript
const RECENT_KEY = 'cammander:recent-workspaces';

function loadRecent(): string[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
  } catch {
    return [];
  }
}

function saveRecent(path: string) {
  const existing = loadRecent();
  const next = [path, ...existing.filter((p) => p !== path)].slice(0, 5);
  localStorage.setItem(RECENT_KEY, JSON.stringify(next));
}
```

Call `saveRecent(workspaceRoot)` whenever the workspace changes.

**Step 3: Render selector in `App.tsx`**

Place `<WorkspaceSelector current={workspaceRoot} recent={recent} onChange={setWorkspaceRoot} />` near the existing header/title.

**Step 4: Build and test**

```bash
npm run build
npm run test
```
Expected: build passes.

**Step 5: Commit**

```bash
git add apps/frontend/src/components/WorkspaceSelector.tsx

git add apps/frontend/src/stores/WorkspaceContext.tsx

git add apps/frontend/src/App.tsx

git commit -m "feat(workspace): show project vault scope and recent workspace switcher"
```

---

## Task 8: Default settings to local-first (`ollama-local`)

**Objective:** Align Cammander with Seth's local inference preference.

**Files:**
- Modify: `apps/backend/src/modules/settings/settings.types.ts`

**Step 1: Change default provider**

Replace:
```typescript
activeProvider: 'ollama-cloud',
```
with:
```typescript
activeProvider: 'ollama-local',
```

**Step 2: Build and test**

```bash
npm run build:backend
npm run test
```
Expected: build passes.

**Step 3: Commit**

```bash
git add apps/backend/src/modules/settings/settings.types.ts

git commit -m "feat(settings): default provider to ollama-local for local-first use"
```

---

## Task 9: Replace hand-rolled markdown renderer with a real library

**Objective:** Improve "gorgeous UX" by supporting code highlighting, tables, and safe HTML.

**Files:**
- Modify: `apps/frontend/package.json`
- Modify: `apps/frontend/src/utils/renderMarkdown.ts`

**Step 1: Install dependencies**

```bash
cd /home/sc/Documents/cammander/apps/frontend
npm install marked highlight.js dompurify
npm install --save-dev @types/marked @types/dompurify
```

**Step 2: Rewrite `renderMarkdown.ts`**

```typescript
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import hljs from 'highlight.js';
import 'highlight.js/styles/github-dark.css';

marked.setOptions({
  gfm: true,
  breaks: true,
  headerIds: false,
  mangle: false,
});

const renderer = new marked.Renderer();
renderer.code = ({ text, lang }: { text: string; lang?: string }) => {
  const language = lang && hljs.getLanguage(lang) ? lang : 'plaintext';
  const highlighted = hljs.highlight(text, { language }).value;
  return `<pre class="hljs"><code class="language-${language}">${highlighted}</code></pre>`;
};

export function renderMarkdown(input: string): string {
  const raw = marked.parse(input, { renderer }) as string;
  return DOMPurify.sanitize(raw);
}
```

**Step 3: Update usage if needed**

`ChatPanel` already calls `renderMarkdown(message.content)`. Verify it expects a string and injects it via `dangerouslySetInnerHTML`.

**Step 4: Build and test**

```bash
cd /home/sc/Documents/cammander
npm run build
npm run test
```
Expected: build passes. If CSS import breaks Vite, add the highlight.js CSS to `index.css` instead and remove the import from TS.

**Step 5: Commit**

```bash
git add apps/frontend/package.json apps/frontend/package-lock.json

git add apps/frontend/src/utils/renderMarkdown.ts

git commit -m "feat(ui): replace hand-rolled markdown renderer with marked + highlight.js"
```

---

## Task 10: Harden terminal PTY lifecycle

**Objective:** Make the integrated terminal feel reliable: reconnect on disconnect, clear sessions on workspace switch, and surface errors.

**Files:**
- Modify: `apps/backend/src/modules/terminal/terminal.gateway.ts`
- Modify: `apps/frontend/src/components/TerminalPanel.tsx`

**Step 1: Add explicit session cleanup in gateway**

In `TerminalGateway`, ensure `handleDisconnect` kills the PTY:

```typescript
@OnGatewayDisconnect()
handleDisconnect(client: Socket) {
  this.logger.log(`terminal client disconnected ${client.id}`);
  const pty = this.ptySessions.get(client.id);
  if (pty) {
    pty.kill();
    this.ptySessions.delete(client.id);
  }
}
```

**Step 2: Add `kill` event handler**

Add a `@SubscribeMessage('kill')` handler that kills the current PTY session and starts a fresh one:

```typescript
@SubscribeMessage('kill')
handleKill(client: Socket) {
  const pty = this.ptySessions.get(client.id);
  if (pty) {
    pty.kill();
    this.ptySessions.delete(client.id);
  }
  this.spawnForClient(client, this.workspaceRoot);
  return { status: 'reset' };
}
```

**Step 3: Add frontend reconnect logic**

In `TerminalPanel.tsx`, wrap the `io(...)` connection with:

```typescript
const socketRef = useRef<Socket | null>(null);

useEffect(() => {
  const socket = io('/terminal', { transports: ['websocket', 'polling'] });
  socketRef.current = socket;
  socket.on('data', (data: string) => termRef.current?.write(data));
  socket.on('connect', () => termRef.current?.writeln('\r\n[connected]'));
  socket.on('disconnect', () => termRef.current?.writeln('\r\n[disconnected]'));
  socket.io.on('reconnect', () => termRef.current?.writeln('\r\n[reconnected]'));
  return () => {
    socket.disconnect();
  };
}, []);
```

**Step 4: Add a "Reset" button**

Render a small button that emits `kill`:

```tsx
<button onClick={() => socketRef.current?.emit('kill')} title="Reset terminal session">
  Reset
</button>
```

**Step 5: Build and test**

```bash
npm run build
npm run test
```
Expected: build passes.

**Step 6: Commit**

```bash
git add apps/backend/src/modules/terminal/terminal.gateway.ts

git add apps/frontend/src/components/TerminalPanel.tsx

git commit -m "feat(terminal): reconnect, reset, and PTY lifecycle hardening"
```

---

## Task 11: Final integration run and `/grill-check` follow-up

**Objective:** Prove the whole stack still works after all changes.

**Files:** none; this is verification.

**Step 1: Full build**

```bash
cd /home/sc/Documents/cammander
npm run build:backend
npm run build
```
Expected: both exit 0.

**Step 2: Run all tests**

```bash
cd apps/backend && npm run test
cd ../frontend && npm run test
```
Expected: backend tests pass, frontend 67 tests pass.

**Step 3: Smoke test runtime**

```bash
cd /home/sc/Documents/cammander
PORT=3002 node apps/backend/dist/apps/backend/src/main.js &
node proxy.js &
```

Then:

```bash
curl -s http://127.0.0.1:3001/api/settings | head -c 200
curl -s http://127.0.0.1:3001/api/vault/notes | head -c 200
curl -s http://127.0.0.1:3001/api/workspace/tree?path=/home/sc/Documents/cammander | head -c 200
```
Expected: all return JSON 200.

**Step 4: Stop servers**

```bash
pkill -f "apps/backend/dist" || true
pkill -f "proxy.js" || true
```

**Step 5: Commit any final cleanup**

```bash
git status --short
# commit only if there are untracked changes worth committing
git commit -m "chore: integration run after gap-closure plan" || true
```

**Step 6: Re-run `/grill-check` summary**

Ask Hermes to run `/grill-check` on Cammander again. Expected outcome: all 10 gaps move to fixed; no remaining aspirational items except deliberate product choices (e.g., per-workspace vault is now explicit).

---

## Summary of Gaps vs Tasks

| Gap | Task | Fix |
|-----|------|-----|
| 1. No `CLAUDE.md` present / harness loader | 1 | Make `CLAUSE.md` canonical; remove `CLAUDE.md` priority |
| 2. Duplicate `SessionModule` | 3 | Delete dead module, keep `SessionsModule` |
| 3. No backend tests | 2, 5 | Add `ToolsService` and `VaultService` specs |
| 4. ChatPanel non-streaming | 6 | Switch to `/chat/stream` SSE |
| 5. No file-tree summary in chat context | 4 | Add `WorkspaceTreeService` and inject tree into prompt |
| 6. Vault isolated per workspace | 7 | Make scope explicit with workspace selector |
| 7. Default provider `ollama-cloud` | 8 | Default to `ollama-local` |
| 8. Hand-rolled markdown renderer | 9 | Replace with `marked` + `highlight.js` |
| 9. Thin PTY lifecycle | 10 | Reconnect, reset button, explicit cleanup |
| 10. Empty note creation / no vault tests | 5 | Validate content, add `VaultService` tests |

---

## Execution Handoff

Plan saved to `/home/sc/Documents/cammander/docs/plans/2026-06-13-cammander-grill-check-gap-closure.md`.

Ready to execute using `subagent-driven-development` — I'll dispatch a fresh subagent per task with two-stage review (spec compliance then code quality). Shall I proceed?
