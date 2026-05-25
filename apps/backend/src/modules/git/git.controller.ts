import { Controller, Get, Post, Body, Query, Logger } from '@nestjs/common';
import { GitService } from './git.service';
import { IsString } from 'class-validator';

class StageDto {
  @IsString()
  file!: string;
}

class CommitDto {
  @IsString()
  message!: string;
}

@Controller('git')
export class GitController {
  private readonly logger = new Logger(GitController.name);

  constructor(private git: GitService) {}

  @Get('status')
  getStatus() {
    return this.git.getStatus();
  }

  @Get('diff')
  getDiff(@Query('file') file?: string) {
    const result = this.git.getDiff(file);
    if (result.error) {
      return { content: '', error: result.error };
    }
    return { content: result.content };
  }

  @Post('stage')
  stage(@Body() dto: StageDto) {
    return this.git.stage(dto.file);
  }

  @Post('unstage')
  unstage(@Body() dto: StageDto) {
    return this.git.unstage(dto.file);
  }

  @Post('commit')
  commit(@Body() dto: CommitDto) {
    return this.git.commit(dto.message);
  }
}
