/**
 * Pure helpers: map OS-level coding CLI process snapshots into history inputs.
 * Used when scanning Windows Terminal / external agent processes (not only
 * Netcatty local sessions).
 */
import {
  extractCodingCliResumeCommand,
  isCleanLocalHistoryCwd,
  type CodingCliTerminalHistoryInput,
} from './codingCliTerminalHistory';
import {
  getCodingCliCommandBasename,
  matchCodingCliProviderFromCommand,
} from './codingCliProviderMatch';
import {
  CODING_CLI_PROVIDERS,
  getCodingCliProvider,
  type CodingCliProviderId,
} from './codingCliProviders';

export type ExternalCodingCliProcessSnapshot = {
  pid: number;
  /** Process image name, e.g. grok.exe */
  name?: string;
  /** Full command line when available */
  commandLine?: string;
  /** Process current working directory when resolved */
  cwd?: string;
};

export type ExternalCodingCliHistoryCandidate = CodingCliTerminalHistoryInput & {
  pid: number;
  source: 'external-process';
};

const HELPER_NAME_RE = /(?:-host|-helper|-service|-server)$/i;
const CODEX_DESKTOP_RE = /\b(?:app-server|code[_-]?mode[_-]?host|features\.code_mode_host)\b/i;
const CURSOR_AGENT_RE = /\bagent\b/i;
/** Electron / desktop app helpers (Kimi Desktop, etc.) — not terminal CLIs. */
const ELECTRON_DESKTOP_RE = /\s--type=|--mojo-platform-channel-handle=|--field-trial-handle=|crashpad-handler/i;
const DESKTOP_INSTALL_RE = /kimi-desktop|\\Programs\\kimi\\b|OpenAI\.Codex_|\\WindowsApps\\OpenAI/i;

/** Known CLI basenames (primary + aliases), without .exe. */
export function listCodingCliExecutableBasenames(): string[] {
  const names = new Set<string>();
  for (const provider of CODING_CLI_PROVIDERS) {
    names.add(provider.command.toLowerCase());
    for (const alias of provider.aliases ?? []) {
      names.add(alias.toLowerCase());
    }
  }
  return [...names];
}

/**
 * Whether a live OS process looks like an interactive coding CLI agent
 * (not IDE hosts / desktop app helpers).
 */
export function isExternalCodingCliProcessCandidate(
  snapshot: Pick<ExternalCodingCliProcessSnapshot, 'name' | 'commandLine'>,
): boolean {
  const name = (snapshot.name || '').trim();
  const commandLine = (snapshot.commandLine || '').trim();
  const probe = commandLine || name;
  if (!probe) return false;

  const basename = getCodingCliCommandBasename(probe)
    || getCodingCliCommandBasename(name);
  if (!basename) return false;
  if (HELPER_NAME_RE.test(basename)) return false;

  const provider = matchCodingCliProviderFromCommand(probe)
    || matchCodingCliProviderFromCommand(name);
  if (!provider) return false;

  const haystack = `${name} ${commandLine}`;

  // Electron renderer/gpu/utility and desktop app install paths.
  if (ELECTRON_DESKTOP_RE.test(haystack) || DESKTOP_INSTALL_RE.test(haystack)) {
    return false;
  }

  // Cursor IDE is `cursor.exe` — only accept agent CLI invocations.
  if (provider.id === 'cursor') {
    return CURSOR_AGENT_RE.test(haystack) || /cursor-agent/i.test(basename);
  }

  // Windows Store Codex desktop hosts are not terminal agents.
  if (provider.id === 'codex' && CODEX_DESKTOP_RE.test(haystack)) {
    return false;
  }

  return true;
}

/**
 * Resume id from a live process command line.
 * Handles both `grok --resume id` and `"C:\\…\\grok.exe" --resume id`.
 */
export function extractResumeFromProcessCommandLine(
  commandLine: string | null | undefined,
  providerId: CodingCliProviderId,
): string | undefined {
  const raw = commandLine?.trim();
  if (!raw) return undefined;

  const fromBanner = extractCodingCliResumeCommand(raw, providerId);
  if (fromBanner) return fromBanner;

  if (providerId === 'grok') {
    const match = raw.match(
      /grok(?:-build)?(?:\.exe)?["']?\s+(?:-r|--resume)(?:\s+|=)([^\s"'`]+)/i,
    );
    if (match?.[1]) {
      const id = match[1].replace(/[^0-9a-f-].*$/i, '');
      if (id.length >= 8) return `grok --resume ${id}`;
    }
  }
  if (providerId === 'claude') {
    const match = raw.match(
      /claude(?:\.exe)?["']?\s+--resume(?:\s+|=)([^\s"'`]+)/i,
    );
    if (match?.[1]) {
      const id = match[1].replace(/[^0-9a-f-].*$/i, '');
      if (id.length >= 8) return `claude --resume ${id}`;
    }
  }
  if (providerId === 'codex') {
    const match = raw.match(
      /codex(?:\.exe)?["']?\s+resume(?:\s+)([^\s"'`]+)/i,
    );
    if (match?.[1] && match[1].toLowerCase() !== '--last') {
      return `codex resume ${match[1]}`;
    }
  }
  return undefined;
}

/** Parse `--cwd path` / `--cwd=path` / `-C path` from a CLI command line. */
export function extractCodingCliCwdFromCommandLine(
  commandLine: string | null | undefined,
): string | undefined {
  const raw = commandLine?.trim();
  if (!raw) return undefined;

  const match = raw.match(
    /(?:^|\s)(?:--cwd|-C)(?:\s+|=)(?:"([^"]+)"|'([^']+)'|([^\s"'`]+))/i,
  );
  const value = (match?.[1] || match?.[2] || match?.[3] || '').trim();
  if (!value) return undefined;
  return isCleanLocalHistoryCwd(value) ? value : undefined;
}

function resolveProviderId(
  snapshot: ExternalCodingCliProcessSnapshot,
): CodingCliProviderId | null {
  const commandLine = snapshot.commandLine?.trim() || '';
  const name = snapshot.name?.trim() || '';
  const fromCmd = commandLine
    ? matchCodingCliProviderFromCommand(commandLine)
    : undefined;
  if (fromCmd) return fromCmd.id;
  const fromName = name ? matchCodingCliProviderFromCommand(name) : undefined;
  return fromName?.id ?? null;
}

function folderTitleFromCwd(cwd: string): string | undefined {
  const normalized = cwd.replace(/[\\/]+$/, '');
  const parts = normalized.split(/[\\/]/).filter(Boolean);
  const leaf = parts[parts.length - 1];
  return leaf || undefined;
}

/**
 * Convert one OS process snapshot into a history upsert input.
 * Returns null when provider or cwd cannot be resolved cleanly.
 */
export function captureExternalCodingCliHistoryInput(
  snapshot: ExternalCodingCliProcessSnapshot,
  options?: { fallbackLocalCwd?: string | null },
): ExternalCodingCliHistoryCandidate | null {
  if (!isExternalCodingCliProcessCandidate(snapshot)) return null;

  const providerId = resolveProviderId(snapshot);
  if (!providerId || !getCodingCliProvider(providerId)) return null;

  const commandLine = snapshot.commandLine?.trim() || snapshot.name?.trim() || '';
  const cwdFromFlag = extractCodingCliCwdFromCommandLine(commandLine);
  const cwdFromProcess = snapshot.cwd && isCleanLocalHistoryCwd(snapshot.cwd)
    ? snapshot.cwd.trim()
    : undefined;
  const fallback = options?.fallbackLocalCwd && isCleanLocalHistoryCwd(options.fallbackLocalCwd)
    ? options.fallbackLocalCwd.trim()
    : undefined;
  // Prefer real process cwd, then --cwd flag, then home fallback only as last resort.
  const cwd = cwdFromProcess || cwdFromFlag || fallback;
  if (!cwd || !isCleanLocalHistoryCwd(cwd)) return null;

  const resumeFromLine = extractResumeFromProcessCommandLine(commandLine, providerId);
  const provider = getCodingCliProvider(providerId);
  const leaf = folderTitleFromCwd(cwd);
  const title = leaf
    ? `${leaf} · ${provider?.label || providerId}`
    : (provider?.label || providerId);

  return {
    pid: snapshot.pid,
    source: 'external-process',
    cwd,
    providerId,
    title,
    ...(resumeFromLine ? { resumeCommand: resumeFromLine } : {}),
  };
}

/**
 * Map a list of process snapshots to unique history inputs (dedupe by
 * provider+cwd; keep the first pid with a resume command when possible).
 */
export function mapExternalCodingCliProcessesToHistoryInputs(
  snapshots: readonly ExternalCodingCliProcessSnapshot[],
  options?: { fallbackLocalCwd?: string | null },
): {
  candidates: ExternalCodingCliHistoryCandidate[];
  matchedProcesses: number;
  skippedNoProvider: number;
  skippedNoCwd: number;
} {
  let skippedNoProvider = 0;
  let skippedNoCwd = 0;
  let matchedProcesses = 0;
  const byKey = new Map<string, ExternalCodingCliHistoryCandidate>();

  for (const snapshot of snapshots) {
    if (!isExternalCodingCliProcessCandidate(snapshot)) {
      // Only count "almost" matches that look like our basenames but filtered.
      const basename = getCodingCliCommandBasename(snapshot.commandLine || snapshot.name || '');
      if (basename && listCodingCliExecutableBasenames().includes(basename)) {
        skippedNoProvider += 1;
      }
      continue;
    }

    const providerId = resolveProviderId(snapshot);
    if (!providerId) {
      skippedNoProvider += 1;
      continue;
    }

    const commandLine = snapshot.commandLine?.trim() || '';
    const hasCwd = Boolean(
      (snapshot.cwd && isCleanLocalHistoryCwd(snapshot.cwd))
      || extractCodingCliCwdFromCommandLine(commandLine)
      || (options?.fallbackLocalCwd && isCleanLocalHistoryCwd(options.fallbackLocalCwd)),
    );
    if (!hasCwd) {
      skippedNoCwd += 1;
      continue;
    }

    const input = captureExternalCodingCliHistoryInput(snapshot, options);
    if (!input) {
      skippedNoCwd += 1;
      continue;
    }

    matchedProcesses += 1;
    const key = `${input.providerId}\0${input.cwd.toLowerCase()}`;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, input);
      continue;
    }
    // Prefer a row that has a resume command.
    if (!existing.resumeCommand && input.resumeCommand) {
      byKey.set(key, input);
    }
  }

  return {
    candidates: [...byKey.values()],
    matchedProcesses,
    skippedNoProvider,
    skippedNoCwd,
  };
}
