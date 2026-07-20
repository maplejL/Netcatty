import test from "node:test";
import assert from "node:assert/strict";

import {
  resolveTerminalSessionExitIntent,
  shouldCloseTerminalPopupOnExit,
} from "./resolveTerminalSessionExitIntent.ts";

test("shell exit / Ctrl+D keeps the tab so scrollback and reconnect remain", () => {
  assert.deepEqual(
    resolveTerminalSessionExitIntent({ reason: "exited", exitCode: 0 }),
    { kind: "markDisconnected" },
  );
  assert.deepEqual(
    resolveTerminalSessionExitIntent({ reason: "exited", exitCode: 1 }),
    { kind: "markDisconnected" },
  );
});

test("backend timeout events keep the tab and mark it disconnected", () => {
  assert.deepEqual(
    resolveTerminalSessionExitIntent({ reason: "timeout", error: "idle timeout" }),
    { kind: "markDisconnected" },
  );
});

test("backend error events keep the tab and mark it disconnected", () => {
  assert.deepEqual(
    resolveTerminalSessionExitIntent({ reason: "error", error: "connection reset" }),
    { kind: "markDisconnected" },
  );
});

test("backend closed events keep the tab and mark it disconnected", () => {
  assert.deepEqual(
    resolveTerminalSessionExitIntent({ reason: "closed", exitCode: 0 }),
    { kind: "markDisconnected" },
  );
});

test("terminal popup only auto-closes after clean command exit", () => {
  assert.equal(shouldCloseTerminalPopupOnExit({ reason: "exited", exitCode: 0 }), true);
  assert.equal(shouldCloseTerminalPopupOnExit({ reason: "exited", exitCode: 1 }), false);
  assert.equal(shouldCloseTerminalPopupOnExit({ reason: "error", error: "connection reset" }), false);
  assert.equal(shouldCloseTerminalPopupOnExit({ reason: "closed", exitCode: 0 }), false);
});
