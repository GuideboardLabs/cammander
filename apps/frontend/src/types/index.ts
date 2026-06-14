// ── File tree types ──

export interface FileNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: FileNode[];
  /** File size in bytes (files only) */
  size?: number;
  /** Last modified timestamp */
  mtime?: Date;
}

// ── Cursor / scroll types ──

export interface CursorPosition {
  line: number;
  column: number;
}

export interface ScrollPosition {
  scrollTop: number;
  scrollLeft: number;
}

// ── Tab types ──

export interface OpenTab {
  /** Full file path — also the unique key */
  filePath: string;
  /** Display name (filename only) */
  label: string;
  /** Whether the file has unsaved changes */
  modified: boolean;
  /** Cursor position (persisted, restored on reload) */
  cursor: CursorPosition;
  /** Scroll position (persisted, restored on reload) */
  scroll: ScrollPosition;
  /** How to display this file — 'code' (Monaco) or 'spreadsheet' (SheetJS table) */
  viewMode?: 'code' | 'spreadsheet';
}

// ── Spreadsheet types ──

export interface SpreadsheetData {
  sheetNames: string[];
  activeSheet: string;
  /** sheetName → 2D array of cell values (all strings) */
  sheets: Record<string, string[][]>;
}

// ── Web app types ──

export interface WebApp {
  name: string;
  url: string;
  description?: string;
  source: 'config' | 'auto';
}

// ── Language detection ──

export type LanguageId = string;

// ── Chat message types ──

export interface ChatMessage {
  id: string;
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  timestamp: string;
  metadata?: {
    model?: string;
    provider?: string;
    latencyMs?: number;
    tokenCount?: number;
    streamed?: boolean;
    toolCallId?: string;
  };
}

// ── AI context types ──

export interface FileTreeSummary {
  summary: string;
  keyPaths: string[];
  fileCount: number;
  dirCount: number;
  generatedAt: string;
}

export interface IndexedSymbol {
  name: string;
  kind: string;
  filePath: string;
  line: number;
}

export interface ContextWindowState {
  activePaths: string[];
  estimatedTokens: number;
  maxTokens: number;
}

export interface AIContext {
  branch?: string;
  fileTreeSummary?: FileTreeSummary;
  indexedSymbols?: IndexedSymbol[];
  relevantFilePaths?: string[];
  contextWindow?: ContextWindowState;
  updatedAt: string;
}

// ── Terminal tab types ──

export interface TerminalTab {
  /** Unique slot ID matching backend session key */
  slotId: string;
  /** Display label (e.g. "Terminal 1") */
  label: string;
  /** Whether this terminal is connected */
  connected: boolean;
  /** PID of the backend PTY process */
  pid: number | null;
}

// ── Workspace actions ──

export type WorkspaceAction =
  | { type: 'SET_ROOT'; root: FileNode | null }
  | { type: 'SET_FILES'; files: Map<string, string> }
  | { type: 'OPEN_TAB'; tab: OpenTab }
  | { type: 'CLOSE_TAB'; filePath: string }
  | { type: 'SET_ACTIVE_TAB'; filePath: string }
  | { type: 'UPDATE_FILE_CONTENT'; filePath: string; content: string }
  | { type: 'MARK_MODIFIED'; filePath: string; modified: boolean }
  | { type: 'SET_CURSOR'; filePath: string; cursor: CursorPosition }
  | { type: 'SET_SCROLL'; filePath: string; scroll: ScrollPosition }
  // Chat actions
  | { type: 'ADD_CHAT_MESSAGE'; message: ChatMessage }
  | { type: 'ADD_CHAT_MESSAGES'; messages: ChatMessage[] }
  | { type: 'APPEND_TO_LAST_ASSISTANT'; token: string }
  | { type: 'CLEAR_CHAT_HISTORY' }
  | { type: 'SET_CHAT_MESSAGES'; messages: ChatMessage[] }
  // AI context actions
  | { type: 'SET_AI_CONTEXT'; context: AIContext }
  | { type: 'UPDATE_FILE_TREE_SUMMARY'; summary: FileTreeSummary }
  | { type: 'UPDATE_INDEXED_SYMBOLS'; symbols: IndexedSymbol[] }
  | { type: 'UPDATE_RELEVANT_PATHS'; paths: string[] }
  | { type: 'UPDATE_BRANCH'; branch: string }
  | { type: 'UPDATE_CONTEXT_WINDOW'; window: ContextWindowState }
  | { type: 'CLEAR_AI_CONTEXT' }
  | { type: 'RESTORE_STATE'; state: WorkspaceState }
  // Spreadsheet actions
  | { type: 'SET_SPREADSHEET_DATA'; filePath: string; data: SpreadsheetData }
  | { type: 'SET_ACTIVE_SHEET'; filePath: string; sheetName: string }
  // Web app actions
  | { type: 'SET_WEB_APPS'; apps: WebApp[] }
  // Terminal tab actions
  | { type: 'ADD_TERMINAL_TAB'; tab: TerminalTab }
  | { type: 'REMOVE_TERMINAL_TAB'; slotId: string }
  | { type: 'SET_ACTIVE_TERMINAL'; slotId: string }
  | { type: 'UPDATE_TERMINAL_TAB'; slotId: string; updates: Partial<TerminalTab> }
  | { type: 'SET_TERMINAL_TABS'; tabs: TerminalTab[] };

// ── Workspace state ──

export interface WorkspaceState {
  /** Root of the file tree */
  root: FileNode | null;
  /** Map from filePath → file content (for open files) */
  files: Map<string, string>;
  /** Ordered list of open tabs */
  openTabs: OpenTab[];
  /** Path of the currently active tab (empty string = none) */
  activeTab: string;
  /** Chat message history */
  chatMessages: ChatMessage[];
  /** AI context data */
  aiContext: AIContext;
  /** Spreadsheet view data keyed by filePath */
  spreadsheetData: Map<string, SpreadsheetData>;
  /** Available web apps for current project */
  webApps: WebApp[];
  /** Terminal tabs (up to 4) */
  terminalTabs: TerminalTab[];
  /** Active terminal slot ID */
  activeTerminal: string;
}