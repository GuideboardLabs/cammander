import { useState, useRef, useCallback, useEffect } from 'react';
import './VaultPanel.css';
import { VaultGraph } from './VaultGraph';

const API_BASE = '/api';

interface VaultNoteSummary {
  id: string;
  title: string;
  tags: string[];
  path: string;
  createdAt: string;
  updatedAt: string;
}

interface VaultFact {
  rowNum: number;
  claim: string;
  kind: string;
  confidence: number;
  value?: string;
  unit?: string;
  source?: string;
  context?: string;
  active: boolean;
}

interface VaultNote extends VaultNoteSummary {
  content: string;
  backlinks: string[];
  wikilinks: string[];
}

type SearchMode = 'quick' | 'balanced' | 'deep';

const SEARCH_MODE_LABELS: Record<SearchMode, { label: string; color: string }> = {
  quick: { label: 'Quick', color: '#7f85a3' },
  balanced: { label: 'Balanced', color: '#14b8a6' },
  deep: { label: 'Deep', color: '#f97316' },
};

interface VaultPanelProps {
  onClose?: () => void;
  isMobile?: boolean;
  panelMode?: 'sidebar' | 'overlay';
}

export function VaultPanel({ onClose, isMobile, panelMode = 'sidebar' }: VaultPanelProps) {
  const [notes, setNotes] = useState<VaultNoteSummary[]>([]);
  const [editingNote, setEditingNote] = useState<VaultNote | null>(null);
  const [isNewNote, setIsNewNote] = useState(false);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null);
  const [searchMode, setSearchMode] = useState<SearchMode | null>(null);
  const [facts, setFacts] = useState<VaultFact[]>([]);
  const [backlinks, setBacklinks] = useState<string[]>([]);
  const [showFacts, setShowFacts] = useState(false);
  const [viewMode, setViewMode] = useState<'list' | 'graph'>('list');
  const searchDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load notes
  const loadNotes = useCallback(async () => {
    try {
      setLoading(true);
      setSearchMode(null);
      const res = await fetch(`${API_BASE}/vault/notes`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setNotes(data);
    } catch (e) {
      console.warn('Vault load error:', e);
      setNotes([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadNotes();
  }, [loadNotes]);

  // Search with mode detection
  const handleSearchChange = useCallback((value: string) => {
    setSearch(value);
    if (searchDebounce.current) clearTimeout(searchDebounce.current);
    searchDebounce.current = setTimeout(async () => {
      if (!value.trim()) {
        loadNotes();
        setSearchMode(null);
        return;
      }
      try {
        setLoading(true);
        // Use context endpoint for mode auto-detection
        const res = await fetch(`${API_BASE}/vault/context`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: value.trim(),
            workspacePath: 'cammander',
            maxChars: 12000,
          }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        setSearchMode(data.mode);
        setNotes(data.notes.map((n: VaultNote) => ({
          id: n.id,
          title: n.title,
          tags: n.tags,
          path: n.path,
          createdAt: n.createdAt,
          updatedAt: n.updatedAt,
        })));
      } catch (e) {
        console.warn('Vault search error:', e);
        // Fallback to simple search
        try {
          const res = await fetch(`${API_BASE}/vault/search?q=${encodeURIComponent(value.trim())}`);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const data = await res.json();
          setNotes(data);
          setSearchMode(null);
        } catch {
          setNotes([]);
        }
      } finally {
        setLoading(false);
      }
    }, 300);
  }, [loadNotes]);

  const openNote = useCallback(async (noteId: string) => {
    try {
      const res = await fetch(`${API_BASE}/vault/notes/${noteId}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const note: VaultNote = await res.json();
      setEditingNote(note);
      setIsNewNote(false);
      setActiveNoteId(noteId);
      setShowFacts(false);

      // Load facts
      try {
        const factsRes = await fetch(`${API_BASE}/vault/facts/${noteId}`);
        if (factsRes.ok) {
          const factsData = await factsRes.json();
          setFacts(factsData);
        }
      } catch { /* skip */ }

      // Load backlinks
      setBacklinks(note.backlinks || []);
    } catch (e) {
      console.error('Failed to open vault note:', e);
    }
  }, []);

  const newNote = useCallback(() => {
    setEditingNote({
      id: '',
      title: '',
      content: '',
      tags: [],
      path: '',
      createdAt: '',
      updatedAt: '',
      backlinks: [],
      wikilinks: [],
    } as VaultNote);
    setIsNewNote(true);
    setActiveNoteId('new');
    setFacts([]);
    setBacklinks([]);
  }, []);

  const cancelEdit = useCallback(() => {
    setEditingNote(null);
    setIsNewNote(false);
    setActiveNoteId(null);
    setFacts([]);
    setBacklinks([]);
    setShowFacts(false);
  }, []);

  const saveNote = useCallback(async () => {
    if (!editingNote) return;
    const title = editingNote.title.trim();
    if (!title) return;
    const tagsStr = editingNote.tags.join(',').trim();
    const tags = tagsStr ? tagsStr.split(',').map((s) => s.trim()).filter(Boolean) : [];
    const content = editingNote.content;

    try {
      if (isNewNote) {
        await fetch(`${API_BASE}/vault/notes`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title, tags, content }),
        });
      } else {
        await fetch(`${API_BASE}/vault/notes/${editingNote.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title, tags, content }),
        });
      }
      setEditingNote(null);
      setIsNewNote(false);
      setActiveNoteId(null);
      setFacts([]);
      setBacklinks([]);
      setShowFacts(false);
      await loadNotes();
    } catch (e) {
      alert('Save failed: ' + (e as Error).message);
    }
  }, [editingNote, isNewNote, loadNotes]);

  const deleteNote = useCallback(async () => {
    if (!editingNote || isNewNote) return;
    if (!confirm('Delete this note?')) return;
    try {
      await fetch(`${API_BASE}/vault/notes/${editingNote.id}`, { method: 'DELETE' });
      setEditingNote(null);
      setIsNewNote(false);
      setActiveNoteId(null);
      setFacts([]);
      setBacklinks([]);
      await loadNotes();
    } catch (e) {
      alert('Delete failed: ' + (e as Error).message);
    }
  }, [editingNote, isNewNote, loadNotes]);

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleDateString();
    } catch {
      return '';
    }
  };

  return (
    <div className={`vault-panel ${panelMode === 'overlay' ? 'vault-panel--overlay' : ''}`}>
      {/* Mobile close button */}
      {panelMode === 'overlay' && onClose && (
        <button className="vault-mobile-close" onClick={onClose} title="Close vault">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      )}

      <div className="vault-header">
        <svg className="vault-header-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>
        </svg>
        <span className="vault-header-title" title={editingNote?.title || 'Vault'}>
          {editingNote ? (editingNote.title || 'New Note') : 'Vault'}
        </span>
        {!editingNote && (
          <button
            className={`vault-header-new-btn vault-header-graph-btn ${viewMode === 'graph' ? 'vault-header-graph-btn--active' : ''}`}
            onClick={() => setViewMode(viewMode === 'graph' ? 'list' : 'graph')}
            title={viewMode === 'graph' ? 'Show list' : 'Show graph'}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              {viewMode === 'graph' ? (
                <>
                  <line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" />
                </>
              ) : (
                <>
                  <circle cx="12" cy="12" r="3" /><circle cx="19" cy="5" r="2" /><circle cx="5" cy="5" r="2" /><circle cx="19" cy="19" r="2" /><circle cx="5" cy="19" r="2" /><line x1="12" y1="9" x2="17" y2="6.5" /><line x1="12" y1="9" x2="7" y2="6.5" /><line x1="12" y1="15" x2="17" y2="17.5" /><line x1="12" y1="15" x2="7" y2="17.5" /><line x1="5" y1="7" x2="5" y2="17" /><line x1="19" y1="7" x2="19" y2="17" />
                </>
              )}
            </svg>
          </button>
        )}
        <button className="vault-header-new-btn" onClick={newNote} title="New note">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
        </button>
      </div>

      {editingNote ? (
        <div className="vault-editor">
          {/* Facts indicator */}
          {facts.length > 0 && (
            <div className="vault-facts-bar" onClick={() => setShowFacts(!showFacts)}>
              <span className="vault-facts-icon">📊</span>
              <span className="vault-facts-count">{facts.filter(f => f.active).length} active facts</span>
              <span className={`vault-facts-toggle ${showFacts ? 'open' : ''}`}>▸</span>
            </div>
          )}

          {/* Facts table */}
          {showFacts && facts.length > 0 && (
            <div className="vault-facts-table">
              <div className="vault-facts-table-header">
                <span className="vault-facts-col">Claim</span>
                <span className="vault-facts-col vault-facts-col--narrow">Kind</span>
                <span className="vault-facts-col vault-facts-col--narrow">Conf</span>
                <span className="vault-facts-col vault-facts-col--wide">Source</span>
              </div>
              {facts.filter(f => f.active).map(fact => (
                <div key={fact.rowNum} className="vault-facts-row">
                  <span className="vault-facts-col vault-facts-col--claim">{fact.claim}</span>
                  <span className={`vault-facts-col vault-facts-col--narrow vault-facts-kind--${fact.kind}`}>{fact.kind}</span>
                  <span className="vault-facts-col vault-facts-col--narrow">{(fact.confidence * 100).toFixed(0)}%</span>
                  <span className="vault-facts-col vault-facts-col--wide vault-facts-source">{fact.source || '—'}</span>
                </div>
              ))}
            </div>
          )}

          {/* Backlinks */}
          {backlinks.length > 0 && (
            <div className="vault-facts-bar">
              <span className="vault-facts-icon">🔗</span>
              <span className="vault-facts-count">{backlinks.length} backlink{backlinks.length !== 1 ? 's' : ''}</span>
              <span className="vault-facts-list">
                {backlinks.slice(0, 5).map((bl) => (
                  <span key={bl} className="vault-backlink-chip" onClick={() => openNote(bl)}>
                    [[{bl}]]
                  </span>
                ))}
                {backlinks.length > 5 && <span className="vault-backlink-more">+{backlinks.length - 5} more</span>}
              </span>
            </div>
          )}

          <div className="vault-editor-field">
            <label className="vault-editor-label">Title</label>
            <input
              className="vault-editor-input"
              type="text"
              value={editingNote.title}
              onChange={(e) => setEditingNote({ ...editingNote, title: e.target.value })}
              placeholder="Note title..."
              autoFocus
            />
          </div>
          <div className="vault-editor-field">
            <label className="vault-editor-label">Tags</label>
            <input
              className="vault-editor-input"
              type="text"
              value={editingNote.tags.join(', ')}
              onChange={(e) => setEditingNote({ ...editingNote, tags: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })}
              placeholder="tag1, tag2, tag3..."
            />
          </div>
          <div className="vault-editor-field vault-editor-field--content">
            <label className="vault-editor-label">Content</label>
            <textarea
              className="vault-editor-textarea"
              value={editingNote.content}
              onChange={(e) => setEditingNote({ ...editingNote, content: e.target.value })}
              placeholder="# Write your note here...\n\n## Facts\n\n<!--- cammander:facts:begin -->\n| # | claim | kind | confidence | value | unit | source | context |\n|---|---|---|---|---|---|---|---|\n| 1 | ...  | fact  | 0.9       |       |      |        |         |\n<!--- cammander:facts:end -->"
              rows={isMobile ? 12 : 8}
            />
          </div>
          <div className="vault-editor-actions">
            <button className="vault-editor-btn vault-editor-btn--primary" onClick={saveNote}>
              Save
            </button>
            <button className="vault-editor-btn vault-editor-btn--secondary" onClick={cancelEdit}>
              Cancel
            </button>
            {!isNewNote && (
              <button className="vault-editor-btn vault-editor-btn--danger" onClick={deleteNote}>
                Delete
              </button>
            )}
          </div>
        </div>
      ) : (
        <>
          <div className="vault-search-bar">
            <div className="vault-search-wrapper">
              <svg className="vault-search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
              <input
                className="vault-search-input"
                type="text"
                value={search}
                onChange={(e) => handleSearchChange(e.target.value)}
                placeholder="Search notes..."
              />
            </div>
            {/* Search mode indicator */}
            {searchMode && (
              <div className="vault-search-mode" style={{ color: SEARCH_MODE_LABELS[searchMode].color }}>
                <span className="vault-search-mode-dot" style={{ background: SEARCH_MODE_LABELS[searchMode].color }} />
                {SEARCH_MODE_LABELS[searchMode].label}
              </div>
            )}
          </div>
          {viewMode === 'graph' ? (
            <VaultGraph onOpenNote={(id) => {
              // Switch to list view and open the note
              setViewMode('list');
              openNote(id);
            }} isMobile={isMobile} />
          ) : (
          <div className="vault-note-list">
            {loading && notes.length === 0 ? (
              <div className="vault-empty">Loading notes…</div>
            ) : notes.length === 0 ? (
              <div className="vault-empty">
                <div className="vault-empty-icon">📝</div>
                <div className="vault-empty-text">No notes yet.</div>
                <div className="vault-empty-hint">Click + to create your first note.</div>
              </div>
            ) : (
              notes.map((note, i) => (
                <div
                  key={note.id}
                  className={`vault-note-item ${activeNoteId === note.id ? 'vault-note-item--active' : ''}`}
                  onClick={() => openNote(note.id)}
                  style={{ animationDelay: `${(i % 8) * 30}ms` }}
                >
                  <div className="vault-note-accent" />
                  <div className="vault-note-content">
                    <div className="vault-note-title-row">
                      <span className="vault-note-item-title">{note.title}</span>
                      <span className="vault-note-item-date">{formatDate(note.updatedAt)}</span>
                    </div>
                    <div className="vault-note-meta-row">
                      {note.tags.length > 0 && (
                        <div className="vault-note-item-tags">
                          {note.tags.slice(0, 3).map((tag) => (
                            <span key={tag} className="vault-note-tag">{tag}</span>
                          ))}
                        </div>
                      )}
                      {note.path.startsWith('sessions/') && (
                        <span className="vault-note-badge vault-note-badge--session" title="Auto-written session note">session</span>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
          )}
        </>
      )}
    </div>
  );
}