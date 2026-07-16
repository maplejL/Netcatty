export interface CommandHistoryPopupEntry {
  id: string;
  command: string;
  hostLabel?: string;
  timestamp?: number;
}

export function filterCommandHistoryPopupEntries(
  entries: CommandHistoryPopupEntry[],
  query: string,
  limit = 200,
): CommandHistoryPopupEntry[] {
  const trimmed = query.trim().toLowerCase();
  const filtered = !trimmed
    ? entries
    : entries.filter((entry) => {
        if (entry.command.toLowerCase().includes(trimmed)) return true;
        if (entry.hostLabel?.toLowerCase().includes(trimmed)) return true;
        return false;
      });

  if (limit <= 0) return [];
  return filtered.slice(0, limit);
}

export function buildCommandHistoryPopupEntries(options: {
  hostEntries?: Array<{ id: string; command: string; timestamp?: number }>;
  globalEntries?: Array<{
    id: string;
    command: string;
    hostId?: string;
    hostLabel?: string;
    timestamp?: number;
  }>;
  focusedHostId?: string | null;
  preferHostOnly?: boolean;
}): CommandHistoryPopupEntry[] {
  const {
    hostEntries = [],
    globalEntries = [],
    focusedHostId = null,
    preferHostOnly = true,
  } = options;

  const result: CommandHistoryPopupEntry[] = [];
  const seen = new Set<string>();

  const push = (entry: CommandHistoryPopupEntry) => {
    const key = entry.command.trim();
    if (!key || seen.has(key)) return;
    seen.add(key);
    result.push(entry);
  };

  // Newest remote/host history first (remote files are usually oldest→newest).
  for (let i = hostEntries.length - 1; i >= 0; i--) {
    const entry = hostEntries[i];
    push({
      id: `host:${entry.id}`,
      command: entry.command,
      timestamp: entry.timestamp,
    });
  }

  const globals = preferHostOnly && focusedHostId
    ? globalEntries.filter((entry) => entry.hostId === focusedHostId)
    : globalEntries;

  // Global/local recordings are usually newest-first already; keep that order.
  for (const entry of globals) {
    push({
      id: `global:${entry.id}`,
      command: entry.command,
      hostLabel: entry.hostLabel,
      timestamp: entry.timestamp,
    });
  }

  return result;
}

export function nextCommandHistorySelectionIndex(
  current: number,
  delta: number,
  length: number,
): number {
  if (length <= 0) return 0;
  if (current < 0) return delta >= 0 ? 0 : length - 1;
  return (current + delta + length) % length;
}
