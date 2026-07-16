import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("WebGL context loss recreates the renderer instead of leaving a dead addon", () => {
  const source = readFileSync(new URL("./createXTermRuntime.ts", import.meta.url), "utf8");

  assert.match(source, /webglAddon\.onContextLoss\(\(\) => \{/);
  assert.match(source, /WebGL context loss detected, recreating renderer/);
  assert.match(source, /webglLoaded = false/);
  assert.match(
    source,
    /webglContextLossRecoveryTimer = setTimeout\(\(\) => \{[\s\S]*loadWebglRenderer\(\);/,
  );
  assert.match(
    source,
    /loadWebglRenderer\(\);[\s\S]*clearWebglTextureAtlas\(\);[\s\S]*forceSyncRenderAfterResize\(term\);/,
  );
});
