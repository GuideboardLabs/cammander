/**
 * Storage abstraction layer.
 *
 * Auto-selects IndexedDB (preferred, larger quota) with localStorage fallback.
 * Provides an async key/value API: get, set, delete, clear, keys.
 * Supports versioned schema migrations and handles serialization, quota errors,
 * and corrupted data gracefully.
 */

// ── Types ───────────────────────────────────────────────────────────────────

export interface StorageBackend {
  get<T = unknown>(key: string): Promise<T | undefined>;
  set<T = unknown>(key: string, value: T): Promise<void>;
  delete(key: string): Promise<void>;
  clear(): Promise<void>;
  keys(): Promise<string[]>;
}

export interface Migration {
  version: number;
  migrate: (backend: StorageBackend) => Promise<void>;
}

export interface StorageOptions {
  /** IndexedDB database name */
  dbName?: string;
  /** IndexedDB store name */
  storeName?: string;
  /** localStorage key prefix */
  lsPrefix?: string;
  /** Schema version — migrations run from (stored+1) → version */
  version?: number;
  migrations?: Migration[];
}

// ── IndexedDB backend ────────────────────────────────────────────────────────

const IDB_READY = typeof indexedDB !== 'undefined';

class IndexedDBBackend implements StorageBackend {
  private db: IDBDatabase | null = null;
  private dbName: string;
  private storeName: string;
  private version: number;
  private migrations: Migration[];
  private initPromise: Promise<void> | null = null;

  constructor(opts: { dbName?: string; storeName?: string; version?: number; migrations?: Migration[] } = {}) {
    this.dbName = opts.dbName ?? 'cammander-storage';
    this.storeName = opts.storeName ?? 'keyval';
    this.version = opts.version ?? 1;
    this.migrations = opts.migrations ?? [];
  }

  private async ensureOpen(): Promise<IDBDatabase> {
    if (this.db) return this.db;
    if (!this.initPromise) {
      this.initPromise = this._open();
    }
    await this.initPromise;
    if (!this.db) throw new Error('IndexedDB: failed to open database');
    return this.db;
  }

  private _open(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version);
      request.onupgradeneeded = (event) => {
        const db = request.result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          db.createObjectStore(this.storeName);
        }
        // Run migrations for versions between oldVersion+1 and current
        const oldVersion = event.oldVersion;
        for (const m of this.migrations) {
          if (m.version > oldVersion && m.version <= this.version) {
            // Migrations run after open; we just create the schema here
          }
        }
      };
      request.onsuccess = async () => {
        this.db = request.result;
        // Run pending migrations
        for (const m of this.migrations) {
          if (m.version > 0) {
            try {
              await m.migrate(this);
            } catch {
              // Migration already applied or failed — continue
            }
          }
        }
        resolve();
      };
      request.onerror = () => reject(request.error);
    });
  }

  async get<T = unknown>(key: string): Promise<T | undefined> {
    const db = await this.ensureOpen();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.storeName, 'readonly');
      const store = tx.objectStore(this.storeName);
      const request = store.get(key);
      request.onsuccess = () => {
        const result = request.result;
        // Envelope pattern: { v: value } distinguishes null from missing
        if (result === undefined) {
          resolve(undefined);
        } else if (result && typeof result === 'object' && 'v' in result) {
          resolve(result.v as T);
        } else {
          // Legacy or corrupted — treat as raw value
          resolve(result as T);
        }
      };
      request.onerror = () => reject(request.error);
    });
  }

  async set<T = unknown>(key: string, value: T): Promise<void> {
    const db = await this.ensureOpen();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.storeName, 'readwrite');
      const store = tx.objectStore(this.storeName);
      // Envelope pattern so we can store null/undefined correctly
      const request = store.put({ v: value }, key);
      request.onsuccess = () => resolve();
      request.onerror = () => {
        if (request.error?.name === 'QuotaExceededError') {
          reject(new StorageQuotaError('IndexedDB quota exceeded'));
        } else {
          reject(request.error);
        }
      };
    });
  }

  async delete(key: string): Promise<void> {
    const db = await this.ensureOpen();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.storeName, 'readwrite');
      const store = tx.objectStore(this.storeName);
      const request = store.delete(key);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async clear(): Promise<void> {
    const db = await this.ensureOpen();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.storeName, 'readwrite');
      const store = tx.objectStore(this.storeName);
      const request = store.clear();
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async keys(): Promise<string[]> {
    const db = await this.ensureOpen();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.storeName, 'readonly');
      const store = tx.objectStore(this.storeName);
      const request = store.getAllKeys();
      request.onsuccess = () => resolve(request.result as string[]);
      request.onerror = () => reject(request.error);
    });
  }

  dispose(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
      this.initPromise = null;
    }
  }
}

// ── localStorage backend ────────────────────────────────────────────────────

class LocalStorageBackend implements StorageBackend {
  private prefix: string;
  private version: number;
  private migrations: Migration[];
  private initialized = false;

  constructor(opts: { lsPrefix?: string; version?: number; migrations?: Migration[] } = {}) {
    this.prefix = opts.lsPrefix ?? 'cammander:';
    this.version = opts.version ?? 1;
    this.migrations = opts.migrations ?? [];
  }

  private async ensureInit(): Promise<void> {
    if (this.initialized) return;
    // Run migrations on first use
    const versionKey = `${this.prefix}__version__`;
    const storedVersion = parseInt(localStorage.getItem(versionKey) ?? '0', 10);
    for (const m of this.migrations) {
      if (m.version > storedVersion && m.version <= this.version) {
        try {
          await m.migrate(this);
        } catch {
          // Continue on failure
        }
      }
    }
    localStorage.setItem(versionKey, String(this.version));
    this.initialized = true;
  }

  private scopedKey(key: string): string {
    return `${this.prefix}${key}`;
  }

  private isScopedKey(key: string): boolean {
    return key.startsWith(this.prefix);
  }

  async get<T = unknown>(key: string): Promise<T | undefined> {
    await this.ensureInit();
    try {
      const raw = localStorage.getItem(this.scopedKey(key));
      if (raw === null) return undefined;
      return JSON.parse(raw) as T;
    } catch {
      // Corrupted data — remove it
      localStorage.removeItem(this.scopedKey(key));
      return undefined;
    }
  }

  async set<T = unknown>(key: string, value: T): Promise<void> {
    await this.ensureInit();
    try {
      localStorage.setItem(this.scopedKey(key), JSON.stringify(value));
    } catch (e) {
      if (e instanceof DOMException && (e.name === 'QuotaExceededError' || e.code === 22)) {
        throw new StorageQuotaError('localStorage quota exceeded');
      }
      throw e;
    }
  }

  async delete(key: string): Promise<void> {
    await this.ensureInit();
    localStorage.removeItem(this.scopedKey(key));
  }

  async clear(): Promise<void> {
    await this.ensureInit();
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && this.isScopedKey(k)) {
        keysToRemove.push(k);
      }
    }
    keysToRemove.forEach((k) => localStorage.removeItem(k));
  }

  async keys(): Promise<string[]> {
    await this.ensureInit();
    const result: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && this.isScopedKey(k)) {
        result.push(k.slice(this.prefix.length));
      }
    }
    return result;
  }
}

// ── Error types ──────────────────────────────────────────────────────────────

export class StorageQuotaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StorageQuotaError';
  }
}

// ── Factory ───────────────────────────────────────────────────────────────────

let _instance: StorageBackend | null = null;

export function createStorageBackend(opts: StorageOptions = {}): StorageBackend {
  if (IDB_READY) {
    return new IndexedDBBackend({
      dbName: opts.dbName,
      storeName: opts.storeName,
      version: opts.version,
      migrations: opts.migrations,
    });
  }
  return new LocalStorageBackend({
    lsPrefix: opts.lsPrefix,
    version: opts.version,
    migrations: opts.migrations,
  });
}

/**
 * Get or create the singleton storage backend.
 * Auto-selects IndexedDB when available, falls back to localStorage.
 */
export function getStorage(opts: StorageOptions = {}): StorageBackend {
  if (!_instance) {
    _instance = createStorageBackend(opts);
  }
  return _instance;
}

/** Reset the singleton (useful for testing). */
export function resetStorage(): void {
  _instance = null;
}