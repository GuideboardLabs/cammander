import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import { AppSettings, DEFAULT_SETTINGS } from './settings.types';
import { ProviderType } from './dto/save-settings.dto';

const SETTINGS_FILE = 'settings.json';

@Injectable()
export class SettingsService {
  private settings: AppSettings;
  private readonly dataDir: string;

  constructor(private config: ConfigService) {
    this.dataDir = this.config.get<string>('DATA_DIR') || './data';
    this.settings = this.load();
  }

  private get filePath(): string {
    return path.join(this.dataDir, SETTINGS_FILE);
  }

  private load(): AppSettings {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf-8');
        return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
      }
    } catch {
      // fall through to defaults
    }
    // Merge env vars into defaults
    return {
      ...DEFAULT_SETTINGS,
      ollamaCloud: {
        ...DEFAULT_SETTINGS.ollamaCloud,
        apiKey: this.config.get<string>('OLLAMA_CLOUD_API_KEY') || '',
        baseUrl:
          this.config.get<string>('OLLAMA_CLOUD_BASE_URL') ||
          DEFAULT_SETTINGS.ollamaCloud.baseUrl,
      },
      ollamaLocal: {
        host: this.config.get<string>('OLLAMA_LOCAL_HOST') || 'localhost',
        port: parseInt(this.config.get<string>('OLLAMA_LOCAL_PORT') || '11434', 10),
      },
    };
  }

  private save(): void {
    fs.mkdirSync(this.dataDir, { recursive: true });
    fs.writeFileSync(this.filePath, JSON.stringify(this.settings, null, 2), 'utf-8');
  }

  get(): AppSettings {
    // Return a copy with apiKey masked
    return {
      ...this.settings,
      ollamaCloud: {
        ...this.settings.ollamaCloud,
        apiKey: this.settings.ollamaCloud.apiKey
          ? '••••' + this.settings.ollamaCloud.apiKey.slice(-4)
          : '',
      },
    };
  }

  getRaw(): AppSettings {
    return this.settings;
  }

  update(partial: Partial<AppSettings>): AppSettings {
    if (partial.activeProvider) {
      this.settings.activeProvider = partial.activeProvider as ProviderType;
    }
    if (partial.ollamaCloud) {
      // If apiKey is masked (starts with ••••), keep the old one
      const newKey = partial.ollamaCloud.apiKey;
      this.settings.ollamaCloud = {
        baseUrl: partial.ollamaCloud.baseUrl ?? this.settings.ollamaCloud.baseUrl,
        apiKey:
          newKey && !newKey.startsWith('••••')
            ? newKey
            : this.settings.ollamaCloud.apiKey,
      };
    }
    if (partial.ollamaLocal) {
      this.settings.ollamaLocal = {
        host: partial.ollamaLocal.host ?? this.settings.ollamaLocal.host,
        port: partial.ollamaLocal.port ?? this.settings.ollamaLocal.port,
      };
    }
    if (partial.defaultModel !== undefined) {
      this.settings.defaultModel = partial.defaultModel;
    }
    this.save();
    return this.get();
  }
}