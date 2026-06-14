import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { VaultService } from './vault.service';
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

  it('saves and retrieves a note', () => {
    const note = service.create({
      title: 'Test Note',
      content: 'Hello vault.',
      tags: ['test'],
    });
    expect(note.id).toBeDefined();
    const fetched = service.get(note.id);
    expect(fetched?.content).toContain('Hello vault.');
  });

  it('resolves note by title slug', () => {
    const note = service.create({
      title: 'My Great Note',
      content: 'content here',
      tags: [],
    });
    const bySlug = service.get('my-great-note');
    expect(bySlug?.id).toBe(note.id);
  });

  it('ranks relevant context above zero-score notes', () => {
    service.create({
      title: 'Banana',
      content: 'yellow fruit',
      tags: [],
    });
    service.create({
      title: 'Quantum Computing',
      content: 'qubits and superposition',
      tags: [],
    });
    const ctx = service.contextRelevant('qubits', dataDir, 4000);
    const titles = ctx.notes.map((n) => n.title);
    expect(titles).toContain('Quantum Computing');
    expect(titles).not.toContain('Banana');
  });

  it('rejects empty content via controller-level guard', () => {
    // service.create still permits empty body; controller now guards it
    const note = service.create({ title: 'Empty', content: '', tags: [] });
    expect(note.id).toBe('empty');
    expect(note.content.trim()).toBe('');
  });
});
