#!/usr/bin/env node
/**
 * vault-index.js — Auto-index project state into vault notes.
 *
 * Scans key project files (package.json, routes, module directories, etc.)
 * and creates/updates vault notes with current state. Keeps vault knowledge
 * in sync with the codebase.
 *
 * Usage:
 *   node scripts/vault-index.js [--workspace /path/to/project]
 *
 * By default, workspace = CWD or /home/sc/cammander.
 * Vault notes live at <workspace>/.cammander/vault/*.md
 */

const fs = require('fs');
const path = require('path');

const workspace = process.argv.find(a => a === '--workspace')
  ? process.argv[process.argv.indexOf('--workspace') + 1]
  : (process.env.WORKSPACE_ROOT || process.cwd());

const vaultDir = path.join(workspace, '.cammander', 'vault');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function slugify(title) {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64) || 'untitled';
}

function writeNote(title, tags, content) {
  ensureDir(vaultDir);
  const id = slugify(title);
  const fp = path.join(vaultDir, `${id}.md`);
  const now = new Date().toISOString();
  const existing = fs.existsSync(fp) ? fs.readFileSync(fp, 'utf-8') : null;
  const createdMatch = existing ? existing.match(/^created:\s*(.+)$/m) : null;
  const created = createdMatch ? createdMatch[1] : now;

  const frontmatter = [
    '---',
    `title: ${title}`,
    `tags: [${tags.join(', ')}]`,
    `created: ${created}`,
    `updated: ${now}`,
    '---',
    '',
    content.trim(),
    '',
  ].join('\n');

  fs.writeFileSync(fp, frontmatter, 'utf-8');
  console.log(`  ✓ ${id}.md (${content.length} chars)`);
}

function scanModules() {
  const modulesDir = path.join(workspace, 'apps/backend/src/modules');
  if (!fs.existsSync(modulesDir)) return [];
  return fs.readdirSync(modulesDir, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name);
}

function scanRoutes() {
  // Quick scan of controller files for @Get/@Post/@Put/@Delete decorators
  const routes = [];
  const modulesDir = path.join(workspace, 'apps/backend/src/modules');
  if (!fs.existsSync(modulesDir)) return routes;

  for (const mod of scanModules()) {
    const modDir = path.join(modulesDir, mod);
    for (const file of fs.readdirSync(modDir)) {
      if (!file.endsWith('.controller.ts')) continue;
      const content = fs.readFileSync(path.join(modDir, file), 'utf-8');
      const controllerMatch = content.match(/@Controller\(['"](\w+)['"]\)/);
      const prefix = controllerMatch ? controllerMatch[1] : mod;
      const methodMatches = content.matchAll(/@(Get|Post|Put|Delete|Patch)\(['"]([^'"]*)['"]\)/g);
      for (const m of methodMatches) {
        routes.push(`${m[1]} /api/${prefix}/${m[2]}`);
      }
      // Also catch routes without path (root of controller)
      const rootMethods = content.matchAll(/@(Get|Post|Put|Delete|Patch)\(\)/g);
      for (const m of rootMethods) {
        routes.push(`${m[1]} /api/${prefix}`);
      }
    }
  }
  return [...new Set(routes)].sort();
}

function scanPackageJson() {
  const pkgPath = path.join(workspace, 'package.json');
  if (!fs.existsSync(pkgPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
  } catch { return null; }
}

function scanBackendPackageJson() {
  const pkgPath = path.join(workspace, 'apps/backend/package.json');
  if (!fs.existsSync(pkgPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
  } catch { return null; }
}

// ── Main ──

console.log(`Vault index: scanning ${workspace}`);
ensureDir(vaultDir);

// 1. Module inventory
const modules = scanModules();
writeNote('Module Inventory', ['architecture', 'modules', 'auto-indexed'],
  `# Backend Module Inventory\n\nAuto-generated from directory scan.\n\n` +
  modules.map(m => `- **${m}/** — \`${m}\` module`).join('\n') +
  `\n\nTotal: ${modules.length} modules`
);

// 2. Route map
const routes = scanRoutes();
writeNote('Route Map', ['api', 'endpoints', 'routes', 'auto-indexed'],
  `# API Route Map\n\nAuto-generated from controller decorators.\n\n` +
  (routes.length > 0
    ? routes.map(r => `- \`${r}\``).join('\n')
    : 'No routes found.')
);

// 3. Package versions
const rootPkg = scanPackageJson();
const backendPkg = scanBackendPackageJson();
if (rootPkg || backendPkg) {
  const lines = [];
  if (rootPkg) {
    lines.push(`## Root package.json`);
    lines.push(`- Version: ${rootPkg.version || 'unknown'}`);
    lines.push(`- Name: ${rootPkg.name || 'unknown'}`);
  }
  if (backendPkg) {
    lines.push(`## Backend package.json`);
    lines.push(`- Version: ${backendPkg.version || 'unknown'}`);
    const deps = { ...backendPkg.dependencies, ...backendPkg.devDependencies };
    const keyDeps = ['@nestjs/core', '@nestjs/common', 'xterm', 'socket.io', 'node-pty'];
    for (const dep of keyDeps) {
      if (deps[dep]) lines.push(`- ${dep}: ${deps[dep]}`);
    }
  }
  writeNote('Package Versions', ['config', 'dependencies', 'auto-indexed'], lines.join('\n'));
}

// 4. Vault note index
const vaultFiles = fs.readdirSync(vaultDir).filter(f => f.endsWith('.md'));
writeNote('Vault Index', ['vault', 'index', 'auto-indexed'],
  `# Vault Note Index\n\nAuto-generated catalog of all vault notes.\n\n` +
  vaultFiles.map(f => `- [[${f.replace('.md', '')}]]`).join('\n') +
  `\n\nTotal: ${vaultFiles.length} notes`
);

console.log(`Done. ${vaultFiles.length + 4} vault notes updated/created.`);