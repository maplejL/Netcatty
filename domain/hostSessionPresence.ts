import type { TerminalSession } from './models';

/** Presence of a host in the work-tab surface (issue #1434). */
export type HostSessionPresence =
  | 'connected'
  | 'connecting'
  | 'open-disconnected'
  | 'none';

const PRESENCE_RANK: Record<HostSessionPresence, number> = {
  connected: 3,
  connecting: 2,
  'open-disconnected': 1,
  none: 0,
};

function presenceFromStatus(status: TerminalSession['status']): HostSessionPresence {
  if (status === 'connected') return 'connected';
  if (status === 'connecting') return 'connecting';
  return 'open-disconnected';
}

/**
 * Best presence per host across open sessions.
 * Priority: connected > connecting > open-disconnected.
 */
export function buildHostSessionPresenceMap(
  sessions: readonly TerminalSession[],
): Map<string, HostSessionPresence> {
  const map = new Map<string, HostSessionPresence>();
  for (const session of sessions) {
    const hostId = session.hostId;
    if (!hostId) continue;
    const next = presenceFromStatus(session.status);
    const prev = map.get(hostId) ?? 'none';
    if (PRESENCE_RANK[next] > PRESENCE_RANK[prev]) {
      map.set(hostId, next);
    }
  }
  return map;
}

export function getHostSessionPresence(
  map: ReadonlyMap<string, HostSessionPresence> | undefined,
  hostId: string | null | undefined,
): HostSessionPresence {
  if (!hostId || !map) return 'none';
  return map.get(hostId) ?? 'none';
}

/**
 * Prefer a live session for focus-existing-tab (issue #1434).
 * Order: connected > connecting > disconnected; stable by array order.
 */
export function findBestSessionForHost(
  sessions: readonly TerminalSession[],
  hostId: string,
): TerminalSession | undefined {
  let best: TerminalSession | undefined;
  let bestRank = -1;
  for (const session of sessions) {
    if (session.hostId !== hostId) continue;
    const rank = PRESENCE_RANK[presenceFromStatus(session.status)];
    if (rank > bestRank) {
      best = session;
      bestRank = rank;
    }
  }
  return best;
}
