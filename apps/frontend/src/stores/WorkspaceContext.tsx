import { createContext, useContext, useReducer, type Dispatch, type ReactNode } from 'react';
import type { WorkspaceState, WorkspaceAction, OpenTab, CursorPosition, ScrollPosition, AIContext } from '@/types';

const DEFAULT_CURSOR: CursorPosition = { line: 1, column: 1 };
const DEFAULT_SCROLL: ScrollPosition = { scrollTop: 0, scrollLeft: 0 };

const DEFAULT_AI_CONTEXT: AIContext = {
  updatedAt: new Date().toISOString(),
};

const SPREADSHEET_EXTENSIONS = new Set(['.csv', '.tsv', '.xls', '.xlsx']);

function isSpreadsheet(filename: string): boolean {
  const ext = filename.includes('.') ? '.' + filename.split('.').pop()!.toLowerCase() : '';
  return SPREADSHEET_EXTENSIONS.has(ext);
}

const initialState: WorkspaceState = {
  root: null,
  files: new Map(),
  openTabs: [],
  activeTab: '',
  chatMessages: [],
  aiContext: DEFAULT_AI_CONTEXT,
  spreadsheetData: new Map(),
  webApps: [],
  terminalTabs: [],
  activeTerminal: '',
};

export function workspaceReducer(state: WorkspaceState, action: WorkspaceAction): WorkspaceState {
  switch (action.type) {
    case 'SET_ROOT':
      return { ...state, root: action.root };

    case 'SET_FILES':
      return { ...state, files: action.files };

    case 'OPEN_TAB': {
      // Deduplicate — if tab already open, just activate it
      const existing = state.openTabs.find((t) => t.filePath === action.tab.filePath);
      if (existing) {
        return { ...state, activeTab: action.tab.filePath };
      }
      // Ensure tab has cursor/scroll defaults
      const tab: OpenTab = {
        ...action.tab,
        cursor: action.tab.cursor ?? DEFAULT_CURSOR,
        scroll: action.tab.scroll ?? DEFAULT_SCROLL,
        viewMode: action.tab.viewMode ?? (isSpreadsheet(action.tab.label) ? 'spreadsheet' : 'code'),
      };
      return {
        ...state,
        openTabs: [...state.openTabs, tab],
        activeTab: tab.filePath,
      };
    }

    case 'CLOSE_TAB': {
      const idx = state.openTabs.findIndex((t) => t.filePath === action.filePath);
      if (idx === -1) return state;

      const newTabs = state.openTabs.filter((t) => t.filePath !== action.filePath);
      let nextActive = state.activeTab;

      if (state.activeTab === action.filePath) {
        // Nearest-neighbor: prefer left, then right, then none
        if (newTabs.length === 0) {
          nextActive = '';
        } else if (idx > 0) {
          nextActive = newTabs[idx - 1]!.filePath;
        } else {
          nextActive = newTabs[0]!.filePath;
        }
      }

      return { ...state, openTabs: newTabs, activeTab: nextActive };
    }

    case 'SET_ACTIVE_TAB':
      return { ...state, activeTab: action.filePath };

    case 'UPDATE_FILE_CONTENT': {
      const newFiles = new Map(state.files);
      newFiles.set(action.filePath, action.content);
      return { ...state, files: newFiles };
    }

    case 'MARK_MODIFIED': {
      const newTabs = state.openTabs.map((t) =>
        t.filePath === action.filePath ? { ...t, modified: action.modified } : t,
      );
      return { ...state, openTabs: newTabs };
    }

    case 'SET_CURSOR': {
      const newTabs = state.openTabs.map((t) =>
        t.filePath === action.filePath ? { ...t, cursor: action.cursor } : t,
      );
      return { ...state, openTabs: newTabs };
    }

    case 'SET_SCROLL': {
      const newTabs = state.openTabs.map((t) =>
        t.filePath === action.filePath ? { ...t, scroll: action.scroll } : t,
      );
      return { ...state, openTabs: newTabs };
    }

    // ── Chat actions ──

    case 'ADD_CHAT_MESSAGE': {
      // Deduplicate by ID
      if (state.chatMessages.some((m) => m.id === action.message.id)) {
        return state;
      }
      return {
        ...state,
        chatMessages: [...state.chatMessages, action.message],
      };
    }

    case 'ADD_CHAT_MESSAGES': {
      // Deduplicate by ID
      const existingIds = new Set(state.chatMessages.map((m) => m.id));
      const newMessages = action.messages.filter((m) => !existingIds.has(m.id));
      return {
        ...state,
        chatMessages: [...state.chatMessages, ...newMessages],
      };
    }

    case 'APPEND_TO_LAST_ASSISTANT': {
      const messages = state.chatMessages;
      if (messages.length === 0) {
        return {
          ...state,
          chatMessages: [{
            id: `asst-${Date.now()}`,
            role: 'assistant',
            content: action.token,
            timestamp: new Date().toISOString(),
            metadata: { streamed: true },
          }],
        };
      }
      const last = messages[messages.length - 1]!;
      if (last.role === 'assistant') {
        const next = [...messages];
        next[next.length - 1] = {
          ...last,
          content: last.content + action.token,
          metadata: { ...last.metadata, streamed: true },
        };
        return { ...state, chatMessages: next };
      }
      return {
        ...state,
        chatMessages: [...messages, {
          id: `asst-${Date.now()}`,
          role: 'assistant',
          content: action.token,
          timestamp: new Date().toISOString(),
          metadata: { streamed: true },
        }],
      };
    }

    case 'CLEAR_CHAT_HISTORY':
      return { ...state, chatMessages: [] };

    case 'SET_CHAT_MESSAGES':
      return { ...state, chatMessages: action.messages };

    // ── AI context actions ──

    case 'SET_AI_CONTEXT':
      return { ...state, aiContext: action.context };

    case 'UPDATE_FILE_TREE_SUMMARY':
      return {
        ...state,
        aiContext: {
          ...state.aiContext,
          fileTreeSummary: action.summary,
          updatedAt: new Date().toISOString(),
        },
      };

    case 'UPDATE_INDEXED_SYMBOLS':
      return {
        ...state,
        aiContext: {
          ...state.aiContext,
          indexedSymbols: action.symbols,
          updatedAt: new Date().toISOString(),
        },
      };

    case 'UPDATE_RELEVANT_PATHS':
      return {
        ...state,
        aiContext: {
          ...state.aiContext,
          relevantFilePaths: action.paths,
          updatedAt: new Date().toISOString(),
        },
      };

    case 'UPDATE_BRANCH':
      return {
        ...state,
        aiContext: {
          ...state.aiContext,
          branch: action.branch,
          updatedAt: new Date().toISOString(),
        },
      };

    case 'UPDATE_CONTEXT_WINDOW':
      return {
        ...state,
        aiContext: {
          ...state.aiContext,
          contextWindow: action.window,
          updatedAt: new Date().toISOString(),
        },
      };

    case 'CLEAR_AI_CONTEXT':
      return { ...state, aiContext: { updatedAt: new Date().toISOString() } };

    case 'SET_SPREADSHEET_DATA': {
      const newSpreadsheetData = new Map(state.spreadsheetData);
      newSpreadsheetData.set(action.filePath, action.data);
      return { ...state, spreadsheetData: newSpreadsheetData };
    }

    case 'SET_ACTIVE_SHEET': {
      const existing = state.spreadsheetData.get(action.filePath);
      if (!existing) return state;
      const newSpreadsheetData = new Map(state.spreadsheetData);
      newSpreadsheetData.set(action.filePath, { ...existing, activeSheet: action.sheetName });
      return { ...state, spreadsheetData: newSpreadsheetData };
    }

    case 'SET_WEB_APPS':
      return { ...state, webApps: action.apps };

    // ── Terminal tab actions ──

    case 'ADD_TERMINAL_TAB': {
      if (state.terminalTabs.length >= 4) return state;
      if (state.terminalTabs.some((t) => t.slotId === action.tab.slotId)) return state;
      return {
        ...state,
        terminalTabs: [...state.terminalTabs, action.tab],
        activeTerminal: action.tab.slotId,
      };
    }

    case 'REMOVE_TERMINAL_TAB': {
      const newTabs = state.terminalTabs.filter((t) => t.slotId !== action.slotId);
      let nextActive = state.activeTerminal;
      if (state.activeTerminal === action.slotId) {
        nextActive = newTabs.length > 0 ? newTabs[newTabs.length - 1]!.slotId : '';
      }
      return { ...state, terminalTabs: newTabs, activeTerminal: nextActive };
    }

    case 'SET_ACTIVE_TERMINAL':
      return { ...state, activeTerminal: action.slotId };

    case 'UPDATE_TERMINAL_TAB': {
      const updated = state.terminalTabs.map((t) =>
        t.slotId === action.slotId ? { ...t, ...action.updates } : t,
      );
      return { ...state, terminalTabs: updated };
    }

    case 'SET_TERMINAL_TABS':
      return { ...state, terminalTabs: action.tabs, activeTerminal: action.tabs.length > 0 ? action.tabs[action.tabs.length - 1]!.slotId : '' };

    case 'RESTORE_STATE':
      return { ...action.state };

    default:
      return state;
  }
}

interface WorkspaceContextValue {
  state: WorkspaceState;
  dispatch: Dispatch<WorkspaceAction>;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(workspaceReducer, initialState);
  return (
    <WorkspaceContext.Provider value={{ state, dispatch }}>
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace(): WorkspaceContextValue {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error('useWorkspace must be used within a WorkspaceProvider');
  return ctx;
}

export { DEFAULT_CURSOR, DEFAULT_SCROLL, DEFAULT_AI_CONTEXT, SPREADSHEET_EXTENSIONS, isSpreadsheet };