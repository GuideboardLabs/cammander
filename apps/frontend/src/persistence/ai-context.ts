/**
 * AI Context Persistence Module
 *
 * Provides persistence for AI context data:
 * - File tree summary (cached repo structure)
 * - Indexed symbols (functions, classes, variables for context-aware features)
 * - Relevant file paths (currently relevant files for AI conversations)
 * - Context window state (activePaths, estimatedTokens)
 *
 * Features:
 * - Update individual context fields without rewriting the entire state
 * - Auto-update when the repo changes (branch switch, file changes)
 * - Graceful handling of corrupted/unreadable data (reset to clean state)
 * - Quota-aware: symbols and paths are capped at configurable limits
 */

import type { Storage } from './storage';
import type {
  AIContextState,
  FileTreeSummary,
  IndexedSymbol,
  ContextWindowState,
} from './types';
import { STORAGE_KEYS, AI_CONTEXT_LIMITS } from './types';

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function isValidFileTreeSummary(data: unknown): data is FileTreeSummary {
  if (typeof data !== 'object' || data === null) return false;
  const d = data as Record<string, unknown>;
  return typeof d.summary === 'string' && Array.isArray(d.keyPaths);
}

function isValidIndexedSymbol(data: unknown): data is IndexedSymbol {
  if (typeof data !== 'object' || data === null) return false;
  const d = data as Record<string, unknown>;
  return (
    typeof d.name === 'string' &&
    typeof d.kind === 'string' &&
    typeof d.filePath === 'string' &&
    typeof d.line === 'number'
  );
}

function isValidContextWindow(data: unknown): data is ContextWindowState {
  if (typeof data !== 'object' || data === null) return false;
  const d = data as Record<string, unknown>;
  return (
    Array.isArray(d.activePaths) &&
    typeof d.estimatedTokens === 'number' &&
    typeof d.maxTokens === 'number'
  );
}

// ---------------------------------------------------------------------------
// AIContextPersistence
// ---------------------------------------------------------------------------

export interface AIContextPersistenceOptions {
  /** Storage backend instance */
  storage: Storage;
  /** Maximum number of indexed symbols to persist (default: AI_CONTEXT_LIMITS.MAX_SYMBOLS) */
  maxSymbols?: number;
  /** Maximum number of relevant file paths (default: AI_CONTEXT_LIMITS.MAX_RELEVANT_PATHS) */
  maxRelevantPaths?: number;
}

export class AIContextPersistence {
  private storage: Storage;
  private maxSymbols: number;
  private maxRelevantPaths: number;

  constructor(options: AIContextPersistenceOptions) {
    this.storage = options.storage;
    this.maxSymbols = options.maxSymbols ?? AI_CONTEXT_LIMITS.MAX_SYMBOLS;
    this.maxRelevantPaths = options.maxRelevantPaths ?? AI_CONTEXT_LIMITS.MAX_RELEVANT_PATHS;
  }

  // -----------------------------------------------------------------------
  // Core Operations
  // -----------------------------------------------------------------------

  /**
   * Save the full AI context state.
   * Overwrites any previously stored context.
   */
  async save(context: AIContextState): Promise<void> {
    // Enforce limits before saving
    const trimmed: AIContextState = {
      ...context,
      indexedSymbols: context.indexedSymbols
        ? context.indexedSymbols.slice(0, this.maxSymbols)
        : undefined,
      relevantFilePaths: context.relevantFilePaths
        ? context.relevantFilePaths.slice(0, this.maxRelevantPaths)
        : undefined,
      updatedAt: new Date().toISOString(),
    };

    await this.storage.set(STORAGE_KEYS.AI_CONTEXT, trimmed);
  }

  /**
   * Restore the full AI context from storage.
   * Returns null if no context has been saved.
   * Invalid data is silently filtered.
   */
  async restore(): Promise<AIContextState | null> {
    try {
      const raw = await this.storage.get(STORAGE_KEYS.AI_CONTEXT);
      if (raw === undefined || raw === null) return null;
      if (typeof raw !== 'object') {
        console.warn('[AIContext] Corrupted context data, resetting');
        return null;
      }
      return this.parseContext(raw as Record<string, unknown>);
    } catch (err) {
      console.error('[AIContext] Error loading context, returning null:', err);
      return null;
    }
  }

  /**
   * Clear all AI context data.
   */
  async clear(): Promise<void> {
    await this.storage.delete(STORAGE_KEYS.AI_CONTEXT);
  }

  // -----------------------------------------------------------------------
  // Partial Updates
  // -----------------------------------------------------------------------

  /**
   * Update the file tree summary.
   * Merges with existing context, only updating the fileTreeSummary field.
   */
  async updateFileTreeSummary(summary: FileTreeSummary): Promise<void> {
    const existing = await this.restore() ?? this.createEmptyContext();
    existing.fileTreeSummary = {
      ...summary,
      generatedAt: summary.generatedAt ?? new Date().toISOString(),
    };
    await this.save(existing);
  }

  /**
   * Update the indexed symbols.
   * Replaces the entire symbol index.
   */
  async updateIndexedSymbols(symbols: IndexedSymbol[]): Promise<void> {
    const existing = await this.restore() ?? this.createEmptyContext();
    // Validate and trim
    const validSymbols = symbols.filter(isValidIndexedSymbol).slice(0, this.maxSymbols);
    existing.indexedSymbols = validSymbols;
    existing.updatedAt = new Date().toISOString();
    await this.save(existing);
  }

  /**
   * Update relevant file paths.
   * Replaces the entire relevant paths list.
   */
  async updateRelevantPaths(paths: string[]): Promise<void> {
    const existing = await this.restore() ?? this.createEmptyContext();
    existing.relevantFilePaths = paths.slice(0, this.maxRelevantPaths);
    existing.updatedAt = new Date().toISOString();
    await this.save(existing);
  }

  /**
   * Update the context window state.
   * Merges with existing context, only updating the contextWindow field.
   */
  async updateContextWindow(window: ContextWindowState): Promise<void> {
    const existing = await this.restore() ?? this.createEmptyContext();
    existing.contextWindow = {
      ...window,
      estimatedTokens: Math.min(window.estimatedTokens, AI_CONTEXT_LIMITS.MAX_CONTEXT_TOKENS),
    };
    existing.updatedAt = new Date().toISOString();
    await this.save(existing);
  }

  /**
   * Update the git branch.
   * Called when the user switches branches.
   */
  async updateBranch(branch: string): Promise<void> {
    const existing = await this.restore() ?? this.createEmptyContext();
    existing.branch = branch;
    existing.updatedAt = new Date().toISOString();
    await this.save(existing);
  }

  // -----------------------------------------------------------------------
  // Repo Change Handling
  // -----------------------------------------------------------------------

  /**
   * Called when the repo changes (branch switch, file add/delete).
   * Clears stale cached data (symbols, file tree summary) but preserves
   * relevant paths and branch.
   */
  async handleRepoChange(newBranch?: string): Promise<void> {
    const existing = await this.restore();
    const context: AIContextState = {
      branch: newBranch ?? existing?.branch,
      // Clear stale cached data
      fileTreeSummary: undefined,
      indexedSymbols: undefined,
      relevantFilePaths: existing?.relevantFilePaths,
      contextWindow: existing?.contextWindow,
      updatedAt: new Date().toISOString(),
    };
    await this.save(context);
  }

  /**
   * Add file paths to the relevant list.
   * Duplicates are silently ignored.
   */
  async addRelevantPaths(paths: string[]): Promise<void> {
    const existing = await this.restore() ?? this.createEmptyContext();
    const currentSet = new Set(existing.relevantFilePaths ?? []);
    for (const p of paths) {
      currentSet.add(p);
    }
    existing.relevantFilePaths = Array.from(currentSet).slice(0, this.maxRelevantPaths);
    existing.updatedAt = new Date().toISOString();
    await this.save(existing);
  }

  /**
   * Remove file paths from the relevant list.
   */
  async removeRelevantPaths(paths: string[]): Promise<void> {
    const existing = await this.restore() ?? this.createEmptyContext();
    const removeSet = new Set(paths);
    existing.relevantFilePaths = (existing.relevantFilePaths ?? []).filter(
      (p) => !removeSet.has(p),
    );
    existing.updatedAt = new Date().toISOString();
    await this.save(existing);
  }

  // -----------------------------------------------------------------------
  // Multi-Context Support (for multiple repos/projects)
  // -----------------------------------------------------------------------

  /**
   * Save AI context under a specific project key.
   */
  async saveForProject(projectKey: string, context: AIContextState): Promise<void> {
    const trimmed: AIContextState = {
      ...context,
      indexedSymbols: context.indexedSymbols
        ? context.indexedSymbols.slice(0, this.maxSymbols)
        : undefined,
      relevantFilePaths: context.relevantFilePaths
        ? context.relevantFilePaths.slice(0, this.maxRelevantPaths)
        : undefined,
      updatedAt: new Date().toISOString(),
    };
    await this.storage.set(`${STORAGE_KEYS.AI_CONTEXT_PREFIX}${projectKey}`, trimmed);
  }

  /**
   * Load AI context for a specific project key.
   */
  async loadForProject(projectKey: string): Promise<AIContextState | null> {
    try {
      const raw = await this.storage.get(`${STORAGE_KEYS.AI_CONTEXT_PREFIX}${projectKey}`);
      if (raw === undefined || raw === null) return null;
      if (typeof raw !== 'object') return null;
      return this.parseContext(raw as Record<string, unknown>);
    } catch (err) {
      console.error(`[AIContext] Error loading context for project ${projectKey}:`, err);
      return null;
    }
  }

  /**
   * Delete AI context for a specific project.
   */
  async deleteForProject(projectKey: string): Promise<void> {
    await this.storage.delete(`${STORAGE_KEYS.AI_CONTEXT_PREFIX}${projectKey}`);
  }

  // -----------------------------------------------------------------------
  // Internal
  // -----------------------------------------------------------------------

  private parseContext(data: Record<string, unknown>): AIContextState | null {
    const context: AIContextState = {
      updatedAt: typeof data.updatedAt === 'string' ? data.updatedAt : new Date().toISOString(),
    };

    // Parse optional fields, filtering invalid data
    if (data.branch !== undefined && data.branch !== null) {
      context.branch = typeof data.branch === 'string' ? data.branch : undefined;
    }

    if (data.fileTreeSummary !== undefined && data.fileTreeSummary !== null) {
      if (isValidFileTreeSummary(data.fileTreeSummary)) {
        context.fileTreeSummary = data.fileTreeSummary;
      } else {
        console.warn('[AIContext] Invalid fileTreeSummary in stored data, skipping');
      }
    }

    if (data.indexedSymbols !== undefined && data.indexedSymbols !== null) {
      if (Array.isArray(data.indexedSymbols)) {
        context.indexedSymbols = (data.indexedSymbols as unknown[]).filter(isValidIndexedSymbol);
      } else {
        console.warn('[AIContext] Invalid indexedSymbols in stored data, skipping');
      }
    }

    if (data.relevantFilePaths !== undefined && data.relevantFilePaths !== null) {
      if (Array.isArray(data.relevantFilePaths)) {
        context.relevantFilePaths = (data.relevantFilePaths as unknown[]).filter(
          (p): p is string => typeof p === 'string',
        );
      }
    }

    if (data.contextWindow !== undefined && data.contextWindow !== null) {
      if (isValidContextWindow(data.contextWindow)) {
        context.contextWindow = data.contextWindow;
      } else {
        console.warn('[AIContext] Invalid contextWindow in stored data, skipping');
      }
    }

    return context;
  }

  private createEmptyContext(): AIContextState {
    return {
      updatedAt: new Date().toISOString(),
    };
  }
}