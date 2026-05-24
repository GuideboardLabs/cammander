import { ProviderType } from './dto/save-settings.dto';

export interface AppSettings {
  activeProvider: ProviderType;
  ollamaCloud: {
    apiKey: string;
    baseUrl: string;
  };
  ollamaLocal: {
    host: string;
    port: number;
  };
  defaultModel: string;
}

export const DEFAULT_SETTINGS: AppSettings = {
  activeProvider: ProviderType.OLLAMA_CLOUD,
  ollamaCloud: {
    apiKey: '',
    baseUrl: 'https://ollama.com/v1',
  },
  ollamaLocal: {
    host: 'localhost',
    port: 11434,
  },
  defaultModel: '',
};