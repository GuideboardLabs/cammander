import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { StorageBackend } from '@/storage';
import {
  loadWorkspaceState,
  createDebouncedSave,
  removeFileFromState,
  fileStillExists,
  createEmptyWorkspaceState,
  type PersistedWorkspaceState,
  type PersistedFileState,
} from '@/fileStatePersistence';

// ── In-memory storage backend for testing ────────────────────────────────────

class MemoryStorageBackend implements StorageBackend {
  private data = new Map<string, unknown>();

  async get<T = unknown>(key: string): Promise<T | undefined> {
    return this.data.has(key) ? (this.data.get(key) as T) : undefined;
  }

  async set<T = unknown>(key: string, value: T): Promise<void> {
    this.data.set(key, value);
  }

  async delete(key: string): Promise<void> {
    this.data.delete(key);
  }

  async clear(): Promise<void> {
    this.data.clear();
  }

  async keys(): Promise<string[]> {
    return Array.from(this.data.keys());
  }
}

function makeFileState(overrides: Partial<PersistedFileState> = {}): PersistedFileState {
  return {
    filePath: '/src/index.ts',
    label: 'index.ts',
    modified: false,
    cursor: { line: 1, column: 1 },
    scroll: { scrollTop: 0, scrollLeft: 0 },
    lastModified: Date.now(),
    ...overrides,
  };
}

function makeWorkspaceState(overrides: Partial<PersistedWorkspaceState> = {}): PersistedWorkspaceState {
  return {
    version: 1,
    files: [],
    activeTab: '',
    ...overrides,
  };
}

describe('File State Persistence', () => {
  let storage: MemoryStorageBackend;

  beforeEach(() => {
    storage = new MemoryStorageBackend();
  });

  describe('loadWorkspaceState', () => {
    it('should return null when no state is stored', async () => {
      const result = await loadWorkspaceState(storage);
      expect(result).toBeNull();
    });

    it('should load a valid workspace state', async () => {
      const state = makeWorkspaceState({
        files: [makeFileState()],
        activeTab: '/src/index.ts',
      });
      await storage.set('workspace-state', state);
      const result = await loadWorkspaceState(storage);
      expect(result).not.toBeNull();
      expect(result!.files).toHaveLength(1);
      expect(result!.activeTab).toBe('/src/index.ts');
    });

    it('should return null and delete corrupted state', async () => {
      await storage.set('workspace-state', { notValid: true });
      const result = await loadWorkspaceState(storage);
      expect(result).toBeNull();
      // Corrupted data should be removed
      const remaining = await storage.get('workspace-state');
      expect(remaining).toBeUndefined();
    });

    it('should handle state with missing files array', async () => {
      await storage.set('workspace-state', { version: 1, activeTab: '' });
      const result = await loadWorkspaceState(storage);
      expect(result).toBeNull();
    });

    it('should load state with multiple files', async () => {
      const state = makeWorkspaceState({
        files: [
          makeFileState({ filePath: '/src/a.ts', label: 'a.ts', cursor: { line: 10, column: 5 } }),
          makeFileState({ filePath: '/src/b.ts', label: 'b.ts', cursor: { line: 42, column: 1 } }),
        ],
        activeTab: '/src/b.ts',
      });
      await storage.set('workspace-state', state);
      const result = await loadWorkspaceState(storage);
      expect(result!.files).toHaveLength(2);
      expect(result!.files[0].filePath).toBe('/src/a.ts');
      expect(result!.files[1].filePath).toBe('/src/b.ts');
      expect(result!.files[0].cursor).toEqual({ line: 10, column: 5 });
    });
  });

  describe('createDebouncedSave', () => {
    it('should save workspace state on flush', async () => {
      const { flush, cancel } = createDebouncedSave(storage);
      const state = makeWorkspaceState({
        files: [makeFileState()],
        activeTab: '/src/index.ts',
      });

      await flush(() => state);

      const loaded = await loadWorkspaceState(storage);
      expect(loaded).not.toBeNull();
      expect(loaded!.files).toHaveLength(1);
    });

    it('should debounce saves via trigger', async () => {
      vi.useFakeTimers();
      const { trigger, cancel } = createDebouncedSave(storage);

      const state1 = makeWorkspaceState({
        files: [makeFileState({ filePath: '/src/a.ts', label: 'a.ts' })],
        activeTab: '/src/a.ts',
      });
      const state2 = makeWorkspaceState({
        files: [
          makeFileState({ filePath: '/src/a.ts', label: 'a.ts' }),
          makeFileState({ filePath: '/src/b.ts', label: 'b.ts' }),
        ],
        activeTab: '/src/b.ts',
      });

      trigger(() => state1);
      trigger(() => state2); // Should replace the first

      // Before debounce fires, nothing should be saved
      let loaded = await loadWorkspaceState(storage);
      expect(loaded).toBeNull();

      // Advance past debounce
      await vi.advanceTimersByTimeAsync(600);

      loaded = await loadWorkspaceState(storage);
      expect(loaded).not.toBeNull();
      // The last triggered state should win
      expect(loaded!.files).toHaveLength(2);
      expect(loaded!.activeTab).toBe('/src/b.ts');

      cancel();
      vi.useRealTimers();
    });

    it('should cancel pending saves', async () => {
      vi.useFakeTimers();
      const { trigger, cancel } = createDebouncedSave(storage);

      const state = makeWorkspaceState({
        files: [makeFileState()],
        activeTab: '/src/index.ts',
      });

      trigger(() => state);
      cancel();

      await vi.advanceTimersByTimeAsync(1000);

      const loaded = await loadWorkspaceState(storage);
      expect(loaded).toBeNull(); // Should not have been saved

      vi.useRealTimers();
    });
  });

  describe('removeFileFromState', () => {
    it('should remove a file from persisted state', async () => {
      const state = makeWorkspaceState({
        files: [
          makeFileState({ filePath: '/src/a.ts', label: 'a.ts' }),
          makeFileState({ filePath: '/src/b.ts', label: 'b.ts' }),
        ],
        activeTab: '/src/a.ts',
      });
      await storage.set('workspace-state', state);

      await removeFileFromState('/src/b.ts', storage);

      const loaded = await loadWorkspaceState(storage);
      expect(loaded!.files).toHaveLength(1);
      expect(loaded!.files[0].filePath).toBe('/src/a.ts');
      expect(loaded!.activeTab).toBe('/src/a.ts');
    });

    it('should update activeTab when the active file is removed', async () => {
      const state = makeWorkspaceState({
        files: [
          makeFileState({ filePath: '/src/a.ts', label: 'a.ts' }),
          makeFileState({ filePath: '/src/b.ts', label: 'b.ts' }),
        ],
        activeTab: '/src/a.ts',
      });
      await storage.set('workspace-state', state);

      await removeFileFromState('/src/a.ts', storage);

      const loaded = await loadWorkspaceState(storage);
      expect(loaded!.files).toHaveLength(1);
      expect(loaded!.activeTab).toBe('/src/b.ts');
    });

    it('should set activeTab to empty when the last file is removed', async () => {
      const state = makeWorkspaceState({
        files: [makeFileState({ filePath: '/src/a.ts', label: 'a.ts' })],
        activeTab: '/src/a.ts',
      });
      await storage.set('workspace-state', state);

      await removeFileFromState('/src/a.ts', storage);

      const loaded = await loadWorkspaceState(storage);
      expect(loaded!.files).toHaveLength(0);
      expect(loaded!.activeTab).toBe('');
    });

    it('should do nothing if no state exists', async () => {
      await expect(removeFileFromState('/src/missing.ts', storage)).resolves.toBeUndefined();
    });
  });

  describe('fileStillExists', () => {
    it('should return true for paths in the known set', () => {
      const known = new Set(['/src/a.ts', '/src/b.ts']);
      expect(fileStillExists('/src/a.ts', known)).toBe(true);
    });

    it('should return false for paths not in the known set', () => {
      const known = new Set(['/src/a.ts', '/src/b.ts']);
      expect(fileStillExists('/src/c.ts', known)).toBe(false);
    });

    it('should return false for an empty set', () => {
      expect(fileStillExists('/src/a.ts', new Set())).toBe(false);
    });
  });

  describe('createEmptyWorkspaceState', () => {
    it('should create a valid empty state', () => {
      const state = createEmptyWorkspaceState();
      expect(state.version).toBe(1);
      expect(state.files).toEqual([]);
      expect(state.activeTab).toBe('');
    });
  });

  describe('cursor and scroll persistence', () => {
    it('should persist and restore cursor positions', async () => {
      const state = makeWorkspaceState({
        files: [
          makeFileState({
            filePath: '/src/main.ts',
            label: 'main.ts',
            cursor: { line: 42, column: 15 },
            scroll: { scrollTop: 300, scrollLeft: 50 },
          }),
        ],
        activeTab: '/src/main.ts',
      });

      await storage.set('workspace-state', state);
      const loaded = await loadWorkspaceState(storage);

      expect(loaded!.files[0].cursor).toEqual({ line: 42, column: 15 });
      expect(loaded!.files[0].scroll).toEqual({ scrollTop: 300, scrollLeft: 50 });
    });

    it('should persist different cursor positions per file', async () => {
      const state = makeWorkspaceState({
        files: [
          makeFileState({
            filePath: '/src/a.ts',
            label: 'a.ts',
            cursor: { line: 1, column: 1 },
          }),
          makeFileState({
            filePath: '/src/b.ts',
            label: 'b.ts',
            cursor: { line: 100, column: 50 },
          }),
        ],
        activeTab: '/src/b.ts',
      });

      await storage.set('workspace-state', state);
      const loaded = await loadWorkspaceState(storage);

      expect(loaded!.files[0].cursor).toEqual({ line: 1, column: 1 });
      expect(loaded!.files[1].cursor).toEqual({ line: 100, column: 50 });
    });
  });
});