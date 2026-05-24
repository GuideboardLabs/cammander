import '@testing-library/jest-dom';

// Mock indexedDB for tests that need it
// (vitest/jsdom doesn't provide a real IndexedDB implementation)
import { IDBFactory, IDBDatabase, IDBObjectStore, IDBRequest, IDBTransaction } from 'fake-indexeddb';

// Make fake-indexeddb available globally
(globalThis as any).indexedDB = new IDBFactory();
(globalThis as any).IDBDatabase = IDBDatabase;
(globalThis as any).IDBObjectStore = IDBObjectStore;
(globalThis as any).IDBRequest = IDBRequest;
(globalThis as any).IDBTransaction = IDBTransaction;