/**
 * React Hook: useAppPersistence
 *
 * Unified persistence lifecycle hook that wires all persistence subsystems
 * into the application's React component tree:
 *
 * - On mount: restores file state, chat history, and AI context from storage
 * - On state changes: persists to storage (debounced for file state)
 * - On beforeunload: flushes pending writes via synchronous localStorage fallback
 * - Handles edge cases: corrupted data, quota exceeded, schema mismatch, concurrent tabs
 *
 * Usage in App.tsx:
 *   const { restored, loading, errors } = useAppPersistence();
 *   if (loading) return <LoadingScreen />;
 */

import { useEffect, useRef, useState } from 'react';
import { useWorkspace } from '@/stores/WorkspaceContext';
import {
  PersistenceCoordinator,
  getPersistenceCoordinator,
  type RestoredState,
  type PersistenceLifecycleOptions,
} from './lifecycle';
import type { PersistedWorkspaceState } from '@/fileStatePersistence';
import type { AIContext } from '@/types';

export interface UseAppPersistenceOptions extends PersistenceLifecycleOptions {
  /** Whether to auto-restore on mount (default: true) */
  autoRestore?: boolean;
}

export interface UseAppPersistenceReturn {
  /** Whether the hook is still initializing/restoring */
  loading: boolean;
  /** Errors encountered during restoration */
  errors: string[];
  /** The coordinator instance (null until initialized) */
  coordinator: PersistenceCoordinator | null;
  /** Whether a quota exceeded event was received */
  quotaExceeded: string | null;
  /** Whether a concurrent tab conflict was detected */
  concurrentTabDetected: boolean;
}

export function useAppPersistence(options: UseAppPersistenceOptions = {}): UseAppPersistenceReturn {
  const { autoRestore = true } = options;
  const { state, dispatch } = useWorkspace();

  const [loading, setLoading] = useState(true);
  const [errors, setErrors] = useState<string[]>([]);
  const [quotaExceeded, setQuotaExceeded] = useState<string | null>(null);
  const [concurrentTabDetected, setConcurrentTabDetected] = useState(false);

  const coordinatorRef = useRef<PersistenceCoordinator | null>(null);
  const initializedRef = useRef(false);

  // ── Restore on mount ──────────────────────────────────────────────────
  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    let cancelled = false;

    (async () => {
      const coordinator = getPersistenceCoordinator({
        onQuotaExceeded: (source) => {
          setQuotaExceeded(source);
        },
        onCorruptedData: (source) => {
          console.warn(`[useAppPersistence] Corrupted data detected: ${source}`);
        },
        onConcurrentTabConflict: (otherTabId) => {
          console.info(`[useAppPersistence] Concurrent tab detected: ${otherTabId}`);
          setConcurrentTabDetected(true);
        },
      });

      coordinatorRef.current = coordinator;

      // Register this tab for concurrent detection
      const otherTabs = coordinator.registerTab();
      if (otherTabs.length > 0) {
        setConcurrentTabDetected(true);
      }

      if (!autoRestore) {
        if (!cancelled) setLoading(false);
        return;
      }

      // Initialize and restore all state
      const restored: RestoredState = await coordinator.init();

      if (cancelled) return;

      // ── Restore file state ──────────────────────────────────────────
      if (restored.fileState && restored.fileState.files.length > 0) {
        // Check for emergency localStorage data (from a crash beforeunload)
        const emergency = coordinator.recoverEmergencyFileState();

        const fileStateToRestore = emergency ?? restored.fileState;

        // Convert to OpenTab format (don't restore content — loaded from FS)
        const openTabs = fileStateToRestore.files.map((f) => ({
          filePath: f.filePath,
          label: f.label,
          modified: false, // Always start unmodified on restore
          cursor: f.cursor,
          scroll: f.scroll,
        }));

        const activeTab = fileStateToRestore.files.some(
          (f) => f.filePath === fileStateToRestore.activeTab,
        )
          ? fileStateToRestore.activeTab
          : openTabs.length > 0
            ? openTabs[0]!.filePath
            : '';

        dispatch({
          type: 'RESTORE_STATE',
          state: {
            root: state.root,
            files: state.files,
            openTabs,
            activeTab,
            chatMessages: [],
            aiContext: { updatedAt: new Date().toISOString() },
            spreadsheetData: new Map(),
            webApps: [],
          },
        });
      }

      // ── Restore chat history ─────────────────────────────────────────
      if (restored.chatMessages.length > 0) {
        dispatch({
          type: 'SET_CHAT_MESSAGES',
          messages: restored.chatMessages,
        });
      }

      // ── Restore AI context ───────────────────────────────────────────
      if (restored.aiContext && Object.keys(restored.aiContext).length > 1) {
        dispatch({
          type: 'SET_AI_CONTEXT',
          context: restored.aiContext,
        });
      }

      if (restored.errors.length > 0) {
        setErrors(restored.errors);
      }

      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Persist file state changes (debounced) ────────────────────────────
  useEffect(() => {
    if (!coordinatorRef.current || loading) return;
    // Skip initial empty state
    if (state.openTabs.length === 0 && !state.activeTab) return;

    const persistedState: PersistedWorkspaceState = {
      version: 1,
      files: state.openTabs.map((tab) => ({
        filePath: tab.filePath,
        label: tab.label,
        modified: tab.modified,
        cursor: tab.cursor,
        scroll: tab.scroll,
        lastModified: Date.now(),
      })),
      activeTab: state.activeTab,
    };

    coordinatorRef.current.saveFileState(() => persistedState);
  }, [state.openTabs, state.activeTab, loading]);

  // ── Persist chat messages ─────────────────────────────────────────────
  const prevChatLenRef = useRef(0);
  useEffect(() => {
    if (!coordinatorRef.current || loading) return;

    const coordinator = coordinatorRef.current;
    const currentLen = state.chatMessages.length;

    // Only persist new messages (append, not full replace)
    if (currentLen > prevChatLenRef.current) {
      const newMessages = state.chatMessages.slice(prevChatLenRef.current);
      for (const msg of newMessages) {
        coordinator.saveChatMessage(msg);
      }
    } else if (currentLen === 0 && prevChatLenRef.current > 0) {
      // History was cleared
      coordinator.clearChatHistory('user-clear');
    }

    prevChatLenRef.current = currentLen;
  }, [state.chatMessages, loading]);

  // ── Persist AI context changes ────────────────────────────────────────
  const prevAIContextRef = useRef<AIContext | null>(null);
  useEffect(() => {
    if (!coordinatorRef.current || loading) return;

    const coordinator = coordinatorRef.current;
    const prev = prevAIContextRef.current;

    // On first run after restore, just store the reference
    if (prev === null) {
      prevAIContextRef.current = state.aiContext;
      return;
    }

    // Check what changed and persist only the changed fields
    if (state.aiContext.branch !== prev.branch) {
      coordinator.updateAIContextPartial('branch', state.aiContext.branch);
    }
    if (state.aiContext.fileTreeSummary !== prev.fileTreeSummary) {
      coordinator.updateAIContextPartial('fileTreeSummary', state.aiContext.fileTreeSummary);
    }
    if (state.aiContext.indexedSymbols !== prev.indexedSymbols) {
      coordinator.updateAIContextPartial('indexedSymbols', state.aiContext.indexedSymbols);
    }
    if (state.aiContext.relevantFilePaths !== prev.relevantFilePaths) {
      coordinator.updateAIContextPartial('relevantFilePaths', state.aiContext.relevantFilePaths);
    }
    if (state.aiContext.contextWindow !== prev.contextWindow) {
      coordinator.updateAIContextPartial('contextWindow', state.aiContext.contextWindow);
    }

    prevAIContextRef.current = state.aiContext;
  }, [state.aiContext, loading]);

  // ── Beforeunload: flush pending writes ────────────────────────────────
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (!coordinatorRef.current) return;

      const persistedState: PersistedWorkspaceState = {
        version: 1,
        files: state.openTabs.map((tab) => ({
          filePath: tab.filePath,
          label: tab.label,
          modified: tab.modified,
          cursor: tab.cursor,
          scroll: tab.scroll,
          lastModified: Date.now(),
        })),
        activeTab: state.activeTab,
      };

      coordinatorRef.current.flushBeforeUnload(() => persistedState);
      coordinatorRef.current.unregisterTab();
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [state.openTabs, state.activeTab]);

  // ── Listen for storage events from other tabs (concurrent detection) ──
  useEffect(() => {
    const handleStorageEvent = (event: StorageEvent) => {
      // Only care about our app's keys
      if (!event.key?.startsWith('cammander:')) return;

      // Another tab wrote to storage — last-write-wins is acceptable,
      // but we can log the conflict
      if (event.key === 'cammander:active-tabs') {
        // Another tab registered/unregistered
        setConcurrentTabDetected(true);
      }
    };

    window.addEventListener('storage', handleStorageEvent);
    return () => window.removeEventListener('storage', handleStorageEvent);
  }, []);

  // ── Cleanup on unmount ─────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (coordinatorRef.current) {
        coordinatorRef.current.unregisterTab();
      }
    };
  }, []);

  return {
    loading,
    errors,
    coordinator: coordinatorRef.current,
    quotaExceeded,
    concurrentTabDetected,
  };
}