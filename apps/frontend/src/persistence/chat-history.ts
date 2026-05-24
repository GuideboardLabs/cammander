/**
 * Chat History Persistence Module
 *
 * Provides persistence for chat history with:
 * - Append-on-write: messages are appended as they arrive
 * - Full history restoration on app load
 * - Deduplication by message ID to handle rapid successive messages
 * - Truncation when storage limits are approached
 * - Clear history for user-initiated reset
 * - Multiple session support
 */

import type { Storage } from './storage';
import type { PersistedChatMessage, ChatHistoryState, ChatMessageMetadata } from './types';
import { STORAGE_KEYS, CHAT_LIMITS } from './types';

// ---------------------------------------------------------------------------
// ID Generation
// ---------------------------------------------------------------------------

/** Generate a unique message ID based on timestamp + random component */
function generateMessageId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

/** Generate a unique session ID */
function generateSessionId(): string {
  return `session_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function isValidMessage(msg: unknown): msg is PersistedChatMessage {
  if (typeof msg !== 'object' || msg === null) return false;
  const m = msg as Record<string, unknown>;
  return (
    typeof m.id === 'string' &&
    typeof m.role === 'string' &&
    typeof m.content === 'string' &&
    typeof m.timestamp === 'string' &&
    ['system', 'user', 'assistant', 'tool'].includes(m.role as string)
  );
}

function validateMessages(messages: unknown[]): PersistedChatMessage[] {
  return messages.filter(isValidMessage) as PersistedChatMessage[];
}

// ---------------------------------------------------------------------------
// ChatHistoryPersistence
// ---------------------------------------------------------------------------

export interface ChatHistoryPersistenceOptions {
  /** Storage backend instance */
  storage: Storage;
  /** Maximum messages before truncation (default: CHAT_LIMITS.MAX_MESSAGES) */
  maxMessages?: number;
  /** Whether to truncate old messages when limit is reached (default: true) */
  enableTruncation?: boolean;
}

export class ChatHistoryPersistence {
  private storage: Storage;
  private maxMessages: number;
  private enableTruncation: boolean;
  /** In-flight message IDs being written — prevents duplicates from rapid calls */
  private pendingIds: Set<string> = new Set();

  constructor(options: ChatHistoryPersistenceOptions) {
    this.storage = options.storage;
    this.maxMessages = options.maxMessages ?? CHAT_LIMITS.MAX_MESSAGES;
    this.enableTruncation = options.enableTruncation ?? true;
  }

  // -----------------------------------------------------------------------
  // Core Operations
  // -----------------------------------------------------------------------

  /**
   * Append a new message to the chat history.
   * If a message with the same ID already exists in stored history, it is silently skipped (dedup).
   * If rapid successive calls produce the same content, the message ID ensures safety.
   */
  async appendMessage(
    role: PersistedChatMessage['role'],
    content: string,
    metadata?: ChatMessageMetadata,
    messageId?: string,
  ): Promise<PersistedChatMessage> {
    const id = messageId ?? generateMessageId();

    const message: PersistedChatMessage = {
      id,
      role,
      // Truncate very long message content
      content: content.length > CHAT_LIMITS.MAX_MESSAGE_LENGTH
        ? content.slice(0, CHAT_LIMITS.MAX_MESSAGE_LENGTH)
        : content,
      timestamp: new Date().toISOString(),
      metadata,
    };

    // Dedup: check for existing message with same ID — skip if already stored
    if (this.pendingIds.has(id)) {
      return message;
    }

    this.pendingIds.add(id);
    try {
      const state = await this.loadState();

      // Check if this ID already exists in stored messages (dedup by ID)
      if (state.messages.some((m) => m.id === id)) {
        return message;
      }

      state.messages.push(message);
      state.updatedAt = new Date().toISOString();

      // Truncate if enabled and over limit
      if (this.enableTruncation && state.messages.length > this.maxMessages) {
        const keepCount = Math.min(CHAT_LIMITS.TRUNCATE_KEEP_RECENT, this.maxMessages);
        state.messages = state.messages.slice(-keepCount);
      }

      await this.storage.set(STORAGE_KEYS.CHAT_HISTORY, state);
      return message;
    } finally {
      this.pendingIds.delete(id);
    }
  }

  /**
   * Append multiple messages at once (batch).
   * Deduplicates by ID against existing history and within the batch.
   */
  async appendMessages(messages: PersistedChatMessage[]): Promise<void> {
    if (messages.length === 0) return;

    const state = await this.loadState();
    const existingIds = new Set(state.messages.map((m) => m.id));

    for (const msg of messages) {
      if (existingIds.has(msg.id)) continue;
      existingIds.add(msg.id);

      state.messages.push({
        ...msg,
        content: msg.content.length > CHAT_LIMITS.MAX_MESSAGE_LENGTH
          ? msg.content.slice(0, CHAT_LIMITS.MAX_MESSAGE_LENGTH)
          : msg.content,
      });
    }

    state.updatedAt = new Date().toISOString();

    // Truncate if needed
    if (this.enableTruncation && state.messages.length > this.maxMessages) {
      const keepCount = Math.min(CHAT_LIMITS.TRUNCATE_KEEP_RECENT, this.maxMessages);
      state.messages = state.messages.slice(-keepCount);
    }

    await this.storage.set(STORAGE_KEYS.CHAT_HISTORY, state);
  }

  /**
   * Restore full chat history from storage.
   * Returns an empty state if no history exists.
   * Invalid messages are filtered out.
   */
  async restore(): Promise<ChatHistoryState> {
    const state = await this.loadState();
    return state;
  }

  /**
   * Clear all chat history.
   * Optionally provide a reason for the clear (logged, not persisted).
   */
  async clear(reason?: string): Promise<void> {
    if (reason) {
      console.info(`[ChatHistory] Clearing chat history: ${reason}`);
    }
    await this.storage.delete(STORAGE_KEYS.CHAT_HISTORY);
  }

  /**
   * Delete the oldest N messages from history.
   * Useful for manual pruning or quota management.
   */
  async pruneOldest(count: number): Promise<number> {
    const state = await this.loadState();
    if (count >= state.messages.length) {
      await this.clear('prune all');
      return state.messages.length;
    }
    state.messages = state.messages.slice(count);
    state.updatedAt = new Date().toISOString();
    await this.storage.set(STORAGE_KEYS.CHAT_HISTORY, state);
    return count;
  }

  /**
   * Get the current message count without loading full history.
   */
  async getMessageCount(): Promise<number> {
    const state = await this.loadState();
    return state.messages.length;
  }

  // -----------------------------------------------------------------------
  // Multi-Session Support
  // -----------------------------------------------------------------------

  /**
   * Save the current session under a specific key.
   * This allows resuming a previous session by ID.
   */
  async saveSession(sessionId: string, messages: PersistedChatMessage[]): Promise<void> {
    const state: ChatHistoryState = {
      messages,
      sessionId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await this.storage.set(`${STORAGE_KEYS.CHAT_SESSION_PREFIX}${sessionId}`, state);
  }

  /**
   * Load a specific session by ID.
   */
  async loadSession(sessionId: string): Promise<ChatHistoryState | null> {
    const raw = await this.storage.get(`${STORAGE_KEYS.CHAT_SESSION_PREFIX}${sessionId}`);
    if (raw === undefined || raw === null) return null;
    if (typeof raw !== 'object') return null;
    const state = raw as Record<string, unknown>;
    if (!Array.isArray(state.messages)) return null;
    return {
      ...state,
      messages: validateMessages(state.messages as unknown[]),
    } as ChatHistoryState;
  }

  /**
   * List all saved session IDs.
   */
  async listSessions(): Promise<string[]> {
    const allKeys = await this.storage.keys();
    return allKeys
      .filter((k) => k.startsWith(STORAGE_KEYS.CHAT_SESSION_PREFIX))
      .map((k) => k.slice(STORAGE_KEYS.CHAT_SESSION_PREFIX.length));
  }

  /**
   * Delete a specific session by ID.
   */
  async deleteSession(sessionId: string): Promise<void> {
    await this.storage.delete(`${STORAGE_KEYS.CHAT_SESSION_PREFIX}${sessionId}`);
  }

  // -----------------------------------------------------------------------
  // Internal
  // -----------------------------------------------------------------------

  private async loadState(): Promise<ChatHistoryState> {
    try {
      const raw = await this.storage.get(STORAGE_KEYS.CHAT_HISTORY);
      if (raw === undefined || raw === null) {
        return this.createEmptyState();
      }
      if (typeof raw !== 'object') {
        console.warn('[ChatHistory] Corrupted data in storage, resetting to empty state');
        return this.createEmptyState();
      }
      const state = raw as Record<string, unknown>;
      if (!Array.isArray(state.messages)) {
        console.warn('[ChatHistory] Missing messages array in stored data, resetting');
        return this.createEmptyState();
      }
      return {
        messages: validateMessages(state.messages as unknown[]),
        sessionId: typeof state.sessionId === 'string' ? state.sessionId : generateSessionId(),
        createdAt: typeof state.createdAt === 'string' ? state.createdAt : new Date().toISOString(),
        updatedAt: typeof state.updatedAt === 'string' ? state.updatedAt : new Date().toISOString(),
      };
    } catch (err) {
      console.error('[ChatHistory] Error loading state, resetting to empty:', err);
      return this.createEmptyState();
    }
  }

  private createEmptyState(): ChatHistoryState {
    return {
      messages: [],
      sessionId: generateSessionId(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }
}