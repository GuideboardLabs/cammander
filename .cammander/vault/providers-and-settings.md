---
title: Providers and Settings
tags: [config, provider, ollama, settings, api-key]
created: 2026-05-27T00:00:00Z
updated: 2026-05-27T00:00:00Z
---

# Provider Configuration (6 Providers)

| Provider | ID | API Key | Base URL | Auth |
|----------|----|---------|----------|------|
| Ollama Cloud | `ollama-cloud` | yes | `https://ollama.com/v1` | Bearer token |
| Ollama Local | `ollama-local` | no | `http://localhost:11434` | None |
| OpenAI Compatible | `openai-compat` | optional | User-provided | Bearer if key set |
| llama.cpp | `llama-cpp` | no | `http://localhost:8080` | None |
| vLLM | `vllm` | optional | `http://localhost:8000` | Bearer if key set |
| LM Studio | `lm-studio` | no | `http://localhost:1234` | None |

## Critical Pitfalls
- **Ollama Cloud URL MUST be `https://ollama.com/v1`**: `api.ollama.com` 301-redirects, Node drops auth on redirect = 401.
- **Local Ollama requires `/v1` prefix**: `http://localhost:11434/v1/chat/completions`.
- **Model IDs are exact**: `deepseek-v4-flash` works, `qwen3-coder` 404s. Always verify via `GET /models`.
- **API key masking**: GET returns `••••XXXX`. PUT detects `••••` prefix and preserves real key. Never save a masked key.

## Environment Variables
- `OPENAI_COMPAT_API_KEY`, `OPENAI_COMPAT_BASE_URL`
- `LLAMA_CPP_BASE_URL`
- `VLLM_API_KEY`, `VLLM_BASE_URL`
- `LM_STUDIO_BASE_URL`

## Settings Service Pattern
- Reads from `data/settings.json` (CWD-relative!)
- PUT merges partial updates (doesn't replace)
- Frontend always falls back to `localStorage` when backend unreachable