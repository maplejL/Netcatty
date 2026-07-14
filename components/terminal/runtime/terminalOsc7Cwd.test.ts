import test from "node:test";
import assert from "node:assert/strict";

import { parseOsc7CwdPayload } from "./terminalOsc7Cwd";

test("parseOsc7CwdPayload extracts paths from standard file:// OSC 7 payloads", () => {
  assert.equal(parseOsc7CwdPayload("file://host/home/user"), "/home/user");
  assert.equal(parseOsc7CwdPayload("file:///var/log"), "/var/log");
  assert.equal(parseOsc7CwdPayload("file://localhost/tmp/a%20b"), "/tmp/a b");
  assert.equal(parseOsc7CwdPayload("/srv/app"), "/srv/app");
});

test("parseOsc7CwdPayload recovers paths when hostname is not a valid URL authority", () => {
  // Colons in hostnames break WHATWG URL parsing; manual extraction must still work.
  assert.equal(parseOsc7CwdPayload("file://a:b/home/user"), "/home/user");
  assert.equal(parseOsc7CwdPayload("file://user@host/tmp/x"), "/tmp/x");
});

test("parseOsc7CwdPayload accepts Windows-style bare paths", () => {
  assert.equal(parseOsc7CwdPayload("C:\\Users\\alice"), "C:\\Users\\alice");
  assert.equal(parseOsc7CwdPayload("D:/work/app"), "D:/work/app");
});

test("parseOsc7CwdPayload returns null for empty or unrelated payloads", () => {
  assert.equal(parseOsc7CwdPayload(""), null);
  assert.equal(parseOsc7CwdPayload("   "), null);
  assert.equal(parseOsc7CwdPayload("not-a-path"), null);
});
