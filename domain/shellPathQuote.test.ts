import test from "node:test";
import assert from "node:assert/strict";
import { quoteShellPath } from "./shellPathQuote.ts";

test("quoteShellPath leaves simple paths unquoted", () => {
  assert.equal(quoteShellPath("/var/log/nginx"), "/var/log/nginx");
  assert.equal(quoteShellPath("README.md"), "README.md");
});

test("quoteShellPath wraps paths that contain spaces", () => {
  assert.equal(quoteShellPath("/home/user/my docs/a.txt"), "'/home/user/my docs/a.txt'");
});

test("quoteShellPath wraps paths with shell metacharacters", () => {
  assert.equal(quoteShellPath("/tmp/file$(id).txt"), "'/tmp/file$(id).txt'");
  assert.equal(quoteShellPath("/tmp/a;rm -rf /"), "'/tmp/a;rm -rf /'");
});

test("quoteShellPath escapes embedded single quotes", () => {
  assert.equal(quoteShellPath("/tmp/o'reilly.txt"), `'/tmp/o'"'"'reilly.txt'`);
});

test("quoteShellPath returns empty single quotes for empty input", () => {
  assert.equal(quoteShellPath(""), "''");
});
