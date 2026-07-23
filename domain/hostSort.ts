import type { Host } from './models';

/** Vault / host-list sort modes (issue #1434). */
export type HostSortMode = 'manual' | 'az' | 'za' | 'newest' | 'oldest' | 'recent' | 'group';

const LABEL_COMPARE_OPTS: Intl.CollatorOptions = {
  numeric: true,
  sensitivity: 'base',
};

export function compareHostLabels(a: string, b: string): number {
  return a.localeCompare(b, undefined, LABEL_COMPARE_OPTS);
}

/**
 * Compare two hosts for a non-manual sort mode.
 * Callers should short-circuit `manual` to vault order before calling this.
 */
export function compareHostsBySortMode(a: Host, b: Host, sortMode: Exclude<HostSortMode, 'manual'>): number {
  switch (sortMode) {
    case 'az':
      return compareHostLabels(a.label, b.label);
    case 'za':
      return compareHostLabels(b.label, a.label);
    case 'newest':
      return (b.createdAt || 0) - (a.createdAt || 0);
    case 'oldest':
      return (a.createdAt || 0) - (b.createdAt || 0);
    case 'recent':
      return (b.lastConnectedAt || 0) - (a.lastConnectedAt || 0);
    case 'group': {
      const groupCmp = compareHostLabels(a.group || '', b.group || '');
      return groupCmp !== 0 ? groupCmp : compareHostLabels(a.label, b.label);
    }
    default:
      return 0;
  }
}
