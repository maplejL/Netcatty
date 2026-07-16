import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const assertHandlerRecoversWebglBeforeRefit = (
  source: string,
  handlerName: string,
): void => {
  const handlerIndex = source.indexOf(`const ${handlerName} = () => {`);
  assert.notEqual(handlerIndex, -1, `${handlerName} must exist`);

  const bodyStart = source.indexOf("{", handlerIndex);
  assert.notEqual(bodyStart, -1, `${handlerName} must have a body`);

  let depth = 0;
  let bodyEnd = -1;
  for (let index = bodyStart; index < source.length; index += 1) {
    const char = source[index];
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        bodyEnd = index + 1;
        break;
      }
    }
  }
  assert.notEqual(bodyEnd, -1, `${handlerName} body must close`);

  const handlerSource = source.slice(handlerIndex, bodyEnd);
  const recoveryIndex = handlerSource.indexOf("recoverWebglRendererOnAppResume()");
  const refitIndex = handlerSource.indexOf("scheduleLayoutRecoveryRefit()");

  assert.notEqual(recoveryIndex, -1, `${handlerName} must recover WebGL on app resume`);
  assert.notEqual(refitIndex, -1, `${handlerName} must schedule layout recovery`);
  assert.ok(
    recoveryIndex < refitIndex,
    `${handlerName} must recover WebGL before layout recovery`,
  );
};

test("app resume recovery clears the WebGL texture atlas after ensuring the renderer", () => {
  const source = readFileSync(new URL("./useTerminalEffects.ts", import.meta.url), "utf8");
  const fnIndex = source.indexOf("const recoverWebglRendererOnAppResume = () => {");
  assert.notEqual(fnIndex, -1, "recoverWebglRendererOnAppResume must exist");

  const bodyStart = source.indexOf("{", fnIndex);
  let depth = 0;
  let bodyEnd = -1;
  for (let index = bodyStart; index < source.length; index += 1) {
    const char = source[index];
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        bodyEnd = index + 1;
        break;
      }
    }
  }
  const body = source.slice(fnIndex, bodyEnd);
  const ensureIndex = body.indexOf("ensureWebglRenderer()");
  const clearIndex = body.indexOf("clearTextureAtlas()");
  const repaintIndex = body.indexOf("forceSyncRenderAfterResize(term)");
  assert.notEqual(ensureIndex, -1, "resume recovery must ensure WebGL");
  assert.notEqual(clearIndex, -1, "resume recovery must clear the texture atlas");
  assert.notEqual(repaintIndex, -1, "resume recovery must force a sync repaint");
  assert.ok(ensureIndex < clearIndex, "ensure WebGL before clearing atlas");
  assert.ok(clearIndex < repaintIndex, "clear atlas before sync repaint");
});

test("app resume handlers recover the terminal renderer before refit", () => {
  const source = readFileSync(new URL("./useTerminalEffects.ts", import.meta.url), "utf8");

  assertHandlerRecoversWebglBeforeRefit(source, "handleVisibilityChange");
  assertHandlerRecoversWebglBeforeRefit(source, "handleWindowFocus");
});
