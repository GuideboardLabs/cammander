import { Injectable, Logger } from '@nestjs/common';
import { exec } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { ConfigService } from '@nestjs/config';

export interface ToolResult {
  name: string;
  toolCallId: string;
  content: string;
  error?: boolean;
}

const MAX_OUTPUT = 10000; // chars
const BASH_TIMEOUT_MS = 120_000; // 2 minutes for bash commands

@Injectable()
export class ToolsService {
  private readonly logger = new Logger(ToolsService.name);
  private workspaceRoot: string;

  constructor(private config: ConfigService) {
    this.workspaceRoot = this.config.get<string>('WORKSPACE_ROOT', '/tmp');
  }

  setWorkspaceRoot(root: string) {
    if (root && root !== this.workspaceRoot) {
      this.logger.log(`Workspace root changed: ${this.workspaceRoot} -> ${root}`);
      this.workspaceRoot = root;
    }
  }

  async execute(name: string, args: Record<string, any>, toolCallId: string): Promise<ToolResult> {
    this.logger.log(`Tool call: ${name}(${JSON.stringify(args).slice(0, 200)})`);
    try {
      let content: string;
      switch (name) {
        case 'bash':
          content = await this.bash(args.command as string);
          break;
        case 'grep':
          content = await this.grep(args.pattern as string, args.path as string, args.glob as string);
          break;
        case 'read_file':
          content = this.readFile(args.path as string, args.offset as number, args.limit as number);
          break;
        case 'write_file':
          content = this.writeFile(args.path as string, args.content as string);
          break;
        case 'list_files':
          content = this.listFiles(args.path as string, args.glob as string);
          break;
        default:
          content = `Unknown tool: ${name}`;
      }
      return { name, toolCallId, content: content.slice(0, MAX_OUTPUT), error: name === 'Unknown tool' ? true : false };
    } catch (e: any) {
      this.logger.error(`Tool ${name} error: ${e.message}`);
      return { name, toolCallId, content: e.message || String(e), error: true };
    }
  }

  private bash(command: string): Promise<string> {
    return new Promise((resolve) => {
      exec(command, { cwd: this.workspaceRoot, timeout: BASH_TIMEOUT_MS, maxBuffer: 1024 * 1024 }, (err, stdout, stderr) => {
        let out = '';
        if (stdout) out += stdout;
        if (stderr) out += (out ? '\n' : '') + stderr;
        if (err && !out) out = err.message;
        resolve(out || '(no output)');
      });
    });
  }

  private async grep(pattern: string, searchPath?: string, glob?: string): Promise<string> {
    const target = searchPath ? this.resolve(searchPath) : this.workspaceRoot;
    const globFlag = glob ? `--include='${glob}'` : '';
    return new Promise((resolve) => {
      exec(`grep -rn ${globFlag} '${pattern.replace(/'/g, "'\\''")}' '${target}' 2>/dev/null | head -100`, { timeout: 15000 }, (err, stdout) => {
        resolve(stdout || `(no matches for ${pattern})`);
      });
    });
  }

  private readFile(filePath: string, offset?: number, limit?: number): string {
    const resolved = this.resolve(filePath);
    if (!fs.existsSync(resolved)) return `File not found: ${filePath}`;
    const content = fs.readFileSync(resolved, 'utf-8');
    const lines = content.split('\n');
    const start = (offset || 1) - 1;
    const end = limit ? start + limit : lines.length;
    return lines.slice(start, end).map((l, i) => `${start + i + 1}|${l}`).join('\n') || '(empty file)';
  }

  private writeFile(filePath: string, content: string): string {
    const resolved = this.resolve(filePath);
    const dir = path.dirname(resolved);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(resolved, content, 'utf-8');
    return `Wrote ${content.length} bytes to ${filePath}`;
  }

  private listFiles(dirPath?: string, glob?: string): string {
    const target = dirPath ? this.resolve(dirPath) : this.workspaceRoot;
    if (!fs.existsSync(target)) return `Directory not found: ${dirPath}`;
    try {
      const maxDepth = 3;
      const entries: string[] = [];
      const walk = (dir: string, depth: number) => {
        if (depth > maxDepth) return;
        const items = fs.readdirSync(dir, { withFileTypes: true });
        for (const item of items) {
          if (item.name.startsWith('.') || item.name === 'node_modules') continue;
          const full = path.join(dir, item.name);
          const rel = path.relative(this.workspaceRoot, full);
          if (glob && !rel.match(glob.replace(/\*/g, '.*'))) continue;
          entries.push(item.isDirectory() ? `${rel}/` : rel);
          if (item.isDirectory()) walk(full, depth + 1);
        }
      };
      walk(target, 0);
      return entries.slice(0, 200).join('\n') || '(empty directory)';
    } catch (e: any) {
      return `Error listing: ${e.message}`;
    }
  }

  private resolve(p: string): string {
    if (path.isAbsolute(p)) return p;
    return path.resolve(this.workspaceRoot, p);
  }
}