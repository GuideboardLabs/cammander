/**
 * Storage Abstraction Layer
 *
 * Provides a unified async API over localStorage and IndexedDB.
 * Auto-selects IndexedDB when available (larger quota), falling back to localStorage.
 * Supports versioned schema migrations.
 *
 * Usage:
 *   import { createStorage } from './storage';
 *   const store = await createStorage({ dbName: 'myApp', storeName: 'data', schemaVersion: 1 });
 *   await store.set('key', { nested: true });
 *   const val = await store.get('key');
 */

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class StorageError extends Error {
  code: string;
  cause: Error | null;

  constructor(message: string, code: string, cause?: Error) {
    super(message);
    this.name = 'StorageError';
    this.code = code;
    this.cause = cause ?? null;
  }
}

/** Thrown when the storage quota is exceeded. */
export class QuotaExceededError extends StorageError {
  constructor(message: string, cause?: Error) {
    super(message, 'QUOTA_EXCEEDED', cause);
    this.name = 'QuotaExceededError';
  }
}

/** Thrown when storage is unavailable (e.g. private browsing). */
export class StorageUnavailableError extends StorageError {
  constructor(message: string, cause?: Error) {
    super(message, 'STORAGE_UNAVAILABLE', cause);
    this.name = 'StorageUnavailableError';
  }
}

/** Thrown when data cannot be deserialized (corrupted). */
export class CorruptedDataError extends StorageError {
  key: string;

  constructor(message: string, key: string, cause?: Error) {
    super(message, 'CORRUPTED_DATA', cause);
    this.name = 'CorruptedDataError';
    this.key = key;
  }
}

// ---------------------------------------------------------------------------
// Storage interface
// ---------------------------------------------------------------------------

export interface Storage {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown): Promise<unknown>;
  delete(key: string): Promise<void>;
  clear(): Promise<void>;
  keys(): Promise<string[]>;
  close(): Promise<void>;
  /** Which backend is active: 'indexeddb' or 'localstorage' */
  readonly backend: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function serialize(value: unknown): string {
  return JSON.stringify(value);
}

function deserialize(raw: string, _key?: string): unknown {
  if (raw === undefined || raw === null) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    // If it's not valid JSON, return the raw string as-is
    // (for storage backends that don't serialize to JSON)
    return raw;
  }
}

/**
 * Detect whether IndexedDB is available and functional.
 */
async function isIndexedDBAvailable(): Promise<boolean> {
  if (typeof indexedDB === 'undefined') return false;
  const testDb = '__storage_available_test__';
  return new Promise((resolve) => {
    let result = false;
    try {
      const req = indexedDB.open(testDb);
      req.onupgradeneeded = () => {
        const db = req.result;
        db.createObjectStore('t');
      };
      req.onsuccess = () => {
        result = true;
        req.result.close();
        indexedDB.deleteDatabase(testDb);
        resolve(true);
      };
      req.onerror = () => resolve(false);
      req.onblocked = () => resolve(false);
    } catch {
      resolve(false);
    }
    // Safety timeout
    setTimeout(() => resolve(result), 3000);
  });
}

/**
 * Detect whether localStorage is available and functional.
 */
function isLocalStorageAvailable(): boolean {
  try {
    if (typeof localStorage === 'undefined') return false;
    const k = '__storage_test__';
    localStorage.setItem(k, '1');
    localStorage.removeItem(k);
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// IndexedDB Backend
// ---------------------------------------------------------------------------

type MigrationFn = (db: IDBDatabase, storeName: string, event: IDBVersionChangeEvent) => void;

class IndexedDBBackend implements Storage {
  private dbName: string;
  private storeName: string;
  private schemaVersion: number;
  private migrations: Record<number, MigrationFn>;
  private _db: IDBDatabase | null = null;
  private _backendName = 'indexeddb';

  constructor({
    dbName,
    storeName,
    schemaVersion,
    migrations,
  }: {
    dbName: string;
    storeName: string;
    schemaVersion: number;
    migrations?: Record<number, MigrationFn>;
  }) {
    this.dbName = dbName;
    this.storeName = storeName;
    this.schemaVersion = schemaVersion;
    this.migrations = migrations ?? {};
  }

  private _req<T>(req: IDBRequest<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  private async _open(): Promise<IDBDatabase> {
    if (this._db) return this._db;
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(this.dbName, this.schemaVersion);

      req.onupgradeneeded = (event) => {
        const db = req.result;
        const oldVersion = event.oldVersion;
        const newVersion = event.newVersion;

        // Create store if fresh
        if (oldVersion === 0) {
          if (!db.objectStoreNames.contains(this.storeName)) {
            db.createObjectStore(this.storeName);
          }
        }

        // Run migrations between versions
        const targetVersion = newVersion ?? this.schemaVersion;
        for (let v = oldVersion + 1; v <= targetVersion; v++) {
          if (typeof this.migrations[v] === 'function') {
            this.migrations[v]!(db, this.storeName, event);
          }
        }
      };

      req.onsuccess = () => {
        this._db = req.result;
        resolve(req.result);
      };
      req.onerror = () =>
        reject(new StorageUnavailableError(`Failed to open IndexedDB "${this.dbName}"`, req.error ?? undefined));
      req.onblocked = () =>
        reject(new StorageUnavailableError(`IndexedDB "${this.dbName}" is blocked`));
    });
  }

  get backend(): string {
    return this._backendName;
  }

  async get(key: string): Promise<unknown> {
    const db = await this._open();
    const store = db.transaction(this.storeName, 'readonly').objectStore(this.storeName);
    const raw = await this._req(store.get(key));
    if (raw === undefined) return undefined;
    // IndexedDB stores structured clones natively — only deserialize if it's a string
    if (typeof raw === 'string') {
      return deserialize(raw, key);
    }
    return raw;
  }

  async set(key: string, value: unknown): Promise<unknown> {
    const db = await this._open();
    const store = db.transaction(this.storeName, 'readwrite').objectStore(this.storeName);
    try {
      await this._req(store.put(value, key));
    } catch (err) {
      if (err instanceof Error && err.name === 'QuotaExceededError') {
        throw new QuotaExceededError(`Storage quota exceeded writing key "${key}"`, err);
      }
      // Some browsers throw DataError for oversized values
      if (err instanceof Error && err.name === 'DataError') {
        throw new QuotaExceededError(`Data too large for key "${key}"`, err);
      }
      throw err;
    }
    return value;
  }

  async delete(key: string): Promise<void> {
    const db = await this._open();
    const store = db.transaction(this.storeName, 'readwrite').objectStore(this.storeName);
    await this._req(store.delete(key));
  }

  async clear(): Promise<void> {
    const db = await this._open();
    const store = db.transaction(this.storeName, 'readwrite').objectStore(this.storeName);
    await this._req(store.clear());
  }

  async keys(): Promise<string[]> {
    const db = await this._open();
    const store = db.transaction(this.storeName, 'readonly').objectStore(this.storeName);
    return this._req(store.getAllKeys()) as Promise<string[]>;
  }

  async close(): Promise<void> {
    if (this._db) {
      this._db.close();
      this._db = null;
    }
  }
}

// ---------------------------------------------------------------------------
// localStorage Backend
// ---------------------------------------------------------------------------

type LSMigrationFn = (ls: globalThis.Storage, prefix: string) => void;

class LocalStorageBackend implements Storage {
  private prefix: string;
  private schemaVersion: number;
  private migrations: Record<number, LSMigrationFn>;
  private _metaKey: string;
  private _backendName = 'localstorage';

  constructor({
    prefix,
    schemaVersion,
    migrations,
  }: {
    prefix: string;
    schemaVersion: number;
    migrations?: Record<number, LSMigrationFn>;
  }) {
    this.prefix = prefix;
    this.schemaVersion = schemaVersion;
    this.migrations = migrations ?? {};
    this._metaKey = `${prefix}__schema_meta__`;
  }

  private _fullKey(key: string): string {
    return `${this.prefix}${key}`;
  }

  private _isOurKey(fullKey: string): boolean {
    return fullKey.startsWith(this.prefix);
  }

  private _stripPrefix(fullKey: string): string {
    return fullKey.slice(this.prefix.length);
  }

  get backend(): string {
    return this._backendName;
  }

  /** Initialize / run migrations synchronously via localStorage */
  _ensureSchema(): void {
    let meta: Record<string, unknown>;
    try {
      meta = JSON.parse(localStorage.getItem(this._metaKey) ?? '') || {};
    } catch {
      meta = {};
    }

    const currentVersion = (meta.version as number) || 0;
    if (currentVersion === this.schemaVersion) return;

    // Run migrations
    for (let v = currentVersion + 1; v <= this.schemaVersion; v++) {
      const migration = this.migrations[v];
      if (typeof migration === 'function') {
        migration(localStorage, this.prefix);
      }
    }

    meta.version = this.schemaVersion;
    try {
      localStorage.setItem(this._metaKey, JSON.stringify(meta));
    } catch (err) {
      throw new QuotaExceededError('Storage quota exceeded writing schema meta', err instanceof Error ? err : undefined);
    }
  }

  async get(key: string): Promise<unknown> {
    this._ensureSchema();
    const raw = localStorage.getItem(this._fullKey(key));
    if (raw === null) return undefined;
    return deserialize(raw, key);
  }

  async set(key: string, value: unknown): Promise<unknown> {
    this._ensureSchema();
    const serialized = serialize(value);
    try {
      localStorage.setItem(this._fullKey(key), serialized);
    } catch (err) {
      if (err instanceof Error && (err.name === 'QuotaExceededError' || (err as DOMException).code === 22)) {
        throw new QuotaExceededError(`Storage quota exceeded writing key "${key}"`, err);
      }
      throw err;
    }
    return value;
  }

  async delete(key: string): Promise<void> {
    this._ensureSchema();
    localStorage.removeItem(this._fullKey(key));
  }

  async clear(): Promise<void> {
    this._ensureSchema();
    // Only remove our keys
    const toRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && this._isOurKey(k) && k !== this._metaKey) {
        toRemove.push(k);
      }
    }
    toRemove.forEach((k) => localStorage.removeItem(k));
  }

  async keys(): Promise<string[]> {
    this._ensureSchema();
    const result: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && this._isOurKey(k) && k !== this._metaKey) {
        result.push(this._stripPrefix(k));
      }
    }
    return result;
  }

  async close(): Promise<void> {
    // No-op for localStorage
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface CreateStorageOptions {
  /** IndexedDB database name (default: 'appStorage') */
  dbName?: string;
  /** IndexedDB object store name (default: 'keyValue') */
  storeName?: string;
  /** localStorage key prefix (default: 'app:') */
  prefix?: string;
  /** Schema version for migrations (default: 1) */
  schemaVersion?: number;
  /** Migration functions keyed by version number */
  migrations?: Record<number, unknown>;
  /** Force a specific backend: 'auto' | 'indexeddb' | 'localstorage' (default: 'auto') */
  backend?: 'auto' | 'indexeddb' | 'localstorage';
}

/**
 * Create a storage instance.
 *
 * Auto-selects IndexedDB when available (larger quota), falling back to localStorage.
 * Supports versioned schema migrations.
 */
export async function createStorage(options: CreateStorageOptions = {}): Promise<Storage> {
  const {
    dbName = 'appStorage',
    storeName = 'keyValue',
    prefix = 'app:',
    schemaVersion = 1,
    migrations = {},
    backend: backendChoice = 'auto',
  } = options;

  let backend: Storage;

  if (backendChoice === 'indexeddb') {
    if (!(await isIndexedDBAvailable())) {
      throw new StorageUnavailableError('IndexedDB requested but not available');
    }
    backend = new IndexedDBBackend({ dbName, storeName, schemaVersion, migrations: migrations as Record<number, MigrationFn> });
  } else if (backendChoice === 'localstorage') {
    if (!isLocalStorageAvailable()) {
      throw new StorageUnavailableError('localStorage requested but not available');
    }
    backend = new LocalStorageBackend({ prefix, schemaVersion, migrations: migrations as Record<number, LSMigrationFn> });
  } else {
    // Auto-select: prefer IndexedDB (larger quota), fall back to localStorage
    const idbAvailable = await isIndexedDBAvailable();
    if (idbAvailable) {
      backend = new IndexedDBBackend({ dbName, storeName, schemaVersion, migrations: migrations as Record<number, MigrationFn> });
    } else if (isLocalStorageAvailable()) {
      backend = new LocalStorageBackend({ prefix, schemaVersion, migrations: migrations as Record<number, LSMigrationFn> });
    } else {
      throw new StorageUnavailableError('No storage backend available');
    }
  }

  // Open / initialize the backend
  try {
    if (backend instanceof IndexedDBBackend) {
      await backend['_open']();
    } else {
      (backend as LocalStorageBackend)._ensureSchema();
    }
  } catch (err) {
    if (err instanceof StorageError) throw err;
    throw new StorageUnavailableError('Failed to initialize storage backend', err instanceof Error ? err : undefined);
  }

  return backend;
}