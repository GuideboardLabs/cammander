import { describe, it, expect } from 'vitest';
import { workspaceReducer } from '@/stores/WorkspaceContext';
import type { WorkspaceState, WorkspaceAction, OpenTab } from '@/types';
import { DEFAULT_CURSOR, DEFAULT_SCROLL } from '@/stores/WorkspaceContext';

function makeState(overrides: Partial<WorkspaceState> = {}): WorkspaceState {
  return {
    root: null,
    files: new Map(),
    openTabs: [],
    activeTab: '',
    ...overrides,
  };
}

function makeTab(overrides: Partial<OpenTab> = {}): OpenTab {
  return {
    filePath: '/src/index.ts',
    label: 'index.ts',
    modified: false,
    cursor: { line: 1, column: 1 },
    scroll: { scrollTop: 0, scrollLeft: 0 },
    ...overrides,
  };
}

describe('Workspace Reducer', () => {
  describe('SET_CURSOR', () => {
    it('should update cursor position for a tab', () => {
      const state = makeState({
        openTabs: [makeTab({ filePath: '/src/a.ts', label: 'a.ts' })],
        activeTab: '/src/a.ts',
      });
      const action: WorkspaceAction = {
        type: 'SET_CURSOR',
        filePath: '/src/a.ts',
        cursor: { line: 10, column: 5 },
      };
      const result = workspaceReducer(state, action);
      expect(result.openTabs[0].cursor).toEqual({ line: 10, column: 5 });
    });

    it('should not affect other tabs', () => {
      const state = makeState({
        openTabs: [
          makeTab({ filePath: '/src/a.ts', label: 'a.ts' }),
          makeTab({ filePath: '/src/b.ts', label: 'b.ts' }),
        ],
        activeTab: '/src/a.ts',
      });
      const action: WorkspaceAction = {
        type: 'SET_CURSOR',
        filePath: '/src/a.ts',
        cursor: { line: 20, column: 10 },
      };
      const result = workspaceReducer(state, action);
      expect(result.openTabs[0].cursor).toEqual({ line: 20, column: 10 });
      expect(result.openTabs[1].cursor).toEqual({ line: 1, column: 1 });
    });
  });

  describe('SET_SCROLL', () => {
    it('should update scroll position for a tab', () => {
      const state = makeState({
        openTabs: [makeTab({ filePath: '/src/a.ts', label: 'a.ts' })],
        activeTab: '/src/a.ts',
      });
      const action: WorkspaceAction = {
        type: 'SET_SCROLL',
        filePath: '/src/a.ts',
        scroll: { scrollTop: 500, scrollLeft: 100 },
      };
      const result = workspaceReducer(state, action);
      expect(result.openTabs[0].scroll).toEqual({ scrollTop: 500, scrollLeft: 100 });
    });
  });

  describe('RESTORE_STATE', () => {
    it('should replace the entire state', () => {
      const state = makeState();
      const restoredState: WorkspaceState = {
        root: null,
        files: new Map([['/src/app.ts', 'content']]),
        openTabs: [
          makeTab({
            filePath: '/src/app.ts',
            label: 'app.ts',
            cursor: { line: 42, column: 7 },
            scroll: { scrollTop: 300, scrollLeft: 20 },
          }),
        ],
        activeTab: '/src/app.ts',
      };
      const action: WorkspaceAction = {
        type: 'RESTORE_STATE',
        state: restoredState,
      };
      const result = workspaceReducer(state, action);
      expect(result.openTabs).toHaveLength(1);
      expect(result.openTabs[0].filePath).toBe('/src/app.ts');
      expect(result.openTabs[0].cursor).toEqual({ line: 42, column: 7 });
      expect(result.openTabs[0].scroll).toEqual({ scrollTop: 300, scrollLeft: 20 });
      expect(result.activeTab).toBe('/src/app.ts');
      expect(result.files.get('/src/app.ts')).toBe('content');
    });
  });

  describe('OPEN_TAB with cursor/scroll', () => {
    it('should fill default cursor/scroll when not provided', () => {
      const state = makeState();
      // Pass tab without cursor/scroll — reducer should fill defaults
      const action: WorkspaceAction = {
        type: 'OPEN_TAB',
        tab: {
          filePath: '/src/new.ts',
          label: 'new.ts',
          modified: false,
          cursor: { line: 1, column: 1 },
          scroll: { scrollTop: 0, scrollLeft: 0 },
        },
      };
      const result = workspaceReducer(state, action);
      expect(result.openTabs[0].cursor).toEqual(DEFAULT_CURSOR);
      expect(result.openTabs[0].scroll).toEqual(DEFAULT_SCROLL);
    });

    it('should preserve provided cursor/scroll', () => {
      const state = makeState();
      const action: WorkspaceAction = {
        type: 'OPEN_TAB',
        tab: {
          filePath: '/src/restored.ts',
          label: 'restored.ts',
          modified: false,
          cursor: { line: 100, column: 25 },
          scroll: { scrollTop: 500, scrollLeft: 30 },
        },
      };
      const result = workspaceReducer(state, action);
      expect(result.openTabs[0].cursor).toEqual({ line: 100, column: 25 });
      expect(result.openTabs[0].scroll).toEqual({ scrollTop: 500, scrollLeft: 30 });
    });
  });

  describe('CLOSE_TAB preserves other tab cursor/scroll', () => {
    it('should preserve cursor/scroll of remaining tabs after close', () => {
      const state = makeState({
        openTabs: [
          makeTab({
            filePath: '/src/a.ts',
            label: 'a.ts',
            cursor: { line: 5, column: 10 },
            scroll: { scrollTop: 100, scrollLeft: 0 },
          }),
          makeTab({
            filePath: '/src/b.ts',
            label: 'b.ts',
            cursor: { line: 50, column: 20 },
            scroll: { scrollTop: 500, scrollLeft: 30 },
          }),
        ],
        activeTab: '/src/b.ts',
      });
      const action: WorkspaceAction = { type: 'CLOSE_TAB', filePath: '/src/a.ts' };
      const result = workspaceReducer(state, action);
      expect(result.openTabs).toHaveLength(1);
      expect(result.openTabs[0].cursor).toEqual({ line: 50, column: 20 });
      expect(result.openTabs[0].scroll).toEqual({ scrollTop: 500, scrollLeft: 30 });
    });
  });
});