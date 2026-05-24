import { Controller, Get, Put, Body } from '@nestjs/common';
import { SettingsService } from './settings.service';
import { SaveSettingsDto } from './dto/save-settings.dto';
import { AppSettings } from './settings.types';

@Controller('settings')
export class SettingsController {
  constructor(private settings: SettingsService) {}

  @Get()
  getSettings(): AppSettings {
    return this.settings.get();
  }

  @Put()
  saveSettings(@Body() dto: SaveSettingsDto): AppSettings {
    const update: Partial<AppSettings> = {
      activeProvider: dto.activeProvider,
      defaultModel: dto.defaultModel,
    };
    if (dto.ollamaCloud) {
      update.ollamaCloud = {
        apiKey: dto.ollamaCloud.apiKey ?? '',
        baseUrl: dto.ollamaCloud.baseUrl ?? '',
      };
    }
    if (dto.ollamaLocal) {
      update.ollamaLocal = {
        host: dto.ollamaLocal.host ?? 'localhost',
        port: dto.ollamaLocal.port ?? 11434,
      };
    }
    return this.settings.update(update);
  }
}