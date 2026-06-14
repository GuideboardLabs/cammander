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
    this.dataDir = this.config.get<string>('DATA_DIR') || path.join(this.config.get<string>('WORKSPACE_ROOT') || '/home/sc/cammander', '.cammander', 'data');
    this.settings = DEFAULT_SETTINGS;
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
      openaiCompat: {
        apiKey: this.config.get<string>('OPENAI_COMPAT_API_KEY') || '',
        baseUrl: this.config.get<string>('OPENAI_COMPAT_BASE_URL') || '',
      },
      llamaCpp: {
        baseUrl: this.config.get<string>('LLAMA_CPP_BASE_URL') || 'http://localhost:8080',
      },
      vllm: {
        baseUrl: this.config.get<string>('VLLM_BASE_URL') || 'http://localhost:8000',
        apiKey: this.config.get<string>('VLLM_API_KEY') || '',
      },
      lmStudio: {
        baseUrl: this.config.get<string>('LM_STUDIO_BASE_URL') || 'http://localhost:1234',
      },
    };
  }

  private save(): void {
    fs.mkdirSync(this.dataDir, { recursive: true });
    fs.writeFileSync(this.filePath, JSON.stringify(this.settings, null, 2), 'utf-8');
  }

  private maskKey(key: string): string {
    return key ? '••••' + key.slice(-4) : '';
  }

  get(): AppSettings {
    // Return a copy with API keys masked
    return {
      ...this.settings,
      ollamaCloud: {
        ...this.settings.ollamaCloud,
        apiKey: this.maskKey(this.settings.ollamaCloud.apiKey),
      },
      openaiCompat: {
        ...this.settings.openaiCompat,
        apiKey: this.maskKey(this.settings.openaiCompat.apiKey),
      },
      vllm: {
        ...this.settings.vllm,
        apiKey: this.maskKey(this.settings.vllm.apiKey),
      },
    };
  }

  getRaw(): AppSettings {
    return this.settings;
  }

  /** Returns true if the value looks like a masked key that shouldn't be stored. */
  private isMasked(key: string): boolean {
    if (!key) return false;
    return key.startsWith('••••') || key === '***' || key === '****' || key === '********';
  }

  update(partial: Partial<AppSettings>): AppSettings {
    if (partial.activeProvider) {
      this.settings.activeProvider = partial.activeProvider as ProviderType;
    }
    if (partial.ollamaCloud) {
      const newKey = partial.ollamaCloud.apiKey;
      this.settings.ollamaCloud = {
        baseUrl: partial.ollamaCloud.baseUrl ?? this.settings.ollamaCloud.baseUrl,
        apiKey:
          newKey && !this.isMasked(newKey)
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
    if (partial.openaiCompat) {
      const newKey = partial.openaiCompat.apiKey;
      this.settings.openaiCompat = {
        baseUrl: partial.openaiCompat.baseUrl ?? this.settings.openaiCompat.baseUrl,
        apiKey:
          newKey && !this.isMasked(newKey)
            ? newKey
            : this.settings.openaiCompat.apiKey,
      };
    }
    if (partial.llamaCpp) {
      this.settings.llamaCpp = {
        baseUrl: partial.llamaCpp.baseUrl ?? this.settings.llamaCpp.baseUrl,
      };
    }
    if (partial.vllm) {
      const newKey = partial.vllm.apiKey;
      this.settings.vllm = {
        baseUrl: partial.vllm.baseUrl ?? this.settings.vllm.baseUrl,
        apiKey:
          newKey && !this.isMasked(newKey)
            ? newKey
            : this.settings.vllm.apiKey,
      };
    }
    if (partial.lmStudio) {
      this.settings.lmStudio = {
        baseUrl: partial.lmStudio.baseUrl ?? this.settings.lmStudio.baseUrl,
      };
    }
    if (partial.defaultModel !== undefined) {
      this.settings.defaultModel = partial.defaultModel;
    }
    this.save();
    return this.get();
  }
}