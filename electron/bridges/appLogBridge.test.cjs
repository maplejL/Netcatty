const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const bridge = require("./appLogBridge.cjs");

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "netcatty-app-logs-"));
}

test("writeLog persists trace entries and redacts secrets", () => {
  const dir = makeTempDir();
  const now = Date.UTC(2026, 7, 14, 12, 0, 0);
  bridge._setTestEnv({ logDir: dir, nowMs: now, resetConfig: true });
  bridge.setConfig({ enabled: true, retentionDays: 7 });
  assert.equal(bridge.writeLog("trace", "sftp.follow", "navigate", { path: "/tmp", password: "secret" }), true);
  bridge.flushQueue();
  const files = fs.readdirSync(dir).filter((name) => name.endsWith(".log"));
  assert.equal(files.length, 1);
  const line = fs.readFileSync(path.join(dir, files[0]), "utf8").trim();
  const entry = JSON.parse(line);
  assert.equal(entry.level, "trace");
  assert.equal(entry.source, "sftp.follow");
  assert.equal(entry.message, "navigate");
  assert.equal(entry.extra.path, "/tmp");
  assert.equal(entry.extra.password, "[Redacted]");
});

test("disabled logger drops trace writes", () => {
  const dir = makeTempDir();
  bridge._setTestEnv({ logDir: dir, nowMs: Date.UTC(2026, 7, 14), resetConfig: true });
  bridge.setConfig({ enabled: false });
  assert.equal(bridge.writeLog("trace", "sftp.follow", "skip"), false);
  bridge.flushQueue();
  assert.equal(fs.readdirSync(dir).filter((name) => name.endsWith(".log")).length, 0);
});

test("pruneOldLogs deletes files older than retention days", () => {
  const dir = makeTempDir();
  const now = Date.UTC(2026, 7, 14, 12, 0, 0);
  bridge._setTestEnv({ logDir: dir, nowMs: now, resetConfig: true });
  bridge.setConfig({ enabled: true, retentionDays: 3 });
  const keep = path.join(dir, "app-2026-08-14.log");
  const drop = path.join(dir, "app-2026-08-01.log");
  fs.writeFileSync(keep, "{}\n");
  fs.writeFileSync(drop, "{}\n");
  const old = now - 10 * 86400000;
  fs.utimesSync(drop, new Date(old), new Date(old));
  assert.equal(bridge.pruneOldLogs(now), 1);
  assert.equal(fs.existsSync(keep), true);
  assert.equal(fs.existsSync(drop), false);
});

test("normalizeRetentionDays rejects unsupported values", () => {
  assert.equal(bridge.normalizeRetentionDays(7), 7);
  assert.equal(bridge.normalizeRetentionDays(2), 7);
  assert.equal(bridge.normalizeRetentionDays("30"), 30);
});
