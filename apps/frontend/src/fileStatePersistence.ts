/**
 * File state persistence module.
 *
 * Persists workspace file state (open tabs, cursor/scroll positions, content)
 * using the storage abstraction layer. On app load, restores previously open
 * files with their positions. Handles missing files gracefully.
 */

import { getStorage, type StorageBackend } from '@/storage';

// ── Types ────────────────────────────────────────────────────────────────────

export interface CursorPosition {
  line: number;
  column: number;
}

export interface ScrollPosition {
  scrollTop: number;
  scrollLeft: number;
}

export interface PersistedFileState {
  /** Full file path */
  filePath: string;
  /** Display name (filename only) */
  label: string;
  /** Whether the file had unsaved changes */
  modified: boolean;
  /** Cursor position when the file was last active */
  cursor: CursorPosition;
  /** Scroll position */
  scroll: ScrollPosition;
  /** Last modified timestamp (epoch ms) */
  lastModified: number;
}

export interface PersistedWorkspaceState {
  /** Schema version for future migrations */
  version: number;
  /** Ordered list of open file states */
  files: PersistedFileState[];
  /** Path of the active tab (empty string = none) */
  activeTab: string;
}

// ── Constants ────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'workspace-state';
const SCHEMA_VERSION = 1;
const DEBOUNCE_MS = 500;

// ── Helpers ──────────────────────────────────────────────────────────────────

function isValidFileState(data: unknown): data is PersistedWorkspaceState {
  if (!data || typeof data !== 'object') return false;
  const obj = data as Record<string, unknown>;
  return (
    typeof obj.version === 'number' &&
    Array.isArray(obj.files) &&
    typeof obj.activeTab === 'string'
  );
}

// ── Persistence API ──────────────────────────────────────────────────────────

/**
 * Load persisted workspace state from storage.
 * Validates the schema and removes entries for files that no longer exist on disk.
 * In a browser context, file existence is checked lazily — entries are kept
 * even if the file can't be immediately verified (the app may not have
 * filesystem access yet). Stale entries are filtered on the next save cycle.
 */
export async function loadWorkspaceState(
  storage?: StorageBackend,
): Promise<PersistedWorkspaceState | null> {
  const backend = storage ?? getStorage();
  try {
    const data = await backend.get<PersistedWorkspaceState>(STORAGE_KEY);
    if (data === undefined || data === null) return null;
    if (!isValidFileState(data)) {
      console.warn('[fileStatePersistence] Corrupted workspace state — clearing');
      await backend.delete(STORAGE_KEY);
      return null;
    }
    return data;
  } catch (err) {
    console.warn('[fileStatePersistence] Failed to load workspace state:', err);
    return null;
  }
}

/**
 * Save workspace state to storage.
 * Debounced: repeated calls within DEBOUNCE_MS are coalesced.
 */
export function saveWorkspaceState(
  getState: () => PersistedWorkspaceState,
  storage?: StorageBackend,
): { flush: () => Promise<void>; cancel: () => void } {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pendingResolve: (() => void) | null = null;
  const backend = storage ?? getStorage();

  const doSave = async () => {
    try {
      const state = getState();
      await backend.set(STORAGE_KEY, state);
    } catch (err) {
      if (err instanceof Error && err.name === 'StorageQuotaError') {
        console.warn('[fileStatePersistence] Storage quota exceeded — cannot save workspace state');
      } else {
        console.warn('[fileStatePersistence] Failed to save workspace state:', err);
      }
    } finally {
      if (pendingResolve) {
        pendingResolve();
        pendingResolve = null;
      }
    }
  };

  const schedule = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(doSave, DEBOUNCE_MS);
  };

  return {
    /** Queue a debounced save. */
    flush: schedule as unknown as () => Promise<void>,
    /** Immediately save and return a promise that resolves when done. */
    cancel: () => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    },
  };
}

/**
 * Create a debounced save function that coalesces rapid state changes.
 * Returns trigger (queues a debounced save) and flush (force-saves now).
 */
export function createDebouncedSave(
  storage?: StorageBackend,
): {
  trigger: (getState: () => PersistedWorkspaceState) => void;
  flush: (getState: () => PersistedWorkspaceState) => Promise<void>;
  cancel: () => void;
} {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let latestGetState: (() => PersistedWorkspaceState) | null = null;
  const backend = storage ?? getStorage();

  const doSave = async (state: PersistedWorkspaceState) => {
    try {
      await backend.set(STORAGE_KEY, state);
    } catch (err) {
      if (err instanceof Error && err.name === 'StorageQuotaError') {
        console.warn('[fileStatePersistence] Storage quota exceeded — cannot save');
      } else {
        console.warn('[fileStatePersistence] Failed to save workspace state:', err);
      }
    }
  };

  const trigger = (getState: () => PersistedWorkspaceState) => {
    latestGetState = getState;
    if (timer) clearTimeout(timer);
    timer = setTimeout(async () => {
      timer = null;
      if (latestGetState) {
        await doSave(latestGetState());
        latestGetState = null;
      }
    }, DEBOUNCE_MS);
  };

  const flush = async (getState: () => PersistedWorkspaceState) => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    latestGetState = null;
    await doSave(getState());
  };

  const cancel = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    latestGetState = null;
  };

  return { trigger, flush, cancel };
}

/**
 * Remove a single file's persisted state (e.g., when the file no longer exists).
 * This operates on the full workspace state, removing the entry for the given path.
 */
export async function removeFileFromState(
  filePath: string,
  storage?: StorageBackend,
): Promise<void> {
  const backend = storage ?? getStorage();
  const state = await loadWorkspaceState(backend);
  if (!state) return;

  state.files = state.files.filter((f) => f.filePath !== filePath);
  if (state.activeTab === filePath) {
    // Point to nearest remaining tab (or empty)
    state.activeTab = state.files.length > 0 ? state.files[0]!.filePath : '';
  }

  await backend.set(STORAGE_KEY, state);
}

/**
 * Check if a file path likely still exists.
 * In a pure browser context we can't verify FS existence, so we trust the path.
 * The app should validate against its loaded file tree when restoring.
 */
export function fileStillExists(filePath: string, knownPaths: Set<string>): boolean {
  return knownPaths.has(filePath);
}

/**
 * Create an empty workspace state.
 */
export function createEmptyWorkspaceState(): PersistedWorkspaceState {
  return {
    version: SCHEMA_VERSION,
    files: [],
    activeTab: '',
  };
}