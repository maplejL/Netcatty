/**
 * Per-session quarantine after forced cancel or interactive-prompt failure.
 * Blocks further AI terminal_execute / terminal_start until the shell idle
 * prompt is observed again (or the session disappears).
 */
"use strict";

const { getFreshIdlePrompt } = require("./shellUtils.cjs");
const { isQuarantineWorthyError } = require("./interactivePromptDetect.cjs");

/** @type {Map<string, { at: number, reason: string }>} */
const quarantinedSessions = new Map();

const SESSION_STILL_BUSY_CODE = "SESSION_STILL_BUSY";
const SESSION_STILL_BUSY_ERROR =
  "SESSION_STILL_BUSY: Previous command may still be running on this terminal (interactive prompt or ignored Ctrl+C). Manually Ctrl+C / kill the process in the terminal, wait for the shell prompt, then retry.";

function quarantineSession(sessionId, reason = "busy") {
  if (!sessionId || typeof sessionId !== "string") return;
  quarantinedSessions.set(sessionId, {
    at: Date.now(),
    reason: String(reason || "busy"),
  });
}

function clearSessionQuarantine(sessionId) {
  if (!sessionId) return;
  quarantinedSessions.delete(sessionId);
}

function isSessionQuarantined(sessionId) {
  return quarantinedSessions.has(sessionId);
}

/**
 * If the session is quarantined, return a stable error object unless the
 * live idle prompt has been refreshed after quarantine started.
 *
 * @param {string} sessionId
 * @param {object|null|undefined} session
 * @returns {{ ok: false, code: string, error: string } | null}
 */
function checkSessionQuarantine(sessionId, session) {
  const entry = quarantinedSessions.get(sessionId);
  if (!entry) return null;

  if (!session) {
    quarantinedSessions.delete(sessionId);
    return null;
  }

  const prompt = getFreshIdlePrompt(session);
  const promptAt = Number(session.lastIdlePromptAt) || 0;
  if (prompt && promptAt > entry.at) {
    quarantinedSessions.delete(sessionId);
    return null;
  }

  return {
    ok: false,
    code: SESSION_STILL_BUSY_CODE,
    error: SESSION_STILL_BUSY_ERROR,
  };
}

function quarantineFromResult(sessionId, result) {
  if (!sessionId) return false;
  if (isQuarantineWorthyError(result?.error)) {
    quarantineSession(sessionId, result.error);
    return true;
  }
  return false;
}

/** @internal test helper */
function _resetSessionQuarantineForTests() {
  quarantinedSessions.clear();
}

module.exports = {
  quarantineSession,
  clearSessionQuarantine,
  isSessionQuarantined,
  checkSessionQuarantine,
  quarantineFromResult,
  isQuarantineWorthyError,
  SESSION_STILL_BUSY_CODE,
  SESSION_STILL_BUSY_ERROR,
  _resetSessionQuarantineForTests,
};
