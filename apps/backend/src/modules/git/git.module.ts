import { Module } from '@nestjs/common';
import { GitController } from './git.controller';
import { GitService } from './git.service';

@Module({
  controllers: [GitController],
  providers: [GitService],
  exports: [GitService],
})
export class GitModule {}
