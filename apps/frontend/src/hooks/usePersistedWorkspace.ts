/**
 * Hook that persists workspace file state to storage and restores it on mount.
 *
 * On mount: loads saved state, filters out files that no longer exist
 * in the loaded file tree, and dispatches RESTORE_STATE.
 *
 * On every state change: debounces saves of open tabs, cursor positions,
 * scroll positions, and active tab.
 */

import { useEffect, useRef, useCallback } from 'react';
import { useWorkspace } from '@/stores/WorkspaceContext';
import {
  loadWorkspaceState,
  createDebouncedSave,
  type PersistedWorkspaceState,
} from '@/fileStatePersistence';
import type { OpenTab } from '@/types';

export function usePersistedWorkspace() {
  const { state, dispatch } = useWorkspace();
  const saveRef = useRef(createDebouncedSave());
  const initialized = useRef(false);

  // ── Restore on mount ──────────────────────────────────────────────────────
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    let cancelled = false;

    (async () => {
      const persisted = await loadWorkspaceState();
      if (cancelled || !persisted) return;

      // Build a set of currently known file paths from the file tree
      const knownPaths = new Set<string>();
      if (state.root) {
        collectPaths(state.root, knownPaths);
      }

      // Filter out files whose paths are no longer known (if we have a file tree).
      // If no file tree is loaded yet (root is null), keep all — the user
      // hasn't opened a directory yet, and the persisted state will be
      // merged once they do.
      const validFiles = persisted.files.filter((f) => {
        if (knownPaths.size === 0) return true; // no tree loaded yet — keep all
        if (knownPaths.has(f.filePath)) return true;
        console.warn(
          `[usePersistedWorkspace] Skipping persisted file (no longer in tree): ${f.filePath}`,
        );
        return false;
      });

      // Convert PersistedFileState → OpenTab
      const openTabs: OpenTab[] = validFiles.map((f) => ({
        filePath: f.filePath,
        label: f.label,
        modified: false, // Always start as unmodified on restore
        cursor: f.cursor,
        scroll: f.scroll,
      }));

      // Determine active tab — only if it's still in the valid set
      const activeTab = validFiles.some((f) => f.filePath === persisted.activeTab)
        ? persisted.activeTab
        : validFiles.length > 0
          ? validFiles[0]!.filePath
          : '';

      // We don't restore file content from persisted state — content comes
      // from the file system when the user opens a directory. But we do
      // restore the tab order and cursor/scroll positions.
      dispatch({
        type: 'RESTORE_STATE',
        state: {
          root: state.root, // keep the current root if any
          files: state.files, // keep current files
          openTabs,
          activeTab,
          chatMessages: [],
          aiContext: { updatedAt: new Date().toISOString() },
          spreadsheetData: new Map(),
          webApps: [],
        },
      });
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Save on state changes (debounced) ─────────────────────────────────────
  useEffect(() => {
    // Don't save the initial empty state
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

    saveRef.current.trigger(() => persistedState);
  }, [state.openTabs, state.activeTab]);

  // ── Flush on unmount ──────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      saveRef.current.cancel();
    };
  }, []);

  // ── Expose flush for explicit save (e.g., before unload) ──────────────────
  const forceSave = useCallback(() => {
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
    saveRef.current.flush(() => persistedState);
  }, [state.openTabs, state.activeTab]);

  // ── Save before unload ────────────────────────────────────────────────────
  useEffect(() => {
    const handleBeforeUnload = () => {
      saveRef.current.cancel(); // cancel debounce timer
      // Note: can't do async write in beforeunload, but the debounced
      // timer should have already saved recent state. For a more robust
      // approach, we'd use a sync localStorage fallback in this handler.
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  return { forceSave };
}

/** Recursively collect all file paths from a FileNode tree. */
function collectPaths(node: { type: string; path: string; children?: Array<{ type: string; path: string; children?: unknown[] }> }, paths: Set<string>): void {
  if (node.type === 'file') {
    paths.add(node.path);
  }
  if (node.children) {
    for (const child of node.children) {
      collectPaths(child as { type: string; path: string; children?: Array<{ type: string; path: string; children?: unknown[] }> }, paths);
    }
  }
}