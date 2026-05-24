import { registerAs } from '@nestjs/config';

export const environment = {
  PORT: parseInt(process.env.PORT || '3000', 10),
  CORS_ORIGIN: process.env.CORS_ORIGIN || '*',
  DATA_DIR: process.env.DATA_DIR || './data',
  OLLAMA_LOCAL_BASE_URL: process.env.OLLAMA_LOCAL_BASE_URL || 'http://localhost:11434',
  OLLAMA_CLOUD_BASE_URL: process.env.OLLAMA_CLOUD_BASE_URL || '',
  OLLAMA_CLOUD_API_KEY: process.env.OLLAMA_CLOUD_API_KEY || '',
  SEARXNG_URL: process.env.SEARXNG_URL || 'http://localhost:8080',
  CLOAK_BROWSER_URL: process.env.CLOAK_BROWSER_URL || 'http://localhost:9222',
  SESSION_TTL_MS: parseInt(process.env.SESSION_TTL_MS || '86400000', 10),
  WORKSPACE_ROOT: process.env.WORKSPACE_ROOT || '/home/sc/cammander',
};

export default registerAs('env', () => environment);
