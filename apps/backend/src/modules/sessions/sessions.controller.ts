import { Controller, Get, Post, Delete, Param, Body, NotFoundException } from '@nestjs/common';
import { SessionsService } from './sessions.service';
import { IsString, IsOptional, IsArray, ValidateNested, ValidateIf } from 'class-validator';
import { Type } from 'class-transformer';
import { ToolCall } from './session.types';

class CreateSessionDto {
  @IsOptional()
  @IsString()
  title?: string;
}

class AddMessageDto {
  @IsString()
  role!: 'system' | 'user' | 'assistant' | 'tool';

  @IsString()
  content!: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => Object)
  toolCalls?: ToolCall[];

  @ValidateIf((o) => o.role === 'tool')
  @IsString()
  toolCallId?: string;

  @IsOptional()
  @IsString()
  model?: string;
}

@Controller('sessions')
export class SessionsController {
  constructor(private sessions: SessionsService) {}

  @Get()
  list() {
    return this.sessions.list();
  }

  @Get(':id')
  get(@Param('id') id: string) {
    const session = this.sessions.get(id);
    if (!session) throw new NotFoundException('Session not found');
    return session;
  }

  @Post()
  create(@Body() dto: CreateSessionDto) {
    return this.sessions.create(dto.title);
  }

  @Delete(':id')
  delete(@Param('id') id: string) {
    const ok = this.sessions.delete(id);
    if (!ok) throw new NotFoundException('Session not found');
    return { deleted: true };
  }

  @Post(':id/messages')
  addMessage(@Param('id') id: string, @Body() dto: AddMessageDto) {
    const msg: any = { role: dto.role, content: dto.content };
    if (dto.toolCalls) msg.toolCalls = dto.toolCalls;
    if (dto.toolCallId) msg.toolCallId = dto.toolCallId;
    if (dto.model) msg.model = dto.model;
    const session = this.sessions.addMessage(id, msg);
    if (!session) throw new NotFoundException('Session not found');
    return session;
  }
}