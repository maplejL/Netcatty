import test from "node:test";
import assert from "node:assert/strict";

import {
  buildCursorModelParams,
  encodeCursorModelId,
  isEffortOnlyFast,
  parseCursorModelId,
  resolveCursorModelSelection,
} from "./cursorModelSelection.ts";

test("parseCursorModelId reads base and query params", () => {
  assert.deepEqual(parseCursorModelId("gpt-5.5"), {
    baseId: "gpt-5.5",
    fast: false,
    effort: undefined,
    params: [],
  });
  assert.deepEqual(parseCursorModelId("gpt-5.5?effort=high"), {
    baseId: "gpt-5.5",
    fast: false,
    effort: "high",
    params: [{ id: "effort", value: "high" }],
  });
  assert.equal(parseCursorModelId("composer-2.5?fast=true").fast, true);
  // effort=low alone is NOT Fast — Grok/GPT expose Low as a normal level.
  assert.equal(parseCursorModelId("gpt-5?effort=low").fast, false);
  assert.equal(parseCursorModelId("cursor-grok-4.5?effort=low&fast=true").fast, true);
});

test("resolveCursorModelSelection encodes Fast and effort", () => {
  assert.equal(
    resolveCursorModelSelection("composer-2.5", {
      fast: true,
      fastParams: [{ id: "fast", value: "true" }],
    }),
    "composer-2.5?fast=true",
  );
  assert.equal(
    resolveCursorModelSelection("gpt-5.5", {
      effort: "high",
      thinkingParamId: "effort",
    }),
    "gpt-5.5?effort=high",
  );
  assert.equal(
    resolveCursorModelSelection("gpt-5.5", {
      fast: true,
      effort: "high",
      thinkingParamId: "effort",
      fastParams: [{ id: "fast", value: "true" }],
    }),
    "gpt-5.5?fast=true&effort=high",
  );
  // Fast off must pin fast=false — Cursor defaults omitted fast to the Fast variant.
  assert.equal(
    resolveCursorModelSelection("cursor-grok-4.5", {
      fast: false,
      effort: "low",
      thinkingParamId: "effort",
      fastParams: [{ id: "fast", value: "true" }],
    }),
    "cursor-grok-4.5?fast=false&effort=low",
  );
  assert.equal(
    resolveCursorModelSelection("composer-2.5", {
      fast: false,
      fastParams: [{ id: "fast", value: "true" }],
    }),
    "composer-2.5?fast=false",
  );
});

test("effort-only Fast collapses to effort=low", () => {
  assert.equal(
    isEffortOnlyFast([{ id: "effort", value: "low" }]),
    true,
  );
  // When Low is a normal effort choice, Fast must not alias to it.
  assert.equal(
    isEffortOnlyFast([{ id: "effort", value: "low" }], "effort", ["low", "high"]),
    false,
  );
  assert.equal(
    resolveCursorModelSelection("gpt-5", {
      fast: true,
      fastParams: [{ id: "effort", value: "low" }],
      thinkingParamId: "effort",
    }),
    "gpt-5?effort=low",
  );
});

test("encodeCursorModelId omits empty params", () => {
  assert.equal(encodeCursorModelId("a", []), "a");
  assert.equal(encodeCursorModelId("a", buildCursorModelParams({})), "a");
});
