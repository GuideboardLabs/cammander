import { Controller, Get, Post, Put, Delete, Param, Body, Query, NotFoundException } from '@nestjs/common';
import { IsString, IsOptional } from 'class-validator';
import * as fs from 'fs';
import * as path from 'path';
import { ConfigService } from '@nestjs/config';

class WriteFileDto {
  @IsString()
  content!: string;
}

class CreateFileDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  type?: 'file' | 'directory';

  @IsOptional()
  @IsString()
  content?: string;
}

@Controller('files')
export class FilesController {
  private root: string;

  constructor(private config: ConfigService) {
    this.root = this.config.get<string>('WORKSPACE_ROOT', '/tmp');
  }

  private resolve(relPath: string): string {
    if (path.isAbsolute(relPath)) return relPath;
    return path.resolve(this.root, relPath);
  }

  @Get()
  listDir(@Query('path') dirPath?: string) {
    const target = this.resolve(dirPath || '');
    if (!fs.existsSync(target)) throw new NotFoundException('Path not found');
    const stat = fs.statSync(target);
    if (!stat.isDirectory()) throw new NotFoundException('Not a directory');
    const entries = fs.readdirSync(target, { withFileTypes: true });
    return entries
      .filter(e => !e.name.startsWith('.') || e.name === '.archive')
      .map(e => {
        const full = path.join(target, e.name);
        let size = 0, mtime = '';
        try {
          const s = fs.statSync(full);
          size = s.size;
          mtime = s.mtime.toISOString();
        } catch {}
        return {
          name: e.name,
          type: e.isDirectory() ? 'directory' : 'file',
          size,
          mtime,
        };
      });
  }

  @Get('read')
  readFile(@Query('path') filePath: string) {
    const resolved = this.resolve(filePath);
    if (!fs.existsSync(resolved)) throw new NotFoundException('File not found');
    const stat = fs.statSync(resolved);
    if (stat.isDirectory()) throw new NotFoundException('Is a directory');
    const ext = path.extname(resolved).toLowerCase();
    const isImage = ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.bmp', '.ico'].includes(ext);
    if (isImage) {
      const buf = fs.readFileSync(resolved);
      const mime = ext === '.svg' ? 'image/svg+xml' : ext === '.png' ? 'image/png' : ext === '.gif' ? 'image/gif' : 'image/jpeg';
      const base64 = buf.toString('base64');
      return { type: 'image', mime, data: `data:${mime};base64,${base64}`, size: stat.size, name: path.basename(resolved) };
    }
    // Binary spreadsheet files
    const isBinary = ['.xls', '.xlsx'].includes(ext);
    if (isBinary) {
      const MAX_BINARY = 20 * 1024 * 1024; // 20 MB
      if (stat.size > MAX_BINARY) {
        return { type: 'error', message: 'File too large for spreadsheet viewer (max 20 MB)', size: stat.size, name: path.basename(resolved) };
      }
      const buf = fs.readFileSync(resolved);
      const base64 = buf.toString('base64');
      const mime = ext === '.xlsx' ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'application/vnd.ms-excel';
      return { type: 'binary', mime, data: base64, size: stat.size, name: path.basename(resolved), ext };
    }
    // Text file
    const MAX = 500000;
    const content = fs.readFileSync(resolved, 'utf-8');
    return {
      type: 'text',
      content: content.length > MAX ? content.slice(0, MAX) + '\n... (truncated)' : content,
      size: stat.size,
      name: path.basename(resolved),
      ext,
    };
  }

  @Post('create')
  createFile(@Body() dto: CreateFileDto, @Query('path') dirPath?: string) {
    const targetDir = this.resolve(dirPath || '');
    if (!fs.existsSync(targetDir)) throw new NotFoundException('Directory not found');
    const target = path.join(targetDir, dto.name);
    if (fs.existsSync(target)) return { error: true, message: 'Already exists' };
    if (dto.type === 'directory') {
      fs.mkdirSync(target, { recursive: true });
    } else {
      const dir = path.dirname(target);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(target, dto.content || '', 'utf-8');
    }
    return { created: true, name: dto.name, type: dto.type || 'file' };
  }

  @Put('write')
  writeFile(@Query('path') filePath: string, @Body() dto: WriteFileDto) {
    const resolved = this.resolve(filePath);
    const dir = path.dirname(resolved);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(resolved, dto.content, 'utf-8');
    return { written: true, path: filePath, size: dto.content.length };
  }

  @Post('archive')
  archiveFile(@Body() body: { path: string }) {
    const resolved = this.resolve(body.path);
    if (!fs.existsSync(resolved)) throw new NotFoundException('File not found');
    // Move to .archive/ directory
    const archiveDir = path.join(this.root, '.archive');
    if (!fs.existsSync(archiveDir)) fs.mkdirSync(archiveDir, { recursive: true });
    const dest = path.join(archiveDir, path.basename(resolved));
    fs.renameSync(resolved, dest);
    return { archived: true, from: body.path, to: `.archive/${path.basename(resolved)}` };
  }
}