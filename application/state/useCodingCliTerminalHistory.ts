import { useCallback, useRef, useState } from 'react';
import {
  mapExternalCodingCliProcessesToHistoryInputs,
  type ExternalCodingCliProcessSnapshot,
} from '../../domain/codingCliExternalProcess';
import {
  addCodingCliHistoryTombstone,
  buildCodingCliHistoryDedupeKey,
  buildTombstoneFromEntry,
  captureCodingCliTerminalHistoryInput,
  removeCodingCliTerminalHistoryEntry,
  resumeCommandMatchesProvider,
  setCodingCliTerminalHistoryPinned,
  touchCodingCliTerminalHistoryEntry,
  upsertCodingCliTerminalHistoryEntry,
  upsertCodingCliTerminalHistoryEntryRespectingTombstones,
  type CodingCliHistoryTombstone,
  type CodingCliTerminalHistoryEntry,
} from '../../domain/codingCliTerminalHistory';
import { matchCodingCliProviderFromCommand } from '../../domain/codingCliProviderMatch';
import type { CodingCliProviderId } from '../../domain/codingCliProviders';
import { inferCodingCliProviderFromTitleSignals } from '../../domain/codingCliTitleParse';
import type { TerminalSession } from '../../domain/models';
import { netcattyBridge } from '../../infrastructure/services/netcattyBridge';
import {
  loadCodingCliHistoryTombstones,
  loadCodingCliTerminalHistory,
  saveCodingCliHistoryTombstones,
  saveCodingCliTerminalHistory,
} from './codingCliTerminalHistoryStorage';

const SCAN_LOG = '[codingCliHistory:scan]';

export type CodingCliHistoryScanResult = {
  matched: number;
  added: number;
  updated: number;
  total: number;
  /** In-app local terminal sessions that matched. */
  localMatched?: number;
  /** External OS processes that matched (Windows Terminal, etc.). */
  externalMatched?: number;
  externalSkippedNoCwd?: number;
  error?: string;
};

export function useCodingCliTerminalHistory(options?: {
  /** Called when local terminal has no tracked cwd (e.g. PowerShell without OSC 7). */
  getFallbackLocalCwd?: () => string | null | undefined;
}) {
  const [entries, setEntries] = useState<CodingCliTerminalHistoryEntry[]>(() => (
    loadCodingCliTerminalHistory()
  ));
  const sessionCwdByIdRef = useRef(new Map<string, string>());
  /** Sticky provider after CLI exits and title/provider is cleared. */
  const lastProviderBySessionRef = useRef(new Map<string, CodingCliProviderId>());
  const lastResumeBySessionRef = useRef(new Map<string, string>());
  /** sessionId → history entry id (set when opening via history jump). */
  const historyEntryBySessionRef = useRef(new Map<string, string>());
  const tombstonesRef = useRef<CodingCliHistoryTombstone[]>(loadCodingCliHistoryTombstones());
  const entriesRef = useRef(entries);
  entriesRef.current = entries;
  const getFallbackLocalCwdRef = useRef(options?.getFallbackLocalCwd);
  getFallbackLocalCwdRef.current = options?.getFallbackLocalCwd;

  const persist = useCallback((next: CodingCliTerminalHistoryEntry[]) => {
    entriesRef.current = next;
    setEntries(next);
    saveCodingCliTerminalHistory(next);
  }, []);

  const persistTombstones = useCallback((next: CodingCliHistoryTombstone[]) => {
    tombstonesRef.current = next;
    saveCodingCliHistoryTombstones(next);
  }, []);

  const rememberSessionCwd = useCallback((sessionId: string, cwd: string | null) => {
    if (cwd && cwd.trim()) {
      sessionCwdByIdRef.current.set(sessionId, cwd.trim());
    } else {
      sessionCwdByIdRef.current.delete(sessionId);
    }
  }, []);

  const getSessionCwd = useCallback((sessionId: string) => (
    sessionCwdByIdRef.current.get(sessionId)
  ), []);

  const rememberProvider = useCallback((
    sessionId: string,
    providerId: CodingCliProviderId | null,
  ) => {
    if (providerId) {
      lastProviderBySessionRef.current.set(sessionId, providerId);
    }
  }, []);

  const rememberResumeCommand = useCallback((
    sessionId: string,
    resumeCommand: string | null | undefined,
  ) => {
    const trimmed = resumeCommand?.trim();
    if (trimmed) {
      lastResumeBySessionRef.current.set(sessionId, trimmed);
    }
  }, []);

  const bindSessionToHistoryEntry = useCallback((
    sessionId: string,
    entryId: string | null | undefined,
  ) => {
    const id = entryId?.trim();
    if (id) historyEntryBySessionRef.current.set(sessionId, id);
    else historyEntryBySessionRef.current.delete(sessionId);
  }, []);

  /** Mark a history row as just used (jump) without creating another row. */
  const touchHistoryEntry = useCallback((entryId: string) => {
    const id = entryId.trim();
    if (!id) return;
    // Do not revive a tombstoned row via touch.
    if (tombstonesRef.current.some((stone) => stone.entryId === id)) return;
    persist(touchCodingCliTerminalHistoryEntry(entriesRef.current, id));
  }, [persist]);

  const resolveRecordInput = useCallback((
    session: TerminalSession,
    cwdOverride?: string | null,
    providerIdOverride?: CodingCliProviderId | null,
    resumeCommandOverride?: string | null,
  ) => {
    const cwd = cwdOverride ?? sessionCwdByIdRef.current.get(session.id) ?? null;
    if (cwd) sessionCwdByIdRef.current.set(session.id, cwd);
    const stickyProvider = providerIdOverride
      ?? session.codingCliProviderId
      ?? lastProviderBySessionRef.current.get(session.id)
      ?? null;
    if (stickyProvider) {
      lastProviderBySessionRef.current.set(session.id, stickyProvider);
    }
    const candidateResume = resumeCommandOverride?.trim()
      || lastResumeBySessionRef.current.get(session.id)
      || null;
    const resumeCommand = stickyProvider
      && candidateResume
      && resumeCommandMatchesProvider(candidateResume, stickyProvider)
      ? candidateResume
      : null;
    if (resumeCommand) {
      lastResumeBySessionRef.current.set(session.id, resumeCommand);
    } else if (
      candidateResume
      && stickyProvider
      && !resumeCommandMatchesProvider(candidateResume, stickyProvider)
    ) {
      lastResumeBySessionRef.current.delete(session.id);
    }
    const entryId = session.codingCliHistoryEntryId
      || historyEntryBySessionRef.current.get(session.id)
      || null;
    return captureCodingCliTerminalHistoryInput(
      session,
      cwd,
      {
        providerIdOverride: stickyProvider,
        fallbackLocalCwd: getFallbackLocalCwdRef.current?.() ?? null,
        resumeCommand,
        entryId,
      },
    );
  }, []);

  const recordFromSession = useCallback((
    session: TerminalSession,
    cwdOverride?: string | null,
    providerIdOverride?: CodingCliProviderId | null,
    resumeCommandOverride?: string | null,
  ) => {
    const input = resolveRecordInput(
      session,
      cwdOverride,
      providerIdOverride,
      resumeCommandOverride,
    );
    if (!input) return false;
    const next = upsertCodingCliTerminalHistoryEntryRespectingTombstones(
      entriesRef.current,
      input,
      tombstonesRef.current,
    );
    // No-op when blocked by tombstone — avoid thrashing storage.
    if (next.length === entriesRef.current.length
      && next.every((entry, index) => entry === entriesRef.current[index])) {
      return false;
    }
    persist(next);
    return true;
  }, [persist, resolveRecordInput]);

  const recordSessions = useCallback((
    sessions: readonly TerminalSession[],
  ) => {
    let next = entriesRef.current;
    let changed = false;
    for (const session of sessions) {
      const input = resolveRecordInput(session);
      if (!input) continue;
      const updated = upsertCodingCliTerminalHistoryEntryRespectingTombstones(
        next,
        input,
        tombstonesRef.current,
      );
      if (updated !== next) {
        next = updated;
        changed = true;
      }
    }
    if (changed) persist(next);
  }, [persist, resolveRecordInput]);

  const mergeScanInputs = useCallback((
    inputs: Array<{
      cwd: string;
      providerId: CodingCliProviderId;
      title?: string;
      resumeCommand?: string;
      entryId?: string;
      localShell?: string;
      localShellName?: string;
    }>,
    options?: {
      bindSessionId?: string;
      providerIdForBind?: CodingCliProviderId;
    },
  ) => {
    let next = entriesRef.current;
    let stones = tombstonesRef.current;
    let matched = 0;
    let changed = false;
    const beforeIds = new Set(next.map((entry) => entry.id));

    for (const input of inputs) {
      matched += 1;
      const dedupeKey = buildCodingCliHistoryDedupeKey(input.cwd, input.providerId);
      const filteredStones = stones.filter(
        (stone) => stone.dedupeKey !== dedupeKey
          && stone.entryId !== (input.entryId || ''),
      );
      if (filteredStones.length !== stones.length) {
        stones = filteredStones;
      }

      const updated = upsertCodingCliTerminalHistoryEntry(next, input);
      if (updated !== next) {
        next = updated;
        changed = true;
      }

      if (options?.bindSessionId && options.providerIdForBind) {
        const row = next.find(
          (entry) => buildCodingCliHistoryDedupeKey(entry.cwd, entry.providerId) === dedupeKey,
        );
        if (row) {
          historyEntryBySessionRef.current.set(options.bindSessionId, row.id);
          lastProviderBySessionRef.current.set(options.bindSessionId, options.providerIdForBind);
        }
      }
    }

    if (stones !== tombstonesRef.current) {
      persistTombstones(stones);
    }
    if (changed) persist(next);

    const afterIds = new Set(next.map((entry) => entry.id));
    let added = 0;
    for (const id of afterIds) {
      if (!beforeIds.has(id)) added += 1;
    }
    return {
      matched,
      added,
      updated: Math.max(0, matched - added),
      total: next.length,
      next,
    };
  }, [persist, persistTombstones]);

  /**
   * Scan currently open local terminals for coding CLIs and merge into history.
   * Intentionally bypasses delete-tombstones so a manual/auto scan can re-add
   * agents that are still running after the user deleted a stale card.
   */
  const scanOpenSessions = useCallback((sessions: readonly TerminalSession[]): CodingCliHistoryScanResult => {
    const inputs: Array<{
      cwd: string;
      providerId: CodingCliProviderId;
      title?: string;
      resumeCommand?: string;
      entryId?: string;
      localShell?: string;
      localShellName?: string;
      sessionId: string;
    }> = [];

    for (const session of sessions) {
      if (session.protocol !== 'local') continue;

      const titleProvider = session.dynamicTitle
        ? inferCodingCliProviderFromTitleSignals(session.dynamicTitle)
        : undefined;
      const nameProvider = session.customName
        ? inferCodingCliProviderFromTitleSignals(session.customName)
        : undefined;
      const startupProvider = session.startupCommand
        ? matchCodingCliProviderFromCommand(session.startupCommand)?.id
        : undefined;
      const providerId = session.codingCliProviderId
        ?? lastProviderBySessionRef.current.get(session.id)
        ?? startupProvider
        ?? titleProvider
        ?? nameProvider
        ?? null;
      if (!providerId) continue;

      // Prefer cwd already cached from prompt/OSC; seed from localStartDir.
      if (!sessionCwdByIdRef.current.get(session.id) && session.localStartDir) {
        sessionCwdByIdRef.current.set(session.id, session.localStartDir);
      }
      if (!sessionCwdByIdRef.current.get(session.id) && session.lastCwd) {
        sessionCwdByIdRef.current.set(session.id, session.lastCwd);
      }

      const input = resolveRecordInput(session, null, providerId);
      if (!input) continue;
      inputs.push({ ...input, sessionId: session.id });
    }

    let next = entriesRef.current;
    let stones = tombstonesRef.current;
    let matched = 0;
    let changed = false;
    const beforeIds = new Set(next.map((entry) => entry.id));

    for (const input of inputs) {
      matched += 1;
      const dedupeKey = buildCodingCliHistoryDedupeKey(input.cwd, input.providerId);
      const filteredStones = stones.filter(
        (stone) => stone.dedupeKey !== dedupeKey
          && stone.entryId !== (input.entryId || ''),
      );
      if (filteredStones.length !== stones.length) {
        stones = filteredStones;
      }

      const updated = upsertCodingCliTerminalHistoryEntry(next, input);
      if (updated !== next) {
        next = updated;
        changed = true;
      }

      const row = next.find(
        (entry) => buildCodingCliHistoryDedupeKey(entry.cwd, entry.providerId) === dedupeKey,
      );
      if (row) {
        historyEntryBySessionRef.current.set(input.sessionId, row.id);
        lastProviderBySessionRef.current.set(input.sessionId, input.providerId);
      }
    }

    if (stones !== tombstonesRef.current) {
      persistTombstones(stones);
    }
    if (changed) persist(next);

    const afterIds = new Set(next.map((entry) => entry.id));
    let added = 0;
    for (const id of afterIds) {
      if (!beforeIds.has(id)) added += 1;
    }
    return {
      matched,
      added,
      updated: Math.max(0, matched - added),
      total: next.length,
      localMatched: matched,
      externalMatched: 0,
    };
  }, [persist, persistTombstones, resolveRecordInput]);

  /**
   * Scan OS-wide coding CLI processes (Windows Terminal / external grok, …)
   * and merge into history. Bypasses tombstones like the in-app session scan.
   */
  const scanExternalProcesses = useCallback(async (): Promise<CodingCliHistoryScanResult> => {
    // Bridge is exposed as window.netcatty (not window.electron).
    const bridge = netcattyBridge.get();
    const hasFn = typeof bridge?.listCodingCliExternalProcesses === 'function';
    console.info(SCAN_LOG, 'external:start', {
      hasBridge: Boolean(bridge),
      hasListFn: hasFn,
      bridgeKeysSample: bridge
        ? Object.keys(bridge).filter((k) => /coding|pty|process|list/i.test(k)).slice(0, 20)
        : [],
    });

    if (!hasFn) {
      console.warn(SCAN_LOG, 'external:unavailable — listCodingCliExternalProcesses missing on window.netcatty');
      return {
        matched: 0,
        added: 0,
        updated: 0,
        total: entriesRef.current.length,
        externalMatched: 0,
        error: 'external-scan-unavailable',
      };
    }

    let processes: ExternalCodingCliProcessSnapshot[] = [];
    let listError: string | undefined;
    try {
      const result = await bridge!.listCodingCliExternalProcesses!();
      processes = result?.processes ?? [];
      listError = result?.error;
      console.info(SCAN_LOG, 'external:raw', {
        count: processes.length,
        error: listError ?? null,
        sample: processes.slice(0, 8).map((p) => ({
          pid: p.pid,
          name: p.name,
          cwd: p.cwd,
          cmd: (p.commandLine || '').slice(0, 120),
        })),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(SCAN_LOG, 'external:ipc-error', message, error);
      return {
        matched: 0,
        added: 0,
        updated: 0,
        total: entriesRef.current.length,
        externalMatched: 0,
        error: message,
      };
    }

    // Do not fall back to home for external processes — that would collapse
    // unrelated agents into one card. Only use real process cwd / --cwd flag.
    const mapped = mapExternalCodingCliProcessesToHistoryInputs(processes);
    console.info(SCAN_LOG, 'external:mapped', {
      matchedProcesses: mapped.matchedProcesses,
      candidates: mapped.candidates.length,
      skippedNoProvider: mapped.skippedNoProvider,
      skippedNoCwd: mapped.skippedNoCwd,
      candidateSample: mapped.candidates.slice(0, 8).map((c) => ({
        pid: c.pid,
        providerId: c.providerId,
        cwd: c.cwd,
        resume: c.resumeCommand,
      })),
    });
    const merge = mergeScanInputs(mapped.candidates);
    console.info(SCAN_LOG, 'external:merged', {
      matched: merge.matched,
      added: merge.added,
      updated: merge.updated,
      total: merge.total,
    });

    return {
      matched: merge.matched,
      added: merge.added,
      updated: merge.updated,
      total: merge.total,
      localMatched: 0,
      externalMatched: mapped.matchedProcesses,
      externalSkippedNoCwd: mapped.skippedNoCwd,
      ...(listError ? { error: listError } : {}),
    };
  }, [mergeScanInputs]);

  /**
   * Full scan: Netcatty local sessions + OS-wide external coding CLI processes.
   */
  const scanAll = useCallback(async (
    sessions: readonly TerminalSession[],
  ): Promise<CodingCliHistoryScanResult> => {
    console.info(SCAN_LOG, 'scanAll:start', {
      sessionCount: sessions.length,
      localSessions: sessions.filter((s) => s.protocol === 'local').length,
    });
    const beforeIds = new Set(entriesRef.current.map((entry) => entry.id));
    const local = scanOpenSessions(sessions);
    console.info(SCAN_LOG, 'scanAll:local', local);
    const external = await scanExternalProcesses();
    console.info(SCAN_LOG, 'scanAll:external', external);
    const afterIds = new Set(entriesRef.current.map((entry) => entry.id));
    let added = 0;
    for (const id of afterIds) {
      if (!beforeIds.has(id)) added += 1;
    }
    const matched = (local.localMatched ?? local.matched) + (external.externalMatched ?? external.matched);
    const summary: CodingCliHistoryScanResult = {
      matched,
      added,
      updated: Math.max(0, matched - added),
      total: entriesRef.current.length,
      localMatched: local.localMatched ?? local.matched,
      externalMatched: external.externalMatched ?? external.matched,
      externalSkippedNoCwd: external.externalSkippedNoCwd,
      ...(external.error ? { error: external.error } : {}),
    };
    console.info(SCAN_LOG, 'scanAll:done', summary);
    return summary;
  }, [scanExternalProcesses, scanOpenSessions]);

  const forgetSession = useCallback((sessionId: string) => {
    sessionCwdByIdRef.current.delete(sessionId);
    lastProviderBySessionRef.current.delete(sessionId);
    lastResumeBySessionRef.current.delete(sessionId);
    historyEntryBySessionRef.current.delete(sessionId);
  }, []);

  const removeEntry = useCallback((id: string) => {
    const entry = entriesRef.current.find((item) => item.id === id);
    if (entry) {
      persistTombstones(
        addCodingCliHistoryTombstone(
          tombstonesRef.current,
          buildTombstoneFromEntry(entry),
        ),
      );
    }
    // Drop jump bindings so live terminals stop targeting this row.
    for (const [sessionId, entryId] of [...historyEntryBySessionRef.current.entries()]) {
      if (entryId === id) {
        historyEntryBySessionRef.current.delete(sessionId);
        lastProviderBySessionRef.current.delete(sessionId);
        lastResumeBySessionRef.current.delete(sessionId);
      }
    }
    persist(removeCodingCliTerminalHistoryEntry(entriesRef.current, id));
  }, [persist, persistTombstones]);

  const clearAll = useCallback(() => {
    // Tombstone every current row so open terminals cannot repopulate the list.
    let stones = tombstonesRef.current;
    for (const entry of entriesRef.current) {
      stones = addCodingCliHistoryTombstone(stones, buildTombstoneFromEntry(entry));
    }
    persistTombstones(stones);
    historyEntryBySessionRef.current.clear();
    lastProviderBySessionRef.current.clear();
    lastResumeBySessionRef.current.clear();
    persist([]);
  }, [persist, persistTombstones]);

  const setPinned = useCallback((id: string, pinned: boolean) => {
    persist(setCodingCliTerminalHistoryPinned(entriesRef.current, id, pinned));
  }, [persist]);

  return {
    entries,
    rememberSessionCwd,
    getSessionCwd,
    rememberProvider,
    rememberResumeCommand,
    bindSessionToHistoryEntry,
    touchHistoryEntry,
    recordFromSession,
    recordSessions,
    scanOpenSessions,
    scanExternalProcesses,
    scanAll,
    forgetSession,
    removeEntry,
    clearAll,
    setPinned,
  };
}
