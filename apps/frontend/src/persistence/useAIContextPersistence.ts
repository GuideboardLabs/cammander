/**
 * React Hook: useAIContextPersistence
 *
 * Provides convenient access to AI context persistence from React components.
 * Manages the lifecycle of the AIContextPersistence instance and
 * auto-loads context on mount.
 *
 * Usage:
 *   const { context, updateFileTreeSummary, updateBranch, clearContext } = useAIContextPersistence();
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { createStorage, type Storage } from './storage';
import { AIContextPersistence } from './ai-context';
import type {
  AIContextState,
  FileTreeSummary,
  IndexedSymbol,
  ContextWindowState,
} from './types';
import { AI_CONTEXT_LIMITS } from './types';

export interface UseAIContextPersistenceOptions {
  /** Storage backend DB name (default: 'cammander') */
  dbName?: string;
  /** Storage backend store name (default: 'aiContext') */
  storeName?: string;
  /** Maximum number of indexed symbols */
  maxSymbols?: number;
  /** Maximum number of relevant file paths */
  maxRelevantPaths?: number;
  /** Whether to auto-restore context on mount (default: true) */
  autoRestore?: boolean;
}

export interface UseAIContextPersistenceReturn {
  /** Current AI context state */
  context: AIContextState | null;
  /** Whether the hook is still initializing */
  loading: boolean;
  /** Error message if initialization or operation failed */
  error: string | null;
  /** Save full context (overwrites existing) */
  saveContext: (context: AIContextState) => Promise<void>;
  /** Restore context from storage */
  restoreContext: () => Promise<AIContextState | null>;
  /** Clear all AI context */
  clearContext: () => Promise<void>;
  /** Update file tree summary */
  updateFileTreeSummary: (summary: FileTreeSummary) => Promise<void>;
  /** Update indexed symbols */
  updateIndexedSymbols: (symbols: IndexedSymbol[]) => Promise<void>;
  /** Update relevant file paths */
  updateRelevantPaths: (paths: string[]) => Promise<void>;
  /** Update context window state */
  updateContextWindow: (window: ContextWindowState) => Promise<void>;
  /** Update git branch */
  updateBranch: (branch: string) => Promise<void>;
  /** Handle repo change (clears stale cached data) */
  handleRepoChange: (newBranch?: string) => Promise<void>;
  /** Add relevant file paths (deduplicates) */
  addRelevantPaths: (paths: string[]) => Promise<void>;
  /** Remove relevant file paths */
  removeRelevantPaths: (paths: string[]) => Promise<void>;
  /** Save context for a specific project key */
  saveForProject: (projectKey: string, context: AIContextState) => Promise<void>;
  /** Load context for a specific project key */
  loadForProject: (projectKey: string) => Promise<AIContextState | null>;
  /** Delete context for a specific project */
  deleteForProject: (projectKey: string) => Promise<void>;
}

export function useAIContextPersistence(
  options: UseAIContextPersistenceOptions = {},
): UseAIContextPersistenceReturn {
  const {
    dbName = 'cammander',
    storeName = 'aiContext',
    maxSymbols = AI_CONTEXT_LIMITS.MAX_SYMBOLS,
    maxRelevantPaths = AI_CONTEXT_LIMITS.MAX_RELEVANT_PATHS,
    autoRestore = true,
  } = options;

  const [context, setContext] = useState<AIContextState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const persistenceRef = useRef<AIContextPersistence | null>(null);
  const storageRef = useRef<Storage | null>(null);

  // Initialize storage and persistence on mount
  useEffect(() => {
    let mounted = true;

    async function init() {
      try {
        const storage = await createStorage({ dbName, storeName });
        if (!mounted) return;

        storageRef.current = storage;
        persistenceRef.current = new AIContextPersistence({
          storage,
          maxSymbols,
          maxRelevantPaths,
        });

        if (autoRestore) {
          const ctx = await persistenceRef.current.restore();
          if (mounted) {
            setContext(ctx);
          }
        }

        if (mounted) {
          setLoading(false);
        }
      } catch (err) {
        if (mounted) {
          setError(err instanceof Error ? err.message : 'Failed to initialize AI context persistence');
          setLoading(false);
        }
      }
    }

    init();

    return () => {
      mounted = false;
      storageRef.current?.close();
    };
  }, [dbName, storeName, maxSymbols, maxRelevantPaths, autoRestore]);

  const refresh = useCallback(async () => {
    if (!persistenceRef.current) return;
    const ctx = await persistenceRef.current.restore();
    setContext(ctx);
  }, []);

  const saveContext = useCallback(async (ctx: AIContextState) => {
    if (!persistenceRef.current) throw new Error('AI context persistence not initialized');
    await persistenceRef.current.save(ctx);
    await refresh();
  }, [refresh]);

  const restoreContext = useCallback(async () => {
    if (!persistenceRef.current) throw new Error('AI context persistence not initialized');
    const ctx = await persistenceRef.current.restore();
    setContext(ctx);
    return ctx;
  }, []);

  const clearContext = useCallback(async () => {
    if (!persistenceRef.current) throw new Error('AI context persistence not initialized');
    await persistenceRef.current.clear();
    setContext(null);
  }, []);

  const updateFileTreeSummary = useCallback(async (summary: FileTreeSummary) => {
    if (!persistenceRef.current) throw new Error('AI context persistence not initialized');
    await persistenceRef.current.updateFileTreeSummary(summary);
    await refresh();
  }, [refresh]);

  const updateIndexedSymbols = useCallback(async (symbols: IndexedSymbol[]) => {
    if (!persistenceRef.current) throw new Error('AI context persistence not initialized');
    await persistenceRef.current.updateIndexedSymbols(symbols);
    await refresh();
  }, [refresh]);

  const updateRelevantPaths = useCallback(async (paths: string[]) => {
    if (!persistenceRef.current) throw new Error('AI context persistence not initialized');
    await persistenceRef.current.updateRelevantPaths(paths);
    await refresh();
  }, [refresh]);

  const updateContextWindow = useCallback(async (window: ContextWindowState) => {
    if (!persistenceRef.current) throw new Error('AI context persistence not initialized');
    await persistenceRef.current.updateContextWindow(window);
    await refresh();
  }, [refresh]);

  const updateBranch = useCallback(async (branch: string) => {
    if (!persistenceRef.current) throw new Error('AI context persistence not initialized');
    await persistenceRef.current.updateBranch(branch);
    await refresh();
  }, [refresh]);

  const handleRepoChange = useCallback(async (newBranch?: string) => {
    if (!persistenceRef.current) throw new Error('AI context persistence not initialized');
    await persistenceRef.current.handleRepoChange(newBranch);
    await refresh();
  }, [refresh]);

  const addRelevantPaths = useCallback(async (paths: string[]) => {
    if (!persistenceRef.current) throw new Error('AI context persistence not initialized');
    await persistenceRef.current.addRelevantPaths(paths);
    await refresh();
  }, [refresh]);

  const removeRelevantPaths = useCallback(async (paths: string[]) => {
    if (!persistenceRef.current) throw new Error('AI context persistence not initialized');
    await persistenceRef.current.removeRelevantPaths(paths);
    await refresh();
  }, [refresh]);

  const saveForProject = useCallback(async (projectKey: string, ctx: AIContextState) => {
    if (!persistenceRef.current) throw new Error('AI context persistence not initialized');
    await persistenceRef.current.saveForProject(projectKey, ctx);
  }, []);

  const loadForProject = useCallback(async (projectKey: string) => {
    if (!persistenceRef.current) throw new Error('AI context persistence not initialized');
    return persistenceRef.current.loadForProject(projectKey);
  }, []);

  const deleteForProject = useCallback(async (projectKey: string) => {
    if (!persistenceRef.current) throw new Error('AI context persistence not initialized');
    await persistenceRef.current.deleteForProject(projectKey);
  }, []);

  return {
    context,
    loading,
    error,
    saveContext,
    restoreContext,
    clearContext,
    updateFileTreeSummary,
    updateIndexedSymbols,
    updateRelevantPaths,
    updateContextWindow,
    updateBranch,
    handleRepoChange,
    addRelevantPaths,
    removeRelevantPaths,
    saveForProject,
    loadForProject,
    deleteForProject,
  };
}