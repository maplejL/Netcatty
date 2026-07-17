import { localStorageAdapter } from '../../infrastructure/persistence/localStorageAdapter';
import {
  STORAGE_KEY_AI_ACTIVE_SESSION_MAP,
  STORAGE_KEY_AI_SESSIONS,
} from '../../infrastructure/config/storageKeys';
import type {
  AIDraft,
  AIPanelView,
  AISession,
  AIPermissionMode,
  AIToolIntegrationMode,
  ChatMessage,
  ChatMessageAttachment,
  ToolCall,
  ToolResult,
} from '../../infrastructure/ai/types';
import {
  bumpDraftMutationVersionState,
  bumpDraftUploadGenerationState,
  getDraftUploadGenerationState,
} from './aiDraftState';
import {
  pruneInactiveScopedSessions,
  pruneInactiveScopedTransientState,
} from './aiScopeCleanup';
import { emitAIStateChanged } from './aiStateEvents';

/** Typed accessor for the Electron IPC bridge exposed on `window.netcatty`. */
export interface AIBridge {
  aiSdkAgentCleanup?: (chatSessionId: string) => Promise<{ ok: boolean }>;
  aiMcpSetPermissionMode?: (mode: AIPermissionMode) => Promise<unknown> | unknown;
  aiMcpSetToolIntegrationMode?: (mode: AIToolIntegrationMode) => Promise<unknown> | unknown;
  aiMcpSetCommandBlocklist?: (blocklist: string[]) => Promise<unknown> | unknown;
  aiMcpSetCommandTimeout?: (timeout: number) => Promise<unknown> | unknown;
  aiMcpSetMaxIterations?: (maxIterations: number) => Promise<unknown> | unknown;
}

export function getAIBridge() {
  return (window as unknown as { netcatty?: AIBridge }).netcatty;
}


export const AI_STATE_CHANGED_DRAFTS_BY_SCOPE = 'netcatty:ai-drafts-by-scope';
export const AI_STATE_CHANGED_PANEL_VIEW_BY_SCOPE = 'netcatty:ai-panel-view-by-scope';

export type DraftsByScope = Partial<Record<string, AIDraft>>;
export type PanelViewByScope = Partial<Record<string, AIPanelView>>;

export function cleanupSdkAgentSessions(sessionIds: string[]) {
  const bridge = getAIBridge();
  if (!bridge?.aiSdkAgentCleanup || sessionIds.length === 0) return;
  for (const sessionId of sessionIds) {
    void bridge.aiSdkAgentCleanup(sessionId).catch(() => {});
  }
}

function isScopeKeyActive(scopeKey: string, activeTargetIds: Set<string>) {
  const separatorIndex = scopeKey.indexOf(':');
  if (separatorIndex === -1) return true;

  const targetId = scopeKey.slice(separatorIndex + 1);
  if (!targetId) return true;

  return activeTargetIds.has(targetId);
}

export function cleanupOrphanedAISessions(activeTargetIds: Set<string>) {
  const currentSessions = sanitizeAISessions(
    latestAISessionsSnapshot
      ?? localStorageAdapter.read<unknown>(STORAGE_KEY_AI_SESSIONS)
      ?? [],
  );

  // Sessions shown by a still-live scope must be protected from cleanup
  // even when their own `scope.targetId` points at a closed terminal —
  // history can be resumed into a different terminal and we must not
  // delete it outright while it's actively being used.
  const preCleanupActiveSessionMap = latestAIActiveSessionMapSnapshot
    ?? localStorageAdapter.read<Record<string, string | null>>(STORAGE_KEY_AI_ACTIVE_SESSION_MAP)
    ?? {};
  const activeSessionIds = new Set<string>();
  for (const [scopeKey, sessionId] of Object.entries(preCleanupActiveSessionMap)) {
    if (!sessionId) continue;
    if (!isScopeKeyActive(scopeKey, activeTargetIds)) continue;
    activeSessionIds.add(sessionId);
  }

  const nextSessionCleanup = pruneInactiveScopedSessions(
    currentSessions,
    activeTargetIds,
    activeSessionIds,
  );

  if (nextSessionCleanup.orphanedSessionIds.length > 0) {
    cleanupSdkAgentSessions(nextSessionCleanup.orphanedSessionIds);
  }

  if (nextSessionCleanup.sessions !== currentSessions) {
    setLatestAISessionsSnapshot(nextSessionCleanup.sessions);
    localStorageAdapter.write(
      STORAGE_KEY_AI_SESSIONS,
      pruneSessionsForStorage(nextSessionCleanup.sessions),
    );
    emitAIStateChanged(STORAGE_KEY_AI_SESSIONS);
  }

  const activeSessionIdMap = preCleanupActiveSessionMap;
  let activeSessionMapChanged = false;
  const nextActiveSessionIdMap = { ...activeSessionIdMap };

  for (const scopeKey of Object.keys(activeSessionIdMap)) {
    if (isScopeKeyActive(scopeKey, activeTargetIds)) continue;
    delete nextActiveSessionIdMap[scopeKey];
    activeSessionMapChanged = true;
  }

  if (activeSessionMapChanged) {
    setLatestAIActiveSessionMapSnapshot(nextActiveSessionIdMap);
    localStorageAdapter.write(STORAGE_KEY_AI_ACTIVE_SESSION_MAP, nextActiveSessionIdMap);
    emitAIStateChanged(STORAGE_KEY_AI_ACTIVE_SESSION_MAP);
  }

  const currentActiveSessionIdMap = activeSessionMapChanged
    ? nextActiveSessionIdMap
    : activeSessionIdMap;
  const currentDraftsByScope = latestAIDraftsByScopeSnapshot ?? {};
  const currentPanelViewByScope = latestAIPanelViewByScopeSnapshot ?? {};
  const prunedScopedTransientState = pruneInactiveScopedTransientState(
    currentActiveSessionIdMap,
    currentDraftsByScope,
    currentPanelViewByScope,
    activeTargetIds,
  );

  if (prunedScopedTransientState.activeSessionIdMap !== currentActiveSessionIdMap) {
    setLatestAIActiveSessionMapSnapshot(prunedScopedTransientState.activeSessionIdMap);
    localStorageAdapter.write(
      STORAGE_KEY_AI_ACTIVE_SESSION_MAP,
      prunedScopedTransientState.activeSessionIdMap,
    );
    emitAIStateChanged(STORAGE_KEY_AI_ACTIVE_SESSION_MAP);
  }

  if (prunedScopedTransientState.draftsByScope !== currentDraftsByScope) {
    for (const scopeKey of Object.keys(currentDraftsByScope)) {
      if (scopeKey in prunedScopedTransientState.draftsByScope) continue;
      bumpDraftMutationVersion(scopeKey);
      bumpDraftUploadGeneration(scopeKey);
    }
    setLatestAIDraftsByScopeSnapshot(prunedScopedTransientState.draftsByScope);
    emitAIStateChanged(AI_STATE_CHANGED_DRAFTS_BY_SCOPE);
  }

  if (prunedScopedTransientState.panelViewByScope !== currentPanelViewByScope) {
    for (const scopeKey of Object.keys(currentPanelViewByScope)) {
      if (scopeKey in prunedScopedTransientState.panelViewByScope) continue;
      bumpDraftMutationVersion(scopeKey);
    }
    setLatestAIPanelViewByScopeSnapshot(prunedScopedTransientState.panelViewByScope);
    emitAIStateChanged(AI_STATE_CHANGED_PANEL_VIEW_BY_SCOPE);
  }
}


/** Maximum number of sessions to keep in localStorage. */
const MAX_STORED_SESSIONS = 50;
/** Maximum number of messages per session when persisting to localStorage. */
const MAX_SESSION_MESSAGES = 200;
/**
 * Drop large base64 attachment payloads when persisting. Vision screenshots can
 * be multi-MB each; storing them in localStorage freezes reload into a white
 * screen after AI panel errors.
 */
const MAX_PERSISTED_ATTACHMENT_BASE64_CHARS = 8_000;

function normalizeAttachmentList(
  raw: unknown,
  stripHeavyPayloads: boolean,
): ChatMessageAttachment[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: ChatMessageAttachment[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const att = entry as Partial<ChatMessageAttachment>;
    const mediaType = typeof att.mediaType === 'string' ? att.mediaType : 'application/octet-stream';
    let base64Data = typeof att.base64Data === 'string' ? att.base64Data : '';
    if (
      stripHeavyPayloads
      && base64Data.length > MAX_PERSISTED_ATTACHMENT_BASE64_CHARS
    ) {
      base64Data = '';
    }
    out.push({
      base64Data,
      mediaType,
      filename: typeof att.filename === 'string' ? att.filename : undefined,
      filePath: typeof att.filePath === 'string' ? att.filePath : undefined,
      terminalSelection: att.terminalSelection === true ? true : undefined,
      previewText: typeof att.previewText === 'string' ? att.previewText : undefined,
      lineCount: typeof att.lineCount === 'number' && Number.isFinite(att.lineCount)
        ? att.lineCount
        : undefined,
    });
  }
  return out.length ? out : undefined;
}

function normalizeToolCalls(raw: unknown): ToolCall[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: ToolCall[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const tc = entry as Partial<ToolCall>;
    if (typeof tc.id !== 'string' || !tc.id) continue;
    if (typeof tc.name !== 'string' || !tc.name) continue;
    out.push({
      id: tc.id,
      name: tc.name,
      arguments: tc.arguments && typeof tc.arguments === 'object'
        ? tc.arguments as Record<string, unknown>
        : {},
    });
  }
  return out.length ? out : undefined;
}

function normalizeToolResults(raw: unknown): ToolResult[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: ToolResult[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const tr = entry as Partial<ToolResult>;
    if (typeof tr.toolCallId !== 'string' || !tr.toolCallId) continue;
    out.push({
      toolCallId: tr.toolCallId,
      content: typeof tr.content === 'string' ? tr.content : '',
      isError: tr.isError === true ? true : undefined,
    });
  }
  return out.length ? out : undefined;
}

export function normalizeChatMessage(
  raw: unknown,
  options: { stripHeavyAttachmentPayloads?: boolean } = {},
): ChatMessage | null {
  if (!raw || typeof raw !== 'object') return null;
  const record = raw as Partial<ChatMessage>;
  const id = typeof record.id === 'string' ? record.id.trim() : '';
  if (!id) return null;
  const role = record.role;
  if (role !== 'user' && role !== 'assistant' && role !== 'system' && role !== 'tool') {
    return null;
  }
  const stripHeavy = options.stripHeavyAttachmentPayloads === true;
  const attachments = normalizeAttachmentList(record.attachments, stripHeavy);
  const images = normalizeAttachmentList(record.images, stripHeavy);
  return {
    ...record,
    id,
    role,
    content: typeof record.content === 'string' ? record.content : '',
    attachments,
    images,
    thinking: typeof record.thinking === 'string' ? record.thinking : undefined,
    toolCalls: normalizeToolCalls(record.toolCalls),
    toolResults: normalizeToolResults(record.toolResults),
    timestamp: typeof record.timestamp === 'number' && Number.isFinite(record.timestamp)
      ? record.timestamp
      : Date.now(),
  };
}

/**
 * Coerce partial / corrupted localStorage session rows into a safe AISession.
 * Missing `messages` / `scope` previously crashed the AI side panel on open
 * (e.g. `session.messages.length` / `session.scope.type`).
 */
export function normalizeAISession(
  raw: unknown,
  options: { stripHeavyAttachmentPayloads?: boolean } = {},
): AISession | null {
  if (!raw || typeof raw !== 'object') return null;
  const record = raw as Partial<AISession> & { scope?: Partial<AISession['scope']> };
  const id = typeof record.id === 'string' ? record.id.trim() : '';
  if (!id) return null;

  const scopeType = record.scope?.type;
  const scope: AISession['scope'] = (
    scopeType === 'terminal' || scopeType === 'workspace' || scopeType === 'global'
  )
    ? {
        type: scopeType,
        targetId: typeof record.scope?.targetId === 'string' ? record.scope.targetId : undefined,
        hostIds: Array.isArray(record.scope?.hostIds)
          ? record.scope.hostIds.filter((hostId): hostId is string => typeof hostId === 'string')
          : undefined,
      }
    : { type: 'global' };

  const createdAt = typeof record.createdAt === 'number' && Number.isFinite(record.createdAt)
    ? record.createdAt
    : Date.now();
  const updatedAt = typeof record.updatedAt === 'number' && Number.isFinite(record.updatedAt)
    ? record.updatedAt
    : createdAt;

  const messages = Array.isArray(record.messages)
    ? record.messages
      .map((message) => normalizeChatMessage(message, options))
      .filter((message): message is ChatMessage => message != null)
    : [];

  return {
    id,
    title: typeof record.title === 'string' && record.title ? record.title : 'New Chat',
    agentId: typeof record.agentId === 'string' && record.agentId ? record.agentId : 'catty',
    scope,
    messages,
    externalSessionId: typeof record.externalSessionId === 'string'
      ? record.externalSessionId
      : undefined,
    createdAt,
    updatedAt,
  };
}

function attachmentHasHeavyBase64(raw: unknown): boolean {
  if (!Array.isArray(raw)) return false;
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const base64Data = (entry as { base64Data?: unknown }).base64Data;
    if (typeof base64Data === 'string' && base64Data.length > MAX_PERSISTED_ATTACHMENT_BASE64_CHARS) {
      return true;
    }
  }
  return false;
}

/** True when a raw session row still carries multi-MB image base64. */
export function sessionsPayloadNeedsStorageRewrite(raw: unknown): boolean {
  if (!Array.isArray(raw)) return false;
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const messages = (entry as { messages?: unknown }).messages;
    if (!Array.isArray(messages)) continue;
    for (const message of messages) {
      if (!message || typeof message !== 'object') continue;
      const record = message as { attachments?: unknown; images?: unknown };
      if (attachmentHasHeavyBase64(record.attachments) || attachmentHasHeavyBase64(record.images)) {
        return true;
      }
    }
  }
  return false;
}

export function sanitizeAISessions(raw: unknown): AISession[] {
  if (!Array.isArray(raw)) return [];
  const sessions: AISession[] = [];
  for (const entry of raw) {
    // Always strip heavy image payloads on load so a previously bloated
    // localStorage row cannot freeze the renderer into a white screen.
    const normalized = normalizeAISession(entry, { stripHeavyAttachmentPayloads: true });
    if (normalized) sessions.push(normalized);
  }
  return sessions;
}

/**
 * If localStorage still has huge image base64, rewrite a pruned copy once so
 * subsequent cold starts do not rehydrate multi-MB payloads.
 */
export function rewriteAISessionsStorageIfBloated(raw: unknown = null): boolean {
  try {
    const stored = raw
      ?? latestAISessionsSnapshot
      ?? localStorageAdapter.read<unknown>(STORAGE_KEY_AI_SESSIONS);
    if (!sessionsPayloadNeedsStorageRewrite(stored)) return false;
    const pruned = pruneSessionsForStorage(sanitizeAISessions(stored));
    localStorageAdapter.write(STORAGE_KEY_AI_SESSIONS, pruned);
    latestAISessionsSnapshot = pruned;
    return true;
  } catch (error) {
    console.warn('[AIState] Failed to rewrite bloated AI sessions storage:', error);
    return false;
  }
}

/**
 * Prune sessions before writing to localStorage to prevent hitting the
 * ~5-10 MB storage quota. Only affects what is persisted — the in-memory
 * state retains all messages until the session is reloaded.
 *
 * - Keeps only the MAX_STORED_SESSIONS most-recently-updated sessions.
 * - Trims each session's messages to the last MAX_SESSION_MESSAGES.
 * - Strips large attachment base64 (images) so reload does not OOM/white-screen.
 */
export function pruneSessionsForStorage(sessions: AISession[]): AISession[] {
  const sanitized = sessions
    .map((entry) => normalizeAISession(entry, { stripHeavyAttachmentPayloads: true }))
    .filter((session): session is AISession => session != null);
  // Sort by updatedAt descending so we keep the newest
  const sorted = [...sanitized].sort((a, b) => b.updatedAt - a.updatedAt);
  const limited = sorted.slice(0, MAX_STORED_SESSIONS);
  return limited.map((s) => {
    if (s.messages.length > MAX_SESSION_MESSAGES) {
      return { ...s, messages: s.messages.slice(-MAX_SESSION_MESSAGES) };
    }
    return s;
  });
}

export let latestAISessionsSnapshot: AISession[] | null = null;
export let latestAIActiveSessionMapSnapshot: Record<string, string | null> | null = null;
export let latestAIDraftsByScopeSnapshot: DraftsByScope | null = null;
export let latestAIPanelViewByScopeSnapshot: PanelViewByScope | null = null;
let latestAIDraftMutationVersionByScopeSnapshot: Record<string, number> = {};
let latestAIDraftUploadGenerationByScopeSnapshot: Record<string, number> = {};

export function setLatestAISessionsSnapshot(sessions: AISession[]) {
  latestAISessionsSnapshot = sessions;
}

export function setLatestAIActiveSessionMapSnapshot(activeSessionIdMap: Record<string, string | null>) {
  latestAIActiveSessionMapSnapshot = activeSessionIdMap;
}

export function prewarmAIStateStorageSnapshots() {
  try {
    if (latestAISessionsSnapshot === null) {
      const stored = localStorageAdapter.read<unknown>(STORAGE_KEY_AI_SESSIONS);
      latestAISessionsSnapshot = sanitizeAISessions(stored);
      // Drop multi-MB image payloads from disk before the next cold start.
      rewriteAISessionsStorageIfBloated(stored);
    }
    if (latestAIActiveSessionMapSnapshot === null) {
      latestAIActiveSessionMapSnapshot =
        localStorageAdapter.read<Record<string, string | null>>(STORAGE_KEY_AI_ACTIVE_SESSION_MAP) ?? {};
    }
  } catch (error) {
    console.warn('[AIState] Failed to prewarm AI state storage snapshots:', error);
  }
}

/** Read + sanitize sessions from storage / snapshot for React state. */
export function readSanitizedAISessions(): AISession[] {
  const stored = latestAISessionsSnapshot
    ?? localStorageAdapter.read<unknown>(STORAGE_KEY_AI_SESSIONS)
    ?? [];
  const sessions = sanitizeAISessions(stored);
  if (sessionsPayloadNeedsStorageRewrite(stored)) {
    rewriteAISessionsStorageIfBloated(stored);
  }
  return sessions;
}

export function setLatestAIDraftsByScopeSnapshot(draftsByScope: DraftsByScope) {
  latestAIDraftsByScopeSnapshot = draftsByScope;
}

export function setLatestAIPanelViewByScopeSnapshot(panelViewByScope: PanelViewByScope) {
  latestAIPanelViewByScopeSnapshot = panelViewByScope;
}

export function bumpDraftMutationVersion(scopeKey: string) {
  latestAIDraftMutationVersionByScopeSnapshot = bumpDraftMutationVersionState(
    latestAIDraftMutationVersionByScopeSnapshot,
    scopeKey,
  );
}

export function getDraftUploadGeneration(scopeKey: string) {
  return getDraftUploadGenerationState(
    latestAIDraftUploadGenerationByScopeSnapshot,
    scopeKey,
  );
}

export function bumpDraftUploadGeneration(scopeKey: string) {
  latestAIDraftUploadGenerationByScopeSnapshot = bumpDraftUploadGenerationState(
    latestAIDraftUploadGenerationByScopeSnapshot,
    scopeKey,
  );
}
