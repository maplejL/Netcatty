import test from "node:test";
import assert from "node:assert/strict";

import {
  clearFocusedTerminalClipboardActionsGetter,
  runFocusedTerminalClipboardAction,
  setFocusedTerminalClipboardActionsGetter,
} from "./focusedTerminalClipboardActions";

test("runFocusedTerminalClipboardAction invokes the focused paste handler", () => {
  let pasted = 0;
  setFocusedTerminalClipboardActionsGetter("t1", () => ({
    onPaste: () => {
      pasted += 1;
    },
  }));

  assert.equal(runFocusedTerminalClipboardAction("paste"), true);
  assert.equal(pasted, 1);

  clearFocusedTerminalClipboardActionsGetter("t1");
  assert.equal(runFocusedTerminalClipboardAction("paste"), false);
});

test("clearing a different owner does not drop the active getter", () => {
  let pasted = 0;
  setFocusedTerminalClipboardActionsGetter("t1", () => ({
    onPaste: () => {
      pasted += 1;
    },
  }));
  clearFocusedTerminalClipboardActionsGetter("t2");
  assert.equal(runFocusedTerminalClipboardAction("paste"), true);
  assert.equal(pasted, 1);
  clearFocusedTerminalClipboardActionsGetter("t1");
});

test("runFocusedTerminalClipboardAction returns false for unknown actions", () => {
  setFocusedTerminalClipboardActionsGetter("t1", () => ({
    onPaste: () => undefined,
  }));
  assert.equal(runFocusedTerminalClipboardAction("openHosts"), false);
  clearFocusedTerminalClipboardActionsGetter("t1");
});
