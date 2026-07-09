import { deriveIpGroupPath } from './hostIpGroup';
import type { Host, TerminalSession, Workspace } from './models';
import { collectSessionIds } from './workspace';

export type IpSegmentSummary = {
  segment: string;
  hosts: Host[];
  hostCount: number;
  lastConnectedAt: number | null;
  activeSessionCount: number;
};

export type OpsResumeItem =
  | { kind: 'workspace'; id: string; title: string; paneCount: number }
  | { kind: 'session'; id: string; label: string };

const RECENT_LIMIT = 12;
const SEGMENT_LIMIT = 8;
const RESUME_LIMIT = 8;

/** Max hosts per ops-home segment workspace (2x2 grid). */
export const OPS_HOME_WORKSPACE_HOST_LIMIT = 4;

export function pickRecentHosts(hosts: Host[], limit = RECENT_LIMIT): Host[] {
  return hosts
    .filter((host) => host.lastConnectedAt)
    .sort((a, b) => (b.lastConnectedAt || 0) - (a.lastConnectedAt || 0))
    .slice(0, limit);
}

export function pickPinnedHosts(hosts: Host[]): Host[] {
  return hosts
    .filter((host) => host.pinned)
    .sort((a, b) => a.label.localeCompare(b.label));
}

export function buildIpSegmentSummaries(
  hosts: Host[],
  activeHostIds: ReadonlySet<string>,
  limit = SEGMENT_LIMIT,
): IpSegmentSummary[] {
  const bySegment = new Map<string, Host[]>();

  for (const host of hosts) {
    const segment = deriveIpGroupPath(host.hostname);
    if (!segment) continue;
    const bucket = bySegment.get(segment);
    if (bucket) {
      bucket.push(host);
    } else {
      bySegment.set(segment, [host]);
    }
  }

  const summaries: IpSegmentSummary[] = [];
  for (const [segment, segmentHosts] of bySegment) {
    const lastConnectedAt = segmentHosts.reduce(
      (max, host) => Math.max(max, host.lastConnectedAt || 0),
      0,
    );
    summaries.push({
      segment,
      hosts: segmentHosts,
      hostCount: segmentHosts.length,
      lastConnectedAt: lastConnectedAt > 0 ? lastConnectedAt : null,
      activeSessionCount: segmentHosts.filter((host) => activeHostIds.has(host.id)).length,
    });
  }

  return summaries
    .sort((a, b) => {
      const lastDelta = (b.lastConnectedAt || 0) - (a.lastConnectedAt || 0);
      if (lastDelta !== 0) return lastDelta;
      return b.hostCount - a.hostCount;
    })
    .slice(0, limit);
}

export function collectActiveHostIds(sessions: TerminalSession[]): Set<string> {
  const active = new Set<string>();
  for (const session of sessions) {
    if (session.status !== 'connected' && session.status !== 'connecting') continue;
    if (session.hostId) active.add(session.hostId);
  }
  return active;
}

export function buildOpsResumeItems(
  sessions: TerminalSession[],
  workspaces: Workspace[],
  limit = RESUME_LIMIT,
): OpsResumeItem[] {
  const items: OpsResumeItem[] = [];

  for (const workspace of workspaces) {
    const paneCount = collectSessionIds(workspace.root).length;
    if (paneCount === 0) continue;
    items.push({
      kind: 'workspace',
      id: workspace.id,
      title: workspace.title || 'Workspace',
      paneCount,
    });
  }

  for (const session of sessions) {
    if (session.workspaceId) continue;
    if (session.status !== 'connected' && session.status !== 'connecting') continue;
    items.push({
      kind: 'session',
      id: session.id,
      label: session.hostLabel || session.hostname || session.id,
    });
  }

  return items.slice(0, limit);
}

export function filterHostsByIpSegment(hosts: Host[], segment: string): Host[] {
  return hosts.filter((host) => deriveIpGroupPath(host.hostname) === segment);
}
