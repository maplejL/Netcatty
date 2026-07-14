import type { AISession } from "../../infrastructure/ai/types";

export function getSessionScopeMatchRank(
  session: AISession,
  scopeType: "terminal" | "workspace",
  scopeTargetId?: string,
  scopeHostIds?: string[],
  /**
   * Session ids currently displayed by other terminal scopes. Tracked by
   * session id rather than `scope.targetId` so that a host-matched session
   * resumed from a different terminal is still recognised as in-use and
   * not offered (or cleaned) as if it were orphaned.
   */
  activeTerminalSessionIds?: Set<string>,
): number {
  const scope = session?.scope;
  if (!scope || scope.type !== scopeType) return 0;
  if (scope.targetId === scopeTargetId) return 3;

  if (scopeType === "terminal" && activeTerminalSessionIds?.has(session.id)) {
    return 0;
  }

  if (scopeType === "terminal" && scopeHostIds?.length && scope.hostIds?.length) {
    return scope.hostIds.some((hostId) => scopeHostIds.includes(hostId)) ? 2 : 0;
  }

  return 1;
}
