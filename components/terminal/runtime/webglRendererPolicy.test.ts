import assert from "node:assert/strict";
import test from "node:test";

import {
  shouldCreateWebglOnMount,
  shouldDeferWebglUntilVisible,
  shouldSuspendWebglOnWorkspaceBlur,
} from "./webglRendererPolicy";

test("defers WebGL for a pane that mounts hidden", () => {
  assert.equal(
    shouldDeferWebglUntilVisible({ useWebGLAddon: true, initiallyVisible: false }),
    true,
  );
});

test("loads WebGL immediately for a visible pane (unchanged behavior)", () => {
  assert.equal(
    shouldDeferWebglUntilVisible({ useWebGLAddon: true, initiallyVisible: true }),
    false,
  );
});

test("never defers when WebGL is not used at all", () => {
  assert.equal(
    shouldDeferWebglUntilVisible({ useWebGLAddon: false, initiallyVisible: false }),
    false,
  );
  assert.equal(
    shouldDeferWebglUntilVisible({ useWebGLAddon: false, initiallyVisible: true }),
    false,
  );
});

test("defers WebGL on mount for an unfocused workspace split pane", () => {
  assert.equal(
    shouldCreateWebglOnMount({
      isVisible: true,
      inWorkspace: true,
      isFocusMode: false,
      isFocused: false,
    }),
    false,
  );
});

test("creates WebGL on mount for the focused workspace split pane", () => {
  assert.equal(
    shouldCreateWebglOnMount({
      isVisible: true,
      inWorkspace: true,
      isFocusMode: false,
      isFocused: true,
    }),
    true,
  );
});

test("creates WebGL on mount for workspace focus mode and solo tabs", () => {
  assert.equal(
    shouldCreateWebglOnMount({
      isVisible: true,
      inWorkspace: true,
      isFocusMode: true,
      isFocused: false,
    }),
    true,
  );
  assert.equal(
    shouldCreateWebglOnMount({
      isVisible: true,
      inWorkspace: false,
      isFocusMode: false,
      isFocused: false,
    }),
    true,
  );
});

test("suspends WebGL when a workspace split pane loses focus", () => {
  assert.equal(
    shouldSuspendWebglOnWorkspaceBlur({
      inWorkspace: true,
      isFocusMode: false,
      isFocused: false,
    }),
    true,
  );
  assert.equal(
    shouldSuspendWebglOnWorkspaceBlur({
      inWorkspace: true,
      isFocusMode: false,
      isFocused: true,
    }),
    false,
  );
});
