import { Controller, Get, Post, Body, Param, Delete, Patch, Query } from '@nestjs/common';
import { WorkspaceService } from './workspace.service';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

@Controller('workspaces')
export class WorkspaceController {
  constructor(private readonly workspaceService: WorkspaceService) {}

  @Get()
  list() {
    return this.workspaceService.list();
  }

  /** Scan home directory (or given base) for project directories */
  @Get('home-folders')
  homeFolders(@Query('base') base?: string) {
    const scanDir = base || os.homedir();
    if (!fs.existsSync(scanDir)) return [];

    const entries = fs.readdirSync(scanDir, { withFileTypes: true });
    const folders = entries
      .filter(e => e.isDirectory() && !e.name.startsWith('.'))
      .map(e => {
        const fullPath = path.join(scanDir, e.name);
        const hasGit = fs.existsSync(path.join(fullPath, '.git'));
        const hasPackageJson = fs.existsSync(path.join(fullPath, 'package.json'));
        const hasCargoToml = fs.existsSync(path.join(fullPath, 'Cargo.toml'));
        const hasPyProject = fs.existsSync(path.join(fullPath, 'pyproject.toml'));
        const hasGoMod = fs.existsSync(path.join(fullPath, 'go.mod'));

        // Count immediate children for context
        let childCount = 0;
        try {
          childCount = fs.readdirSync(fullPath).length;
        } catch { childCount = 0; }

        return {
          name: e.name,
          path: fullPath,
          hasGit,
          isProject: hasGit || hasPackageJson || hasCargoToml || hasPyProject || hasGoMod,
          childCount,
        };
      })
      // Sort: project folders first, then alpha
      .sort((a, b) => {
        if (a.isProject !== b.isProject) return a.isProject ? -1 : 1;
        return a.name.localeCompare(b.name);
      });

    return folders;
  }

  /** Browse subdirectories of a given path (for deeper navigation) */
  @Get('tree')
  getTree(@Query('path') dirPath?: string) {
    const target = dirPath || os.homedir();
    if (!fs.existsSync(target)) return { path: target, tree: '' };
    return { path: target, tree: this.workspaceService.getTree(target) };
  }

  /** Browse subdirectories of a given path (for deeper navigation) */
  @Get('browse')
  browse(@Query('path') dirPath?: string) {
    const target = dirPath || os.homedir();
    if (!fs.existsSync(target)) return { path: target, entries: [] };

    try {
      const stat = fs.statSync(target);
      if (!stat.isDirectory()) return { path: target, entries: [] };
    } catch {
      return { path: target, entries: [] };
    }

    const entries = fs.readdirSync(target, { withFileTypes: true })
      .filter(e => e.isDirectory() && !e.name.startsWith('.'))
      .map(e => {
        const fullPath = path.join(target, e.name);
        const hasGit = fs.existsSync(path.join(fullPath, '.git'));
        return { name: e.name, path: fullPath, hasGit };
      })
      .sort((a, b) => a.name.localeCompare(b.name));

    return { path: target, entries };
  }

  @Post()
  create(@Body() dto: { name: string; path: string }) {
    return this.workspaceService.create(dto.name, dto.path);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.workspaceService.get(id);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.workspaceService.remove(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: { name?: string }) {
    return this.workspaceService.update(id, dto);
  }
}
