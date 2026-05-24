export interface ModelInfo {
    id: string;
    name: string;
    provider: string;
    size?: number;
    parameterCount?: string;
    contextWindow?: number;
    quantization?: string;
    available: boolean;
}
export interface AgentChatRequest {
    model: string;
    provider: string;
    messages: ChatMessage[];
    tools?: ToolDefinition[];
    temperature?: number;
    maxTokens?: number;
    stream?: boolean;
    system?: string;
}
export interface ChatMessage {
    role: 'system' | 'user' | 'assistant' | 'tool';
    content: string;
    tool_calls?: ToolCall[];
    tool_call_id?: string;
}
export interface ToolCall {
    id: string;
    type: 'function';
    function: {
        name: string;
        arguments: string;
    };
}
export interface ToolDefinition {
    type: 'function';
    function: {
        name: string;
        description: string;
        parameters: Record<string, unknown>;
    };
}
export interface ModelToken {
    token: string;
    done?: boolean;
    toolCall?: ToolCall | null;
}
export interface WorkspaceSession {
    id: string;
    name: string;
    workspacePath: string;
    provider: string;
    model: string;
    createdAt: string;
    updatedAt: string;
    messages: ChatMessage[];
    openFiles: string[];
    cwd: string;
    toolHistory: ToolEvent[];
    permissions: PermissionPolicyMap;
}
export interface PermissionPolicyMap {
    [toolName: string]: 'allow' | 'ask' | 'deny' | 'session_allow';
}
export interface ToolEvent {
    id: string;
    tool: string;
    args: unknown;
    result?: unknown;
    error?: string;
    approved: boolean;
    timestamp: string;
}
export interface PermissionPrompt {
    id: string;
    tool: string;
    args: unknown;
    reason: string;
    risk: 'low' | 'medium' | 'high' | 'critical';
    affectedFiles: string[];
    resolved: boolean;
    allowed?: boolean;
}
export interface AgentRequest {
    sessionId: string;
    message: string;
    provider?: string;
    model?: string;
}
export interface WorkspaceIndexEntry {
    path: string;
    type: 'file' | 'directory';
    size?: number;
    mtime?: string;
}
export interface WorkspaceSettings {
    theme: 'dark' | 'light' | 'system';
    fontSize: number;
    compactMode: boolean;
    autoScroll: boolean;
    markdownRendering: boolean;
    streamingSpeed: 'slow' | 'normal' | 'fast';
    indexingRules: string[];
    ignoredFolders: string[];
    gitIntegration: boolean;
    sessionPersistence: boolean;
    claudeMdEnforcement: boolean;
    fileWatcher: boolean;
    searxngUrl: string;
    browserEnabled: boolean;
    cloakBrowserUrl?: string;
}
export interface AIProviderConfig {
    id: string;
    name: string;
    type: 'ollama-local' | 'ollama-cloud';
    baseUrl: string;
    apiKey?: string;
    timeout: number;
    concurrency: number;
}
export interface ModelRouting {
    high: {
        provider: string;
        model: string;
    };
    medium: {
        provider: string;
        model: string;
    };
    low: {
        provider: string;
        model: string;
    };
    planner?: {
        provider: string;
        model: string;
    };
    patch?: {
        provider: string;
        model: string;
    };
    grep?: {
        provider: string;
        model: string;
    };
    web?: {
        provider: string;
        model: string;
    };
    vision?: {
        provider: string;
        model: string;
    };
}
export interface AgentSettings {
    autonomousMode: boolean;
    toolApprovalDefault: 'ask' | 'allow' | 'deny';
    maxToolLoops: number;
    maxBashTimeout: number;
    tokenLimit: number;
    retryBehavior: 'none' | 'linear' | 'exponential';
    reasoningVerbosity: 'concise' | 'normal' | 'verbose';
}
