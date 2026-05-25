import { Controller, Post, Body, Logger, Res } from '@nestjs/common';
import type { Response as ExpressResponse } from 'express';
import { ConfigService } from '@nestjs/config';
import { SettingsService } from '../settings/settings.service';
import { SessionsService } from '../sessions/sessions.service';
import { ToolsService, ToolResult } from '../tools/tools.service';
import { IsString, IsOptional } from 'class-validator';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

// Load the project soul (HQ.md, CLAUDE.md, AGENTS.md, or soul.md) from workspace root.
// Returns the file contents or null if none found.
const SOUL_FILES = ['HQ.md', 'CLAUDE.md', 'AGENTS.md', 'soul.md'];

function loadSoul(workspaceRoot: string): string | null {
  for (const name of SOUL_FILES) {
    const p = join(workspaceRoot, name);
    if (existsSync(p)) {
      try {
        return readFileSync(p, 'utf-8');
      } catch { /* permission / encoding issue — skip silently */ }
    }
  }
  return null;
}

function buildSystemPrompt(workspaceRoot: string): string {
  const workspaceName = workspaceRoot.split('/').pop() || 'workspace';
  const soul = loadSoul(workspaceRoot);
  const context = `\n\n---\nWorkspace: "${workspaceName}" at ${workspaceRoot}. All file paths and commands are relative to this project.\nCurrent date: ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}.`;
  if (soul) {
    return soul + context;
  }
  return `You are a helpful coding assistant inside the cammander IDE. You have tools to run commands, read and write files, search code, and list directories. Use them to help the user. Be concise and practical.` + context;
}

// Tool definitions for the LLM
const TOOL_DEFINITIONS = [
  {
    type: 'function',
    function: {
      name: 'bash',
      description: 'Run a shell command in the project workspace. Returns stdout and stderr. Use for builds, tests, git, npm, etc.',
      parameters: {
        type: 'object',
        required: ['command'],
        properties: {
          command: { type: 'string', description: 'Shell command to execute' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'read_file',
      description: 'Read a file from the workspace. Returns line-numbered content.',
      parameters: {
        type: 'object',
        required: ['path'],
        properties: {
          path: { type: 'string', description: 'Relative or absolute file path' },
          offset: { type: 'number', description: 'Starting line number (1-indexed, default 1)' },
          limit: { type: 'number', description: 'Max lines to return (default 500)' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'write_file',
      description: 'Write content to a file. Creates parent directories if needed. Overwrites existing files.',
      parameters: {
        type: 'object',
        required: ['path', 'content'],
        properties: {
          path: { type: 'string', description: 'Relative or absolute file path' },
          content: { type: 'string', description: 'File content to write' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'grep',
      description: 'Search file contents for a pattern. Returns matching lines with line numbers.',
      parameters: {
        type: 'object',
        required: ['pattern'],
        properties: {
          pattern: { type: 'string', description: 'Regex pattern to search for' },
          path: { type: 'string', description: 'Directory or file to search in (default: workspace root)' },
          glob: { type: 'string', description: 'File glob filter, e.g. "*.ts"' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_files',
      description: 'List files and directories in a path. Shows tree structure up to 3 levels deep.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Directory path (default: workspace root)' },
          glob: { type: 'string', description: 'Optional glob pattern filter' },
        },
      },
    },
  },
];

const MAX_TOOL_ROUNDS = 8;

class ChatRequestDto {
  @IsString()
  sessionId!: string;

  @IsString()
  message!: string;

  @IsOptional()
  @IsString()
  model?: string;

  @IsOptional()
  @IsString()
  workspaceRoot?: string;
}

@Controller('chat')
export class ChatController {
  private readonly logger = new Logger(ChatController.name);

  constructor(
    private settings: SettingsService,
    private sessions: SessionsService,
    private tools: ToolsService,
    private config: ConfigService,
  ) {}

  @Post()
  async chat(@Body() dto: ChatRequestDto) {
    const s = this.settings.getRaw();
    const provider = s.activeProvider;
    const model = dto.model || s.defaultModel || 'deepseek-v4-flash';
    let session = this.sessions.get(dto.sessionId);

    if (!session) {
      this.logger.warn(`Session ${dto.sessionId} not found, creating new`);
      session = this.sessions.create();
    }

    // Add user message
    session = this.sessions.addMessage(session.id, { role: 'user', content: dto.message })!;

    // Resolve workspace root: prefer request-sent value, then env, then fallback
    const workspaceRoot: string = dto.workspaceRoot || this.config.get<string>('WORKSPACE_ROOT', '/tmp') || '/tmp';
    this.tools.setWorkspaceRoot(workspaceRoot);

    // Build messages array for the LLM
    const messages: any[] = [
      {
        role: 'system',
        content: buildSystemPrompt(workspaceRoot),
      },
    ];

    // Add conversation history
    for (const msg of session.messages) {
      if (msg.role === 'system') continue; // we add our own system prompt
      if (msg.role === 'assistant' && msg.toolCalls && msg.toolCalls.length > 0) {
        messages.push({
          role: 'assistant',
          content: msg.content || null,
          tool_calls: msg.toolCalls,
        });
      } else if (msg.role === 'tool') {
        messages.push({
          role: 'tool',
          tool_call_id: msg.toolCallId,
          content: msg.content,
        });
      } else {
        messages.push({ role: msg.role, content: msg.content });
      }
    }

    let baseUrl: string;
    let headers: Record<string, string> = { 'Content-Type': 'application/json' };

    if (provider === 'ollama-cloud') {
      baseUrl = s.ollamaCloud.baseUrl.replace(/\/$/, '');
      if (s.ollamaCloud.apiKey) {
        headers['Authorization'] = `Bearer ${s.ollamaCloud.apiKey}`;
      }
    } else {
      baseUrl = `http://${s.ollamaLocal.host}:${s.ollamaLocal.port}/v1`;
    }

    const fetchUrl = `${baseUrl}/chat/completions`;

    // Multi-turn tool calling loop
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      this.logger.log(`Round ${round + 1}: Sending ${messages.length} messages to ${model}`);

      let res: Response;
      try {
        res = await fetch(fetchUrl, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            model,
            messages,
            tools: TOOL_DEFINITIONS,
            tool_choice: 'auto',
            stream: false,
          }),
          redirect: 'follow',
        });
      } catch (fetchErr: any) {
        this.logger.error(`Fetch failed: ${fetchErr.message}`);
        const errSession = this.sessions.addMessage(session.id, {
          role: 'assistant',
          content: `⚠ Cannot reach ${provider}: ${fetchErr.message}`,
        });
        return { error: true, status: 502, message: `Cannot reach ${provider}: ${fetchErr.message}`, provider, model, sessionId: session.id, session: errSession };
      }

      if (!res.ok) {
        const errText = await res.text().catch(() => 'Unknown error');
        this.logger.warn(`Provider returned ${res.status}: ${errText.slice(0, 200)}`);
        const errSession = this.sessions.addMessage(session.id, {
          role: 'assistant',
          content: `⚠ Provider returned ${res.status}: ${errText}`,
        });
        return { error: true, status: res.status, message: `Provider returned ${res.status}: ${errText}`, provider, model, sessionId: session.id, session: errSession };
      }

      const data = await res.json() as any;
      const choice = data?.choices?.[0];
      if (!choice) {
        const errSession = this.sessions.addMessage(session.id, {
          role: 'assistant',
          content: '⚠ No response from model',
        });
        return { error: true, status: 502, message: 'No response from model', provider, model, sessionId: session.id, session: errSession };
      }

      const assistantMsg = choice.message;

      // No tool calls — just return the text response
      if (!assistantMsg.tool_calls || assistantMsg.tool_calls.length === 0) {
        const content = assistantMsg.content || '(no response)';
        const updatedSession = this.sessions.addMessage(session.id, {
          role: 'assistant',
          content,
          model,
        });
        return { error: false, content, provider, model, sessionId: session.id, session: updatedSession };
      }

      // Has tool calls — save assistant message and execute tools
      this.sessions.addMessage(session.id, {
        role: 'assistant',
        content: assistantMsg.content || '',
        toolCalls: assistantMsg.tool_calls,
      });

      // Add to LLM messages
      messages.push(assistantMsg);

      // Execute each tool call
      for (const tc of assistantMsg.tool_calls) {
        const fnName = tc.function.name;
        let fnArgs: Record<string, any> = {};
        try {
          fnArgs = JSON.parse(tc.function.arguments);
        } catch {
          fnArgs = {};
        }

        const result: ToolResult = await this.tools.execute(fnName, fnArgs, tc.id);

        // Save tool result to session
        this.sessions.addMessage(session.id, {
          role: 'tool',
          content: result.content,
          toolCallId: tc.id,
        });

        // Add to LLM messages for next round
        messages.push({
          role: 'tool',
          tool_call_id: tc.id,
          content: result.content,
        });

        this.logger.log(`Tool ${fnName} -> ${result.content.slice(0, 100)}${result.error ? ' (ERROR)' : ''}`);
      }
    }

    // Exceeded max rounds
    const exhaustedSession = this.sessions.addMessage(session.id, {
      role: 'assistant',
      content: '⚠ Reached maximum number of tool call rounds. Please continue the conversation.',
    });
    return { error: false, content: 'Reached maximum tool call rounds.', provider, model, sessionId: session.id, session: exhaustedSession };
  }

  @Post('stream')
  async chatStream(@Body() dto: ChatRequestDto, @Res() res: ExpressResponse) {
    const s = this.settings.getRaw();
    const provider = s.activeProvider;
    const model = dto.model || s.defaultModel || 'deepseek-v4-flash';

    // SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const send = (data: Record<string, any>) => {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    let session = this.sessions.get(dto.sessionId);
    if (!session) {
      this.logger.warn(`Session ${dto.sessionId} not found, creating new`);
      session = this.sessions.create();
    }

    // Add user message
    session = this.sessions.addMessage(session.id, { role: 'user', content: dto.message })!;

    // Resolve workspace root
    const workspaceRoot: string = dto.workspaceRoot || this.config.get<string>('WORKSPACE_ROOT', '/tmp') || '/tmp';
    this.tools.setWorkspaceRoot(workspaceRoot);

    // Build messages
    const messages: any[] = [
      {
        role: 'system',
        content: buildSystemPrompt(workspaceRoot),
      },
    ];

    for (const msg of session.messages) {
      if (msg.role === 'system') continue;
      if (msg.role === 'assistant' && msg.toolCalls && msg.toolCalls.length > 0) {
        messages.push({
          role: 'assistant',
          content: msg.content || null,
          tool_calls: msg.toolCalls,
        });
      } else if (msg.role === 'tool') {
        messages.push({
          role: 'tool',
          tool_call_id: msg.toolCallId,
          content: msg.content,
        });
      } else {
        messages.push({ role: msg.role, content: msg.content });
      }
    }

    let baseUrl: string;
    let headers: Record<string, string> = { 'Content-Type': 'application/json' };

    if (provider === 'ollama-cloud') {
      baseUrl = s.ollamaCloud.baseUrl.replace(/\/$/, '');
      if (s.ollamaCloud.apiKey) {
        headers['Authorization'] = `Bearer ${s.ollamaCloud.apiKey}`;
      }
    } else {
      baseUrl = `http://${s.ollamaLocal.host}:${s.ollamaLocal.port}/v1`;
    }

    const fetchUrl = `${baseUrl}/chat/completions`;

    try {
      // Multi-turn tool calling loop with streaming
      for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
        this.logger.log(`Stream round ${round + 1}: Sending ${messages.length} messages to ${model}`);

        const fetchRes = await fetch(fetchUrl, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            model,
            messages,
            tools: TOOL_DEFINITIONS,
            tool_choice: 'auto',
            stream: true,
          }),
          redirect: 'follow',
        });

        if (!fetchRes.ok) {
          const errText = await fetchRes.text().catch(() => 'Unknown error');
          this.logger.warn(`Provider returned ${fetchRes.status}: ${errText.slice(0, 200)}`);
          send({ type: 'token', content: `⚠ Provider returned ${fetchRes.status}: ${errText}` });
          send({ type: 'error', status: fetchRes.status, message: errText });
          this.sessions.addMessage(session.id, {
            role: 'assistant',
            content: `⚠ Provider returned ${fetchRes.status}: ${errText}`,
          });
          res.end();
          return;
        }

        if (!fetchRes.body) {
          send({ type: 'token', content: '⚠ No response body from provider' });
          send({ type: 'error', message: 'No response body' });
          res.end();
          return;
        }

        // Accumulate streaming content and tool calls
        let fullContent = '';
        const toolCalls: Map<number, { id: string; name: string; args: string }> = new Map();

        const reader = fetchRes.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          // Keep the last partial line in buffer
          buffer = lines.pop() || '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || !trimmed.startsWith('data: ')) continue;
            const dataStr = trimmed.slice(6);
            if (dataStr === '[DONE]') continue;

            try {
              const chunk = JSON.parse(dataStr);
              const delta = chunk?.choices?.[0]?.delta;

              if (delta?.content) {
                fullContent += delta.content;
                send({ type: 'token', content: delta.content });
              }

              if (delta?.tool_calls) {
                for (const tc of delta.tool_calls) {
                  const idx = tc.index ?? 0;
                  if (!toolCalls.has(idx)) {
                    const toolCall = {
                      id: tc.id || '',
                      name: tc.function?.name || '',
                      args: tc.function?.arguments || '',
                    };
                    toolCalls.set(idx, toolCall);
                    if (toolCall.name) {
                      send({ type: 'tool_call', name: toolCall.name, args: '' });
                    }
                  } else {
                    const existing = toolCalls.get(idx)!;
                    if (tc.function?.name) existing.name = tc.function.name;
                    if (tc.function?.arguments) existing.args += tc.function.arguments;
                  }
                }
              }
            } catch {
              // Skip unparseable chunks
            }
          }
        }

        // Process remaining buffer
        if (buffer.trim()) {
          const trimmed = buffer.trim();
          if (trimmed.startsWith('data: ') && trimmed.slice(6) !== '[DONE]') {
            try {
              const chunk = JSON.parse(trimmed.slice(6));
              const delta = chunk?.choices?.[0]?.delta;
              if (delta?.content) {
                fullContent += delta.content;
                send({ type: 'token', content: delta.content });
              }
            } catch { /* skip */ }
          }
        }

        // Convert tool calls map to array
        const toolCallsArr = Array.from(toolCalls.values()).filter(tc => tc.id && tc.name);

        // No tool calls — final answer
        if (toolCallsArr.length === 0) {
          const finalSession = this.sessions.addMessage(session.id, {
            role: 'assistant',
            content: fullContent || '(no response)',
            model,
          });
          send({ type: 'done', session: finalSession });
          res.end();
          return;
        }

        // Has tool calls — add assistant message and execute tools
        this.sessions.addMessage(session.id, {
          role: 'assistant',
          content: fullContent,
          toolCalls: toolCallsArr.map(tc => ({
            id: tc.id,
            type: 'function',
            function: { name: tc.name, arguments: tc.args },
          })),
        });

        // Add assistant message to LLM messages
        messages.push({
          role: 'assistant',
          content: fullContent || null,
          tool_calls: toolCallsArr.map(tc => ({
            id: tc.id,
            type: 'function',
            function: { name: tc.name, arguments: tc.args },
          })),
        });

        // Execute each tool call
        for (const tc of toolCallsArr) {
          let fnArgs: Record<string, any> = {};
          try { fnArgs = JSON.parse(tc.args); } catch { fnArgs = {}; }

          const result: ToolResult = await this.tools.execute(tc.name, fnArgs, tc.id);

          this.sessions.addMessage(session.id, {
            role: 'tool',
            content: result.content,
            toolCallId: tc.id,
          });

          messages.push({
            role: 'tool',
            tool_call_id: tc.id,
            content: result.content,
          });

          this.logger.log(`Tool ${tc.name} -> ${result.content.slice(0, 100)}${result.error ? ' (ERROR)' : ''}`);
        }
      }

      // Exceeded max rounds
      const exhaustedSession = this.sessions.addMessage(session.id, {
        role: 'assistant',
        content: '⚠ Reached maximum number of tool call rounds. Please continue the conversation.',
      });
      send({ type: 'done', session: exhaustedSession });
      res.end();
    } catch (fetchErr: any) {
      this.logger.error(`Stream fetch failed: ${fetchErr.message}`);
      send({ type: 'error', status: 502, message: `Cannot reach ${provider}: ${fetchErr.message}` });
      this.sessions.addMessage(session.id, {
        role: 'assistant',
        content: `⚠ Cannot reach ${provider}: ${fetchErr.message}`,
      });
      res.end();
    }
  }
}