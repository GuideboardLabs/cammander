import { useCallback, useState } from 'react';
import type { FileNode } from '@/types';

/**
 * Browser File System Access API hook.
 * Lets the user pick a directory, then recursively reads its structure
 * and lazily loads file content on demand.
 */
export function useFileSystem() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const openDirectoryPicker = useCallback(async (): Promise<{
    root: FileNode;
    files: Map<string, string>;
  } | null> => {
    setLoading(true);
    setError(null);

    try {
      // Feature detection — only Chrome/Edge support showDirectoryPicker
      if (!('showDirectoryPicker' in window)) {
        setError('Your browser does not support the File System Access API. Use Chrome or Edge.');
        return null;
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const dirHandle = await (window as any).showDirectoryPicker({ mode: 'read' }) as FileSystemDirectoryHandle & { entries(): AsyncIterableIterator<[string, FileSystemHandle]> };

      const files = new Map<string, string>();
      const extensionsToSkip = new Set([
        '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.ico', '.webp', '.svg',
        '.woff', '.woff2', '.ttf', '.eot',
        '.zip', '.gz', '.tar', '.rar',
        '.mp3', '.mp4', '.wav', '.avi', '.mov',
        '.pdf', '.exe', '.dll', '.so', '.dylib',
        '.lock', '.pnp.js', '.pnp.cjs',
      ]);

      const maxFileSize = 512 * 1024; // 512 KB — skip huge files

      async function readDirectory(handle: FileSystemDirectoryHandle & { entries(): AsyncIterableIterator<[string, FileSystemHandle]> }, path: string): Promise<FileNode> {
        const children: FileNode[] = [];

        for await (const [name, entry] of handle.entries()) {
          const entryPath = path ? `${path}/${name}` : name;

          if (entry.kind === 'directory') {
            // Skip node_modules, .git, and hidden dirs
            if (name === 'node_modules' || name === '.git' || name.startsWith('.cache')) {
              continue;
            }
            const childNode = await readDirectory(entry as FileSystemDirectoryHandle & { entries(): AsyncIterableIterator<[string, FileSystemHandle]> }, entryPath);
            children.push(childNode);
          } else {
            // Skip binary/large files
            const ext = name.includes('.') ? `.${name.split('.').pop()!}` : '';
            if (extensionsToSkip.has(ext)) continue;

            const file = await (entry as FileSystemFileHandle).getFile();
            if (file.size > maxFileSize) continue;

            const content = await file.text();
            files.set(entryPath, content);

            children.push({
              name,
              path: entryPath,
              type: 'file',
              size: file.size,
              mtime: file.lastModified ? new Date(file.lastModified) : undefined,
            });
          }
        }

        // Sort: directories first, then alphabetical
        children.sort((a, b) => {
          if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
          return a.name.localeCompare(b.name);
        });

        return {
          name: handle.name,
          path: path || handle.name,
          type: 'directory',
          children,
        };
      }

      const root = await readDirectory(dirHandle, dirHandle.name);
      return { root, files };
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        // User cancelled picker
        return null;
      }
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  return { openDirectoryPicker, loading, error };
}