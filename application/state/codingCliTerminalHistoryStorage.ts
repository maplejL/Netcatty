import {
  sanitizeCodingCliHistoryTombstones,
  sanitizeCodingCliTerminalHistory,
  type CodingCliHistoryTombstone,
  type CodingCliTerminalHistoryEntry,
} from '../../domain/codingCliTerminalHistory';
import {
  STORAGE_KEY_CODING_CLI_TERMINAL_HISTORY,
  STORAGE_KEY_CODING_CLI_TERMINAL_HISTORY_TOMBSTONES,
} from '../../infrastructure/config/storageKeys';
import { localStorageAdapter } from '../../infrastructure/persistence/localStorageAdapter';

type HistoryStorage = {
  read<T>(key: string): T | null;
  write<T>(key: string, value: T): boolean;
};

export function loadCodingCliTerminalHistory(
  storage: HistoryStorage = localStorageAdapter,
  storageKey = STORAGE_KEY_CODING_CLI_TERMINAL_HISTORY,
): CodingCliTerminalHistoryEntry[] {
  const raw = storage.read<unknown>(storageKey);
  if (raw == null) return [];
  const cleaned = sanitizeCodingCliTerminalHistory(raw);
  // Rewrite if sanitizer dropped invalid records.
  if (Array.isArray(raw) && cleaned.length !== raw.length) {
    storage.write(storageKey, cleaned);
  }
  return cleaned;
}

export function saveCodingCliTerminalHistory(
  entries: readonly CodingCliTerminalHistoryEntry[],
  storage: HistoryStorage = localStorageAdapter,
  storageKey = STORAGE_KEY_CODING_CLI_TERMINAL_HISTORY,
): boolean {
  return storage.write(storageKey, sanitizeCodingCliTerminalHistory(entries));
}

export function loadCodingCliHistoryTombstones(
  storage: HistoryStorage = localStorageAdapter,
  storageKey = STORAGE_KEY_CODING_CLI_TERMINAL_HISTORY_TOMBSTONES,
): CodingCliHistoryTombstone[] {
  const raw = storage.read<unknown>(storageKey);
  if (raw == null) return [];
  return sanitizeCodingCliHistoryTombstones(raw);
}

export function saveCodingCliHistoryTombstones(
  tombstones: readonly CodingCliHistoryTombstone[],
  storage: HistoryStorage = localStorageAdapter,
  storageKey = STORAGE_KEY_CODING_CLI_TERMINAL_HISTORY_TOMBSTONES,
): boolean {
  return storage.write(storageKey, sanitizeCodingCliHistoryTombstones(tombstones));
}
