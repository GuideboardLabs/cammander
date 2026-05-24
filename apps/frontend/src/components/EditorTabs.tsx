import type { OpenTab } from '@/types';
import './EditorTabs.css';

interface EditorTabsProps {
  tabs: OpenTab[];
  activeTab: string;
  onTabSelect: (filePath: string) => void;
  onTabClose: (filePath: string) => void;
}

export function EditorTabs({ tabs, activeTab, onTabSelect, onTabClose }: EditorTabsProps) {
  if (tabs.length === 0) {
    return (
      <div className="editor-tabs editor-tabs--empty" role="tablist" aria-label="Open files">
        <span className="editor-tabs-placeholder">No files open</span>
      </div>
    );
  }

  return (
    <div className="editor-tabs" role="tablist" aria-label="Open files">
      {tabs.map((tab) => {
        const isActive = tab.filePath === activeTab;
        return (
          <button
            key={tab.filePath}
            role="tab"
            aria-selected={isActive}
            aria-controls="editor-pane"
            className={`editor-tab ${isActive ? 'editor-tab--active' : ''}`}
            onClick={() => onTabSelect(tab.filePath)}
            title={tab.filePath}
          >
            <span className="editor-tab-label">{tab.label}</span>
            {tab.modified && <span className="editor-tab-modified" title="Unsaved changes">●</span>}
            <span
              className="editor-tab-close"
              role="button"
              aria-label={`Close ${tab.label}`}
              onClick={(e) => {
                e.stopPropagation();
                onTabClose(tab.filePath);
              }}
            >
              ×
            </span>
          </button>
        );
      })}
    </div>
  );
}