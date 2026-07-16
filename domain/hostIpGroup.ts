import type { Host } from './models';

const IPV4_PATTERN = /^(?:\d{1,3}\.){3}\d{1,3}$/;

export function isIpv4Hostname(hostname: string): boolean {
  const candidate = hostname.trim().split(/\s+/)[0];
  if (!IPV4_PATTERN.test(candidate)) return false;
  return candidate.split('.').every((octet) => {
    const value = Number.parseInt(octet, 10);
    return Number.isFinite(value) && value >= 0 && value <= 255;
  });
}

/** First three IPv4 octets, e.g. 172.168.5.142 -> 172.168.5 */
export function deriveIpGroupPath(hostname: string): string | undefined {
  const candidate = hostname.trim().split(/\s+/)[0];
  if (!isIpv4Hostname(candidate)) return undefined;
  const parts = candidate.split('.');
  return `${parts[0]}.${parts[1]}.${parts[2]}`;
}

export function isUngroupedHost(host: Pick<Host, 'group'>): boolean {
  return !host.group?.trim();
}

export function localDayBounds(day: Date = new Date()): { startMs: number; endMs: number } {
  const start = new Date(day);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { startMs: start.getTime(), endMs: end.getTime() };
}

export function isHostCreatedOnLocalDay(
  createdAt: number | undefined,
  day: Date = new Date(),
): boolean {
  if (!createdAt) return false;
  const { startMs, endMs } = localDayBounds(day);
  return createdAt >= startMs && createdAt < endMs;
}

export function shouldRemoveTodayUngroupedHost(host: Host, day: Date = new Date()): boolean {
  return isUngroupedHost(host) && isHostCreatedOnLocalDay(host.createdAt, day);
}

export function filterOutTodayUngroupedHosts(hosts: Host[], day: Date = new Date()): Host[] {
  return hosts.filter((host) => !shouldRemoveTodayUngroupedHost(host, day));
}
