import { Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Detect a Python virtual environment in a directory.
 * Returns the activation command (source/activate) or null.
 */
export function detectVenv(dir: string): string | null {
  const candidates = [
    // Standard venv locations
    path.join(dir, '.venv'),
    path.join(dir, 'venv'),
    path.join(dir, 'env'),
    // Nested under project name
    ...findNestedVenvs(dir),
  ];

  for (const venvPath of candidates) {
    if (isVenv(venvPath)) {
      const activatePath = path.join(venvPath, 'bin', 'activate');
      if (fs.existsSync(activatePath)) {
        return `source ${activatePath}`;
      }
    }
  }
  return null;
}

function isVenv(dirPath: string): boolean {
  if (!fs.existsSync(dirPath) || !fs.statSync(dirPath).isDirectory()) {
    return false;
  }
  // A venv has bin/activate and lib/python*
  const binDir = path.join(dirPath, 'bin');
  const activatePath = path.join(binDir, 'activate');
  if (!fs.existsSync(activatePath)) return false;

  const libDir = path.join(dirPath, 'lib');
  if (fs.existsSync(libDir)) {
    const entries = fs.readdirSync(libDir);
    if (entries.some((e) => e.startsWith('python'))) return true;
  }

  // conda-style: conda-meta/
  if (fs.existsSync(path.join(dirPath, 'conda-meta'))) return true;

  return false;
}

function findNestedVenvs(dir: string): string[] {
  const results: string[] = [];
  try {
    if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return results;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const venvNames = ['.venv', 'venv', 'env'];
      if (venvNames.includes(entry.name)) {
        results.push(path.join(dir, entry.name));
      }
    }
  } catch {
    // ignore permission errors etc
  }
  return results;
}

/**
 * Detect Node.js project and return activation hints.
 */
export function detectNodeProject(dir: string): { nvmrc?: string; volta?: boolean } | null {
  const nvmrcPath = path.join(dir, '.nvmrc');
  const packageJsonPath = path.join(dir, 'package.json');
  const hasNvmrc = fs.existsSync(nvmrcPath);
  const hasPackageJson = fs.existsSync(packageJsonPath);

  if (!hasNvmrc && !hasPackageJson) return null;

  const result: { nvmrc?: string; volta?: boolean } = {};

  if (hasNvmrc) {
    try {
      result.nvmrc = fs.readFileSync(nvmrcPath, 'utf8').trim();
    } catch {
      // ignore
    }
  }

  // Check for volta pin in package.json
  if (hasPackageJson) {
    try {
      const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
      if (pkg.volta) result.volta = true;
    } catch {
      // ignore
    }
  }

  return Object.keys(result).length > 0 ? result : null;
}

/**
 * Build the shell init commands for a workspace directory.
 * - cd into the directory
 * - activate venv if found
 * - show detected project info
 */
export function buildTerminalInit(cwd: string): { command: string; info: string[] } {
  const info: string[] = [];
  const parts: string[] = [];

  // cd into workspace
  parts.push(`cd ${cwd}`);

  // Detect and activate Python venv
  const venv = detectVenv(cwd);
  if (venv) {
    parts.push(venv);
    const venvDir = cwd; // venv is relative to cwd
    info.push(`🐍 venv activated: ${venv.replace(/^source /, '')}`);
  }

  // Detect Node project
  const nodeInfo = detectNodeProject(cwd);
  if (nodeInfo) {
    if (nodeInfo.nvmrc) {
      info.push(`📦 .nvmrc: v${nodeInfo.nvmrc}`);
    }
    if (nodeInfo.volta) {
      info.push(`⚡ Volta project detected`);
    }
  }

  return {
    command: parts.join(' && '),
    info,
  };
}