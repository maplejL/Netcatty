/**
 * App diagnostic log bridge.
 *
 * Daily JSONL files under {userData}/app-logs/app-YYYY-MM-DD.log.
 * Default min level is trace so follow-cwd / SFTP / SSH probe issues can be
 * reconstructed after the fact. Retention is configurable from System settings.
 */

const fs = require("node:fs");
const path = require("node:path");

const LEVEL_RANK = { trace: 10, debug: 20, info: 30, warn: 40, error: 50 };
const RETENTION_OPTIONS = [1, 3, 7, 14, 30];
const DEFAULT_RETENTION_DAYS = 7;
const FILE_NAME_RE = /^app-\d{4}-\d{2}-\d{2}\.log$/;
const SENSITIVE_KEY = /password|passphrase|privatekey|secret|token|authorization|cookie|sudoprobe/i;
const MAX_QUEUE = 200;
const FLUSH_MS = 40;

let logDir = null;
let electronApp = null;
let electronShell = null;
let writeQueue = [];
let flushTimer = null;
let testNowMs = null;

const config = {
  enabled: true,
  retentionDays: DEFAULT_RETENTION_DAYS,
  minLevel: "trace",
};

function normalizeRetentionDays(value) {
  const parsed = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
  return RETENTION_OPTIONS.includes(parsed) ? parsed : DEFAULT_RETENTION_DAYS;
}

function normalizeLevel(value) {
  return Object.prototype.hasOwnProperty.call(LEVEL_RANK, value) ? value : "trace";
}

function shouldWrite(level) {
  if (!config.enabled) return false;
  const rank = LEVEL_RANK[normalizeLevel(level)];
  return rank >= LEVEL_RANK[config.minLevel];
}

function sanitizeValue(value, depth) {
  if (depth > 4) return "[MaxDepth]";
  if (value == null) return value;
  if (typeof value === "string") return value.length > 2000 ? `${value.slice(0, 2000)}...` : value;
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (value instanceof Error) return { name: value.name, message: value.message };
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => sanitizeValue(item, depth + 1));
  if (typeof value === "object") {
    const out = {};
    for (const key of Object.keys(value).slice(0, 40)) {
      out[key] = SENSITIVE_KEY.test(key) ? "[Redacted]" : sanitizeValue(value[key], depth + 1);
    }
    return out;
  }
  return String(value);
}

function nowMs() {
  return testNowMs == null ? Date.now() : testNowMs;
}

function todayFileName(atMs) {
  const d = new Date(atMs ?? nowMs());
  const ymd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return `app-${ymd}.log`;
}

function resolveUserDataPath() {
  try {
    if (electronApp?.getPath) return electronApp.getPath("userData");
  } catch {
    // fall through
  }
  try {
    const { app } = require("electron");
    return app?.getPath?.("userData") ?? null;
  } catch {
    return null;
  }
}

function ensureLogDir() {
  if (logDir) return logDir;
  try {
    const userDataPath = resolveUserDataPath();
    if (!userDataPath) return null;
    logDir = path.join(userDataPath, "app-logs");
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    return logDir;
  } catch {
    return null;
  }
}

function pruneOldLogs(atMs) {
  try {
    const dir = ensureLogDir();
    if (!dir) return 0;
    const cutoff = (atMs ?? nowMs()) - config.retentionDays * 86400000;
    const files = fs.readdirSync(dir);
    let deleted = 0;
    for (const file of files) {
      if (!FILE_NAME_RE.test(file)) continue;
      try {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);
        if (stat.mtimeMs < cutoff) {
          fs.unlinkSync(filePath);
          deleted += 1;
        }
      } catch {
        // skip
      }
    }
    return deleted;
  } catch {
    return 0;
  }
}

function buildEntry(level, source, message, extra, timestamp) {
  return {
    ts: timestamp || new Date(nowMs()).toISOString(),
    level: normalizeLevel(level),
    source: typeof source === "string" && source.trim() ? source.trim() : "app",
    message: typeof message === "string" ? message : String(message ?? ""),
    extra: extra === undefined ? undefined : sanitizeValue(extra, 0),
    pid: process.pid,
  };
}

function appendEntries(entries) {
  const dir = ensureLogDir();
  if (!dir || !entries.length) return;
  const filePath = path.join(dir, todayFileName());
  const payload = entries.map((entry) => JSON.stringify(entry)).join("\n") + "\n";
  fs.appendFileSync(filePath, payload, "utf-8");
}

function flushQueue() {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  if (!writeQueue.length) return;
  const batch = writeQueue;
  writeQueue = [];
  try {
    appendEntries(batch);
  } catch {
    // Never throw from the diagnostic logger.
  }
}

function enqueue(entry, immediate) {
  writeQueue.push(entry);
  if (writeQueue.length >= MAX_QUEUE || immediate) {
    flushQueue();
    return;
  }
  if (!flushTimer) {
    flushTimer = setTimeout(flushQueue, FLUSH_MS);
    if (typeof flushTimer.unref === "function") flushTimer.unref();
  }
}

function writeLog(level, source, message, extra) {
  try {
    if (!shouldWrite(level)) return false;
    const immediate = LEVEL_RANK[normalizeLevel(level)] >= LEVEL_RANK.warn;
    enqueue(buildEntry(level, source, message, extra), immediate);
    return true;
  } catch {
    return false;
  }
}

function writeLogs(entries) {
  if (!Array.isArray(entries) || entries.length === 0) return { written: 0 };
  let written = 0;
  let immediate = false;
  const accepted = [];
  for (const raw of entries.slice(0, MAX_QUEUE)) {
    const level = normalizeLevel(raw?.level);
    if (!shouldWrite(level)) continue;
    accepted.push(buildEntry(level, raw?.source, raw?.message, raw?.extra, raw?.ts));
    if (LEVEL_RANK[level] >= LEVEL_RANK.warn) immediate = true;
    written += 1;
  }
  if (accepted.length) {
    for (const entry of accepted) enqueue(entry, false);
    if (immediate) flushQueue();
  }
  return { written };
}

function setConfig(next) {
  if (!next || typeof next !== "object") {
    return { ...config, path: ensureLogDir() };
  }
  if (typeof next.enabled === "boolean") config.enabled = next.enabled;
  if (next.minLevel != null) config.minLevel = normalizeLevel(next.minLevel);
  if (next.retentionDays != null) {
    config.retentionDays = normalizeRetentionDays(next.retentionDays);
    pruneOldLogs();
  }
  return getInfo();
}

function getInfo() {
  const dir = ensureLogDir();
  let fileCount = 0;
  let totalSize = 0;
  if (dir) {
    try {
      for (const file of fs.readdirSync(dir)) {
        if (!FILE_NAME_RE.test(file)) continue;
        fileCount += 1;
        try {
          totalSize += fs.statSync(path.join(dir, file)).size;
        } catch {
          // skip
        }
      }
    } catch {
      // skip
    }
  }
  return {
    enabled: config.enabled,
    retentionDays: config.retentionDays,
    minLevel: config.minLevel,
    path: dir || "",
    exists: Boolean(dir),
    fileCount,
    totalSize,
  };
}

async function listLogs() {
  const dir = ensureLogDir();
  if (!dir) return [];
  try {
    const results = [];
    for (const file of await fs.promises.readdir(dir)) {
      if (!FILE_NAME_RE.test(file)) continue;
      try {
        const stat = await fs.promises.stat(path.join(dir, file));
        results.push({
          fileName: file,
          date: file.replace("app-", "").replace(".log", ""),
          size: stat.size,
        });
      } catch {
        // skip
      }
    }
    results.sort((a, b) => b.date.localeCompare(a.date));
    return results;
  } catch {
    return [];
  }
}

async function clearLogs() {
  flushQueue();
  const dir = ensureLogDir();
  if (!dir) return { deletedCount: 0 };
  let deletedCount = 0;
  try {
    for (const file of await fs.promises.readdir(dir)) {
      if (!FILE_NAME_RE.test(file)) continue;
      try {
        await fs.promises.unlink(path.join(dir, file));
        deletedCount += 1;
      } catch {
        // skip
      }
    }
  } catch {
    // skip
  }
  return { deletedCount };
}

async function openDir() {
  const dir = ensureLogDir();
  if (!dir || !electronShell?.openPath) return { success: false };
  try {
    const errorMessage = await electronShell.openPath(dir);
    return { success: !errorMessage };
  } catch {
    return { success: false };
  }
}

function init(deps) {
  const { electronModule } = deps || {};
  const { app, shell } = electronModule || {};
  electronApp = app || null;
  electronShell = shell || null;
  ensureLogDir();
  pruneOldLogs();
  writeLog("info", "appLog", "diagnostic logger ready", getInfo());
}

function registerHandlers(ipcMain) {
  ipcMain.handle("netcatty:appLogs:write", async (_event, payload) => writeLogs(payload?.entries));
  ipcMain.handle("netcatty:appLogs:setConfig", async (_event, payload) => setConfig(payload));
  ipcMain.handle("netcatty:appLogs:getInfo", async () => getInfo());
  ipcMain.handle("netcatty:appLogs:list", async () => listLogs());
  ipcMain.handle("netcatty:appLogs:clear", async () => clearLogs());
  ipcMain.handle("netcatty:appLogs:openDir", async () => openDir());
}

function _setTestEnv(overrides) {
  if (overrides?.logDir != null) logDir = overrides.logDir;
  if (overrides?.nowMs != null) testNowMs = overrides.nowMs;
  if (overrides?.resetConfig) {
    config.enabled = true;
    config.retentionDays = DEFAULT_RETENTION_DAYS;
    config.minLevel = "trace";
  }
  writeQueue = [];
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
}

module.exports = {
  init,
  registerHandlers,
  writeLog,
  writeLogs,
  setConfig,
  getInfo,
  pruneOldLogs,
  sanitizeValue,
  normalizeRetentionDays,
  _setTestEnv,
  flushQueue,
};
