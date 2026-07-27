const test = require("node:test");
const assert = require("node:assert/strict");

const {
  looksLikeInteractivePrompt,
  getLastNonEmptyLine,
  isQuarantineWorthyError,
  INTERACTIVE_PROMPT_ERROR,
  FORCED_CANCEL_ERROR,
} = require("./interactivePromptDetect.cjs");

test("detects iastool-style Enter the value for … option>", () => {
  const output = "Creating JDBC resource...\nEnter the value for the driverclassname option>";
  assert.equal(looksLikeInteractivePrompt(output), true);
  assert.equal(
    getLastNonEmptyLine(output),
    "Enter the value for the driverclassname option>",
  );
});

test("detects password: wait line at end of output", () => {
  assert.equal(looksLikeInteractivePrompt("Connecting...\npassword:"), true);
  assert.equal(looksLikeInteractivePrompt("Enter Password: "), true);
});

test("detects [Y/n] and Continue? prompts", () => {
  assert.equal(looksLikeInteractivePrompt("Overwrite existing file? [Y/n]"), true);
  assert.equal(looksLikeInteractivePrompt("Proceed with install?\nContinue?"), true);
});

test("does not treat shell idle prompts as interactive", () => {
  assert.equal(looksLikeInteractivePrompt("done\nuser@host:~$"), false);
  assert.equal(looksLikeInteractivePrompt("done\nPS C:\\Users\\alice>"), false);
  assert.equal(looksLikeInteractivePrompt("done\nC:\\Users\\alice>"), false);
});

test("false positive: password: mid-output with shell prompt after", () => {
  const output = [
    "grep password /etc/app.conf",
    "db.password: secret123",
    "user@host:~$",
  ].join("\n");
  assert.equal(looksLikeInteractivePrompt(output), false);
});

test("false positive: password mentioned mid-line without trailing wait", () => {
  assert.equal(
    looksLikeInteractivePrompt("Updated password:hash in config\nuser@host:~$"),
    false,
  );
});

test("isQuarantineWorthyError matches forced cancel and interactive errors", () => {
  assert.equal(isQuarantineWorthyError(FORCED_CANCEL_ERROR), true);
  assert.equal(isQuarantineWorthyError(INTERACTIVE_PROMPT_ERROR), true);
  assert.equal(isQuarantineWorthyError("Cancelled"), false);
  assert.equal(isQuarantineWorthyError("Command timed out (60s)"), false);
});
