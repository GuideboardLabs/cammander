export interface VaultNote {
  id: string;          // filename without .md (slug)
  title: string;
  content: string;     // markdown body (without frontmatter)
  tags: string[];
  path: string;        // relative path within vault
  filePath: string;    // absolute filesystem path
  createdAt: string;   // ISO timestamp
  updatedAt: string;   // ISO timestamp
  backlinks: string[]; // note ids that link to this one
}

export interface VaultNoteSummary {
  id: string;
  title: string;
  tags: string[];
  path: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateVaultNoteDto {
  title: string;
  content?: string;
  tags?: string[];
  path?: string; // subdirectory within vault
}

export interface UpdateVaultNoteDto {
  title?: string;
  content?: string;
  tags?: string[];
}
