import assert from "node:assert/strict";
import test from "node:test";

import {
  consumePendingInterruptScroll,
  forceTerminalScrollToBottomForInterrupt,
  markPendingInterruptScroll,
  shouldForceScrollAfterInterruptDisplay,
} from "./terminalInterruptScroll.ts";

test("force interrupt scroll marks pending and scrolls immediately", () => {
  let scrolls = 0;
  const term = {
    scrollToBottom() {
      scrolls += 1;
    },
  };
  forceTerminalScrollToBottomForInterrupt(term);
  assert.equal(scrolls, 1);
  assert.equal(consumePendingInterruptScroll(term), true);
  assert.equal(consumePendingInterruptScroll(term), false);
});

test("mark pending interrupt scroll can be consumed later", () => {
  const term = {};
  markPendingInterruptScroll(term);
  assert.equal(consumePendingInterruptScroll(term), true);
});

test("interrupt display reasons that resume the viewport force scroll", () => {
  assert.equal(shouldForceScrollAfterInterruptDisplay("interrupt-echo"), true);
  assert.equal(shouldForceScrollAfterInterruptDisplay("prompt-candidate"), true);
  assert.equal(shouldForceScrollAfterInterruptDisplay("inactive"), false);
  assert.equal(shouldForceScrollAfterInterruptDisplay("draining"), false);
});
