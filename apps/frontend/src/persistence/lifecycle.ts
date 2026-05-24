/**
 * Unified Persistence Lifecycle
 *
 * Coordinates all persistence subsystems (file state, chat history, AI context)
 * into a single lifecycle: init, restore, save-on-change, flush-on-unload,
 * and edge-case handling (corrupted data, quota exceeded, schema migration,
 * concurrent tabs).
 *
 * This module is the integration point that task 1 (file state) and task 2
 * (chat/AI context) consume through a single hook in the app component.
 */

import { getStorage as getFileStateStorage, type StorageBackend } from '@/storage';
import {
  createStorage as createPersistenceStorage,
  type Storage as PersistenceStorage,
  QuotaExceededError,
} from './storage';
import { ChatHistoryPersistence } from './chat-history';
import { AIContextPersistence } from './ai-context';
import type {
  PersistedChatMessage,
  ChatHistoryState,
  AIContextState,
  FileTreeSummary,
  IndexedSymbol,
  ContextWindowState,
} from './types';
import {
  loadWorkspaceState,
  createDebouncedSave,
  type PersistedWorkspaceState,
} from '@/fileStatePersistence';
import type { AIContext, ChatMessage } from '@/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Unique tab identifier for concurrent-tab detection */
const TAB_ID = `tab_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

export interface RestoredState {
  /** File state: open tabs, cursors, scroll, active tab */
  fileState: PersistedWorkspaceState | null;
  /** Chat history messages */
  chatMessages: ChatMessage[];
  /** AI context */
  aiContext: AIContext;
  /** Whether any errors occurred during restoration */
  errors: string[];
  /** Tab ID for this instance */
  tabId: string;
}

export interface PersistenceLifecycleOptions {
  /** Called when storage quota is exceeded — allows the app to notify the user */
  onQuotaExceeded?: (source: string) => void;
  /** Called when corrupted data is found and reset */
  onCorruptedData?: (source: string) => void;
  /** Called when a concurrent tab conflict is detected */
  onConcurrentTabConflict?: (otherTabId: string) => void;
}

// ---------------------------------------------------------------------------
// Persistence Coordinator
// ---------------------------------------------------------------------------

export class PersistenceCoordinator {
  private fileStorage: StorageBackend;
  private chatStorage: PersistenceStorage | null = null;
  private aiContextStorage: PersistenceStorage | null = null;
  private chatPersistence: ChatHistoryPersistence | null = null;
  private aiContextPersistence: AIContextPersistence | null = null;
  private debouncedFileSave: ReturnType<typeof createDebouncedSave>;
  private options: PersistenceLifecycleOptions;
  private initialized = false;

  constructor(options: PersistenceLifecycleOptions = {}) {
    this.options = options;
    this.fileStorage = getFileStateStorage();
    this.debouncedFileSave = createDebouncedSave(this.fileStorage);
  }

  // -----------------------------------------------------------------------
  // Initialization
  // -----------------------------------------------------------------------

  /**
   * Initialize all persistence backends and restore state.
   * Should be called once on app startup, before rendering.
   */
  async init(): Promise<RestoredState> {
    const errors: string[] = [];

    // ── Restore file state ──────────────────────────────────────────────
    let fileState: PersistedWorkspaceState | null = null;
    try {
      fileState = await loadWorkspaceState(this.fileStorage);
      if (fileState && fileState.version !== 1) {
        // Schema version mismatch — attempt migration
        fileState = await this.migrateFileState(fileState);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn('[PersistenceCoordinator] Failed to load file state:', msg);
      errors.push(`file-state: ${msg}`);
      this.options.onCorruptedData?.('file-state');
      // Reset to clean state
      try { await this.fileStorage.delete('workspace-state'); } catch { /* ignore */ }
    }

    // ── Initialize chat/AI context storage ───────────────────────────────
    let chatMessages: ChatMessage[] = [];
    let aiContext: AIContext = { updatedAt: new Date().toISOString() };

    try {
      this.chatStorage = await createPersistenceStorage({
        dbName: 'cammander-chat',
        storeName: 'keyValue',
        schemaVersion: 1,
      });
      this.chatPersistence = new ChatHistoryPersistence({ storage: this.chatStorage });

      const chatState: ChatHistoryState = await this.chatPersistence.restore();
      chatMessages = chatState.messages.map(m => this.chatMessageToApp(m));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn('[PersistenceCoordinator] Failed to init chat persistence:', msg);
      errors.push(`chat: ${msg}`);
      this.options.onCorruptedData?.('chat');
    }

    try {
      this.aiContextStorage = await createPersistenceStorage({
        dbName: 'cammander-ai-context',
        storeName: 'keyValue',
        schemaVersion: 1,
      });
      this.aiContextPersistence = new AIContextPersistence({ storage: this.aiContextStorage });

      const storedCtx = await this.aiContextPersistence.restore();
      if (storedCtx) {
        aiContext = this.aiContextStateToApp(storedCtx);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn('[PersistenceCoordinator] Failed to init AI context persistence:', msg);
      errors.push(`ai-context: ${msg}`);
      this.options.onCorruptedData?.('ai-context');
    }

    this.initialized = true;

    return {
      fileState,
      chatMessages,
      aiContext,
      errors,
      tabId: TAB_ID,
    };
  }

  // -----------------------------------------------------------------------
  // File state persistence
  // -----------------------------------------------------------------------

  /**
   * Save file state (debounced). Called on every openTabs/activeTab change.
   */
  saveFileState(getState: () => PersistedWorkspaceState): void {
    if (!this.initialized) return;
    try {
      this.debouncedFileSave.trigger(getState);
    } catch (err) {
      this.handleQuotaError(err, 'file-state');
    }
  }

  /**
   * Force-flush all pending file state writes.
   */
  async flushFileState(getState: () => PersistedWorkspaceState): Promise<void> {
    try {
      await this.debouncedFileSave.flush(getState);
    } catch (err) {
      this.handleQuotaError(err, 'file-state');
    }
  }

  // -----------------------------------------------------------------------
  // Chat persistence
  // -----------------------------------------------------------------------

  /**
   * Persist a chat message.
   */
  async saveChatMessage(message: ChatMessage): Promise<void> {
    if (!this.chatPersistence) return;
    try {
      await this.chatPersistence.appendMessage(
        message.role,
        message.content,
        message.metadata,
        message.id,
      );
    } catch (err) {
      this.handleQuotaError(err, 'chat');
    }
  }

  /**
   * Persist multiple chat messages.
   */
  async saveChatMessages(messages: PersistedChatMessage[]): Promise<void> {
    if (!this.chatPersistence) return;
    try {
      await this.chatPersistence.appendMessages(messages);
    } catch (err) {
      this.handleQuotaError(err, 'chat');
    }
  }

  /**
   * Clear chat history in persistence.
   */
  async clearChatHistory(reason?: string): Promise<void> {
    if (!this.chatPersistence) return;
    try {
      await this.chatPersistence.clear(reason);
    } catch (err) {
      this.handleQuotaError(err, 'chat');
    }
  }

  /**
   * Prune oldest chat messages to free storage space.
   */
  async pruneOldestChatMessages(count: number): Promise<number> {
    if (!this.chatPersistence) return 0;
    try {
      return await this.chatPersistence.pruneOldest(count);
    } catch (err) {
      this.handleQuotaError(err, 'chat');
      return 0;
    }
  }

  // -----------------------------------------------------------------------
  // AI context persistence
  // -----------------------------------------------------------------------

  /**
   * Save full AI context.
   */
  async saveAIContext(context: AIContextState): Promise<void> {
    if (!this.aiContextPersistence) return;
    try {
      await this.aiContextPersistence.save(context);
    } catch (err) {
      this.handleQuotaError(err, 'ai-context');
    }
  }

  /**
   * Update a partial AI context field.
   */
  async updateAIContextPartial(
    field: 'fileTreeSummary' | 'indexedSymbols' | 'relevantFilePaths' | 'contextWindow' | 'branch',
    value: unknown,
  ): Promise<void> {
    if (!this.aiContextPersistence) return;
    try {
      switch (field) {
        case 'fileTreeSummary':
          await this.aiContextPersistence.updateFileTreeSummary(value as FileTreeSummary);
          break;
        case 'indexedSymbols':
          await this.aiContextPersistence.updateIndexedSymbols(value as IndexedSymbol[]);
          break;
        case 'relevantFilePaths':
          await this.aiContextPersistence.updateRelevantPaths(value as string[]);
          break;
        case 'contextWindow':
          await this.aiContextPersistence.updateContextWindow(value as ContextWindowState);
          break;
        case 'branch':
          await this.aiContextPersistence.updateBranch(value as string);
          break;
      }
    } catch (err) {
      this.handleQuotaError(err, 'ai-context');
    }
  }

  /**
   * Clear AI context persistence.
   */
  async clearAIContext(): Promise<void> {
    if (!this.aiContextPersistence) return;
    try {
      await this.aiContextPersistence.clear();
    } catch (err) {
      this.handleQuotaError(err, 'ai-context');
    }
  }

  /**
   * Handle repo change — clears stale cached AI context data.
   */
  async handleRepoChange(newBranch?: string): Promise<void> {
    if (!this.aiContextPersistence) return;
    try {
      await this.aiContextPersistence.handleRepoChange(newBranch);
    } catch (err) {
      this.handleQuotaError(err, 'ai-context');
    }
  }

  // -----------------------------------------------------------------------
  // Before-unload flush
  // -----------------------------------------------------------------------

  /**
   * Flush all pending writes. Call from beforeunload handler.
   * For sync paths: writes to localStorage as a fast fallback.
   * For async paths: cancels debounce timers — the last debounced save
   * should have already captured recent state.
   */
  flushBeforeUnload(getFileState: () => PersistedWorkspaceState): void {
    // File state: cancel debounce and try a synchronous localStorage write
    this.debouncedFileSave.cancel();

    // Write file state to localStorage synchronously as a safety net
    try {
      const state = getFileState();
      localStorage.setItem(
        'cammander:workspace-state-emergency',
        JSON.stringify(state),
      );
    } catch {
      // Quota or other error — nothing we can do in beforeunload
    }

    // Chat and AI context persistence are not debounced at this level;
    // they write immediately on each change. No flush needed.
  }

  /**
   * On app startup, check for emergency localStorage data and merge it.
   */
  recoverEmergencyFileState(): PersistedWorkspaceState | null {
    try {
      const raw = localStorage.getItem('cammander:workspace-state-emergency');
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (data && typeof data === 'object' && typeof data.version === 'number' && Array.isArray(data.files)) {
        // Clear emergency data after recovery
        localStorage.removeItem('cammander:workspace-state-emergency');
        return data as PersistedWorkspaceState;
      }
      localStorage.removeItem('cammander:workspace-state-emergency');
    } catch {
      localStorage.removeItem('cammander:workspace-state-emergency');
    }
    return null;
  }

  // -----------------------------------------------------------------------
  // Concurrent tab detection
  // -----------------------------------------------------------------------

  /**
   * Register this tab's presence and detect other tabs.
   * Uses localStorage for cross-tab communication since storage events
   * are broadcast to other tabs.
   */
  registerTab(): string[] {
    const key = 'cammander:active-tabs';
    try {
      let tabs: string[] = [];
      const raw = localStorage.getItem(key);
      if (raw) {
        try { tabs = JSON.parse(raw); } catch { tabs = []; }
      }
      // Filter out stale tabs (older than 30 seconds)
      const now = Date.now();
      tabs = tabs.filter((t: string) => {
        const parts = t.split('_');
        if (parts.length >= 2) {
          const ts = parseInt(parts[1] ?? '', 10);
          if (!isNaN(ts)) {
            return now - ts < 30_000; // keep only if less than 30s old
          }
        }
        return true; // keep if we can't parse timestamp
      });

      const otherTabs = tabs.filter((t: string) => t !== TAB_ID);
      tabs.push(TAB_ID);
      localStorage.setItem(key, JSON.stringify(tabs));
      return otherTabs;
    } catch {
      return [];
    }
  }

  /**
   * Unregister this tab on unload.
   */
  unregisterTab(): void {
    const key = 'cammander:active-tabs';
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        let tabs: string[];
        try { tabs = JSON.parse(raw); } catch { return; }
        tabs = tabs.filter((t: string) => t !== TAB_ID);
        if (tabs.length > 0) {
          localStorage.setItem(key, JSON.stringify(tabs));
        } else {
          localStorage.removeItem(key);
        }
      }
    } catch {
      // Ignore
    }
  }

  /**
   * Get the current tab ID.
   */
  getTabId(): string {
    return TAB_ID;
  }

  // -----------------------------------------------------------------------
  // Cleanup
  // -----------------------------------------------------------------------

  /**
   * Dispose all storage connections.
   */
  async dispose(): Promise<void> {
    this.debouncedFileSave.cancel();
    if (this.chatStorage) {
      try { await this.chatStorage.close(); } catch { /* ignore */ }
    }
    if (this.aiContextStorage) {
      try { await this.aiContextStorage.close(); } catch { /* ignore */ }
    }
    this.unregisterTab();
  }

  // -----------------------------------------------------------------------
  // Internal helpers
  // -----------------------------------------------------------------------

  private async migrateFileState(
    state: PersistedWorkspaceState,
  ): Promise<PersistedWorkspaceState> {
    // Currently only version 1 exists, so any other version is unrecognized.
    // Reset to clean state for forward compatibility.
    if (state.version > 1) {
      console.warn(
        `[PersistenceCoordinator] Future schema version ${state.version} — resetting to clean state`,
      );
      this.options.onCorruptedData?.('file-state');
      try { await this.fileStorage.delete('workspace-state'); } catch { /* ignore */ }
      return { version: 1, files: [], activeTab: '' };
    }

    // Version 0 → 1 migration (shouldn't exist in practice, but handle it)
    if (state.version === 0) {
      console.info('[PersistenceCoordinator] Migrating schema v0 → v1');
      const migrated: PersistedWorkspaceState = {
        version: 1,
        files: state.files.map(f => ({
          ...f,
          cursor: f.cursor ?? { line: 1, column: 1 },
          scroll: f.scroll ?? { scrollTop: 0, scrollLeft: 0 },
          lastModified: f.lastModified ?? Date.now(),
        })),
        activeTab: state.activeTab ?? '',
      };
      try {
        await this.fileStorage.set('workspace-state', migrated);
      } catch {
        // If save fails, just return the migrated state in memory
      }
      return migrated;
    }

    return state;
  }

  private handleQuotaError(err: unknown, source: string): void {
    const isQuotaError =
      err instanceof QuotaExceededError ||
      (err instanceof Error && err.name === 'StorageQuotaError') ||
      (err instanceof Error && err.name === 'QuotaExceededError');

    if (isQuotaError) {
      console.warn(`[PersistenceCoordinator] Storage quota exceeded for ${source}`);
      this.options.onQuotaExceeded?.(source);

      // Attempt to prune oldest data to free space
      this.atemptPruneForQuota(source);
    } else {
      console.warn(`[PersistenceCoordinator] Error persisting ${source}:`, err);
    }
  }

  private async atemptPruneForQuota(source: string): Promise<void> {
    try {
      if (source === 'chat' && this.chatPersistence) {
        // Prune oldest 100 messages
        await this.chatPersistence.pruneOldest(100);
      } else if (source === 'ai-context' && this.aiContextPersistence) {
        // Clear stale indexed symbols (often the largest data)
        await this.aiContextPersistence.updateIndexedSymbols([]);
      } else if (source === 'file-state') {
        // File state is relatively small; just warn
        console.info('[PersistenceCoordinator] File state quota exceeded — consider closing some tabs');
      }
    } catch {
      // If pruning also fails, nothing more we can do
    }
  }

  private chatMessageToApp(msg: PersistedChatMessage): ChatMessage {
    return {
      id: msg.id,
      role: msg.role,
      content: msg.content,
      timestamp: msg.timestamp,
      metadata: msg.metadata,
    };
  }

  private aiContextStateToApp(state: AIContextState): AIContext {
    return {
      branch: state.branch,
      fileTreeSummary: state.fileTreeSummary,
      indexedSymbols: state.indexedSymbols,
      relevantFilePaths: state.relevantFilePaths,
      contextWindow: state.contextWindow,
      updatedAt: state.updatedAt,
    };
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

let _coordinator: PersistenceCoordinator | null = null;

export function getPersistenceCoordinator(
  options?: PersistenceLifecycleOptions,
): PersistenceCoordinator {
  if (!_coordinator) {
    _coordinator = new PersistenceCoordinator(options);
  }
  return _coordinator;
}

export function resetPersistenceCoordinator(): void {
  if (_coordinator) {
    _coordinator.dispose();
    _coordinator = null;
  }
}