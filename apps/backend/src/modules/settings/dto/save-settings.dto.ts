import { IsString, IsOptional, IsEnum, ValidateIf, IsNumber } from 'class-validator';

export enum ProviderType {
  OLLAMA_CLOUD = 'ollama-cloud',
  OLLAMA_LOCAL = 'ollama-local',
  OPENAI_COMPAT = 'openai-compat',
  LLAMA_CPP = 'llama-cpp',
  VLLM = 'vllm',
  LM_STUDIO = 'lm-studio',
}

export class OllamaCloudSettings {
  @IsString()
  @IsOptional()
  apiKey?: string;

  @IsString()
  @IsOptional()
  baseUrl?: string;
}

export class OllamaLocalSettings {
  @IsString()
  @IsOptional()
  host?: string;

  @IsNumber()
  @IsOptional()
  @ValidateIf((o) => o.port !== undefined)
  port?: number;
}

export class OpenAICompatSettings {
  @IsString()
  @IsOptional()
  apiKey?: string;

  @IsString()
  @IsOptional()
  baseUrl?: string;
}

export class LlamaCppSettings {
  @IsString()
  @IsOptional()
  baseUrl?: string;
}

export class VLLMSettings {
  @IsString()
  @IsOptional()
  baseUrl?: string;

  @IsString()
  @IsOptional()
  apiKey?: string;
}

export class LMStudioSettings {
  @IsString()
  @IsOptional()
  baseUrl?: string;
}

export class SaveSettingsDto {
  @IsEnum(ProviderType)
  activeProvider: ProviderType;

  @IsOptional()
  ollamaCloud?: OllamaCloudSettings;

  @IsOptional()
  ollamaLocal?: OllamaLocalSettings;

  @IsOptional()
  openaiCompat?: OpenAICompatSettings;

  @IsOptional()
  llamaCpp?: LlamaCppSettings;

  @IsOptional()
  vllm?: VLLMSettings;

  @IsOptional()
  lmStudio?: LMStudioSettings;

  @IsString()
  @IsOptional()
  defaultModel?: string;
}