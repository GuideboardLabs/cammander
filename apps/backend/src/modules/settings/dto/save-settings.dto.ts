import { IsString, IsOptional, IsEnum, ValidateIf, IsNumber } from 'class-validator';

export enum ProviderType {
  OLLAMA_CLOUD = 'ollama-cloud',
  OLLAMA_LOCAL = 'ollama-local',
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

export class SaveSettingsDto {
  @IsEnum(ProviderType)
  activeProvider: ProviderType;

  @IsOptional()
  ollamaCloud?: OllamaCloudSettings;

  @IsOptional()
  ollamaLocal?: OllamaLocalSettings;

  @IsString()
  @IsOptional()
  defaultModel?: string;
}