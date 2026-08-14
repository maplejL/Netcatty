export const APP_LOG_LEVELS = ["trace", "debug", "info", "warn", "error"] as const;
export type AppLogLevel = (typeof APP_LOG_LEVELS)[number];

export const APP_LOG_LEVEL_RANK: Record<AppLogLevel, number> = {
  trace: 10,
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
};

export const APP_LOG_RETENTION_DAY_OPTIONS = [1, 3, 7, 14, 30] as const;
export type AppLogRetentionDays = (typeof APP_LOG_RETENTION_DAY_OPTIONS)[number];

export const DEFAULT_APP_LOGS_ENABLED = true;
export const DEFAULT_APP_LOGS_RETENTION_DAYS: AppLogRetentionDays = 7;
export const DEFAULT_APP_LOGS_MIN_LEVEL: AppLogLevel = "trace";

const SENSITIVE_KEY = /password|passphrase|privatekey|secret|token|authorization|cookie|sudoprobe/i;

export const isAppLogLevel = (value: unknown): value is AppLogLevel =>
  typeof value === "string" && (APP_LOG_LEVELS as readonly string[]).includes(value);

export const normalizeAppLogRetentionDays = (value: unknown): AppLogRetentionDays => {
  const parsed = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
  if ((APP_LOG_RETENTION_DAY_OPTIONS as readonly number[]).includes(parsed)) {
    return parsed as AppLogRetentionDays;
  }
  return DEFAULT_APP_LOGS_RETENTION_DAYS;
};

export const shouldWriteAppLog = (
  enabled: boolean,
  level: AppLogLevel,
  minLevel: AppLogLevel = DEFAULT_APP_LOGS_MIN_LEVEL,
): boolean => {
  if (!enabled) return false;
  return APP_LOG_LEVEL_RANK[level] >= APP_LOG_LEVEL_RANK[minLevel];
};

export const sanitizeAppLogValue = (value: unknown, depth = 0): unknown => {
  if (depth > 4) return "[MaxDepth]";
  if (value == null) return value;
  if (typeof value === "string") return value.length > 2000 ? `${value.slice(0, 2000)}...` : value;
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (value instanceof Error) return { name: value.name, message: value.message };
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => sanitizeAppLogValue(item, depth + 1));
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(record).slice(0, 40)) {
      out[key] = SENSITIVE_KEY.test(key) ? "[Redacted]" : sanitizeAppLogValue(record[key], depth + 1);
    }
    return out;
  }
  return String(value);
};
