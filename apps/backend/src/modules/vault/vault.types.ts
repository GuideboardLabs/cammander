// ── Vault v0.2 — GBrain-inspired types ──────────────────────────────────
// Graph walking, facts tables, search tiers, session auto-write.

export interface VaultNoteSummary {
  id: string;
  title: string;
  tags: string[];
  path: string;
  createdAt: string;
  updatedAt: string;
}

export interface VaultNote extends VaultNoteSummary {
  content: string;
  filePath: string;
  backlinks: string[]; // notes that [[wikilink]] to this one
  wikilinks: string[]; // notes this one links [[to]]
}

/** Parsed row from a `## Facts` fence table (gbrain-inspired). */
export interface VaultFact {
  rowNum: number;
  claim: string;
  kind: FactKind;
  confidence: number;
  value?: string;      // metric value if present
  unit?: string;       // unit if present
  source?: string;
  context?: string;
  active: boolean;     // false if strikethrough
}

export type FactKind = 'metric' | 'event' | 'decision' | 'preference' | 'fact' | 'pitfall';

/** Search tier auto-detected from query complexity. */
export type SearchMode = 'quick' | 'balanced' | 'deep';

/** Full configuration for one search tier. */
export interface SearchModeConfig {
  maxResultChars: number;
  keywordWeight: number;        // keyword score multiplier
  graphHops: number;            // wikilink graph traversal depth
  graphBump: number;            // bonus per graph-hop match
  recencyDays: number;          // recency bonus window
  includeFacts: boolean;        // include facts tables in context
}

/** A session auto-write note (written to .cammander/vault/sessions/). */
export interface SessionNote {
  id: string;
  timestamp: string;
  summary: string;
  decisions: string[];
  tags: string[];
  sessionId: string;
}

export class CreateVaultNoteDto {
  title!: string;
  content!: string;
  tags?: string[];
  path?: string;
}

export class UpdateVaultNoteDto {
  title?: string;
  content?: string;
  tags?: string[];
}

export class WriteSessionDto {
  summary!: string;
  decisions?: string[];
  tags?: string[];
  sessionId!: string;
}