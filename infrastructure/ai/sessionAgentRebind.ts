import type { AISession } from './types';

/**
 * Rebind an AI chat session to a different agent while keeping messages.
 *
 * Clears `externalSessionId` so the next external-agent turn cannot resume a
 * prior CLI/SDK session from the previous agent (history is replayed from
 * Netcatty's message list instead).
 */
export function rebindSessionAgent(session: AISession, agentId: string, now = Date.now()): AISession {
  const nextAgentId = String(agentId || '').trim();
  if (!nextAgentId || session.agentId === nextAgentId) {
    return session;
  }

  const next: AISession = {
    ...session,
    agentId: nextAgentId,
    updatedAt: now,
  };
  delete next.externalSessionId;
  return next;
}

/** Whether the active panel session should be rebound (vs starting a fresh draft). */
export function shouldRebindActiveSessionOnAgentChange(
  activeSession: AISession | null | undefined,
  nextAgentId: string,
): boolean {
  if (!activeSession) return false;
  const next = String(nextAgentId || '').trim();
  if (!next) return false;
  return activeSession.agentId !== next;
}
