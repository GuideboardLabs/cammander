import { useCallback, useRef, useState, useEffect } from 'react';
import { useWorkspace } from '@/stores';
import { useFileSystem, useAppPersistence } from '@/hooks';
import { FileTree, EditorTabs, EditorPane, SpreadsheetViewer, WebAppsPanel } from '@/components';
import { ChatPanel } from '@/components/ChatPanel';
import { TerminalPanel } from '@/components/TerminalPanel';
import { VaultPanel } from '@/components/VaultPanel';
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
  const [activePanel, setActivePanel] = useState<'explorer' | 'vault'>('explorer');
  const [isMobile, setIsMobile] = useState(false);
  const [sidebarVisible, setSidebarVisible] = useState(false);

  const handleSetPanel = useCallback((panel: 'explorer' | 'vault') => {
    setActivePanel(panel);
    if (isMobile) setSidebarVisible(true);
  }, [isMobile]);

  // Mobile detection
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth <= 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

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
  const activeTab = state.openTabs.find((t) => t.filePath === state.activeTab);
  const isBinarySpreadsheet = state.activeTab ? /\.(xlsx?|xls)$/i.test(state.activeTab) : false;

  const handleSpreadsheetDataLoaded = useCallback((data: import('@/types').SpreadsheetData) => {
    if (state.activeTab) {
      dispatch({ type: 'SET_SPREADSHEET_DATA', filePath: state.activeTab, data });
    }
  }, [state.activeTab, dispatch]);

  const sidebarContent = activePanel === 'explorer' ? (
    <>
      <div className="sidebar-panel-header">
        <button className="sidebar-panel-explore-btn" onClick={handleOpenFolder} disabled={loading}>
          {loading ? 'Opening…' : 'Open Folder'}
        </button>
        <button className="sidebar-icon-btn" onClick={() => setPickerOpen(true)} title="Browse workspaces">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
        </button>
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
        <FileTree root={state.root} onFileSelect={handleFileSelect} activeFilePath={state.activeTab} />
      </div>
      <WebAppsPanel workspaceRoot={state.root?.path || ''} />
    </>
  ) : (
    isMobile ? null : <VaultPanel onClose={() => setActivePanel('explorer')} isMobile={isMobile} />
  );

  return (
    <div className={`app-layout${chatOpen ? ' app-layout--chat' : ''}${activePanel === 'vault' ? ' app-layout--vault' : ''}`}>
      {/* Mobile hamburger */}
      {isMobile && (
        <button className="mobile-hamburger" onClick={() => setSidebarVisible(!sidebarVisible)} title="Menu">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
          </svg>
        </button>
      )}

      {/* Sidebar overlay (mobile) */}
      {isMobile && sidebarVisible && (
        <div className="sidebar-overlay sidebar-overlay--visible" onClick={() => setSidebarVisible(false)} />
      )}

      {/* Left sidebar */}
      <aside className={`sidebar${isMobile ? (sidebarVisible ? ' sidebar--visible' : '') : ''}`}>
        <div className="sidebar-tabs">
          <button
            className={`sidebar-tab${activePanel === 'explorer' ? ' sidebar-tab--active' : ''}`}
            onClick={() => handleSetPanel('explorer')}
            title="Explorer"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
            </svg>
            <span>Explorer</span>
          </button>
          <button
            className={`sidebar-tab${activePanel === 'vault' ? ' sidebar-tab--active' : ''}`}
            onClick={() => handleSetPanel('vault')}
            title="Vault"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>
            </svg>
            <span>Vault</span>
          </button>
        </div>
        <div className="sidebar-content">
          {sidebarContent}
        </div>
        {/* Bottom toolbar */}
        <div className="sidebar-toolbar">
          <button className={`sidebar-toolbar-btn${termOpen ? ' sidebar-toolbar-btn--active' : ''}`} onClick={() => setTermOpen(!termOpen)} title="Toggle terminal">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/>
            </svg>
          </button>
          <button className={`sidebar-toolbar-btn${chatOpen ? ' sidebar-toolbar-btn--active' : ''}`} onClick={() => setChatOpen(!chatOpen)} title="Toggle chat">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>
            </svg>
          </button>
          <button className="sidebar-toolbar-btn" onClick={() => setSettingsOpen(true)} title="Settings">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.18A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.67 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.18A1.65 1.65 0 0 0 4.67 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.67a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.18a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.33 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.18a1.65 1.65 0 0 0-1.51 1z"/>
            </svg>
          </button>
        </div>
      </aside>

      {/* Mobile vault full-width overlay */}
      {isMobile && activePanel === 'vault' && (
        <VaultPanel onClose={() => setActivePanel('explorer')} isMobile={isMobile} panelMode="overlay" />
      )}

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
