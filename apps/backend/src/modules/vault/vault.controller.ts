import { Controller, Get, Post, Put, Delete, Body, Param, Query, Logger, BadRequestException } from '@nestjs/common';
import { VaultService } from './vault.service';
import { CreateVaultNoteDto, UpdateVaultNoteDto, SearchMode } from './vault.types';

@Controller('vault')
export class VaultController {
  private readonly logger = new Logger(VaultController.name);

  constructor(private readonly vault: VaultService) {}

  @Get('notes')
  list() {
    return this.vault.list();
  }

  @Get('notes/:id')
  get(@Param('id') id: string) {
    return this.vault.get(id);
  }

  @Post('notes')
  create(@Body() dto: CreateVaultNoteDto) {
    if (!dto.content || dto.content.trim().length === 0) {
      throw new BadRequestException('Note content is required.');
    }
    return this.vault.create(dto);
  }

  @Put('notes/:id')
  update(@Param('id') id: string, @Body() dto: UpdateVaultNoteDto) {
    if (dto.content !== undefined && dto.content.trim().length === 0) {
      throw new BadRequestException('Note content cannot be empty.');
    }
    return this.vault.update(id, dto);
  }

  @Delete('notes/:id')
  delete(@Param('id') id: string) {
    return this.vault.delete(id);
  }

  @Get('search')
  search(@Query('q') q: string) {
    return this.vault.search(q || '');
  }

  @Get('backlinks/:id')
  backlinks(@Param('id') id: string) {
    return this.vault.getBacklinks(id);
  }

  @Get('facts/:id')
  facts(@Param('id') id: string) {
    return this.vault.getFacts(id);
  }

  /** Get full knowledge graph (nodes + edges from wikilinks). */
  @Get('graph')
  graph() {
    return this.vault.getKnowledgeGraph();
  }

  /** GBrain-inspired context with auto-detected search mode. */
  @Post('context')
  context(
    @Body() body: { message: string; workspacePath: string; mode?: SearchMode; maxChars?: number },
  ) {
    return this.vault.contextRelevant(
      body.message,
      body.workspacePath,
      body.maxChars,
      body.mode,
    );
  }

  /** Write a session auto-note after conversation. */
  @Post('sessions')
  writeSession(@Body() body: Record<string, any>) {
    return this.vault.writeSessionNote({
      summary: body.summary || '',
      decisions: body.decisions || [],
      tags: body.tags || [],
      sessionId: body.sessionId || '',
    });
  }

  /** Seed default vault notes (v0.2 gbrain-inspired defaults). */
  @Post('seed')
  seed() {
    this.vault.seedDefaults();
    return { ok: true, message: 'Vault seeded with defaults' };
  }
}