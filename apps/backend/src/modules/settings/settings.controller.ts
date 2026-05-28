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
      // Build partial ollamaCloud — apiKey only included when explicitly provided
      const cloud: Record<string, unknown> = {
        baseUrl: dto.ollamaCloud.baseUrl ?? '',
      };
      if (dto.ollamaCloud.apiKey !== undefined) {
        cloud.apiKey = dto.ollamaCloud.apiKey;
      }
      update.ollamaCloud = cloud as AppSettings['ollamaCloud'];
    }
    if (dto.ollamaLocal) {
      update.ollamaLocal = {
        host: dto.ollamaLocal.host ?? 'localhost',
        port: dto.ollamaLocal.port ?? 11434,
      };
    }
    if (dto.openaiCompat) {
      const compat: Record<string, unknown> = {
        baseUrl: dto.openaiCompat.baseUrl ?? '',
      };
      if (dto.openaiCompat.apiKey !== undefined) {
        compat.apiKey = dto.openaiCompat.apiKey;
      }
      update.openaiCompat = compat as AppSettings['openaiCompat'];
    }
    if (dto.llamaCpp) {
      update.llamaCpp = {
        baseUrl: dto.llamaCpp.baseUrl ?? 'http://localhost:8080',
      };
    }
    if (dto.vllm) {
      const vllm: Record<string, unknown> = {
        baseUrl: dto.vllm.baseUrl ?? 'http://localhost:8000',
      };
      if (dto.vllm.apiKey !== undefined) {
        vllm.apiKey = dto.vllm.apiKey;
      }
      update.vllm = vllm as AppSettings['vllm'];
    }
    if (dto.lmStudio) {
      update.lmStudio = {
        baseUrl: dto.lmStudio.baseUrl ?? 'http://localhost:1234',
      };
    }
    return this.settings.update(update);
  }
}