/**
 * Language configuration for Monaco Editor.
 * Registers Monarch tokenizers for languages Monaco doesn't ship built-in,
 * and ensures local Monaco bundle is used instead of CDN.
 */

// ── Extension → Monaco language ID mapping ──
export const LANGUAGE_MAP: Record<string, string> = {
  ts: 'typescript',
  tsx: 'typescript',
  js: 'javascript',
  jsx: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  json: 'json',
  jsonc: 'json',
  css: 'css',
  scss: 'scss',
  less: 'less',
  html: 'html',
  htm: 'html',
  svg: 'html',
  xml: 'xml',
  md: 'markdown',
  markdown: 'markdown',
  py: 'python',
  pyw: 'python',
  rs: 'rust',
  go: 'go',
  yaml: 'yaml',
  yml: 'yaml',
  toml: 'toml',
  sh: 'shell',
  bash: 'shell',
  zsh: 'shell',
  sql: 'sql',
  csv: 'csv',
  tsv: 'csv',
  xls: 'spreadsheet',
  xlsx: 'spreadsheet',
  dockerfile: 'dockerfile',
  makefile: 'makefile',
  proto: 'protobuf',
  graphql: 'graphql',
  gql: 'graphql',
  env: 'dotenv',
  gitignore: 'plaintext',
  dockerignore: 'plaintext',
  lock: 'json',
  vue: 'html',
  svelte: 'html',
};

export function getLanguageFromPath(filePath: string): string {
  const fileName = filePath.split('/').pop() ?? '';
  // Check exact filename matches first (Dockerfile, Makefile, etc.)
  const lowerName = fileName.toLowerCase();
  if (lowerName === 'dockerfile' || lowerName.startsWith('dockerfile.')) return 'dockerfile';
  if (lowerName === 'makefile') return 'makefile';
  if (lowerName === '.env' || lowerName.startsWith('.env.')) return 'dotenv';
  if (lowerName === '.gitignore' || lowerName === '.dockerignore') return 'plaintext';
  if (lowerName === '.toml' || lowerName === 'cargo.toml' || lowerName === 'pyproject.toml') return 'toml';

  const ext = fileName.includes('.') ? fileName.split('.').pop()! : '';
  return LANGUAGE_MAP[ext] ?? ext;
}

// ── Monarch tokenizer definitions (consumed at runtime by Monaco API) ──
// Using explicit tuple arrays — Monaco's tokenizer rules are [pattern, action] tuples

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ML = any;

// ── CSV Monarch tokenizer ──
const CSV_TOKENIZER: ML = {
  tokenizer: {
    root: [
      [/,/, 'delimiter.comma'],
      [/\t/, 'delimiter.tab'],
      [/"([^"\\]|\\.)*"/, 'string.quoted'],
      [/'([^'\\]|\\.)*'/, 'string.quoted'],
      [/\d+\.\d+/, 'number.float'],
      [/\d+/, 'number'],
      [/true|false|null/i, 'keyword'],
    ],
  },
};

// ── TOML Monarch tokenizer ──
const TOML_TOKENIZER: ML = {
  comments: { lineComment: '#' },
  tokenizer: {
    root: [
      [/^\s*\[[\w.-]+\]/, 'keyword.section'],
      [/^\s*\[\[[\w.-]+\]\]/, 'keyword.section.array'],
      [/[a-zA-Z_][\w.-]*(?=\s*=)/, 'variable.key'],
      [/=/, 'delimiter'],
      [/"([^"\\]|\\.)*"/, 'string.quoted.double'],
      [/'([^'\\]|\\.)*'/, 'string.quoted.single'],
      [/'''(.|\n)*?'''/, 'string.triple'],
      [/"""(.|\n)*?"""/, 'string.triple'],
      [/\d+\.\d+([eE][+-]?\d+)?/, 'number.float'],
      [/\d+([eE][+-]?\d+)?/, 'number'],
      [/true|false/, 'keyword.bool'],
      [/#.*$/, 'comment'],
    ],
  },
};

// ── Dockerfile Monarch tokenizer ──
const DOCKERFILE_TOKENIZER: ML = {
  comments: { lineComment: '#' },
  tokenizer: {
    root: [
      [/^(FROM|RUN|CMD|LABEL|MAINTAINER|EXPOSE|ENV|ADD|COPY|ENTRYPOINT|VOLUME|USER|WORKDIR|ARG|ONBUILD|STOPSIGNAL|HEALTHCHECK|SHELL)\b/i, 'keyword.directive'],
      [/#.*$/, 'comment'],
      [/"/, 'string', '@string_double'],
      [/'/, 'string', '@string_single'],
      [/\$\{[a-zA-Z_]\w*\}/, 'variable'],
      [/\$[a-zA-Z_]\w*/, 'variable'],
    ],
    string_double: [
      [/[^ "\\]+/, 'string'],
      [/\\./, 'string.escape'],
      [/"/, 'string', '@pop'],
    ],
    string_single: [
      [/[^ '\\]+/, 'string'],
      [/\\./, 'string.escape'],
      [/'/, 'string', '@pop'],
    ],
  },
};

// ── dotenv Monarch tokenizer ──
const DOTENV_TOKENIZER: ML = {
  comments: { lineComment: '#' },
  tokenizer: {
    root: [
      [/^\s*[a-zA-Z_]\w*(?=\s*=)/, 'variable.key'],
      [/=/, 'delimiter'],
      [/"([^"\\]|\\.)*"/, 'string.quoted.double'],
      [/'([^'\\]|\\.)*'/, 'string.quoted.single'],
      [/#.*$/, 'comment'],
    ],
  },
};

// ── GraphQL Monarch tokenizer ──
const GRAPHQL_TOKENIZER: ML = {
  comments: { lineComment: '#' },
  tokenizer: {
    root: [
      [/""".*?"""/s, 'string.triple'],
      [/"([^"\\]|\\.)*"/, 'string.quoted.double'],
      [/\b(query|mutation|subscription|fragment|schema|directive|type|interface|union|scalar|enum|input|extends|implements|on|include|skip|deprecated|repeatable)\b/, 'keyword'],
      [/\b(true|false|null)\b/, 'keyword.bool'],
      [/\$[a-zA-Z_]\w*/, 'variable'],
      [/[A-Z][a-zA-Z0-9_]*/, 'type.identifier'],
      [/[a-z_][a-zA-Z0-9_]*/, 'identifier'],
      [/[{}()\[\]]/, 'delimiter.bracket'],
      [/:]/, 'delimiter'],
      [/!/, 'keyword.modifier'],
      [/#.*$/, 'comment'],
    ],
  },
};

/** Languages that Monaco ships tokenizers for but may need extension registration */
const EXTENDED_EXTENSIONS: Record<string, string[]> = {
  csv: ['.csv', '.tsv'],
  toml: ['.toml'],
  dockerfile: ['.dockerfile'],
  dotenv: ['.env', '.env.local', '.env.production', '.env.development'],
  graphql: ['.graphql', '.gql'],
};

/**
 * Register all custom Monarch tokenizers with Monaco.
 * Call this once when the Monaco editor mounts.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function registerCustomLanguages(monaco: any) {
  // Register custom languages that Monaco doesn't include
  monaco.languages.register({ id: 'csv', extensions: EXTENDED_EXTENSIONS.csv, aliases: ['CSV', 'TSV'] });
  monaco.languages.setMonarchTokensProvider('csv', CSV_TOKENIZER);

  monaco.languages.register({ id: 'toml', extensions: EXTENDED_EXTENSIONS.toml, filenames: ['Cargo.toml', 'pyproject.toml'], aliases: ['TOML'] });
  monaco.languages.setMonarchTokensProvider('toml', TOML_TOKENIZER);

  monaco.languages.register({ id: 'dockerfile', extensions: EXTENDED_EXTENSIONS.dockerfile, filenames: ['Dockerfile'], aliases: ['Dockerfile'] });
  monaco.languages.setMonarchTokensProvider('dockerfile', DOCKERFILE_TOKENIZER);

  monaco.languages.register({ id: 'dotenv', extensions: EXTENDED_EXTENSIONS.dotenv, aliases: ['dotenv', 'env'] });
  monaco.languages.setMonarchTokensProvider('dotenv', DOTENV_TOKENIZER);

  monaco.languages.register({ id: 'graphql', extensions: EXTENDED_EXTENSIONS.graphql, aliases: ['GraphQL'] });
  monaco.languages.setMonarchTokensProvider('graphql', GRAPHQL_TOKENIZER);

  // Auto-close pairs for key languages
  const bracketPairs: Record<string, { open: string; close: string; notIn?: string[] }[]> = {
    python: [
      { open: '(', close: ')', notIn: ['string', 'comment'] },
      { open: '[', close: ']', notIn: ['string', 'comment'] },
      { open: '{', close: '}', notIn: ['string', 'comment'] },
      { open: '"', close: '"', notIn: ['string'] },
      { open: "'", close: "'", notIn: ['string'] },
    ],
    rust: [
      { open: '(', close: ')', notIn: ['string', 'comment'] },
      { open: '[', close: ']', notIn: ['string', 'comment'] },
      { open: '{', close: '}', notIn: ['string', 'comment'] },
      { open: '"', close: '"', notIn: ['string'] },
      { open: "'", close: "'", notIn: ['string', 'comment'] },
    ],
    go: [
      { open: '(', close: ')', notIn: ['string', 'comment'] },
      { open: '[', close: ']', notIn: ['string', 'comment'] },
      { open: '{', close: '}', notIn: ['string', 'comment'] },
      { open: '"', close: '"', notIn: ['string'] },
      { open: '`', close: '`', notIn: ['string'] },
    ],
    shell: [
      { open: '(', close: ')', notIn: ['string', 'comment'] },
      { open: '{', close: '}', notIn: ['string', 'comment'] },
      { open: '"', close: '"', notIn: ['string'] },
      { open: "'", close: "'", notIn: ['string'] },
      { open: '`', close: '`', notIn: ['string'] },
    ],
    csv: [
      { open: '"', close: '"' },
    ],
    toml: [
      { open: '"', close: '"', notIn: ['string'] },
      { open: "'", close: "'", notIn: ['string'] },
    ],
    dockerfile: [
      { open: '"', close: '"', notIn: ['string'] },
      { open: "'", close: "'", notIn: ['string'] },
    ],
    dotenv: [
      { open: '"', close: '"', notIn: ['string'] },
      { open: "'", close: "'", notIn: ['string'] },
    ],
  };

  for (const [langId, pairs] of Object.entries(bracketPairs)) {
    monaco.languages.setLanguageConfiguration(langId, {
      autoClosingPairs: pairs,
      surroundingPairs: pairs.map(p => ({ open: p.open, close: p.close })),
    });
  }
}