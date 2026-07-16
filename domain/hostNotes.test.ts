import assert from "node:assert/strict";
import test from "node:test";

import { summarizeHostNotes } from "./hostNotes.ts";

test("summarizeHostNotes returns null for empty or whitespace notes", () => {
  assert.equal(summarizeHostNotes(undefined), null);
  assert.equal(summarizeHostNotes(null), null);
  assert.equal(summarizeHostNotes(""), null);
  assert.equal(summarizeHostNotes("   \n\t  "), null);
});

test("summarizeHostNotes strips common markdown and collapses whitespace", () => {
  const excerpt = summarizeHostNotes("## 生产\n- 8C16G\n**客户A**");
  assert.equal(excerpt, "生产 8C16G 客户A");
});

test("summarizeHostNotes keeps link labels and drops urls", () => {
  const excerpt = summarizeHostNotes("see [docs](https://example.com/path) later");
  assert.equal(excerpt, "see docs later");
});

test("summarizeHostNotes truncates to maxLength with ellipsis", () => {
  const long = "abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJKLMNOP";
  const excerpt = summarizeHostNotes(long, { maxLength: 10 });
  assert.equal(excerpt, "abcdefghi…");
  assert.equal(excerpt!.length, 10);
});

test("summarizeHostNotes returns full text when within maxLength", () => {
  assert.equal(summarizeHostNotes("short note", { maxLength: 48 }), "short note");
});

test("summarizeHostNotes returns null when maxLength is non-positive", () => {
  assert.equal(summarizeHostNotes("hello", { maxLength: 0 }), null);
  assert.equal(summarizeHostNotes("hello", { maxLength: -1 }), null);
});
