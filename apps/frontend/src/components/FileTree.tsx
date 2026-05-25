import { useState, useCallback } from 'react';
import type { FileNode } from '@/types';

interface TreeNodeProps {
  node: FileNode;
  depth: number;
  onFileSelect: (node: FileNode) => void;
  activeFilePath: string;
}

function TreeNode({ node, depth, onFileSelect, activeFilePath }: TreeNodeProps) {
  const [expanded, setExpanded] = useState(depth < 1); // Auto-expand root

  const handleClick = useCallback(() => {
    if (node.type === 'directory') {
      setExpanded((prev) => !prev);
    } else {
      onFileSelect(node);
    }
  }, [node, onFileSelect]);

  const isActive = node.type === 'file' && node.path === activeFilePath;
  const isDir = node.type === 'directory';

  return (
    <li role="treeitem" aria-expanded={isDir ? expanded : undefined}>
      <div
        className={`tree-node ${isActive ? 'tree-node--active' : ''}`}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        onClick={handleClick}
        title={node.path}
      >
        <span className="tree-icon">{isDir ? (expanded ? '▾' : '▸') : ' '}</span>
        <span className={`tree-icon tree-icon--${isDir ? 'dir' : 'file'}`}>
          {isDir ? '📁' : getIconForFile(node.name)}
        </span>
        <span className="tree-label">{node.name}</span>
      </div>
      {isDir && expanded && node.children && (
        <ul role="group">
          {node.children.map((child) => (
            <TreeNode
              key={child.path}
              node={child}
              depth={depth + 1}
              onFileSelect={onFileSelect}
              activeFilePath={activeFilePath}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

function getIconForFile(name: string): string {
  if (name.endsWith('.ts') || name.endsWith('.tsx')) return '🔷';
  if (name.endsWith('.js') || name.endsWith('.jsx')) return '📜';
  if (name.endsWith('.css') || name.endsWith('.scss')) return '🎨';
  if (name.endsWith('.json')) return '📋';
  if (name.endsWith('.md')) return '📝';
  if (name.endsWith('.html')) return '🌐';
  if (name.endsWith('.py')) return '🐍';
  if (name.endsWith('.rs')) return '🦀';
  if (name.endsWith('.go')) return '🔵';
  if (name.endsWith('.xlsx') || name.endsWith('.xls')) return '📊';
  if (name.endsWith('.csv') || name.endsWith('.tsv')) return '📊';
  return '📄';
}

interface FileTreeProps {
  root: FileNode | null;
  onFileSelect: (node: FileNode) => void;
  activeFilePath: string;
}

export function FileTree({ root, onFileSelect, activeFilePath }: FileTreeProps) {
  if (!root) {
    return (
      <div className="file-tree-empty">
        <p>No workspace open</p>
        <p className="file-tree-hint">Use the "Open Folder" button above</p>
      </div>
    );
  }

  return (
    <nav className="file-tree" role="tree" aria-label="File explorer">
      <div className="file-tree-header">{root.name}</div>
      <ul role="group">
        {root.children?.map((child) => (
          <TreeNode
            key={child.path}
            node={child}
            depth={0}
            onFileSelect={onFileSelect}
            activeFilePath={activeFilePath}
          />
        ))}
      </ul>
    </nav>
  );
}