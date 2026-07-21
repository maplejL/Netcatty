import test from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_WORK_TABS_LOCATION,
  isSideWorkTabsLocation,
  isWorkTabsLocation,
  resolveWorkTabsLocation,
} from "./workTabsLocation.ts";

test("work tabs location defaults to top", () => {
  assert.equal(DEFAULT_WORK_TABS_LOCATION, "top");
  assert.equal(resolveWorkTabsLocation(null), "top");
  assert.equal(resolveWorkTabsLocation(undefined), "top");
  assert.equal(resolveWorkTabsLocation("nope"), "top");
});

test("work tabs location accepts top left right", () => {
  assert.equal(isWorkTabsLocation("top"), true);
  assert.equal(isWorkTabsLocation("left"), true);
  assert.equal(isWorkTabsLocation("right"), true);
  assert.equal(resolveWorkTabsLocation("left"), "left");
  assert.equal(resolveWorkTabsLocation("right"), "right");
});

test("side work tabs helper", () => {
  assert.equal(isSideWorkTabsLocation("top"), false);
  assert.equal(isSideWorkTabsLocation("left"), true);
  assert.equal(isSideWorkTabsLocation("right"), true);
});
