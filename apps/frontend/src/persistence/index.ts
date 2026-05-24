// Persistence module barrel export
export { createStorage } from './storage';
export type { Storage } from './storage';
export {
  StorageError,
  QuotaExceededError,
  StorageUnavailableError,
  CorruptedDataError,
} from './storage';
export type { CreateStorageOptions } from './storage';

export { ChatHistoryPersistence } from './chat-history';
export type { ChatHistoryPersistenceOptions } from './chat-history';

export { AIContextPersistence } from './ai-context';
export type { AIContextPersistenceOptions } from './ai-context';

export { useChatPersistence } from './useChatPersistence';
export type { UseChatPersistenceOptions, UseChatPersistenceReturn } from './useChatPersistence';

export { useAIContextPersistence } from './useAIContextPersistence';
export type { UseAIContextPersistenceOptions, UseAIContextPersistenceReturn } from './useAIContextPersistence';

export { PersistenceCoordinator, getPersistenceCoordinator, resetPersistenceCoordinator } from './lifecycle';
export type { RestoredState, PersistenceLifecycleOptions } from './lifecycle';

export { useAppPersistence } from './useAppPersistence';
export type { UseAppPersistenceOptions, UseAppPersistenceReturn } from './useAppPersistence';

export type {
  PersistedChatMessage,
  ChatMessageMetadata,
  ChatHistoryState,
  AIContextState,
  FileTreeSummary,
  IndexedSymbol,
  ContextWindowState,
} from './types';

export { STORAGE_KEYS, CHAT_LIMITS, AI_CONTEXT_LIMITS } from './types';