import assert from "node:assert/strict";
import test from "node:test";

import {
  readTerminalClipboardText,
  writeTerminalClipboardText,
} from "./terminalClipboardAccess.ts";

test("readTerminalClipboardText falls back to navigator when bridge is missing", async () => {
  const originalNavigator = globalThis.navigator;
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: {
      clipboard: {
        readText: async () => "from-navigator",
      },
    },
  });

  try {
    assert.equal(await readTerminalClipboardText(), "from-navigator");
  } finally {
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: originalNavigator,
    });
  }
});

test("writeTerminalClipboardText falls back to navigator when bridge write fails open", async () => {
  const writes: string[] = [];
  const originalNavigator = globalThis.navigator;
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: {
      clipboard: {
        writeText: async (text: string) => {
          writes.push(text);
        },
      },
    },
  });

  try {
    assert.equal(await writeTerminalClipboardText("hello"), true);
    assert.deepEqual(writes, ["hello"]);
    assert.equal(await writeTerminalClipboardText(""), false);
  } finally {
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: originalNavigator,
    });
  }
});
