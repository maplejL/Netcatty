// AI Provider types
import defaultCommandBlocklist from '../../lib/commandBlocklist.json';
import type { ProviderContinuation } from './providerContinuation';

export type AIProviderId =
  | 'openai'
  | 'anthropic'
  | 'google'
  | 'ollama'
  | 'openrouter'
  | 'qwen'
  | 'deepseek'
  | 'kimi'
  | 'zhipu'
  | 'doubao'
  | 'mimo'
  | 'custom';

/**
 * Wire-protocol family for a provider. Three are supported because every
 * Anthropic/OpenAI-compatible third party reduces to one of these.
 * `providerId` stays as the routing/display identity; `style` decides
 * which Vercel AI SDK client builds the request.
 */
export type ProviderStyle = 'openai' | 'anthropic' | 'google';

export interface ProviderAdvancedParams {
  maxTokens?: number;
  temperature?: number;       // 0–2
  topP?: number;              // 0–1
  frequencyPenalty?: number;  // -2–2
  presencePenalty?: number;   // -2–2
}

export interface ProviderConfig {
  id: string;
  providerId: AIProviderId;
  name: string;
  /** Override the wire-protocol family; defaults from `providerId` via {@link resolveProviderStyle}. */
  style?: ProviderStyle;
  /** Built-in icon key (slug under public/ai/providers/), independent of providerId. */
  iconId?: string;
  /** User-supplied icon as a data URL (compressed to 64x64 webp at write time). Wins over iconId. */
  iconDataUrl?: string;
  apiKey?: string;           // encrypted via credentialBridge (enc:v1: prefix)
  baseURL?: string;          // custom endpoint URL
  defaultModel?: string;
  customHeaders?: Record<string, string>;
  enabled: boolean;
  skipTLSVerify?: boolean;   // skip TLS certificate verification (for self-signed certs)
  /** User override for the model context window, in tokens. Wins over discovered model metadata. */
  contextWindow?: number;
  /** Context windows discovered from provider model-list metadata, keyed by model id. */
  modelContextWindows?: Record<string, number>;
  advancedParams?: ProviderAdvancedParams;
}

/** Pick the protocol family for a provider config, falling back from providerId when style is unset. */
export function resolveProviderStyle(config: Pick<ProviderConfig, 'providerId' | 'style'>): ProviderStyle {
  if (config.style) return config.style;
  switch (config.providerId) {
    case 'anthropic':
      return 'anthropic';
    case 'google':
      return 'google';
    default:
      return 'openai';
  }
}

export interface ModelInfo {
  id: string;
  name: string;
  providerId: AIProviderId;
  contextWindow?: number;
  supportsTools?: boolean;
  supportsStreaming?: boolean;
}

// Chat types
export interface ChatMessageAttachment {
  base64Data: string;
  mediaType: string;
  filename?: string;
  filePath?: string;    // original filesystem path, when available
  terminalSelection?: boolean;
  previewText?: string;
  lineCount?: number;
}

export interface UploadedFile {
  id: string;
  filename: string;
  dataUrl: string;
  base64Data: string;
  mediaType: string;
  filePath?: string;
  terminalSelection?: boolean;
  previewText?: string;
  lineCount?: number;
}

export interface AIDraft {
  text: string;
  agentId: string;
  attachments: UploadedFile[];
  selectedUserSkillSlugs: string[];
  updatedAt: number;
}

export type AIPanelView =
  | { mode: 'draft' }
  | { mode: 'session'; sessionId: string };

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  attachments?: ChatMessageAttachment[];
  /** @deprecated Use attachments instead. Kept for backward compatibility with persisted sessions. */
  images?: ChatMessageAttachment[];
  thinking?: string;
  thinkingDurationMs?: number;
  providerContinuation?: ProviderContinuation;
  toolCalls?: ToolCall[];
  toolResults?: ToolResult[];
  timestamp: number;
  model?: string;
  providerId?: AIProviderId;
  errorInfo?: {
    type: 'network' | 'auth' | 'timeout' | 'provider' | 'agent' | 'unknown';
    message: string;
    retryable: boolean;
  };
  /** Transient status text shown with shimmer effect (e.g. "Waiting for response...") */
  statusText?: string;
  executionStatus?: 'pending' | 'approved' | 'rejected' | 'running' | 'completed' | 'failed' | 'cancelled';
  pendingApproval?: {
    approvalId: string;
    toolCallId: string;
    toolName: string;
    toolArgs: Record<string, unknown>;
    status: 'pending' | 'approved' | 'denied';
  };
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ToolResult {
  toolCallId: string;
  /** Optional tool name carried by external SDK/MCP result streams. */
  toolName?: string;
  content: string;
  isError?: boolean;
}

export interface ChatParams {
  model: string;
  messages: ChatMessage[];
  tools?: ToolDefinition[];
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>; // JSON Schema
}

// Streaming events
export type ChatStreamEvent =
  | { type: 'text'; content: string }
  | { type: 'thinking'; content: string }
  | { type: 'tool_call'; toolCall: ToolCall }
  | { type: 'error'; error: string }
  | { type: 'done'; usage?: { promptTokens: number; completionTokens: number } };

// AI Session types
export interface AISession {
  id: string;
  title: string;
  agentId: string;
  scope: AISessionScope;
  messages: ChatMessage[];
  externalSessionId?: string;
  createdAt: number;
  updatedAt: number;
}

export interface AISessionScope {
  type: 'terminal' | 'workspace' | 'global';
  targetId?: string;        // sessionId or workspaceId
  hostIds?: string[];       // resolved host IDs in scope
}

// Permission model
export type AIPermissionMode = 'observer' | 'confirm' | 'auto';
export type AIToolIntegrationMode = 'mcp' | 'skills';

export interface HostAIPermission {
  hostId: string;
  mode: AIPermissionMode;
  allowedCommands?: string[];   // regex patterns
  blockedCommands?: string[];   // regex patterns
  allowFileWrite?: boolean;
  maxConcurrentCommands?: number;
}

// Agent types
export interface AgentInfo {
  id: string;
  name: string;
  type: 'builtin' | 'external';
  icon?: string;
  description?: string;
  command?: string;             // for external agents
  args?: string[];
  available: boolean;
}

// External agent config. Managed agents route through official SDK backends.
export interface ExternalAgentConfig {
  id: string;
  name: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
  apiKey?: string;           // encrypted via credentialBridge (enc:v1: prefix)
  icon?: string;
  enabled: boolean;
  available?: boolean;
  /** SDK backend key for managed agents (claude|codex|copilot|cursor|codebuddy|workbuddy|opencode). */
  sdkBackend?: string;
  /** Internal: whether the managed command was set manually or auto-detected. */
  commandSource?: "manual" | "auto";
  /** @deprecated Legacy persisted field from the pre-SDK migration. Read only for compatibility. */
  acpCommand?: string;
  /** @deprecated Legacy persisted field from the pre-SDK migration. */
  acpArgs?: string[];
  /** Internal: disabled only because the managed CLI was unavailable. */
  autoDisabledUntilAvailable?: boolean;
}

// Discovered agent from system PATH
export interface DiscoveredAgent {
  command: string;
  name: string;
  icon: string;
  description: string;
  args: string[];
  path: string;
  version: string;
  available: boolean;
  /** @deprecated Legacy discovery field from the pre-SDK migration. */
  acpCommand?: string;
  acpArgs?: string[];
  /** SDK backend key (claude|codex|copilot|cursor|codebuddy|workbuddy|opencode) — the routing value. */
  sdkBackend?: 'claude' | 'codex' | 'copilot' | 'cursor' | 'codebuddy' | 'workbuddy' | 'opencode';
  /** Absolute resolved CLI path (preferred over `path`). */
  binPath?: string;
  installed?: boolean;
  authenticated?: boolean;
  authSource?: string | null;
}

// Web Search types
export type WebSearchProviderId = 'tavily' | 'exa' | 'bocha' | 'zhipu' | 'searxng';

export interface WebSearchConfig {
  providerId: WebSearchProviderId;
  apiKey?: string;        // enc:v1: encrypted via credentialBridge
  apiHost?: string;       // custom API endpoint (required for SearXNG)
  enabled: boolean;
  maxResults?: number;    // default 5
}

export const WEB_SEARCH_PROVIDER_PRESETS: Record<WebSearchProviderId, { name: string; defaultApiHost: string; requiresApiKey: boolean }> = {
  tavily: { name: 'Tavily', defaultApiHost: 'https://api.tavily.com', requiresApiKey: true },
  exa: { name: 'Exa', defaultApiHost: 'https://api.exa.ai', requiresApiKey: true },
  bocha: { name: 'Bocha', defaultApiHost: 'https://api.bochaai.com', requiresApiKey: true },
  zhipu: { name: 'Zhipu', defaultApiHost: 'https://open.bigmodel.cn/api/paas/v4', requiresApiKey: true },
  searxng: { name: 'SearXNG', defaultApiHost: '', requiresApiKey: false },
};

/** Check if a WebSearchConfig is fully configured and ready to use. */
export function isWebSearchReady(config?: WebSearchConfig | null): boolean {
  if (!config?.enabled) return false;
  const preset = WEB_SEARCH_PROVIDER_PRESETS[config.providerId];
  if (preset?.requiresApiKey && !config.apiKey) return false;
  if (config.providerId === 'searxng' && !config.apiHost) return false;
  // Validate apiHost is a well-formed URL if provided
  if (config.apiHost) {
    try { new URL(config.apiHost); } catch { return false; }
  }
  return true;
}

// AI Settings (stored in localStorage)
export interface AISettings {
  providers: ProviderConfig[];
  activeProviderId: string;
  activeModelId: string;
  globalPermissionMode: AIPermissionMode;
  toolIntegrationMode: AIToolIntegrationMode;
  externalAgents: ExternalAgentConfig[];
  defaultAgentId: string;
  commandBlocklist: string[];    // global command blocklist patterns
  commandTimeout: number;        // seconds, default 60
  maxIterations: number;         // doom loop prevention, default 20
  webSearchConfig?: WebSearchConfig;
}

export const DEFAULT_COMMAND_BLOCKLIST = [
  ...defaultCommandBlocklist,
];

export const DEFAULT_COMMAND_TIMEOUT_SECONDS = 60;
export const MAX_COMMAND_TIMEOUT_SECONDS = 24 * 60 * 60;

export function normalizeCommandTimeoutSeconds(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_COMMAND_TIMEOUT_SECONDS;
  return Math.min(MAX_COMMAND_TIMEOUT_SECONDS, Math.max(1, value));
}

export const DEFAULT_AI_SETTINGS: AISettings = {
  providers: [],
  activeProviderId: '',
  activeModelId: '',
  globalPermissionMode: 'confirm',
  toolIntegrationMode: 'mcp',
  externalAgents: [],
  defaultAgentId: 'catty',
  commandBlocklist: [...DEFAULT_COMMAND_BLOCKLIST],
  commandTimeout: DEFAULT_COMMAND_TIMEOUT_SECONDS,
  maxIterations: 20,
};

export interface ProviderPreset {
  name: string;
  defaultBaseURL: string;
  modelsEndpoint?: string;
  defaultModels?: readonly string[];
}

// Provider presets for quick setup
export const PROVIDER_PRESETS: Record<AIProviderId, ProviderPreset> = {
  openai: { name: 'OpenAI', defaultBaseURL: 'https://api.openai.com/v1', modelsEndpoint: '/models' },
  anthropic: { name: 'Anthropic', defaultBaseURL: 'https://api.anthropic.com', modelsEndpoint: '/v1/models' },
  google: { name: 'Google AI', defaultBaseURL: 'https://generativelanguage.googleapis.com/v1beta' },
  ollama: { name: 'Ollama', defaultBaseURL: 'http://localhost:11434/v1', modelsEndpoint: '/models' },
  openrouter: { name: 'OpenRouter', defaultBaseURL: 'https://openrouter.ai/api/v1', modelsEndpoint: '/models' },
  qwen: {
    name: 'Qwen',
    defaultBaseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    modelsEndpoint: '/models',
    defaultModels: [
      'qwen3.7-plus',
      'qwen3.7-max',
      'qwen3.6-plus',
      'qwen3.6-flash',
      'qwen3.6-max-preview',
      'qwen3.5-plus',
      'qwen3-coder-plus',
      'qwen3-coder-flash',
      'qwen-plus',
      'qwen-plus-latest',
    ],
  },
  deepseek: {
    name: 'DeepSeek',
    defaultBaseURL: 'https://api.deepseek.com/v1',
    modelsEndpoint: '/models',
    defaultModels: [
      'deepseek-v4-flash',
      'deepseek-v4-pro',
      'deepseek-chat',
      'deepseek-reasoner',
    ],
  },
  kimi: {
    name: 'Kimi',
    defaultBaseURL: 'https://api.moonshot.ai/v1',
    modelsEndpoint: '/models',
    defaultModels: [
      'kimi-k2.6',
      'kimi-k2.5',
      'moonshot-v1-128k',
      'moonshot-v1-32k',
      'moonshot-v1-8k',
    ],
  },
  zhipu: {
    name: 'Zhipu',
    defaultBaseURL: 'https://open.bigmodel.cn/api/paas/v4',
    modelsEndpoint: '/models',
    defaultModels: [
      'glm-5.1',
      'glm-5',
      'glm-5-turbo',
      'glm-4.7',
      'glm-4.7-flash',
      'glm-4.6',
      'glm-4.5',
      'glm-4.5-air',
    ],
  },
  doubao: {
    name: 'Doubao',
    defaultBaseURL: 'https://ark.cn-beijing.volces.com/api/v3',
    modelsEndpoint: '/models',
    defaultModels: [
      'doubao-seed-2-0-pro-260215',
      'doubao-seed-2-0-lite-260215',
      'doubao-seed-2-0-mini-260215',
      'doubao-seed-2-0-code-preview-260215',
    ],
  },
  mimo: {
    name: 'Xiaomi MiMo',
    defaultBaseURL: 'https://api.xiaomimimo.com/v1',
    modelsEndpoint: '/models',
    defaultModels: [
      'mimo-v2.5-pro',
      'mimo-v2.5',
    ],
  },
  custom: { name: 'Custom', defaultBaseURL: '' },
};

// Agent model presets (hardcoded, same as 1code)
export interface AgentModelPreset {
  id: string;
  name: string;
  description?: string;
  /** Slash-encoded thinking levels (model ID sent as `id/level`) */
  thinkingLevels?: string[];
  /**
   * When set (Cursor effort param), thinking is encoded as `id?param=level`
   * instead of slash-style `id/level`.
   */
  thinkingParamId?: string;
  /** Fast mode toggle availability */
  supportsFast?: boolean;
  /** Cursor-style query params when Fast is enabled (e.g. fast=true) */
  fastParams?: Array<{ id: string; value: string }>;
  /**
   * Slash-style Fast (Codex / CodeBuddy): selecting Fast stores `id/<fastEffort>`.
   * Prefer a value NOT listed in thinkingLevels (e.g. Codex `minimal`) so Fast
   * stays independent from the Low effort chip.
   */
  fastEffort?: string;
}

/** CodeBuddy / WorkBuddy thinking modes (slash-encoded on the model id). */
export const CODEBUDDY_THINKING_LEVELS = ['disabled', 'adaptive', 'enabled'] as const;

export const CLAUDE_MODEL_PRESETS: AgentModelPreset[] = [
  { id: 'default', name: 'Opus 4.6', description: 'Recommended' },
  { id: 'sonnet', name: 'Sonnet 4.6', description: 'Everyday tasks' },
  { id: 'haiku', name: 'Haiku 4.5', description: 'Fastest' },
];

// Curated codex model list (codex-sdk has no enumeration API). Mirrors the
// craft agent's `openai-codex` set. The codex driver splits "<id>/<effort>"
// into model + modelReasoningEffort, so thinkingLevels work via codex-sdk.
// Fast maps to `minimal` (not `low`) so it stays independent of the Low chip.
const CODEX_GPT_CONTROLS = {
  thinkingLevels: ['low', 'medium', 'high', 'xhigh'] as string[],
  supportsFast: true,
  fastEffort: 'minimal',
};

export const CODEX_MODEL_PRESETS: AgentModelPreset[] = [
  { id: 'gpt-5.5', name: 'GPT-5.5', description: 'Latest', ...CODEX_GPT_CONTROLS },
  { id: 'gpt-5.2', name: 'GPT-5.2', ...CODEX_GPT_CONTROLS },
  { id: 'gpt-5.1', name: 'GPT-5.1', ...CODEX_GPT_CONTROLS },
  { id: 'gpt-5', name: 'GPT-5', ...CODEX_GPT_CONTROLS },
  {
    id: 'o4-mini',
    name: 'o4-mini',
    description: 'Fast reasoning',
    thinkingLevels: ['low', 'medium', 'high'],
    supportsFast: true,
    fastEffort: 'minimal',
  },
  {
    id: 'o3',
    name: 'o3',
    description: 'Reasoning',
    thinkingLevels: ['low', 'medium', 'high'],
    supportsFast: true,
    fastEffort: 'minimal',
  },
  { id: 'gpt-4o', name: 'GPT-4o' },
];

// Fallback only when Cursor.models.list() fails. Prefer runtime catalog.
// IDs must match Cursor SDK model ids (dots, not hyphens in the minor segment
// for Claude aliases vary by account — runtime list is authoritative).
export const CURSOR_MODEL_PRESETS: AgentModelPreset[] = [
  { id: 'composer-2.5', name: 'Composer 2.5', description: 'Recommended', supportsFast: true, fastParams: [{ id: 'fast', value: 'true' }] },
  { id: 'auto', name: 'Auto', description: 'Cursor selects a model' },
  {
    id: 'gpt-5.5',
    name: 'GPT-5.5',
    supportsFast: true,
    fastParams: [{ id: 'fast', value: 'true' }],
    thinkingLevels: ['low', 'medium', 'high', 'xhigh'],
    thinkingParamId: 'effort',
  },
  {
    id: 'gpt-5.2',
    name: 'GPT-5.2',
    supportsFast: true,
    fastParams: [{ id: 'fast', value: 'true' }],
    thinkingLevels: ['low', 'medium', 'high', 'xhigh'],
    thinkingParamId: 'effort',
  },
  {
    id: 'gpt-5.1',
    name: 'GPT-5.1',
    supportsFast: true,
    fastParams: [{ id: 'fast', value: 'true' }],
    thinkingLevels: ['low', 'medium', 'high', 'xhigh'],
    thinkingParamId: 'effort',
  },
  { id: 'claude-opus-4.6', name: 'Claude Opus 4.6' },
  { id: 'claude-sonnet-4.6', name: 'Claude Sonnet 4.6' },
];

// CodeBuddy's SDK model enumeration can be empty depending on CLI/account
// state; keep a CLI-supported fallback list so users can still pass --model.
// Thinking is slash-encoded (`id/adaptive`); Fast maps to thinking disabled
// and is kept OUT of thinkingLevels so the Off chip does not light Fast.
const CODEBUDDY_MODEL_CONTROLS = {
  thinkingLevels: ['adaptive', 'enabled'] as string[],
  supportsFast: true,
  fastEffort: 'disabled',
};

export const CODEBUDDY_MODEL_PRESETS: AgentModelPreset[] = [
  { id: 'deepseek-v4-pro', name: 'DeepSeek V4 Pro', ...CODEBUDDY_MODEL_CONTROLS },
  { id: 'deepseek-v4-flash', name: 'DeepSeek V4 Flash', ...CODEBUDDY_MODEL_CONTROLS },
  { id: 'deepseek-v3-2-volc', name: 'DeepSeek V3.2', ...CODEBUDDY_MODEL_CONTROLS },
  { id: 'glm-5.1', name: 'GLM 5.1', ...CODEBUDDY_MODEL_CONTROLS },
  { id: 'glm-5.0', name: 'GLM 5.0', ...CODEBUDDY_MODEL_CONTROLS },
  { id: 'glm-5.0-turbo', name: 'GLM 5.0 Turbo', ...CODEBUDDY_MODEL_CONTROLS },
  { id: 'glm-5v-turbo', name: 'GLM 5V Turbo', ...CODEBUDDY_MODEL_CONTROLS },
  { id: 'glm-4.7', name: 'GLM 4.7', ...CODEBUDDY_MODEL_CONTROLS },
  { id: 'minimax-m3-pay', name: 'MiniMax M3', ...CODEBUDDY_MODEL_CONTROLS },
  { id: 'minimax-m2.7', name: 'MiniMax M2.7', ...CODEBUDDY_MODEL_CONTROLS },
  { id: 'kimi-k2.6', name: 'Kimi K2.6', ...CODEBUDDY_MODEL_CONTROLS },
  { id: 'hy3-preview', name: 'Hy3 Preview', ...CODEBUDDY_MODEL_CONTROLS },
];

/** Encode slash-style model + Fast/effort (Codex, CodeBuddy). */
export function resolveSlashModelSelection(
  baseId: string,
  options: {
    effort?: string | null;
    fast?: boolean;
    fastEffort?: string | null;
    thinkingLevels?: readonly string[] | null;
  },
): string {
  const id = String(baseId || '').trim();
  if (!id) return '';
  let effort = options.effort ?? null;
  if (options.fast && options.fastEffort) {
    effort = options.fastEffort;
  }
  if (
    effort
    && (
      options.thinkingLevels?.includes(effort)
      || effort === options.fastEffort
    )
  ) {
    return `${id}/${effort}`;
  }
  return id;
}

export const OPENCODE_MODEL_PRESETS: AgentModelPreset[] = [
  { id: 'openai/gpt-5.1', name: 'OpenAI GPT-5.1' },
  { id: 'anthropic/claude-sonnet-4-6', name: 'Claude Sonnet 4.6' },
  { id: 'deepseek/deepseek-chat', name: 'DeepSeek Chat' },
  { id: 'openrouter/openai/gpt-5.1', name: 'OpenRouter GPT-5.1' },
  { id: 'ollama/llama3.3', name: 'Ollama Llama 3.3' },
];

export function getAgentModelPresets(
  agentCommand?: string,
  sdkBackend?: string,
): AgentModelPreset[] {
  // Prefer explicit SDK backend — managed agents may use a path basename that
  // does not start with the product name (e.g. WorkBuddy's embedded codebuddy).
  const backend = String(sdkBackend || '').trim().toLowerCase();
  if (backend === 'claude') return CLAUDE_MODEL_PRESETS;
  if (backend === 'codex') return CODEX_MODEL_PRESETS;
  if (backend === 'cursor') return CURSOR_MODEL_PRESETS;
  if (backend === 'codebuddy' || backend === 'workbuddy') return CODEBUDDY_MODEL_PRESETS;
  if (backend === 'opencode') return OPENCODE_MODEL_PRESETS;
  if (backend === 'copilot') return [];

  if (!agentCommand) return [];
  // Split on both POSIX (/) and Windows (\) separators so command paths like
  // "C:\\Users\\foo\\codex.cmd" resolve to the right basename. Splitting only
  // on "/" leaves the full path intact on Windows, which never matches the
  // preset prefixes below and yields an empty list (presets silently lost).
  const basename = agentCommand.split(/[\\/]/).pop()?.toLowerCase() ?? '';
  if (basename.startsWith('claude')) return CLAUDE_MODEL_PRESETS;
  if (basename.startsWith('codex')) return CODEX_MODEL_PRESETS;
  if (basename.startsWith('cursor')) return CURSOR_MODEL_PRESETS;
  if (basename.startsWith('codebuddy') || basename.startsWith('workbuddy')) {
    return CODEBUDDY_MODEL_PRESETS;
  }
  if (basename.startsWith('opencode')) return OPENCODE_MODEL_PRESETS;
  return [];
}

export function formatThinkingLabel(level: string): string {
  const value = String(level ?? '').trim();
  if (!value) return '';
  if (value === 'xhigh') return 'Extra High';
  if (value === 'minimal') return 'Minimal';
  if (value === 'disabled') return 'Off';
  if (value === 'adaptive') return 'Adaptive';
  if (value === 'enabled') return 'On';
  return value.charAt(0).toUpperCase() + value.slice(1);
}
