// ---------------------------------------------------------------------------
// Chat History Types
// ---------------------------------------------------------------------------

export interface PersistedChatMessage {
  /** Message role: user, assistant, system, or tool */
  role: 'system' | 'user' | 'assistant' | 'tool';
  /** Message content (text) */
  content: string;
  /** ISO 8601 timestamp */
  timestamp: string;
  /** Optional metadata (model used, latency, etc.) */
  metadata?: ChatMessageMetadata;
  /** Unique message ID for deduplication */
  id: string;
}

export interface ChatMessageMetadata {
  /** Model that generated this message */
  model?: string;
  /** Provider used (e.g., 'ollama-local') */
  provider?: string;
  /** Latency in ms */
  latencyMs?: number;
  /** Token count (if available) */
  tokenCount?: number;
  /** Whether this message was streamed */
  streamed?: boolean;
  /** Tool call IDs (if applicable) */
  toolCallId?: string;
}

export interface ChatHistoryState {
  /** Ordered array of chat messages */
  messages: PersistedChatMessage[];
  /** Unique session ID */
  sessionId: string;
  /** ISO 8601 creation timestamp */
  createdAt: string;
  /** ISO 8601 last-updated timestamp */
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// AI Context Types
// ---------------------------------------------------------------------------

export interface FileTreeSummary {
  /** Human-readable summary of the file tree */
  summary: string;
  /** Key file paths detected */
  keyPaths: string[];
  /** Total file count */
  fileCount: number;
  /** Total directory count */
  dirCount: number;
  /** ISO 8601 timestamp when this was generated */
  generatedAt: string;
}

export interface IndexedSymbol {
  /** Symbol name */
  name: string;
  /** Symbol kind (function, class, variable, etc.) */
  kind: string;
  /** File path where the symbol is defined */
  filePath: string;
  /** Line number (1-based) */
  line: number;
}

export interface AIContextState {
  /** Current git branch (if applicable) */
  branch?: string;
  /** Summary of the file tree structure */
  fileTreeSummary?: FileTreeSummary;
  /** Indexed symbols for context-aware completions */
  indexedSymbols?: IndexedSymbol[];
  /** Relevant file paths for the current context */
  relevantFilePaths?: string[];
  /** Context window state: selected files and their summaries */
  contextWindow?: ContextWindowState;
  /** ISO 8601 last-updated timestamp */
  updatedAt: string;
}

export interface ContextWindowState {
  /** File paths currently in the context window */
  activePaths: string[];
  /** Total estimated token count in the context window */
  estimatedTokens: number;
  /** Maximum context tokens */
  maxTokens: number;
}

// ---------------------------------------------------------------------------
// Storage Keys
// ---------------------------------------------------------------------------

/** Well-known storage keys for persistence */
export const STORAGE_KEYS = {
  CHAT_HISTORY: 'chat:history',
  CHAT_SESSION_PREFIX: 'chat:session:',
  AI_CONTEXT: 'ai:context',
  AI_CONTEXT_PREFIX: 'ai:context:',
} as const;

// ---------------------------------------------------------------------------
// Limits
// ---------------------------------------------------------------------------

export const CHAT_LIMITS = {
  /** Maximum number of messages to keep in persisted history */
  MAX_MESSAGES: 10_000,
  /** Maximum message content length in characters (truncate beyond this) */
  MAX_MESSAGE_LENGTH: 100_000,
  /** Number of messages to keep when truncating (oldest are dropped) */
  TRUNCATE_KEEP_RECENT: 5000,
} as const;

export const AI_CONTEXT_LIMITS = {
  /** Maximum number of indexed symbols */
  MAX_SYMBOLS: 50_000,
  /** Maximum number of relevant file paths */
  MAX_RELEVANT_PATHS: 200,
  /** Maximum context window estimated tokens */
  MAX_CONTEXT_TOKENS: 200_000,
} as const;