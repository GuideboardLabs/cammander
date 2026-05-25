import { useCallback, useRef, useState } from 'react';
import { useWorkspace } from '@/stores';
import { useFileSystem, useAppPersistence } from '@/hooks';
import { FileTree, EditorTabs, EditorPane, SpreadsheetViewer, WebAppsPanel } from '@/components';
import { ChatPanel } from '@/components/ChatPanel';
import { TerminalPanel } from '@/components/TerminalPanel';
import { SettingsModal } from '@/components/SettingsModal';
import { WorkspacePicker } from '@/components/WorkspacePicker';
import { getLanguageFromPath } from '@/languages';
import type { FileNode, OpenTab, CursorPosition, ScrollPosition } from '@/types';

export default function App() {
  const { state, dispatch } = useWorkspace();
  const { openDirectoryPicker, loading: fsLoading, error: fsError } = useFileSystem();
  const { loading: persistenceLoading, quotaExceeded, concurrentTabDetected } = useAppPersistence();
  const [chatOpen, setChatOpen] = useState(false);
  const [termOpen, setTermOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  // Track cursor/scroll updates — debounced at the Monaco level
  const cursorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleOpenFolder = useCallback(async () => {
    // First try the browser File System Access API
    try {
      const result = await openDirectoryPicker();
      if (result) {
        dispatch({ type: 'SET_ROOT', root: result.root });
        dispatch({ type: 'SET_FILES', files: result.files });
        return;
      }
    } catch {
      // Fallback to server-side picker
    }
    setPickerOpen(true);
  }, [openDirectoryPicker, dispatch]);

  const handleWorkspaceSelect = useCallback(async (absPath: string) => {
    // Load the directory listing from the backend
    try {
      const res = await fetch(`/api/files?path=${encodeURIComponent(absPath)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const files = await res.json();
      dispatch({ type: 'SET_ROOT', root: { name: absPath.split('/').pop() || absPath, path: absPath, type: 'directory', children: files } });
      dispatch({ type: 'SET_FILES', files });
    } catch (e: any) {
      console.error('Failed to open workspace:', e.message);
    }
  }, [dispatch]);

  const handleFileSelect = useCallback(
    (node: FileNode) => {
      if (node.type !== 'file') return;
      const tab: OpenTab = {
        filePath: node.path,
        label: node.name,
        modified: false,
        cursor: { line: 1, column: 1 },
        scroll: { scrollTop: 0, scrollLeft: 0 },
      };
      dispatch({ type: 'OPEN_TAB', tab });
    },
    [dispatch],
  );

  const handleTabSelect = useCallback(
    (filePath: string) => {
      dispatch({ type: 'SET_ACTIVE_TAB', filePath });
    },
    [dispatch],
  );

  const handleTabClose = useCallback(
    (filePath: string) => {
      dispatch({ type: 'CLOSE_TAB', filePath });
    },
    [dispatch],
  );

  const handleEditorChange = useCallback(
    (value: string) => {
      if (!state.activeTab) return;
      dispatch({ type: 'UPDATE_FILE_CONTENT', filePath: state.activeTab, content: value });
      dispatch({ type: 'MARK_MODIFIED', filePath: state.activeTab, modified: true });
    },
    [state.activeTab, dispatch],
  );

  // Monaco editor cursor position change — debounced
  const handleCursorChange = useCallback(
    (cursor: CursorPosition) => {
      if (!state.activeTab) return;
      if (cursorTimerRef.current) clearTimeout(cursorTimerRef.current);
      cursorTimerRef.current = setTimeout(() => {
        dispatch({ type: 'SET_CURSOR', filePath: state.activeTab, cursor });
      }, 300);
    },
    [state.activeTab, dispatch],
  );

  // Monaco editor scroll position change — debounced
  const handleScrollChange = useCallback(
    (scroll: ScrollPosition) => {
      if (!state.activeTab) return;
      if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current);
      scrollTimerRef.current = setTimeout(() => {
        dispatch({ type: 'SET_SCROLL', filePath: state.activeTab, scroll });
      }, 300);
    },
    [state.activeTab, dispatch],
  );

  const loading = fsLoading || persistenceLoading;

  const activeFileContent = state.activeTab ? state.files.get(state.activeTab) ?? '' : '';
  const activeLanguage = state.activeTab ? getLanguageFromPath(state.activeTab) : 'plaintext';

  // Get active tab's saved cursor/scroll for restoration
  const activeTab = state.openTabs.find((t) => t.filePath === state.activeTab);

  // Check if active file is binary spreadsheet (content is base64)
  const isBinarySpreadsheet = state.activeTab ? /\.(xlsx?|xls)$/i.test(state.activeTab) : false;

  const handleSpreadsheetDataLoaded = useCallback((data: import('@/types').SpreadsheetData) => {
    if (state.activeTab) {
      dispatch({ type: 'SET_SPREADSHEET_DATA', filePath: state.activeTab, data });
    }
  }, [state.activeTab, dispatch]);

  return (
    <div className={`app-layout${chatOpen ? ' app-layout--chat' : ''}`}>
      {/* Left sidebar */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <span className="sidebar-title">Explorer</span>
          <div className="sidebar-actions">
            <button
              className={`sidebar-icon-btn${termOpen ? ' sidebar-icon-btn--active' : ''}`}
              onClick={() => setTermOpen(!termOpen)}
              title="Toggle terminal"
            >
              ⌘T
            </button>
            <button
              className={`sidebar-icon-btn${chatOpen ? ' sidebar-icon-btn--active' : ''}`}
              onClick={() => setChatOpen(!chatOpen)}
              title="Toggle chat"
            >
              💬
            </button>
            <button
              className="sidebar-icon-btn"
              onClick={() => setSettingsOpen(true)}
              title="Settings"
            >
              ⚙
            </button>
            <button
              className="sidebar-icon-btn"
              onClick={() => setPickerOpen(true)}
              title="Open workspace"
            >
              📂
            </button>
            <button
              className="open-folder-btn"
              onClick={handleOpenFolder}
              disabled={loading}
              title="Open a folder to browse"
            >
              {loading ? 'Loading…' : 'Open Folder'}
            </button>
          </div>
        </div>
        {fsError && <div className="sidebar-error">{fsError}</div>}
        {quotaExceeded && (
          <div className="sidebar-warning">
            Storage almost full — some data may not be saved ({quotaExceeded})
          </div>
        )}
        {concurrentTabDetected && (
          <div className="sidebar-info">
            Another tab is open — changes sync via last-write-wins
          </div>
        )}
        <div className="sidebar-tree">
          <FileTree
            root={state.root}
            onFileSelect={handleFileSelect}
            activeFilePath={state.activeTab}
          />
        </div>
        <WebAppsPanel workspaceRoot={state.root?.path || ''} />
      </aside>

      {/* Main area */}
      <main className="main-area">
        <EditorTabs
          tabs={state.openTabs}
          activeTab={state.activeTab}
          onTabSelect={handleTabSelect}
          onTabClose={handleTabClose}
        />
        <div className="editor-area">
          {state.activeTab ? (
            (activeTab?.viewMode === 'spreadsheet' || /\.(csv|tsv|xlsx?|xls)$/i.test(state.activeTab)) ? (
              <SpreadsheetViewer
                filePath={state.activeTab}
                content={activeFileContent}
                binaryData={isBinarySpreadsheet ? activeFileContent : null}
                onDataLoaded={handleSpreadsheetDataLoaded}
              />
            ) : (
              <EditorPane
                value={activeFileContent}
                language={activeLanguage}
                filePath={state.activeTab}
                onChange={handleEditorChange}
                onCursorChange={handleCursorChange}
                onScrollChange={handleScrollChange}
                savedCursor={activeTab?.cursor}
                savedScroll={activeTab?.scroll}
              />
            )
          ) : (
            <div className="welcome-screen">
              <h2>Cammander</h2>
              <p>Open a folder to start editing</p>
            </div>
          )}
        </div>
        {termOpen && <TerminalPanel onClose={() => setTermOpen(false)} />}
      </main>

      {/* Chat panel (right side) */}
      {chatOpen && <ChatPanel onClose={() => setChatOpen(false)} />}

      {/* Settings modal */}
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />

      {/* Workspace picker modal */}
      <WorkspacePicker open={pickerOpen} onClose={() => setPickerOpen(false)} onSelect={handleWorkspaceSelect} />
    </div>
  );
}