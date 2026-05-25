import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { execSync } from 'child_process';

@Injectable()
export class GitService {
  private readonly logger = new Logger(GitService.name);
  private workspaceRoot: string;

  constructor(private config: ConfigService) {
    this.workspaceRoot = this.config.get<string>('WORKSPACE_ROOT', '/tmp');
  }

  private exec(cmd: string): { stdout: string; stderr: string; success: boolean } {
    try {
      const stdout = execSync(cmd, {
        cwd: this.workspaceRoot,
        timeout: 15000,
        maxBuffer: 2 * 1024 * 1024,
        encoding: 'utf-8',
      });
      return { stdout: stdout.trim(), stderr: '', success: true };
    } catch (e: any) {
      return {
        stdout: e.stdout?.trim() || '',
        stderr: e.stderr?.trim() || e.message || String(e),
        success: false,
      };
    }
  }

  getStatus(): {
    branch: string;
    changes: Array<{ file: string; status: string; staged: boolean; additions?: number; deletions?: number }>;
    ahead: number;
    behind: number;
  } {
    const branch = this.exec('git rev-parse --abbrev-ref HEAD');
    const branchName = branch.success ? branch.stdout : 'unknown';

    // Get ahead/behind counts
    let ahead = 0;
    let behind = 0;
    if (branch.success) {
      const ab = this.exec(`git rev-list --left-right --count origin/${branchName}...HEAD 2>/dev/null || echo "0 0"`);
      if (ab.success && ab.stdout) {
        const parts = ab.stdout.split(/\s+/);
        behind = parseInt(parts[0] || '0', 10);
        ahead = parseInt(parts[1] || '0', 10);
      }
    }

    // Get status in porcelain format
    const status = this.exec('git status --porcelain=v1');
    const changes: Array<{ file: string; status: string; staged: boolean; additions?: number; deletions?: number }> = [];

    if (status.success && status.stdout) {
      const lines = status.stdout.split('\n').filter(Boolean);
      for (const line of lines) {
        const indexCode = line[0];
        const workTreeCode = line[1];
        let file = line.slice(3).trim();
        // Handle renamed files: "R  old -> new"
        if (indexCode === 'R' || workTreeCode === 'R') {
          const arrowIdx = file.indexOf(' -> ');
          if (arrowIdx !== -1) file = file.slice(arrowIdx + 4);
        }

        // Staged changes (index)
        if (indexCode !== ' ' && indexCode !== '?') {
          const change = { file, status: this.statusLabel(indexCode), staged: true };
          changes.push(change);
        }

        // Unstaged changes (worktree)
        if (workTreeCode !== ' ' && workTreeCode !== '?') {
          const change = { file, status: this.statusLabel(workTreeCode), staged: false };
          changes.push(change);
        }

        // Untracked
        if (indexCode === '?' && workTreeCode === '?') {
          changes.push({ file, status: 'untracked', staged: false });
        }
      }
    }

    return { branch: branchName, changes, ahead, behind };
  }

  getDiff(file?: string): { content: string; error?: string } {
    let cmd: string;
    if (file) {
      // Diff for a specific file (staged + unstaged combined)
      cmd = `git diff HEAD -- '${file.replace(/'/g, "'\\''")}'`;
    } else {
      // Full workspace diff
      cmd = 'git diff HEAD';
    }
    const result = this.exec(cmd);
    if (!result.success && result.stderr && !result.stdout) {
      return { content: '', error: result.stderr };
    }
    return { content: result.stdout };
  }

  stage(file: string): { success: boolean; message: string } {
    const result = this.exec(`git add -- '${file.replace(/'/g, "'\\''")}'`);
    if (result.success) {
      return { success: true, message: `Staged: ${file}` };
    }
    return { success: false, message: result.stderr || result.stdout || `Failed to stage ${file}` };
  }

  unstage(file: string): { success: boolean; message: string } {
    const result = this.exec(`git reset HEAD -- '${file.replace(/'/g, "'\\''")}'`);
    if (result.success) {
      return { success: true, message: `Unstaged: ${file}` };
    }
    return { success: false, message: result.stderr || result.stdout || `Failed to unstage ${file}` };
  }

  commit(message: string): { success: boolean; message: string; hash?: string } {
    const escaped = message.replace(/'/g, "'\\''");
    const result = this.exec(`git commit -m '${escaped}'`);
    if (result.success) {
      // Extract commit hash
      const hashMatch = result.stdout.match(/\[[\w\-]+ ([a-f0-9]+)\]/);
      const hash = hashMatch ? hashMatch[1] : undefined;
      return { success: true, message: result.stdout || 'Committed successfully', hash };
    }
    return { success: false, message: result.stderr || result.stdout || 'Failed to commit' };
  }

  private statusLabel(code: string): string {
    switch (code) {
      case 'M': return 'modified';
      case 'A': return 'added';
      case 'D': return 'deleted';
      case 'R': return 'renamed';
      case 'C': return 'copied';
      case 'U': return 'unmerged';
      case 'T': return 'typechange';
      default: return code;
    }
  }
}
