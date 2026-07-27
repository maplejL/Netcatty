import test from "node:test";
import assert from "node:assert/strict";

import {
  shouldScrollOnTerminalInput,
  shouldScrollOnTerminalOutput,
  shouldEnableNativeUserInputAutoScroll,
} from "./terminalScroll.ts";

test("Ctrl+C follows normal key-press scroll settings (does not force bottom)", () => {
  assert.equal(
    shouldScrollOnTerminalInput({ scrollOnInput: true, scrollOnKeyPress: false }, "\x03"),
    false,
  );
  assert.equal(
    shouldScrollOnTerminalInput({ scrollOnInput: false, scrollOnKeyPress: false }, "\x03"),
    false,
  );
  assert.equal(
    shouldScrollOnTerminalInput({ scrollOnInput: false, scrollOnKeyPress: true }, "\x03"),
    true,
  );
});

test("printable input still respects scrollOnInput", () => {
  assert.equal(
    shouldScrollOnTerminalInput({ scrollOnInput: true, scrollOnKeyPress: false }, "a"),
    true,
  );
  assert.equal(
    shouldScrollOnTerminalInput({ scrollOnInput: false, scrollOnKeyPress: false }, "a"),
    false,
  );
});

test("non-printable key presses still respect scrollOnKeyPress", () => {
  assert.equal(
    shouldScrollOnTerminalInput({ scrollOnInput: true, scrollOnKeyPress: false }, "\r"),
    false,
  );
  assert.equal(
    shouldScrollOnTerminalInput({ scrollOnInput: true, scrollOnKeyPress: true }, "\r"),
    true,
  );
});

test("output and native input scroll defaults stay unchanged", () => {
  assert.equal(shouldScrollOnTerminalOutput({}), false);
  assert.equal(shouldEnableNativeUserInputAutoScroll({}), true);
});
