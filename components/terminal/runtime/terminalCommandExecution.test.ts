import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import {
  pickSubmittedTerminalCommand,
  recordTerminalCommandExecution,
  resolveSubmittedTerminalCommand,
} from "./terminalCommandExecution";
import {
  configureTerminalCommandTiming,
  getTerminalCommandTimingTraces,
  resetTerminalCommandTimingStore,
  setTerminalCommandTimingDebugEnabled,
} from "./terminalCommandTiming";

beforeEach(() => {
  resetTerminalCommandTimingStore();
  configureTerminalCommandTiming({ persist: false });
  setTerminalCommandTimingDebugEnabled(true);
});

afterEach(() => {
  setTerminalCommandTimingDebugEnabled(false);
  resetTerminalCommandTimingStore();
});

test("resolveSubmittedTerminalCommand trims buffer command", () => {
  assert.equal(resolveSubmittedTerminalCommand("  ls -la  "), "ls -la");
  assert.equal(resolveSubmittedTerminalCommand("   "), "");
});

test("pickSubmittedTerminalCommand prefers longer live prompt after tab complete", () => {
  // User typed `cd /ho` then Tab → screen shows `cd /home/`, buffer still short.
  assert.equal(pickSubmittedTerminalCommand("cd /ho", "cd /home/"), "cd /home/");
  assert.equal(pickSubmittedTerminalCommand("cd /home/", "cd /ho"), "cd /home/");
  // History recall / remote edit: screen differs entirely → prefer screen.
  assert.equal(pickSubmittedTerminalCommand("ls", "uptime"), "uptime");
  // Empty sides.
  assert.equal(pickSubmittedTerminalCommand("", "ll"), "ll");
  assert.equal(pickSubmittedTerminalCommand("ll", ""), "ll");
  assert.equal(pickSubmittedTerminalCommand("  ", "  "), "");
});

test("recordTerminalCommandExecution starts timing when enabled", () => {
  const commandBufferRef = { current: "uptime" };
  const started = recordTerminalCommandExecution(
    commandBufferRef.current,
    {
      host: { id: "h1", label: "box", hostname: "10.1.2.3" },
      sessionId: "ui-session",
      sessionRef: { current: "backend-session" },
      commandBufferRef,
    },
    null,
  );
  // Without a real xterm, shell-history gate returns true (no term).
  assert.equal(started, "uptime");
  const traces = getTerminalCommandTimingTraces();
  assert.equal(traces.length, 1);
  assert.equal(traces[0].command, "uptime");
  assert.equal(traces[0].sessionId, "backend-session");
  assert.equal(traces[0].hostLabel, "box");
  assert.equal(traces[0].hostHostname, "10.1.2.3");
});

test("recordTerminalCommandExecution is no-op when timing disabled", () => {
  setTerminalCommandTimingDebugEnabled(false);
  const commandBufferRef = { current: "ls" };
  recordTerminalCommandExecution(
    commandBufferRef.current,
    {
      host: { id: "h1", label: "box" },
      sessionId: "s1",
      commandBufferRef,
    },
    null,
  );
  assert.equal(getTerminalCommandTimingTraces().length, 0);
});
