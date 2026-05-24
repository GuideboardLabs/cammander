import { useCallback, useEffect, useRef, useMemo } from 'react';
import Editor, { type OnMount, loader } from '@monaco-editor/react';
import type { editor } from 'monaco-editor';
import type { CursorPosition, ScrollPosition } from '@/types';
import { getLanguageFromPath, registerCustomLanguages } from '@/languages';
import './EditorPane.css';

// Configure Monaco to use the locally installed package instead of CDN
// This ensures syntax highlighting works offline (WSL/local dev)
import * as monaco from 'monaco-editor';
loader.config({ monaco });

interface EditorPaneProps {
  value: string;
  language: string;
  filePath: string;
  onChange: (value: string) => void;
  /** Called when the cursor position changes (debounced) */
  onCursorChange?: (cursor: CursorPosition) => void;
  /** Called when the scroll position changes (debounced) */
  onScrollChange?: (scroll: ScrollPosition) => void;
  /** Restored cursor position for this file */
  savedCursor?: CursorPosition;
  /** Restored scroll position for this file */
  savedScroll?: ScrollPosition;
}

// Register custom languages once
let languagesRegistered = false;

export function EditorPane({
  value,
  language,
  filePath,
  onChange,
  onCursorChange,
  onScrollChange,
  savedCursor,
  savedScroll,
}: EditorPaneProps) {
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const restoredPathRef = useRef<string>('');
  const skipCursorEventRef = useRef(false);

  const handleChange = useCallback(
    (newValue: string | undefined) => {
      onChange(newValue ?? '');
    },
    [onChange],
  );

  // Track cursor position changes from the editor
  const handleEditorMount: OnMount = useCallback((editor, monaco) => {
    editorRef.current = editor;

    // Register custom Monarch tokenizers on first mount
    if (!languagesRegistered) {
      registerCustomLanguages(monaco);
      languagesRegistered = true;
    }

    // Listen for cursor position changes
    editor.onDidChangeCursorPosition((e) => {
      if (skipCursorEventRef.current) {
        skipCursorEventRef.current = false;
        return;
      }
      onCursorChange?.({ line: e.position.lineNumber, column: e.position.column });
    });

    // Listen for scroll position changes
    editor.onDidScrollChange((e) => {
      onScrollChange?.({
        scrollTop: e.scrollTop,
        scrollLeft: e.scrollLeft,
      });
    });
  }, [onCursorChange, onScrollChange]);

  // Restore saved cursor/scroll when switching to a file
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;

    // Only restore when switching to a different file path or on first mount
    if (restoredPathRef.current === filePath) return;
    restoredPathRef.current = filePath;

    if (savedCursor) {
      skipCursorEventRef.current = true;
      editor.setPosition({ lineNumber: savedCursor.line, column: savedCursor.column });
      editor.revealLineInCenter(savedCursor.line);
    }

    if (savedScroll) {
      // Scroll restoration needs a small delay so the editor has laid out
      requestAnimationFrame(() => {
        editor.setScrollPosition({
          scrollTop: savedScroll.scrollTop,
          scrollLeft: savedScroll.scrollLeft,
        });
      });
    }
  }, [filePath, savedCursor, savedScroll]);

  const editorOptions = useMemo(
    () => ({
      automaticLayout: true,
      bracketPairColorization: { enabled: true },
      fontLigatures: true,
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      tabSize: 2,
    }),
    [],
  );

  const lang = language || getLanguageFromPath(filePath);

  return (
    <div className="editor-pane" id="editor-pane">
      <Editor
        height="100%"
        language={lang}
        value={value}
        path={filePath}
        onChange={handleChange}
        onMount={handleEditorMount}
        theme="vs-dark"
        options={editorOptions}
        loading={<div className="editor-loading">Loading editor…</div>}
      />
    </div>
  );
}