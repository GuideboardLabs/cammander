import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { WorkspaceModule } from './modules/workspace/workspace.module';
import { FilesystemModule } from './modules/filesystem/filesystem.module';
import { PermissionModule } from './modules/permission/permission.module';
import { ToolRegistryModule } from './modules/tool-registry/tool-registry.module';
import { AgentOrchestratorModule } from './modules/agent-orchestrator/agent-orchestrator.module';
import { ModelGatewayModule } from './modules/model-gateway/model-gateway.module';
import { ModelRoutingModule } from './modules/model-routing/model-routing.module';
import { SearxngSearchModule } from './modules/searxng-search/searxng-search.module';
import { CloakBrowserModule } from './modules/cloak-browser/cloak-browser.module';
import { BrowserPermissionModule } from './modules/browser-permission/browser-permission.module';
import { ChatModule } from './modules/chat/chat.module';
import { SessionsModule } from './modules/sessions/sessions.module';
import { SettingsModule } from './modules/settings/settings.module';
import { ToolsModule } from './modules/tools/tools.module';
import { FilesModule } from './modules/files/files.module';
import { GitModule } from './modules/git/git.module';
import { TerminalModule } from './modules/terminal/terminal.module';
import { ProjectModule } from './modules/project/project.module';
import { VaultModule } from './modules/vault/vault.module';
import { CoreGatewayModule } from './gateway/gateway.module';
import { environment } from './config/environment';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [() => environment],
    }),
    CoreGatewayModule,
    WorkspaceModule,
    FilesystemModule,
    PermissionModule,
    ToolRegistryModule,
    AgentOrchestratorModule,
    ModelGatewayModule,
    ModelRoutingModule,
    SearxngSearchModule,
    CloakBrowserModule,
    BrowserPermissionModule,
    SettingsModule,
    ChatModule,
    SessionsModule,
    ToolsModule,
    FilesModule,
    GitModule,
    TerminalModule,
    ProjectModule,
    VaultModule,
  ],
})
export class AppModule {}
