import test from "node:test";
import assert from "node:assert/strict";

import { countPasteLines, shouldConfirmMultilinePaste } from "./multilinePaste.ts";

test("countPasteLines handles CRLF and bare CR", () => {
  assert.equal(countPasteLines("a\nb"), 2);
  assert.equal(countPasteLines("a\r\nb\r\nc"), 3);
  assert.equal(countPasteLines("a\rb"), 2);
  assert.equal(countPasteLines("single"), 1);
  assert.equal(countPasteLines(""), 0);
});

test("shouldConfirmMultilinePaste defaults to 2+ lines", () => {
  assert.equal(shouldConfirmMultilinePaste("one"), false);
  assert.equal(shouldConfirmMultilinePaste("one\ntwo"), true);
  assert.equal(shouldConfirmMultilinePaste("one\r\ntwo\r\nthree"), true);
});

test("shouldConfirmMultilinePaste respects enabled flag", () => {
  assert.equal(shouldConfirmMultilinePaste("one\ntwo", { enabled: false }), false);
  assert.equal(shouldConfirmMultilinePaste("one\ntwo", { enabled: true }), true);
});
