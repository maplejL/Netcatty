import {
  CODING_CLI_PROVIDERS,
  getCodingCliProvider,
  type CodingCliProviderId,
} from './codingCliProviders';
import type { TerminalSession } from './models';

export const CODING_CLI_TERMINAL_HISTORY_MAX = 80;

export type CodingCliTerminalHistoryEntry = {
  id: string;
  cwd: string;
  providerId: CodingCliProviderId;
  title?: string;
  localShell?: string;
  localShellName?: string;
  /** Optional full CLI re-launch line, e.g. `grok --resume <id>`. */
  resumeCommand?: string;
  firstSeenAt: number;
  lastUsedAt: number;
  useCount: number;
  pinned?: boolean;
};

export type CodingCliTerminalHistoryInput = {
  cwd: string;
  providerId: CodingCliProviderId;
  title?: string;
  localShell?: string;
  localShellName?: string;
  resumeCommand?: string;
  now?: number;
  /** When set, update this row in place (history jump / same session). */
  entryId?: string;
};

const isRecord = (value: unknown): value is Record<string, unknown> => (
  Boolean(value) && typeof value === 'object'
);

export function normalizeCodingCliHistoryCwd(cwd: string): string {
  let next = cwd.trim();
  if (!next) return '';

  // Collapse repeated separators without inventing a full path resolver.
  next = next.replace(/[\\/]+/g, (match) => (match.includes('\\') ? '\\' : '/'));

  // Drop trailing separators except root ("/" or "C:\").
  if (next.length > 1) {
    if (/^[A-Za-z]:[\\/]$/.test(next)) {
      // keep drive root as-is
    } else {
      next = next.replace(/[\\/]+$/, '');
    }
  }

  // Windows paths: case-insensitive identity for dedupe.
  if (/^[A-Za-z]:[\\/]/.test(next)) {
    return next.toLowerCase();
  }
  return next;
}

export function isUsableCodingCliHistoryCwd(cwd: string | undefined | null): cwd is string {
  if (!cwd) return false;
  const trimmed = cwd.trim();
  if (!trimmed) return false;
  if (trimmed === '.' || trimmed === '..') return false;
  return (
    trimmed.startsWith('/')
    || trimmed === '~'
    || trimmed.startsWith('~/')
    || /^[A-Za-z]:[\\/]/.test(trimmed)
  );
}

export function buildCodingCliHistoryDedupeKey(
  cwd: string,
  providerId: CodingCliProviderId,
): string {
  return `${providerId}\0${normalizeCodingCliHistoryCwd(cwd)}`;
}

export function resolveCodingCliHistoryCwd(
  session: Pick<TerminalSession, 'lastCwd' | 'localStartDir'>,
  cwdOverride?: string | null,
): string | undefined {
  const candidates = [cwdOverride, session.lastCwd, session.localStartDir];
  for (const candidate of candidates) {
    if (isCleanLocalHistoryCwd(candidate)) return candidate.trim();
  }
  return undefined;
}

export function captureCodingCliTerminalHistoryInput(
  session: Pick<
    TerminalSession,
    | 'protocol'
    | 'codingCliProviderId'
    | 'codingCliHistoryEntryId'
    | 'lastCwd'
    | 'localStartDir'
    | 'customName'
    | 'dynamicTitle'
    | 'localShell'
    | 'localShellName'
  > & {
    hostLabel?: TerminalSession['hostLabel'];
  },
  cwdOverride?: string | null,
  options?: {
    /** Used when local PTY has no OSC7/pwd yet (common on Windows PowerShell). */
    fallbackLocalCwd?: string | null;
    /** Prefer this provider when session sticky id was already cleared. */
    providerIdOverride?: CodingCliProviderId | null;
    /** Optional resume / re-launch command captured from the terminal. */
    resumeCommand?: string | null;
    /** Prefer updating this history row (opened via jump). */
    entryId?: string | null;
  },
): CodingCliTerminalHistoryInput | null {
  if (session.protocol !== 'local') return null;
  const providerId = options?.providerIdOverride ?? session.codingCliProviderId;
  if (!providerId || !getCodingCliProvider(providerId)) return null;

  const resolvedCwd = resolveCodingCliHistoryCwd(session, cwdOverride)
    ?? (
      options?.fallbackLocalCwd && isCleanLocalHistoryCwd(options.fallbackLocalCwd)
        ? options.fallbackLocalCwd.trim()
        : undefined
    );
  // Never persist prompt junk like `C:\x> PS C:\x` as cwd.
  const cwd = resolvedCwd && isCleanLocalHistoryCwd(resolvedCwd) ? resolvedCwd : undefined;
  if (!cwd) return null;

  const title = resolveCodingCliHistoryTitle({
    customName: session.customName,
    dynamicTitle: session.dynamicTitle,
    hostLabel: session.hostLabel,
    providerId,
  });
  const rawResume = options?.resumeCommand?.trim() || undefined;
  // Never attach another CLI's resume line to this provider's history row.
  const resumeCommand = rawResume && resumeCommandMatchesProvider(rawResume, providerId)
    ? rawResume
    : undefined;

  const entryId = options?.entryId?.trim()
    || (typeof session.codingCliHistoryEntryId === 'string'
      ? session.codingCliHistoryEntryId.trim()
      : undefined);

  return {
    cwd,
    providerId,
    ...(title ? { title } : {}),
    ...(session.localShell ? { localShell: session.localShell } : {}),
    ...(session.localShellName ? { localShellName: session.localShellName } : {}),
    ...(resumeCommand ? { resumeCommand } : {}),
    ...(entryId ? { entryId } : {}),
  };
}

/**
 * Jump strategy when reopening a coding-CLI workdir:
 * - exact: stored `resumeCommand` (e.g. grok --resume <id>)
 * - continue: provider supports "resume last in this directory" without an id
 * - fresh: start a new CLI process in that directory
 */
export type CodingCliJumpTier = 'exact' | 'continue' | 'fresh';

export type CodingCliJumpPlan = {
  tier: CodingCliJumpTier;
  command: string;
};

/**
 * Per-provider "continue last session in cwd" commands.
 * Used when we never captured an exact resume id (common when the CLI is
 * killed without printing an exit banner).
 *
 * Prefer flags that are cwd-aware and non-interactive (no picker).
 */
export function getCodingCliContinueCommand(
  providerId: CodingCliProviderId,
  cwd?: string,
): string | undefined {
  const cwdFlag = formatCodingCliCwdFlag(providerId, cwd);
  switch (providerId) {
    case 'claude':
      // Claude Code: continue the most recent conversation for this project dir.
      return 'claude --continue';
    case 'codex':
      // Codex CLI: resume most recent session without picker.
      return 'codex resume --last';
    case 'grok':
      // Grok Build: continue most recent session for current working directory.
      // Attach --cwd when we know the path so a shell that started in the wrong
      // directory still resumes the correct project session.
      return cwdFlag ? `grok ${cwdFlag} --continue` : 'grok --continue';
    case 'cursor':
      return 'cursor agent';
    case 'deepseek':
    case 'gemini':
    case 'kimi':
    case 'droid':
    case 'opencode':
    case 'copilot':
    case 'codebuddy':
    case 'workbuddy':
    default:
      return undefined;
  }
}

/** Quote a path for CLI --cwd style flags (works in PowerShell + POSIX shells). */
export function quoteCodingCliPath(path: string): string {
  const value = path.trim();
  if (!value) return "''";
  // No metacharacters — leave bare (Windows drive paths stay readable).
  if (!/[\s"'`$&|;<>()!]/.test(value)) return value;
  // Prefer single quotes: literal in PowerShell and POSIX.
  if (!value.includes("'")) return `'${value}'`;
  // Mixed quotes: POSIX-style concatenation; PowerShell also accepts this form.
  return `'${value.replace(/'/g, `'\"'\"'`)}'`;
}

export function formatCodingCliCwdFlag(
  providerId: CodingCliProviderId,
  cwd?: string,
): string | undefined {
  const path = cwd?.trim();
  if (!path || !isUsableCodingCliHistoryCwd(path)) return undefined;
  if (providerId === 'grok') {
    return `--cwd ${quoteCodingCliPath(path)}`;
  }
  return undefined;
}

/**
 * Normalize a captured resume token (strip ANSI leftovers / trailing punctuation).
 * Grok/Claude ids are UUID-like; reject trailing garbage such as "…075grok".
 */
export function sanitizeCodingCliResumeToken(token: string): string {
  let next = token
    .replace(/\u001b\[[0-9:;?]*[ -/]*[@-~]/g, '')
    .replace(/[\r\n]+/g, '')
    .replace(/^["'`]+|["'`]+$/g, '')
    .trim();

  // Prefer a leading UUID (8-4-4-4-12) even when glued to trailing text.
  const uuid = next.match(
    /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i,
  );
  if (uuid?.[1]) return uuid[1];

  // Looser dashed hex id (some CLIs use non-RFC UUID variants).
  const dashed = next.match(/^([0-9a-f]{8}(?:-[0-9a-f]{4}){3,}-[0-9a-f]{6,})/i);
  if (dashed?.[1]) {
    // Cut at first non-hex/non-dash if still dirty.
    return dashed[1].replace(/[^0-9a-f-].*$/i, '');
  }

  // Strip trailing non id characters (e.g. "abc123grok" → "abc123").
  next = next
    .replace(/[^0-9a-f-].*$/i, '')
    .replace(/[),.;:]+$/g, '')
    .trim();
  return next;
}

/** True when a resume command belongs to the given provider (prevents cross-CLI bleed). */
export function resumeCommandMatchesProvider(
  resumeCommand: string | null | undefined,
  providerId: CodingCliProviderId,
): boolean {
  const raw = resumeCommand?.trim();
  if (!raw) return false;
  const provider = getCodingCliProvider(providerId);
  if (!provider) return false;
  const head = raw.split(/\s+/)[0]?.toLowerCase() ?? '';
  if (head === provider.command.toLowerCase()) return true;
  if (provider.aliases?.some((alias) => alias.toLowerCase() === head)) return true;
  // "codex resume …"
  if (providerId === 'codex' && /^codex\b/i.test(raw)) return true;
  return false;
}

/** Reject prompt fragments mistakenly stored as cwd (e.g. `C:\x> PS C:\x`). */
export function isCleanLocalHistoryCwd(path: string | null | undefined): path is string {
  if (!isUsableCodingCliHistoryCwd(path)) return false;
  const value = path.trim();
  if (value.length > 512) return false;
  if (/[>\r\n]/.test(value)) return false;
  if (/\bPS\s+/i.test(value)) return false;
  if (/\s{2,}/.test(value)) return false;
  return true;
}

/**
 * Parse the last shell prompt cwd from local terminal output.
 * PowerShell: `PS C:\work\proj>`
 * CMD: `C:\work\proj>`
 * POSIX-ish: `user@host:/path$` or `user@host:~/path$`
 */
export function extractLocalShellCwdFromOutput(text: string): string | undefined {
  const raw = text
    .replace(/\u001b\[[0-9:;?]*[ -/]*[@-~]/g, '')
    .replace(/\u001b\][^\u0007]*(?:\u0007|\u001b\\)/g, '');
  if (!raw.trim()) return undefined;

  // Split on CR and LF — PowerShell often uses bare `\r` between prompts.
  const lines = raw.split(/\r\n|\n|\r/);
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const line = (lines[i] || '').trim();
    if (!line) continue;

    // PowerShell: take the *last* `PS <path>` token on the line (handles glued junk).
    const psMatches = [...line.matchAll(/\bPS\s+((?:[A-Za-z.][\w.]*::)?[A-Za-z]:\\[^\s>]*|\/[^\s>]*|~[^\s>]*)\s*>/g)];
    if (psMatches.length > 0) {
      let path = (psMatches[psMatches.length - 1]![1] || '').trim();
      const providerSplit = path.match(/::([A-Za-z]:\\.*|\/.*|~.*)$/);
      if (providerSplit?.[1]) path = providerSplit[1];
      if (isCleanLocalHistoryCwd(path)) return path;
    }

    // Entire line is a clean PS prompt.
    const psSimple = line.match(/^PS\s+(.+?)\s*>\s*$/);
    if (psSimple?.[1]) {
      let path = psSimple[1].trim();
      const providerSplit = path.match(/::([A-Za-z]:\\.*|\/.*|~.*)$/);
      if (providerSplit?.[1]) path = providerSplit[1];
      if (isCleanLocalHistoryCwd(path)) return path;
    }

    // CMD: entire line `C:\path>`
    const cmd = line.match(/^([A-Za-z]:\\[^>]*?)\s*>\s*$/);
    if (cmd?.[1] && isCleanLocalHistoryCwd(cmd[1])) return cmd[1];

    // user@host:path$ or user@host:path#
    const posix = line.match(/^[^\s@]+@[^\s:]+:(\/[^$#\s]*|~[^$#\s]*)\s*[$#]\s*$/);
    if (posix?.[1] && isCleanLocalHistoryCwd(posix[1])) return posix[1];
  }

  return undefined;
}

/** Prefer a stable title; ignore shell prompts and mixed OSC garbage. */
export function resolveCodingCliHistoryTitle(input: {
  customName?: string;
  dynamicTitle?: string;
  hostLabel?: string;
  providerId: CodingCliProviderId;
}): string | undefined {
  const provider = getCodingCliProvider(input.providerId);
  const providerLabel = provider?.label;

  const candidates = [input.customName, input.dynamicTitle, input.hostLabel]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value));

  for (const candidate of candidates) {
    // Shell prompt leftovers / polluted OSC titles
    if (/^PS\s+/i.test(candidate)) continue;
    if (/[A-Za-z]:\\[^>]*>/.test(candidate) && /\bPS\s+/i.test(candidate)) continue;
    if (candidate.length > 120) continue;
    // Generic labels — fall through to provider name
    if (/^local terminal$/i.test(candidate)) continue;
    return candidate;
  }

  return providerLabel;
}

/** Build the shell command + tier used for "quick jump" into a coding CLI. */
export function buildCodingCliJumpPlan(
  entry: Pick<CodingCliTerminalHistoryEntry, 'providerId' | 'resumeCommand' | 'cwd'>,
): CodingCliJumpPlan {
  const exact = normalizeExactResumeCommand(entry);
  if (exact) {
    return { tier: 'exact', command: exact };
  }

  const continueCommand = getCodingCliContinueCommand(entry.providerId, entry.cwd);
  if (continueCommand) {
    return { tier: 'continue', command: continueCommand };
  }

  const provider = getCodingCliProvider(entry.providerId);
  const base = provider?.command || entry.providerId;
  const cwdFlag = formatCodingCliCwdFlag(entry.providerId, entry.cwd);
  return {
    tier: 'fresh',
    command: cwdFlag ? `${base} ${cwdFlag}` : base,
  };
}

/**
 * Rebuild exact resume lines so they always include a reliable cwd when the
 * provider supports it (Grok), and strip noisy tokens from stored commands.
 */
export function normalizeExactResumeCommand(
  entry: Pick<CodingCliTerminalHistoryEntry, 'providerId' | 'resumeCommand' | 'cwd'>,
): string | undefined {
  const raw = entry.resumeCommand?.trim();
  if (!raw) return undefined;

  const providerId = entry.providerId;
  const cwdFlag = formatCodingCliCwdFlag(providerId, entry.cwd);

  if (providerId === 'grok') {
    const idMatch = raw.match(/(?:^|\s)(?:grok(?:-build)?\s+)?(?:-r|--resume)(?:\s+|=)([^\s"'`]+)/i)
      || raw.match(/\b(?:-r|--resume)(?:\s+|=)([^\s"'`]+)/i);
    if (idMatch?.[1]) {
      const id = sanitizeCodingCliResumeToken(idMatch[1]);
      if (!id) return undefined;
      return cwdFlag
        ? `grok ${cwdFlag} --resume ${id}`
        : `grok --resume ${id}`;
    }
    // Stored as bare id?
    if (/^[0-9a-f]{8}-[0-9a-f-]{4,}$/i.test(raw) || /^[0-9a-f]{20,}$/i.test(raw)) {
      const id = sanitizeCodingCliResumeToken(raw);
      return cwdFlag
        ? `grok ${cwdFlag} --resume ${id}`
        : `grok --resume ${id}`;
    }
  }

  if (providerId === 'claude') {
    const idMatch = raw.match(/(?:^|\s)claude\s+--resume(?:\s+|=)([^\s"'`]+)/i);
    if (idMatch?.[1]) {
      return `claude --resume ${sanitizeCodingCliResumeToken(idMatch[1])}`;
    }
  }

  if (providerId === 'codex') {
    const idMatch = raw.match(/(?:^|\s)codex\s+resume(?:\s+|=)([^\s"'`]+)/i);
    if (idMatch?.[1] && idMatch[1].toLowerCase() !== '--last') {
      return `codex resume ${sanitizeCodingCliResumeToken(idMatch[1])}`;
    }
  }

  // Already a full command we don't know how to rewrite — use as-is if it looks executable.
  if (/^(grok|claude|codex)\b/i.test(raw)) {
    return raw;
  }
  return undefined;
}

/** @deprecated Prefer buildCodingCliJumpPlan — kept for call sites that only need the command string. */
export function buildCodingCliJumpCommand(
  entry: Pick<CodingCliTerminalHistoryEntry, 'providerId' | 'resumeCommand' | 'cwd'>,
): string {
  return buildCodingCliJumpPlan(entry).command;
}

/** UI/status label key suffix for a history row's jump capability. */
export function resolveCodingCliHistoryJumpStatus(
  entry: Pick<CodingCliTerminalHistoryEntry, 'providerId' | 'resumeCommand' | 'cwd'>,
): CodingCliJumpTier {
  return buildCodingCliJumpPlan(entry).tier;
}

/** Extract a reusable resume command from CLI stdout / typed command lines. */
export function extractCodingCliResumeCommand(
  text: string,
  providerId?: CodingCliProviderId | null,
): string | undefined {
  // Strip ANSI so color codes between tokens don't break the match.
  const raw = text
    .replace(/\u001b\[[0-9:;?]*[ -/]*[@-~]/g, '')
    .replace(/\u001b\][^\u0007]*(?:\u0007|\u001b\\)/g, '')
    .trim();
  if (!raw) return undefined;

  // Prefer the last match — exit banners often print after other mentions.
  // Capture a bounded id token (UUID / dashed hex), not "…075grok".
  const idToken = '([0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}|[0-9a-f]{8}(?:-[0-9a-f]{4}){2,}-[0-9a-f]{6,}|[0-9a-f-]{16,})';
  const grokRe = new RegExp(`\\bgrok(?:-build)?\\s+(?:-r|--resume)(?:\\s+|=)${idToken}`, 'gi');
  const grokMatches = [...raw.matchAll(grokRe)];
  if (grokMatches.length > 0 && (!providerId || providerId === 'grok')) {
    const id = sanitizeCodingCliResumeToken(grokMatches[grokMatches.length - 1]![1] || '');
    return id ? `grok --resume ${id}` : undefined;
  }

  const claudeRe = new RegExp(`\\bclaude\\s+--resume(?:\\s+|=)${idToken}`, 'gi');
  const claudeMatches = [...raw.matchAll(claudeRe)];
  if (claudeMatches.length > 0 && (!providerId || providerId === 'claude')) {
    const id = sanitizeCodingCliResumeToken(claudeMatches[claudeMatches.length - 1]![1] || '');
    return id ? `claude --resume ${id}` : undefined;
  }

  const codexRe = new RegExp(`\\bcodex\\s+resume(?:\\s+)${idToken}`, 'gi');
  const codexMatches = [...raw.matchAll(codexRe)];
  if (codexMatches.length > 0 && (!providerId || providerId === 'codex')) {
    const token = sanitizeCodingCliResumeToken(codexMatches[codexMatches.length - 1]![1] || '');
    if (!token || token.toLowerCase() === 'last') {
      return 'codex resume --last';
    }
    return `codex resume ${token}`;
  }

  if (/\bcodex\s+resume\s+--last\b/i.test(raw) && (!providerId || providerId === 'codex')) {
    return 'codex resume --last';
  }

  return undefined;
}

export function upsertCodingCliTerminalHistoryEntry(
  entries: readonly CodingCliTerminalHistoryEntry[],
  input: CodingCliTerminalHistoryInput,
): CodingCliTerminalHistoryEntry[] {
  const cwd = input.cwd.trim();
  if (!isUsableCodingCliHistoryCwd(cwd)) return [...entries];
  if (!getCodingCliProvider(input.providerId)) return [...entries];

  const now = input.now ?? Date.now();
  const dedupeKey = buildCodingCliHistoryDedupeKey(cwd, input.providerId);
  // Prefer the explicit history row (jump target) over cwd+provider dedupe so
  // reopening from history updates the same card instead of inserting another.
  let existingIndex = input.entryId
    ? entries.findIndex((entry) => entry.id === input.entryId)
    : -1;
  if (existingIndex < 0) {
    existingIndex = entries.findIndex(
      (entry) => buildCodingCliHistoryDedupeKey(entry.cwd, entry.providerId) === dedupeKey,
    );
  }

  if (existingIndex >= 0) {
    const existing = entries[existingIndex]!;
    const nextEntry: CodingCliTerminalHistoryEntry = {
      ...existing,
      // Prefer a newly observed clean path over a stale home fallback.
      cwd: isCleanLocalHistoryCwd(cwd) ? cwd : (isCleanLocalHistoryCwd(existing.cwd) ? existing.cwd : cwd),
      providerId: input.providerId || existing.providerId,
      lastUsedAt: now,
      useCount: Math.max(1, existing.useCount) + 1,
      ...(input.title?.trim() ? { title: input.title.trim() } : {}),
      ...(input.localShell ? { localShell: input.localShell } : {}),
      ...(input.localShellName ? { localShellName: input.localShellName } : {}),
      ...(input.resumeCommand?.trim()
        && resumeCommandMatchesProvider(input.resumeCommand, input.providerId)
        ? { resumeCommand: input.resumeCommand.trim() }
        : {}),
    };
    const without = entries.filter((_, index) => index !== existingIndex);
    return enforceCodingCliTerminalHistoryLimit([nextEntry, ...without]);
  }

  const created: CodingCliTerminalHistoryEntry = {
    id: input.entryId?.trim() || createCodingCliHistoryId(input.providerId, cwd, now),
    cwd,
    providerId: input.providerId,
    firstSeenAt: now,
    lastUsedAt: now,
    useCount: 1,
    ...(input.title?.trim() ? { title: input.title.trim() } : {}),
    ...(input.localShell ? { localShell: input.localShell } : {}),
    ...(input.localShellName ? { localShellName: input.localShellName } : {}),
    ...(input.resumeCommand?.trim()
      && resumeCommandMatchesProvider(input.resumeCommand, input.providerId)
      ? { resumeCommand: input.resumeCommand.trim() }
      : {}),
  };
  return enforceCodingCliTerminalHistoryLimit([created, ...entries]);
}

/** Bump lastUsedAt / useCount for an existing row (history jump). */
export function touchCodingCliTerminalHistoryEntry(
  entries: readonly CodingCliTerminalHistoryEntry[],
  entryId: string,
  now = Date.now(),
): CodingCliTerminalHistoryEntry[] {
  const index = entries.findIndex((entry) => entry.id === entryId);
  if (index < 0) return [...entries];
  const existing = entries[index]!;
  const nextEntry: CodingCliTerminalHistoryEntry = {
    ...existing,
    lastUsedAt: now,
    useCount: Math.max(1, existing.useCount) + 1,
  };
  const without = entries.filter((_, i) => i !== index);
  return enforceCodingCliTerminalHistoryLimit([nextEntry, ...without]);
}

export function enforceCodingCliTerminalHistoryLimit(
  entries: readonly CodingCliTerminalHistoryEntry[],
  max = CODING_CLI_TERMINAL_HISTORY_MAX,
): CodingCliTerminalHistoryEntry[] {
  if (entries.length <= max) return [...entries];
  const pinned = entries.filter((entry) => entry.pinned);
  const unpinned = entries
    .filter((entry) => !entry.pinned)
    .sort((a, b) => b.lastUsedAt - a.lastUsedAt);
  const pinnedRoom = Math.min(pinned.length, max);
  const unpinnedRoom = Math.max(0, max - pinnedRoom);
  return [
    ...pinned
      .slice()
      .sort((a, b) => b.lastUsedAt - a.lastUsedAt)
      .slice(0, pinnedRoom),
    ...unpinned.slice(0, unpinnedRoom),
  ].sort((a, b) => {
    if (Boolean(a.pinned) !== Boolean(b.pinned)) return a.pinned ? -1 : 1;
    return b.lastUsedAt - a.lastUsedAt;
  });
}

export function sortCodingCliTerminalHistory(
  entries: readonly CodingCliTerminalHistoryEntry[],
): CodingCliTerminalHistoryEntry[] {
  return [...entries].sort((a, b) => {
    if (Boolean(a.pinned) !== Boolean(b.pinned)) return a.pinned ? -1 : 1;
    return b.lastUsedAt - a.lastUsedAt;
  });
}

export function removeCodingCliTerminalHistoryEntry(
  entries: readonly CodingCliTerminalHistoryEntry[],
  id: string,
): CodingCliTerminalHistoryEntry[] {
  return entries.filter((entry) => entry.id !== id);
}

/** Soft-delete markers so a still-running session cannot recreate a removed row. */
export type CodingCliHistoryTombstone = {
  entryId: string;
  dedupeKey: string;
  deletedAt: number;
};

export function buildTombstoneFromEntry(
  entry: Pick<CodingCliTerminalHistoryEntry, 'id' | 'cwd' | 'providerId'>,
  deletedAt = Date.now(),
): CodingCliHistoryTombstone {
  return {
    entryId: entry.id,
    dedupeKey: buildCodingCliHistoryDedupeKey(entry.cwd, entry.providerId),
    deletedAt,
  };
}

export function sanitizeCodingCliHistoryTombstones(
  value: unknown,
): CodingCliHistoryTombstone[] {
  if (!Array.isArray(value)) return [];
  const next: CodingCliHistoryTombstone[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const record = item as Record<string, unknown>;
    const entryId = typeof record.entryId === 'string' ? record.entryId.trim() : '';
    const dedupeKey = typeof record.dedupeKey === 'string' ? record.dedupeKey.trim() : '';
    const deletedAt = typeof record.deletedAt === 'number' && Number.isFinite(record.deletedAt)
      ? record.deletedAt
      : Date.now();
    if (!entryId || !dedupeKey) continue;
    const key = `${entryId}\0${dedupeKey}`;
    if (seen.has(key)) continue;
    seen.add(key);
    next.push({ entryId, dedupeKey, deletedAt });
  }
  return next;
}

export function isCodingCliHistoryTombstoned(
  tombstones: readonly CodingCliHistoryTombstone[],
  options: { entryId?: string | null; dedupeKey?: string | null },
): boolean {
  const entryId = options.entryId?.trim();
  const dedupeKey = options.dedupeKey?.trim();
  return tombstones.some((stone) => (
    (entryId && stone.entryId === entryId)
    || (dedupeKey && stone.dedupeKey === dedupeKey)
  ));
}

/**
 * Upsert that respects delete tombstones: never recreates a removed row by
 * entry id or the same provider+cwd key until the tombstone is cleared.
 */
export function upsertCodingCliTerminalHistoryEntryRespectingTombstones(
  entries: readonly CodingCliTerminalHistoryEntry[],
  input: CodingCliTerminalHistoryInput,
  tombstones: readonly CodingCliHistoryTombstone[],
): CodingCliTerminalHistoryEntry[] {
  const cwd = input.cwd.trim();
  if (!isUsableCodingCliHistoryCwd(cwd) || !getCodingCliProvider(input.providerId)) {
    return [...entries];
  }
  const dedupeKey = buildCodingCliHistoryDedupeKey(cwd, input.providerId);
  const entryId = input.entryId?.trim() || null;

  // Bound jump session still tries to write a deleted card → no-op.
  if (entryId && isCodingCliHistoryTombstoned(tombstones, { entryId })) {
    return [...entries];
  }
  // Same provider+cwd was deleted → do not auto-resurrect from a live shell.
  if (isCodingCliHistoryTombstoned(tombstones, { dedupeKey })) {
    // Only allow if we already have a live row (user re-added somehow).
    const exists = entries.some(
      (entry) => buildCodingCliHistoryDedupeKey(entry.cwd, entry.providerId) === dedupeKey,
    );
    if (!exists) return [...entries];
  }

  return upsertCodingCliTerminalHistoryEntry(entries, {
    ...input,
    // Never re-use a deleted id for a brand-new create path.
    entryId: entryId && entries.some((e) => e.id === entryId) ? entryId : undefined,
  });
}

export function addCodingCliHistoryTombstone(
  tombstones: readonly CodingCliHistoryTombstone[],
  stone: CodingCliHistoryTombstone,
): CodingCliHistoryTombstone[] {
  const without = tombstones.filter(
    (item) => item.entryId !== stone.entryId && item.dedupeKey !== stone.dedupeKey,
  );
  return [...without, stone];
}

export function setCodingCliTerminalHistoryPinned(
  entries: readonly CodingCliTerminalHistoryEntry[],
  id: string,
  pinned: boolean,
): CodingCliTerminalHistoryEntry[] {
  return enforceCodingCliTerminalHistoryLimit(
    entries.map((entry) => {
      if (entry.id !== id) return entry;
      if (pinned) return { ...entry, pinned: true };
      const { pinned: _pinned, ...rest } = entry;
      return rest;
    }),
  );
}

export function matchesCodingCliTerminalHistorySearch(
  query: string,
  entry: CodingCliTerminalHistoryEntry,
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const provider = getCodingCliProvider(entry.providerId);
  const haystack = [
    entry.cwd,
    entry.title,
    entry.localShell,
    entry.localShellName,
    entry.providerId,
    provider?.label,
    provider?.command,
    ...(provider?.aliases ?? []),
  ]
    .filter((value): value is string => Boolean(value))
    .join('\n')
    .toLowerCase();
  return haystack.includes(q);
}

export function filterCodingCliTerminalHistory(
  entries: readonly CodingCliTerminalHistoryEntry[],
  options?: {
    query?: string;
    providerId?: CodingCliProviderId | 'all';
  },
): CodingCliTerminalHistoryEntry[] {
  const query = options?.query ?? '';
  const providerId = options?.providerId ?? 'all';
  return sortCodingCliTerminalHistory(entries).filter((entry) => {
    if (providerId !== 'all' && entry.providerId !== providerId) return false;
    return matchesCodingCliTerminalHistorySearch(query, entry);
  });
}

export function sanitizeCodingCliTerminalHistory(
  value: unknown,
): CodingCliTerminalHistoryEntry[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const next: CodingCliTerminalHistoryEntry[] = [];

  for (const item of value) {
    if (!isRecord(item)) continue;
    const id = typeof item.id === 'string' ? item.id.trim() : '';
    const cwd = typeof item.cwd === 'string' ? item.cwd.trim() : '';
    const providerId = typeof item.providerId === 'string' ? item.providerId : '';
    if (!id || !isCleanLocalHistoryCwd(cwd)) continue;
    if (!getCodingCliProvider(providerId as CodingCliProviderId)) continue;

    const dedupeKey = buildCodingCliHistoryDedupeKey(cwd, providerId as CodingCliProviderId);
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    const firstSeenAt = readFiniteNumber(item.firstSeenAt) ?? Date.now();
    const lastUsedAt = readFiniteNumber(item.lastUsedAt) ?? firstSeenAt;
    const useCount = Math.max(1, Math.floor(readFiniteNumber(item.useCount) ?? 1));

    next.push({
      id,
      cwd,
      providerId: providerId as CodingCliProviderId,
      firstSeenAt,
      lastUsedAt,
      useCount,
      ...(typeof item.title === 'string' && item.title.trim() ? { title: item.title.trim() } : {}),
      ...(typeof item.localShell === 'string' && item.localShell.trim()
        ? { localShell: item.localShell.trim() }
        : {}),
      ...(typeof item.localShellName === 'string' && item.localShellName.trim()
        ? { localShellName: item.localShellName.trim() }
        : {}),
      ...((() => {
        if (typeof item.resumeCommand !== 'string' || !item.resumeCommand.trim()) return {};
        const cleaned = item.resumeCommand.trim();
        // Drop cross-provider or corrupted resume lines from older builds.
        if (!resumeCommandMatchesProvider(cleaned, providerId as CodingCliProviderId)) return {};
        const normalized = normalizeExactResumeCommand({
          providerId: providerId as CodingCliProviderId,
          resumeCommand: cleaned,
          cwd,
        });
        return normalized ? { resumeCommand: normalized } : { resumeCommand: cleaned };
      })()),
      ...(item.pinned === true ? { pinned: true } : {}),
    });
  }

  return enforceCodingCliTerminalHistoryLimit(sortCodingCliTerminalHistory(next));
}

export function listKnownCodingCliHistoryProviders(): CodingCliProviderId[] {
  return CODING_CLI_PROVIDERS.map((provider) => provider.id);
}

function readFiniteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function createCodingCliHistoryId(
  providerId: CodingCliProviderId,
  cwd: string,
  now: number,
): string {
  const normalized = normalizeCodingCliHistoryCwd(cwd).slice(0, 48);
  return `cli-hist-${providerId}-${now.toString(36)}-${hashTiny(normalized)}`;
}

function hashTiny(value: string): string {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = ((hash << 5) - hash + value.charCodeAt(i)) | 0;
  }
  return Math.abs(hash).toString(36);
}
