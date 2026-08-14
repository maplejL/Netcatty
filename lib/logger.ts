import { sanitizeAppLogValue, type AppLogLevel } from "../domain/appLogs";

type LogArgs = unknown[];

const isDev =
  typeof import.meta !== "undefined" &&
  typeof import.meta.env !== "undefined" &&
  !!import.meta.env.DEV;

const FLUSH_MS = 40;
const MAX_BATCH = 40;

type PendingEntry = {
  level: AppLogLevel;
  source: string;
  message: string;
  extra?: unknown;
  ts: string;
};

let pending: PendingEntry[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;

const formatArg = (value: unknown): string => {
  if (typeof value === "string") return value;
  if (value instanceof Error) return value.message;
  try {
    return JSON.stringify(sanitizeAppLogValue(value));
  } catch {
    return String(value);
  }
};

const splitArgs = (args: LogArgs): { source: string; message: string; extra?: unknown } => {
  const first = args[0];
  const message = args.map(formatArg).join(" ");
  const sourceMatch = typeof first === "string" ? first.match(/^\[([^\]]+)\]/) : null;
  const extra = args.length > 1 && typeof args[1] === "object" && args[1] !== null && !(args[1] instanceof Error)
    ? sanitizeAppLogValue(args.length === 2 ? args[1] : args.slice(1))
    : args.length > 1
      ? sanitizeAppLogValue(args.slice(1))
      : undefined;
  return {
    source: sourceMatch?.[1] || "renderer",
    message,
    extra,
  };
};

const flushPending = () => {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  if (pending.length === 0) return;
  const batch = pending;
  pending = [];
  try {
    if (typeof window === "undefined") return;
    const write = window.netcatty?.writeAppLogs;
    if (!write) return;
    void write(batch).catch(() => {});
  } catch {
    // ignore
  }
};

const persist = (level: AppLogLevel, args: LogArgs) => {
  try {
    if (typeof window === "undefined") return;
    const { source, message, extra } = splitArgs(args);
    pending.push({
      level,
      source,
      message,
      extra,
      ts: new Date().toISOString(),
    });
    if (pending.length >= MAX_BATCH) {
      flushPending();
      return;
    }
    if (!flushTimer) {
      flushTimer = setTimeout(flushPending, FLUSH_MS);
    }
  } catch {
    // ignore
  }
};

export const logger = {
  trace: (...args: LogArgs) => {
    persist("trace", args);
    if (isDev) console.debug(...args);
  },
  debug: (...args: LogArgs) => {
    persist("debug", args);
    if (isDev) console.debug(...args);
  },
  info: (...args: LogArgs) => {
    persist("info", args);
    if (isDev) console.info(...args);
  },
  warn: (...args: LogArgs) => {
    persist("warn", args);
    console.warn(...args);
  },
  error: (...args: LogArgs) => {
    persist("error", args);
    console.error(...args);
  },
};
