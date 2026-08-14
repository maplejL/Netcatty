import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_APP_LOGS_RETENTION_DAYS,
  normalizeAppLogRetentionDays,
  sanitizeAppLogValue,
  shouldWriteAppLog,
} from "./appLogs";

test("normalizeAppLogRetentionDays accepts configured day options", () => {
  assert.equal(normalizeAppLogRetentionDays(1), 1);
  assert.equal(normalizeAppLogRetentionDays("14"), 14);
  assert.equal(normalizeAppLogRetentionDays(30), 30);
});

test("normalizeAppLogRetentionDays falls back for invalid values", () => {
  assert.equal(normalizeAppLogRetentionDays(2), DEFAULT_APP_LOGS_RETENTION_DAYS);
  assert.equal(normalizeAppLogRetentionDays("nope"), DEFAULT_APP_LOGS_RETENTION_DAYS);
  assert.equal(normalizeAppLogRetentionDays(undefined), DEFAULT_APP_LOGS_RETENTION_DAYS);
});

test("shouldWriteAppLog writes trace only when enabled", () => {
  assert.equal(shouldWriteAppLog(true, "trace"), true);
  assert.equal(shouldWriteAppLog(false, "trace"), false);
  assert.equal(shouldWriteAppLog(false, "error"), false);
});

test("sanitizeAppLogValue redacts secrets and truncates long strings", () => {
  const sanitized = sanitizeAppLogValue({
    path: "/etc/nginx",
    password: "hunter2",
    sudoProbePassword: "rootpw",
    nested: { privateKey: "-----BEGIN" },
  }) as Record<string, unknown>;
  assert.equal(sanitized.path, "/etc/nginx");
  assert.equal(sanitized.password, "[Redacted]");
  assert.equal(sanitized.sudoProbePassword, "[Redacted]");
  assert.deepEqual(sanitized.nested, { privateKey: "[Redacted]" });
  assert.equal((sanitizeAppLogValue("x".repeat(2001)) as string).endsWith("..."), true);
});
