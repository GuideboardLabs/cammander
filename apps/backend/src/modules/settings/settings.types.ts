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
  openaiCompat: {
    apiKey: string;
    baseUrl: string;
  };
  llamaCpp: {
    baseUrl: string;
  };
  vllm: {
    baseUrl: string;
    apiKey: string;
  };
  lmStudio: {
    baseUrl: string;
  };
  defaultModel: string;
}

export const DEFAULT_SETTINGS: AppSettings = {
  activeProvider: ProviderType.OLLAMA_LOCAL,
  ollamaCloud: {
    apiKey: '',
    baseUrl: 'https://ollama.com/v1',
  },
  ollamaLocal: {
    host: 'localhost',
    port: 11434,
  },
  openaiCompat: {
    apiKey: '',
    baseUrl: '',
  },
  llamaCpp: {
    baseUrl: 'http://localhost:8080',
  },
  vllm: {
    baseUrl: 'http://localhost:8000',
    apiKey: '',
  },
  lmStudio: {
    baseUrl: 'http://localhost:1234',
  },
  defaultModel: '',
};