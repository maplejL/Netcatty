/**
 * Opt-in terminal command latency traces.
 *
 * Settings UI lives in a *separate BrowserWindow* from terminals, so traces
 * cannot stay in a single renderer module heap. When enabled we keep an
 * in-memory ring buffer (hot path) and mirror it to localStorage so the
 * settings window can read the same data via the StorageEvent.
 *
 * When disabled, public APIs are no-ops (aside from enable/disable itself).
 */

export type TerminalCommandTimingEndReason =
  | 'next_command'
  | 'prompt_return'
  | 'session_exit'
  | 'timeout'
  | 'manual';

export type TerminalCommandTimingTrace = {
  id: string;
  sessionId: string;
  hostId?: string;
  hostLabel?: string;
  /** SSH hostname / IP when available (for IP filter in settings). */
  hostHostname?: string;
  command: string;
  /** Monotonic clock (performance.now / Date.now) at submit — process-local. */
  tSubmit: number;
  tWrite?: number;
  tFirstOutput?: number;
  tFirstRender?: number;
  tEnd?: number;
  endReason?: TerminalCommandTimingEndReason;
  /** Derived ms deltas (filled when the corresponding mark is set). */
  msWrite?: number;
  msFirstOutput?: number;
  msFirstRender?: number;
  msTotal?: number;
  /** Wall clock (Date.now) at submit — for UI ordering across restarts. */
  wallSubmit?: number;
};

export type TerminalCommandTimingSnapshot = {
  enabled: boolean;
  capacity: number;
  traces: TerminalCommandTimingTrace[];
  activeBySession: Record<string, TerminalCommandTimingTrace | undefined>;
};

/** Pipeline stages for stacked-bar visualization (ms within each hop). */
export type TerminalCommandTimingSegmentId =
  | 'submit_to_write'
  | 'write_to_output'
  | 'output_to_render'
  | 'render_to_end'
  | 'incomplete';

export type TerminalCommandTimingSegment = {
  id: TerminalCommandTimingSegmentId;
  ms: number;
  /** True when this stage is the largest measured hop (ties: first wins). */
  isBottleneck: boolean;
};

export type TerminalCommandTimingViewModel = TerminalCommandTimingTrace & {
  status: 'active' | 'ended';
  segments: TerminalCommandTimingSegment[];
  /** Span used as 100% for the bar (max of measured total / sum of segments). */
  barTotalMs: number;
  bottleneckId: TerminalCommandTimingSegmentId | null;
};

const DEFAULT_CAPACITY = 200;
const DEFAULT_TIMEOUT_MS = 120_000;
/** Must match infrastructure/config/storageKeys.ts (avoid circular deps at init). */
const STORAGE_KEY_TERMINAL_COMMAND_TIMING_DEBUG_ENABLED =
  'netcatty_terminal_command_timing_debug_enabled_v1';
const STORAGE_KEY_TERMINAL_COMMAND_TIMING_TRACES =
  'netcatty_terminal_command_timing_traces_v1';

type NowFn = () => number;
type Listener = () => void;

const defaultNow: NowFn = () => {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
};

function readEnabledFromStorage(): boolean {
  try {
    if (typeof localStorage === 'undefined') return false;
    return localStorage.getItem(STORAGE_KEY_TERMINAL_COMMAND_TIMING_DEBUG_ENABLED) === 'true';
  } catch {
    return false;
  }
}

// Hydrate immediately so terminals opened before settings effects run still record.
let enabled = readEnabledFromStorage();
let capacity = DEFAULT_CAPACITY;
let timeoutMs = DEFAULT_TIMEOUT_MS;
let nowFn: NowFn = defaultNow;
let seq = 0;
let notifyScheduled = false;
let persistScheduled = false;
/** Tests can disable localStorage I/O. */
let persistEnabled = true;
let crossWindowInstalled = false;

const traces: TerminalCommandTimingTrace[] = [];
/** One open (not yet ended) command per session. */
const activeBySession = new Map<string, TerminalCommandTimingTrace>();
const timeoutTimers = new Map<string, ReturnType<typeof setTimeout>>();
const listeners = new Set<Listener>();

function notifyListeners(): void {
  if (listeners.size === 0) return;
  if (notifyScheduled) return;
  notifyScheduled = true;
  queueMicrotask(() => {
    notifyScheduled = false;
    for (const listener of listeners) {
      try {
        listener();
      } catch {
        // ignore listener errors
      }
    }
  });
}

function schedulePersist(): void {
  if (!persistEnabled || !enabled) return;
  if (typeof localStorage === 'undefined') return;
  if (persistScheduled) return;
  persistScheduled = true;
  // Debounce so mark/write/output bursts collapse into one write.
  setTimeout(() => {
    persistScheduled = false;
    persistTracesToStorage();
  }, 40);
}

function persistTracesToStorage(): void {
  if (!persistEnabled) return;
  try {
    if (typeof localStorage === 'undefined') return;
    const payload = {
      v: 1,
      updatedAt: Date.now(),
      traces: traces.slice(-capacity),
    };
    localStorage.setItem(STORAGE_KEY_TERMINAL_COMMAND_TIMING_TRACES, JSON.stringify(payload));
  } catch {
    // quota / private mode — keep memory-only
  }
}

function loadTracesFromStorage(): boolean {
  if (!persistEnabled) return false;
  try {
    if (typeof localStorage === 'undefined') return false;
    const raw = localStorage.getItem(STORAGE_KEY_TERMINAL_COMMAND_TIMING_TRACES);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as { traces?: TerminalCommandTimingTrace[] };
    if (!Array.isArray(parsed?.traces)) return false;
    traces.length = 0;
    for (const t of parsed.traces) {
      if (t && typeof t.id === 'string' && typeof t.command === 'string') {
        traces.push(t);
      }
    }
    while (traces.length > capacity) traces.shift();
    // Rebuild active map from open traces (no tEnd).
    activeBySession.clear();
    for (const t of traces) {
      if (t.tEnd === undefined && t.sessionId) {
        activeBySession.set(t.sessionId, t);
      }
    }
    return true;
  } catch {
    return false;
  }
}

function installCrossWindowSync(): void {
  if (crossWindowInstalled) return;
  if (typeof window === 'undefined') return;
  crossWindowInstalled = true;

  window.addEventListener('storage', (e: StorageEvent) => {
    if (!e.key) return;
    if (e.key === STORAGE_KEY_TERMINAL_COMMAND_TIMING_DEBUG_ENABLED) {
      const next = e.newValue === 'true';
      if (next !== enabled) {
        enabled = next;
        if (!enabled) {
          for (const sessionId of [...activeBySession.keys()]) {
            endActiveTrace(sessionId, 'manual', nowFn(), { skipPersist: true });
          }
        }
        notifyListeners();
      }
      return;
    }
    if (e.key === STORAGE_KEY_TERMINAL_COMMAND_TIMING_TRACES) {
      // Another window wrote or cleared the ring buffer.
      if (e.newValue === null) {
        traces.length = 0;
        activeBySession.clear();
        notifyListeners();
        return;
      }
      if (loadTracesFromStorage()) {
        notifyListeners();
      }
    }
  });
}

// Best-effort hydrate + cross-window wiring as soon as the module loads.
if (typeof window !== 'undefined') {
  installCrossWindowSync();
  if (enabled) {
    loadTracesFromStorage();
  }
}

function nextId(): string {
  seq += 1;
  return `tcmd-${seq}-${Date.now().toString(36)}`;
}

function fillDeltas(trace: TerminalCommandTimingTrace): void {
  const base = trace.tSubmit;
  if (typeof trace.tWrite === 'number') {
    trace.msWrite = Math.max(0, Math.round(trace.tWrite - base));
  }
  if (typeof trace.tFirstOutput === 'number') {
    trace.msFirstOutput = Math.max(0, Math.round(trace.tFirstOutput - base));
  }
  if (typeof trace.tFirstRender === 'number') {
    trace.msFirstRender = Math.max(0, Math.round(trace.tFirstRender - base));
  }
  if (typeof trace.tEnd === 'number') {
    trace.msTotal = Math.max(0, Math.round(trace.tEnd - base));
  }
}

function clearTimeoutTimer(sessionId: string): void {
  const timer = timeoutTimers.get(sessionId);
  if (timer !== undefined) {
    clearTimeout(timer);
    timeoutTimers.delete(sessionId);
  }
}

function scheduleTimeout(sessionId: string, traceId: string): void {
  clearTimeoutTimer(sessionId);
  if (timeoutMs <= 0) return;
  const timer = setTimeout(() => {
    timeoutTimers.delete(sessionId);
    const active = activeBySession.get(sessionId);
    if (!active || active.id !== traceId || active.tEnd !== undefined) return;
    endActiveTrace(sessionId, 'timeout');
  }, timeoutMs);
  timeoutTimers.set(sessionId, timer);
}

function pushTrace(trace: TerminalCommandTimingTrace): void {
  traces.push(trace);
  while (traces.length > capacity) {
    traces.shift();
  }
  schedulePersist();
  notifyListeners();
}

function endActiveTrace(
  sessionId: string,
  reason: TerminalCommandTimingEndReason,
  at: number = nowFn(),
  options?: { skipPersist?: boolean },
): TerminalCommandTimingTrace | null {
  const active = activeBySession.get(sessionId);
  if (!active || active.tEnd !== undefined) return null;
  active.tEnd = at;
  active.endReason = reason;
  fillDeltas(active);
  activeBySession.delete(sessionId);
  clearTimeoutTimer(sessionId);
  logTrace(active);
  if (!options?.skipPersist) {
    schedulePersist();
  }
  notifyListeners();
  return active;
}

function logTrace(trace: TerminalCommandTimingTrace): void {
  try {
    // Use info (not debug) so default DevTools levels show the breadcrumb.
    // eslint-disable-next-line no-console
    console.info(
      '[terminal-command-timing]',
      {
        sessionId: trace.sessionId,
        host: trace.hostLabel || trace.hostId,
        command: trace.command,
        msWrite: trace.msWrite,
        msFirstOutput: trace.msFirstOutput,
        msFirstRender: trace.msFirstRender,
        msTotal: trace.msTotal,
        endReason: trace.endReason,
      },
    );
  } catch {
    // ignore
  }
}

/** Refresh enabled flag from localStorage (settings may live in another window). */
export function syncTerminalCommandTimingEnabledFromStorage(): boolean {
  if (!persistEnabled) return enabled;
  const next = readEnabledFromStorage();
  if (next !== enabled) {
    enabled = next;
    if (enabled) {
      loadTracesFromStorage();
    }
    notifyListeners();
  }
  return enabled;
}

/**
 * Settings window poll helper: re-read ring buffer written by the main window.
 * Safe to call often; no-ops when persistence is disabled (tests).
 */
export function refreshTerminalCommandTimingFromStorage(): void {
  syncTerminalCommandTimingEnabledFromStorage();
  if (!enabled) return;
  if (loadTracesFromStorage()) {
    // Don't notify here — caller (panel) already bumps version.
  }
}

export function setTerminalCommandTimingDebugEnabled(next: boolean): void {
  const wasEnabled = enabled;
  enabled = Boolean(next);
  if (persistEnabled) {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(
          STORAGE_KEY_TERMINAL_COMMAND_TIMING_DEBUG_ENABLED,
          enabled ? 'true' : 'false',
        );
      }
    } catch {
      // ignore
    }
  }
  if (wasEnabled && !enabled) {
    for (const sessionId of [...activeBySession.keys()]) {
      endActiveTrace(sessionId, 'manual');
    }
  }
  if (enabled && !wasEnabled) {
    loadTracesFromStorage();
  }
  if (!enabled && persistEnabled) {
    try {
      localStorage?.removeItem?.(STORAGE_KEY_TERMINAL_COMMAND_TIMING_TRACES);
    } catch {
      // ignore
    }
  }
  notifyListeners();
}

/** Subscribe to store mutations (for settings panel live view). Returns unsubscribe. */
export function subscribeTerminalCommandTiming(listener: Listener): () => void {
  installCrossWindowSync();
  // Settings window may open after main already wrote traces — re-hydrate once.
  syncTerminalCommandTimingEnabledFromStorage();
  if (enabled) {
    loadTracesFromStorage();
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function isTerminalCommandTimingDebugEnabled(): boolean {
  return enabled;
}

export function configureTerminalCommandTiming(options?: {
  capacity?: number;
  timeoutMs?: number;
  now?: NowFn;
  /** When false, skip localStorage (unit tests). Default true. */
  persist?: boolean;
}): void {
  if (options?.capacity !== undefined && options.capacity > 0) {
    capacity = Math.floor(options.capacity);
    while (traces.length > capacity) {
      traces.shift();
    }
  }
  if (options?.timeoutMs !== undefined) {
    timeoutMs = Math.max(0, Math.floor(options.timeoutMs));
  }
  if (options?.now) {
    nowFn = options.now;
  }
  if (options?.persist !== undefined) {
    persistEnabled = options.persist;
  }
}

export function resetTerminalCommandTimingStore(): void {
  for (const sessionId of timeoutTimers.keys()) {
    clearTimeoutTimer(sessionId);
  }
  traces.length = 0;
  activeBySession.clear();
  seq = 0;
  notifyListeners();
}

/** Clear recorded traces only (keeps enabled flag and capacity). */
export function clearTerminalCommandTimingTraces(): void {
  for (const sessionId of timeoutTimers.keys()) {
    clearTimeoutTimer(sessionId);
  }
  traces.length = 0;
  activeBySession.clear();
  if (persistEnabled) {
    try {
      localStorage?.removeItem?.(STORAGE_KEY_TERMINAL_COMMAND_TIMING_TRACES);
    } catch {
      // ignore
    }
  }
  notifyListeners();
}

export function beginTerminalCommandTiming(input: {
  sessionId: string;
  command: string;
  hostId?: string;
  hostLabel?: string;
  hostHostname?: string;
}): TerminalCommandTimingTrace | null {
  // Settings toggles in another window only update localStorage + StorageEvent;
  // re-check storage so we never miss a just-enabled switch.
  if (!enabled) {
    syncTerminalCommandTimingEnabledFromStorage();
  }
  if (!enabled) return null;
  const sessionId = input.sessionId;
  if (!sessionId) return null;
  const command = (input.command || '').trim();
  if (!command) return null;

  const at = nowFn();
  endActiveTrace(sessionId, 'next_command', at);

  const hostHostname = (input.hostHostname || '').trim() || undefined;
  const trace: TerminalCommandTimingTrace = {
    id: nextId(),
    sessionId,
    hostId: input.hostId,
    hostLabel: input.hostLabel,
    hostHostname,
    command,
    tSubmit: at,
    wallSubmit: Date.now(),
  };
  pushTrace(trace);
  activeBySession.set(sessionId, trace);
  scheduleTimeout(sessionId, trace.id);
  try {
    // eslint-disable-next-line no-console
    console.info('[terminal-command-timing] submit', {
      sessionId,
      command,
      host: input.hostLabel || hostHostname || input.hostId,
      hostname: hostHostname,
    });
  } catch {
    // ignore
  }
  return trace;
}

/** Display label for host filter rows (prefer IP/hostname, then label). */
export function getTerminalCommandTimingHostKey(trace: Pick<
  TerminalCommandTimingTrace,
  'hostId' | 'hostLabel' | 'hostHostname'
>): string {
  const hostname = (trace.hostHostname || '').trim();
  if (hostname) return hostname;
  const label = (trace.hostLabel || '').trim();
  if (label) return label;
  const id = (trace.hostId || '').trim();
  if (id) return id;
  return '';
}

export function listTerminalCommandTimingHostOptions(
  traces: TerminalCommandTimingTrace[],
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const trace of traces) {
    const key = getTerminalCommandTimingHostKey(trace);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out.sort((a, b) => a.localeCompare(b));
}

export function matchTerminalCommandTimingTrace(
  trace: TerminalCommandTimingTrace,
  options: { hostFilter?: string; query?: string },
): boolean {
  const hostFilter = (options.hostFilter || '').trim();
  if (hostFilter && hostFilter !== '*') {
    const key = getTerminalCommandTimingHostKey(trace);
    if (key !== hostFilter) {
      // Also allow exact match on any host field (legacy traces without hostHostname).
      const fields = [trace.hostHostname, trace.hostLabel, trace.hostId]
        .map((v) => (v || '').trim())
        .filter(Boolean);
      if (!fields.includes(hostFilter)) return false;
    }
  }

  const query = (options.query || '').trim().toLowerCase();
  if (!query) return true;

  const haystack = [
    trace.command,
    trace.hostLabel,
    trace.hostHostname,
    trace.hostId,
    trace.sessionId,
    trace.endReason,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return haystack.includes(query);
}

export function filterTerminalCommandTimingTraces(
  traces: TerminalCommandTimingTrace[],
  options: { hostFilter?: string; query?: string },
): TerminalCommandTimingTrace[] {
  if (!options.hostFilter && !options.query) return traces;
  const hostFilter = (options.hostFilter || '').trim();
  const query = (options.query || '').trim();
  if ((!hostFilter || hostFilter === '*') && !query) return traces;
  return traces.filter((trace) => matchTerminalCommandTimingTrace(trace, options));
}

export function markTerminalCommandWrite(sessionId: string): void {
  if (!enabled || !sessionId) return;
  const active = activeBySession.get(sessionId);
  if (!active || active.tWrite !== undefined) return;
  active.tWrite = nowFn();
  fillDeltas(active);
  schedulePersist();
  notifyListeners();
}

export function markTerminalCommandFirstOutput(sessionId: string): void {
  if (!enabled || !sessionId) return;
  const active = activeBySession.get(sessionId);
  if (!active || active.tFirstOutput !== undefined) return;
  active.tFirstOutput = nowFn();
  fillDeltas(active);
  schedulePersist();
  notifyListeners();
}

export function markTerminalCommandFirstRender(sessionId: string): void {
  if (!enabled || !sessionId) return;
  const active = activeBySession.get(sessionId);
  if (!active || active.tFirstRender !== undefined) return;
  active.tFirstRender = nowFn();
  fillDeltas(active);
  schedulePersist();
  notifyListeners();
}

export function endTerminalCommandTiming(
  sessionId: string,
  reason: TerminalCommandTimingEndReason = 'manual',
): TerminalCommandTimingTrace | null {
  if (!enabled || !sessionId) return null;
  return endActiveTrace(sessionId, reason);
}

/**
 * End the open command when the shell is back at an idle prompt.
 *
 * Without this, total keeps accruing until the next Enter (endReason
 * `next_command`), so "渲染之后" includes idle time after the command finished.
 *
 * Call after xterm has applied remote output (write callback), not on submit.
 */
export function maybeEndTerminalCommandTimingOnPrompt(
  sessionId: string,
  detection: { isAtPrompt: boolean; userInput: string } | null | undefined,
): TerminalCommandTimingTrace | null {
  if (!enabled || !sessionId || !detection) return null;
  const active = activeBySession.get(sessionId);
  if (!active || active.tEnd !== undefined) return null;
  // Wait for at least one remote chunk after submit so we do not end on the
  // still-idle pre-command prompt line in the same tick as Enter.
  if (active.tFirstOutput === undefined && active.tFirstRender === undefined) {
    return null;
  }
  if (!detection.isAtPrompt) return null;
  if ((detection.userInput || '').length > 0) return null;
  return endActiveTrace(sessionId, 'prompt_return');
}

export function getTerminalCommandTimingSnapshot(): TerminalCommandTimingSnapshot {
  const active: Record<string, TerminalCommandTimingTrace | undefined> = {};
  for (const [sessionId, trace] of activeBySession) {
    active[sessionId] = { ...trace };
  }
  return {
    enabled,
    capacity,
    traces: traces.map((t) => ({ ...t })),
    activeBySession: active,
  };
}

export function getTerminalCommandTimingTraces(limit?: number): TerminalCommandTimingTrace[] {
  if (limit === undefined || limit >= traces.length) {
    return traces.map((t) => ({ ...t }));
  }
  return traces.slice(-Math.max(0, limit)).map((t) => ({ ...t }));
}

/** Format a single-line summary for UI / copy. */
export function formatTerminalCommandTimingTrace(trace: TerminalCommandTimingTrace): string {
  const parts = [
    `cmd=${JSON.stringify(trace.command)}`,
    `session=${trace.sessionId}`,
  ];
  if (trace.hostHostname || trace.hostLabel || trace.hostId) {
    parts.push(`host=${trace.hostHostname || trace.hostLabel || trace.hostId}`);
  }
  if (trace.msWrite !== undefined) parts.push(`write=${trace.msWrite}ms`);
  if (trace.msFirstOutput !== undefined) parts.push(`firstOut=${trace.msFirstOutput}ms`);
  if (trace.msFirstRender !== undefined) parts.push(`firstRender=${trace.msFirstRender}ms`);
  if (trace.msTotal !== undefined) parts.push(`total=${trace.msTotal}ms`);
  if (trace.endReason) parts.push(`end=${trace.endReason}`);
  return parts.join(' ');
}

/**
 * Split a trace into pipeline hops for stacked bars.
 */
export function buildTerminalCommandTimingSegments(
  trace: TerminalCommandTimingTrace,
): TerminalCommandTimingSegment[] {
  const write = trace.msWrite;
  const firstOut = trace.msFirstOutput;
  const firstRender = trace.msFirstRender;
  const total = trace.msTotal;

  const raw: Array<{ id: TerminalCommandTimingSegmentId; ms: number }> = [];

  if (write !== undefined) {
    raw.push({ id: 'submit_to_write', ms: Math.max(0, write) });
  }
  if (write !== undefined && firstOut !== undefined) {
    raw.push({ id: 'write_to_output', ms: Math.max(0, firstOut - write) });
  }
  if (firstOut !== undefined && firstRender !== undefined) {
    raw.push({ id: 'output_to_render', ms: Math.max(0, firstRender - firstOut) });
  }
  if (firstRender !== undefined && total !== undefined) {
    raw.push({ id: 'render_to_end', ms: Math.max(0, total - firstRender) });
  } else if (firstOut !== undefined && total !== undefined && firstRender === undefined) {
    raw.push({ id: 'render_to_end', ms: Math.max(0, total - firstOut) });
  } else if (write !== undefined && total !== undefined && firstOut === undefined && firstRender === undefined) {
    raw.push({ id: 'render_to_end', ms: Math.max(0, total - write) });
  }

  if (total === undefined) {
    const last = firstRender ?? firstOut ?? write ?? 0;
    if (raw.length === 0 && last === 0) {
      raw.push({ id: 'incomplete', ms: 0 });
    }
  }

  let bottleneckId: TerminalCommandTimingSegmentId | null = null;
  let maxMs = -1;
  for (const seg of raw) {
    if (seg.ms > maxMs) {
      maxMs = seg.ms;
      bottleneckId = seg.id;
    }
  }

  return raw.map((seg) => ({
    id: seg.id,
    ms: seg.ms,
    isBottleneck: bottleneckId !== null && seg.id === bottleneckId && seg.ms > 0,
  }));
}

export function buildTerminalCommandTimingViewModel(
  trace: TerminalCommandTimingTrace,
): TerminalCommandTimingViewModel {
  const segments = buildTerminalCommandTimingSegments(trace);
  const segmentSum = segments.reduce((acc, s) => acc + s.ms, 0);
  const barTotalMs = Math.max(trace.msTotal ?? 0, segmentSum, 1);
  const bottleneck = segments.find((s) => s.isBottleneck);
  return {
    ...trace,
    status: trace.tEnd === undefined ? 'active' : 'ended',
    segments,
    barTotalMs,
    bottleneckId: bottleneck?.id ?? null,
  };
}

export function getTerminalCommandTimingViewModels(limit?: number): TerminalCommandTimingViewModel[] {
  const list = getTerminalCommandTimingTraces(limit);
  return list.map(buildTerminalCommandTimingViewModel).reverse();
}
