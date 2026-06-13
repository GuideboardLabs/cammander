import { Module } from '@nestjs/common';
import { WorkspaceService } from './workspace.service';
import { WorkspaceTreeService } from './workspace-tree.service';
import { WorkspaceController } from './workspace.controller';

@Module({
  controllers: [WorkspaceController],
  providers: [WorkspaceService, WorkspaceTreeService],
  exports: [WorkspaceService, WorkspaceTreeService],
})
export class WorkspaceModule {}
