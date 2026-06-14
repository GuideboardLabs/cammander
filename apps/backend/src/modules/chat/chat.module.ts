import { Module } from '@nestjs/common';
import { ChatController } from './chat.controller';
import { SettingsModule } from '../settings/settings.module';
import { SessionsModule } from '../sessions/sessions.module';
import { ToolsModule } from '../tools/tools.module';
import { VaultModule } from '../vault/vault.module';
import { WorkspaceModule } from '../workspace/workspace.module';

@Module({
  imports: [SettingsModule, SessionsModule, ToolsModule, VaultModule, WorkspaceModule],
  controllers: [ChatController],
})
export class ChatModule {}