import { describe, it, expect, beforeEach } from 'vitest';
import {
  createStorageBackend,
  resetStorage,
  StorageQuotaError,
  type StorageBackend,
} from '@/storage';

describe('Storage Abstraction Layer', () => {
  let backend: StorageBackend;

  beforeEach(() => {
    resetStorage();
    backend = createStorageBackend({
      dbName: `test-db-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      storeName: 'keyval',
      version: 1,
    });
  });

  describe('basic operations', () => {
    it('should set and get a string value', async () => {
      await backend.set('name', 'Alice');
      const result = await backend.get('name');
      expect(result).toBe('Alice');
    });

    it('should set and get a number value', async () => {
      await backend.set('count', 42);
      const result = await backend.get('count');
      expect(result).toBe(42);
    });

    it('should set and get a boolean value', async () => {
      await backend.set('active', true);
      const result = await backend.get('active');
      expect(result).toBe(true);
    });

    it('should set and get null', async () => {
      await backend.set('empty', null);
      const result = await backend.get('empty');
      expect(result).toBe(null);
    });

    it('should set and get an object', async () => {
      const obj = { line: 10, column: 5 };
      await backend.set('cursor', obj);
      const result = await backend.get<{ line: number; column: number }>('cursor');
      expect(result).toEqual(obj);
    });

    it('should set and get a nested object', async () => {
      const data = {
        files: [
          { path: '/src/index.ts', content: 'hello' },
          { path: '/src/app.ts', content: 'world' },
        ],
        activeTab: '/src/index.ts',
      };
      await backend.set('workspace', data);
      const result = await backend.get('workspace');
      expect(result).toEqual(data);
    });

    it('should return undefined for non-existent keys', async () => {
      const result = await backend.get('does-not-exist');
      expect(result).toBeUndefined();
    });

    it('should overwrite existing values', async () => {
      await backend.set('key', 'first');
      await backend.set('key', 'second');
      const result = await backend.get('key');
      expect(result).toBe('second');
    });
  });

  describe('delete operation', () => {
    it('should delete a key', async () => {
      await backend.set('to-delete', 'value');
      await backend.delete('to-delete');
      const result = await backend.get('to-delete');
      expect(result).toBeUndefined();
    });

    it('should not throw when deleting a non-existent key', async () => {
      await expect(backend.delete('nonexistent')).resolves.toBeUndefined();
    });
  });

  describe('clear operation', () => {
    it('should clear all keys', async () => {
      await backend.set('a', 1);
      await backend.set('b', 2);
      await backend.set('c', 3);
      await backend.clear();
      const allKeys = await backend.keys();
      expect(allKeys).toHaveLength(0);
    });

    it('should leave the store usable after clearing', async () => {
      await backend.set('before', 'clear');
      await backend.clear();
      await backend.set('after', 'clear');
      const result = await backend.get('after');
      expect(result).toBe('clear');
    });
  });

  describe('keys operation', () => {
    it('should return all keys', async () => {
      await backend.set('alpha', 1);
      await backend.set('beta', 2);
      const allKeys = await backend.keys();
      expect(allKeys).toContain('alpha');
      expect(allKeys).toContain('beta');
    });

    it('should return an empty array when no keys exist', async () => {
      const allKeys = await backend.keys();
      expect(allKeys).toEqual([]);
    });
  });

  describe('edge cases', () => {
    it('should handle empty string values', async () => {
      await backend.set('empty-string', '');
      const result = await backend.get('empty-string');
      expect(result).toBe('');
    });

    it('should handle zero values', async () => {
      await backend.set('zero', 0);
      const result = await backend.get('zero');
      expect(result).toBe(0);
    });

    it('should handle false values', async () => {
      await backend.set('false', false);
      const result = await backend.get('false');
      expect(result).toBe(false);
    });

    it('should handle arrays', async () => {
      const arr = ['a', 'b', 'c'];
      await backend.set('arr', arr);
      const result = await backend.get<string[]>('arr');
      expect(result).toEqual(arr);
    });
  });

  describe('concurrent operations', () => {
    it('should handle multiple sequential writes', async () => {
      for (let i = 0; i < 50; i++) {
        await backend.set(`key-${i}`, `value-${i}`);
      }
      for (let i = 0; i < 50; i++) {
        const result = await backend.get(`key-${i}`);
        expect(result).toBe(`value-${i}`);
      }
    });
  });
});