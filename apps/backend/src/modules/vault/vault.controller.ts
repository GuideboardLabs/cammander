import { Controller, Get, Post, Put, Delete, Query, Param, Body, NotFoundException, Logger } from '@nestjs/common';
import { VaultService } from './vault.service';
import { CreateVaultNoteDto, UpdateVaultNoteDto } from './vault.types';

@Controller('vault')
export class VaultController {
  private readonly logger = new Logger(VaultController.name);

  constructor(private vault: VaultService) {}

  @Get('notes')
  listNotes() {
    return this.vault.list();
  }

  @Get('notes/:id')
  getNote(@Param('id') id: string, @Query('path') subPath?: string) {
    const note = this.vault.get(id, subPath);
    if (!note) throw new NotFoundException(`Note '${id}' not found`);
    return note;
  }

  @Post('notes')
  createNote(@Body() dto: CreateVaultNoteDto) {
    return this.vault.create(dto);
  }

  @Put('notes/:id')
  updateNote(@Param('id') id: string, @Body() dto: UpdateVaultNoteDto, @Query('path') subPath?: string) {
    const note = this.vault.update(id, dto, subPath);
    if (!note) throw new NotFoundException(`Note '${id}' not found`);
    return note;
  }

  @Delete('notes/:id')
  deleteNote(@Param('id') id: string, @Query('path') subPath?: string) {
    const ok = this.vault.delete(id);
    if (!ok) throw new NotFoundException(`Note '${id}' not found`);
    return { ok: true };
  }

  @Get('search')
  searchNotes(@Query('q') query: string) {
    if (!query) return [];
    return this.vault.search(query);
  }

  @Get('links')
  getBacklinks(@Query('target') target: string) {
    if (!target) return [];
    return this.vault.getBacklinks(target);
  }
}
