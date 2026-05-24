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
    if (provider === 'ollama-local') {
      return this.listLocalModels();
    }
    return this.listCloudModels();
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
}