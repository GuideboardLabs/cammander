import { Controller, Post, Body, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SettingsService } from '../settings/settings.service';
import { SessionsService } from '../sessions/sessions.service';
import { ToolsService, ToolResult } from '../tools/tools.service';
import { IsString, IsOptional } from 'class-validator';

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
    const workspaceName = workspaceRoot.split('/').pop() || 'workspace';
    const messages: any[] = [
      {
        role: 'system',
        content: `You are a helpful coding assistant inside the cammander IDE. You have tools to run commands, read and write files, search code, and list directories. Use them to help the user. Be concise and practical. The workspace is "${workspaceName}" at ${workspaceRoot}. All file paths and commands are relative to this project.`,
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
}