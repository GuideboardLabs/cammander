/**
 * React Hook: useChatPersistence
 *
 * Provides convenient access to chat history persistence from React components.
 * Manages the lifecycle of the ChatHistoryPersistence instance and
 * auto-initializes storage on mount.
 *
 * Usage:
 *   const { appendMessage, restoreHistory, clearHistory, messageCount } = useChatPersistence();
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { createStorage, type Storage } from './storage';
import { ChatHistoryPersistence } from './chat-history';
import type { PersistedChatMessage, ChatHistoryState, ChatMessageMetadata } from './types';
import { CHAT_LIMITS } from './types';

export interface UseChatPersistenceOptions {
  /** Storage backend DB name (default: 'cammander') */
  dbName?: string;
  /** Storage backend store name (default: 'chatHistory') */
  storeName?: string;
  /** Maximum messages before truncation */
  maxMessages?: number;
  /** Whether to enable truncation (default: true) */
  enableTruncation?: boolean;
  /** Whether to auto-restore history on mount (default: true) */
  autoRestore?: boolean;
}

export interface UseChatPersistenceReturn {
  /** Current chat history state */
  history: ChatHistoryState | null;
  /** Whether the hook is still initializing */
  loading: boolean;
  /** Error message if initialization or operation failed */
  error: string | null;
  /** Append a new message to the chat history */
  appendMessage: (
    role: PersistedChatMessage['role'],
    content: string,
    metadata?: ChatMessageMetadata,
    messageId?: string,
  ) => Promise<PersistedChatMessage>;
  /** Append multiple messages at once */
  appendMessages: (messages: PersistedChatMessage[]) => Promise<void>;
  /** Restore full chat history from storage */
  restoreHistory: () => Promise<ChatHistoryState>;
  /** Clear all chat history */
  clearHistory: (reason?: string) => Promise<void>;
  /** Delete the oldest N messages */
  pruneOldest: (count: number) => Promise<number>;
  /** Current message count */
  messageCount: number;
  /** Save current session under a specific ID */
  saveSession: (sessionId: string, messages: PersistedChatMessage[]) => Promise<void>;
  /** Load a specific session by ID */
  loadSession: (sessionId: string) => Promise<ChatHistoryState | null>;
  /** List all saved session IDs */
  listSessions: () => Promise<string[]>;
  /** Delete a specific session */
  deleteSession: (sessionId: string) => Promise<void>;
}

export function useChatPersistence(options: UseChatPersistenceOptions = {}): UseChatPersistenceReturn {
  const {
    dbName = 'cammander',
    storeName = 'chatHistory',
    maxMessages = CHAT_LIMITS.MAX_MESSAGES,
    enableTruncation = true,
    autoRestore = true,
  } = options;

  const [history, setHistory] = useState<ChatHistoryState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [messageCount, setMessageCount] = useState(0);

  const persistenceRef = useRef<ChatHistoryPersistence | null>(null);
  const storageRef = useRef<Storage | null>(null);

  // Initialize storage and persistence on mount
  useEffect(() => {
    let mounted = true;

    async function init() {
      try {
        const storage = await createStorage({ dbName, storeName });
        if (!mounted) return;

        storageRef.current = storage;
        persistenceRef.current = new ChatHistoryPersistence({
          storage,
          maxMessages,
          enableTruncation,
        });

        if (autoRestore) {
          const state = await persistenceRef.current.restore();
          if (mounted) {
            setHistory(state);
            setMessageCount(state.messages.length);
          }
        }

        if (mounted) {
          setLoading(false);
        }
      } catch (err) {
        if (mounted) {
          setError(err instanceof Error ? err.message : 'Failed to initialize chat persistence');
          setLoading(false);
        }
      }
    }

    init();

    return () => {
      mounted = false;
      // Close storage connection on unmount
      storageRef.current?.close();
    };
  }, [dbName, storeName, maxMessages, enableTruncation, autoRestore]);

  const appendMessage = useCallback(
    async (
      role: PersistedChatMessage['role'],
      content: string,
      metadata?: ChatMessageMetadata,
      messageId?: string,
    ) => {
      if (!persistenceRef.current) throw new Error('Chat persistence not initialized');
      const msg = await persistenceRef.current.appendMessage(role, content, metadata, messageId);
      const state = await persistenceRef.current.restore();
      setHistory(state);
      setMessageCount(state.messages.length);
      return msg;
    },
    [],
  );

  const appendMessages = useCallback(async (messages: PersistedChatMessage[]) => {
    if (!persistenceRef.current) throw new Error('Chat persistence not initialized');
    await persistenceRef.current.appendMessages(messages);
    const state = await persistenceRef.current.restore();
    setHistory(state);
    setMessageCount(state.messages.length);
  }, []);

  const restoreHistory = useCallback(async () => {
    if (!persistenceRef.current) throw new Error('Chat persistence not initialized');
    const state = await persistenceRef.current.restore();
    setHistory(state);
    setMessageCount(state.messages.length);
    return state;
  }, []);

  const clearHistory = useCallback(async (reason?: string) => {
    if (!persistenceRef.current) throw new Error('Chat persistence not initialized');
    await persistenceRef.current.clear(reason);
    const state = await persistenceRef.current.restore();
    setHistory(state);
    setMessageCount(state.messages.length);
  }, []);

  const pruneOldest = useCallback(async (count: number) => {
    if (!persistenceRef.current) throw new Error('Chat persistence not initialized');
    const pruned = await persistenceRef.current.pruneOldest(count);
    const state = await persistenceRef.current.restore();
    setHistory(state);
    setMessageCount(state.messages.length);
    return pruned;
  }, []);

  const saveSession = useCallback(async (sessionId: string, messages: PersistedChatMessage[]) => {
    if (!persistenceRef.current) throw new Error('Chat persistence not initialized');
    await persistenceRef.current.saveSession(sessionId, messages);
  }, []);

  const loadSession = useCallback(async (sessionId: string) => {
    if (!persistenceRef.current) throw new Error('Chat persistence not initialized');
    return persistenceRef.current.loadSession(sessionId);
  }, []);

  const listSessions = useCallback(async () => {
    if (!persistenceRef.current) throw new Error('Chat persistence not initialized');
    return persistenceRef.current.listSessions();
  }, []);

  const deleteSession = useCallback(async (sessionId: string) => {
    if (!persistenceRef.current) throw new Error('Chat persistence not initialized');
    await persistenceRef.current.deleteSession(sessionId);
  }, []);

  return {
    history,
    loading,
    error,
    appendMessage,
    appendMessages,
    restoreHistory,
    clearHistory,
    pruneOldest,
    messageCount,
    saveSession,
    loadSession,
    listSessions,
    deleteSession,
  };
}