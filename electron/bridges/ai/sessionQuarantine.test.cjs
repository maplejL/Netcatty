const test = require("node:test");
const assert = require("node:assert/strict");

const {
  quarantineSession,
  clearSessionQuarantine,
  checkSessionQuarantine,
  quarantineFromResult,
  SESSION_STILL_BUSY_CODE,
  _resetSessionQuarantineForTests,
} = require("./sessionQuarantine.cjs");
const { FORCED_CANCEL_ERROR, INTERACTIVE_PROMPT_ERROR } = require("./interactivePromptDetect.cjs");

test.beforeEach(() => {
  _resetSessionQuarantineForTests();
});

test("quarantine blocks until a fresher idle prompt arrives", () => {
  const sessionId = "sess-1";
  const session = {
    lastIdlePrompt: "user@host:~$",
    lastIdlePromptAt: 1000,
    _promptTrackTail: "user@host:~$",
  };

  quarantineSession(sessionId, FORCED_CANCEL_ERROR);
  const blocked = checkSessionQuarantine(sessionId, session);
  assert.ok(blocked);
  assert.equal(blocked.code, SESSION_STILL_BUSY_CODE);
  assert.match(blocked.error, /SESSION_STILL_BUSY/);

  // Same cached prompt timestamp does not clear quarantine
  assert.ok(checkSessionQuarantine(sessionId, session));

  // Fresh idle prompt after quarantine time clears it
  session.lastIdlePromptAt = Date.now() + 1;
  assert.equal(checkSessionQuarantine(sessionId, session), null);
  assert.equal(checkSessionQuarantine(sessionId, session), null);
});

test("quarantineFromResult only quarantines forced/interactive failures", () => {
  assert.equal(quarantineFromResult("s1", { error: "Cancelled" }), false);
  assert.equal(checkSessionQuarantine("s1", {}), null);

  assert.equal(quarantineFromResult("s2", { error: INTERACTIVE_PROMPT_ERROR }), true);
  assert.ok(checkSessionQuarantine("s2", {
    lastIdlePrompt: "user@host:~$",
    lastIdlePromptAt: 1,
    _promptTrackTail: "still waiting\n",
  }));
});

test("missing session clears quarantine entry", () => {
  quarantineSession("gone", FORCED_CANCEL_ERROR);
  assert.equal(checkSessionQuarantine("gone", null), null);
});

test("clearSessionQuarantine removes the entry", () => {
  quarantineSession("s3", FORCED_CANCEL_ERROR);
  clearSessionQuarantine("s3");
  assert.equal(checkSessionQuarantine("s3", {
    lastIdlePrompt: "user@host:~$",
    lastIdlePromptAt: 1,
    _promptTrackTail: "user@host:~$",
  }), null);
});
