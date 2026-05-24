export interface AIProvider {
  name: string;
  type: 'ollama-local' | 'ollama-cloud';
  chat(request: ProviderChatRequest): AsyncIterable<string>;
  listModels(): Promise<ModelDescriptor[]>;
}

export interface ProviderChatRequest {
  model: string;
  messages: { role: string; content: string }[];
  temperature?: number;
  maxTokens?: number;
  tools?: unknown[];
  stream?: boolean;
  system?: string;
}

export interface ModelDescriptor {
  id: string;
  name: string;
  parameterCount?: string;
  contextWindow?: number;
  quantization?: string;
  available: boolean;
}
