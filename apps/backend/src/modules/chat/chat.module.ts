import { Module } from '@nestjs/common';
import { ChatController } from './chat.controller';
import { SettingsModule } from '../settings/settings.module';
import { SessionsModule } from '../sessions/sessions.module';
import { ToolsModule } from '../tools/tools.module';

@Module({
  imports: [SettingsModule, SessionsModule, ToolsModule],
  controllers: [ChatController],
})
export class ChatModule {}