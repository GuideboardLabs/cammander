import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { ModelDescriptor } from '../../common/interfaces/ai-provider.interface';
import { SettingsService } from '../settings/settings.service';

@Injectable()
export class ModelGatewayService {
  constructor(
    private config: ConfigService,
    private settings: SettingsService,
  ) {}

  private getLocalBaseUrl(): string {
    const s = this.settings.getRaw().ollamaLocal;
    return `http://${s.host}:${s.port}`;
  }

  private getCloudBaseUrl(): string {
    return this.settings.getRaw().ollamaCloud.baseUrl;
  }

  private getCloudApiKey(): string {
    return this.settings.getRaw().ollamaCloud.apiKey;
  }

  async listModels(): Promise<ModelDescriptor[]> {
    const provider = this.settings.getRaw().activeProvider;
    const s = this.settings.getRaw();

    switch (provider) {
      case 'ollama-local':
        return this.listLocalModels();
      case 'ollama-cloud':
        return this.listCloudModels();
      case 'openai-compat':
        return this.listOpenAICompatModels(s.openaiCompat.baseUrl, s.openaiCompat.apiKey);
      case 'llama-cpp':
        return this.listOpenAICompatModels(s.llamaCpp.baseUrl);
      case 'vllm':
        return this.listOpenAICompatModels(s.vllm.baseUrl, s.vllm.apiKey);
      case 'lm-studio':
        return this.listOpenAICompatModels(s.lmStudio.baseUrl);
      default:
        return this.listCloudModels();
    }
  }

  private async listLocalModels(): Promise<ModelDescriptor[]> {
    try {
      const res = await axios.get(`${this.getLocalBaseUrl()}/api/tags`, {
        timeout: 5000,
      });
      const models = res.data?.models || [];
      return models.map((m: any) => ({
        id: m.name || m.model,
        name: m.name || m.model,
        parameterCount: m.details?.parameter_size,
        quantization: m.details?.quantization_level,
        contextWindow: undefined,
        available: true,
      }));
    } catch (e: any) {
      return [
        {
          id: 'error',
          name: `Cannot reach Ollama at ${this.getLocalBaseUrl()}`,
          available: false,
        },
      ];
    }
  }

  private async listCloudModels(): Promise<ModelDescriptor[]> {
    const baseUrl = this.getCloudBaseUrl();
    const apiKey = this.getCloudApiKey();
    if (!baseUrl || !apiKey) {
      return [
        {
          id: 'not-configured',
          name: 'Ollama Cloud not configured — set API key in Settings',
          available: false,
        },
      ];
    }
    try {
      const res = await axios.get(`${baseUrl.replace(/\/$/, '')}/models`, {
        headers: { Authorization: `Bearer ${apiKey}` },
        timeout: 5000,
      });
      const models = res.data?.data || res.data?.models || [];
      return models.map((m: any) => ({
        id: m.id || m.model,
        name: m.id || m.model || m.name,
        available: true,
      }));
    } catch (e: any) {
      return [
        {
          id: 'error',
          name: `Cannot reach Ollama Cloud: ${e.message}`,
          available: false,
        },
      ];
    }
  }

  private async listOpenAICompatModels(baseUrl: string, apiKey?: string): Promise<ModelDescriptor[]> {
    if (!baseUrl) {
      return [
        {
          id: 'not-configured',
          name: 'Provider not configured — set Base URL in Settings',
          available: false,
        },
      ];
    }
    try {
      const cleanUrl = baseUrl.replace(/\/$/, '');
      const headers: Record<string, string> = {};
      if (apiKey) {
        headers['Authorization'] = `Bearer ${apiKey}`;
      }
      const res = await axios.get(`${cleanUrl}/v1/models`, {
        headers,
        timeout: 5000,
      });
      const models = res.data?.data || res.data?.models || [];
      return models.map((m: any) => ({
        id: m.id || m.model,
        name: m.id || m.model || m.name,
        available: true,
      }));
    } catch (e: any) {
      return [
        {
          id: 'error',
          name: `Cannot reach provider at ${baseUrl}: ${e.message}`,
          available: false,
        },
      ];
    }
  }
}