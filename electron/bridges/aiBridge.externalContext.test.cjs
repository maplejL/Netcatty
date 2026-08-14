"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { buildExternalAgentSystemContext } = require("./aiBridge.cjs");

test("buildExternalAgentSystemContext (MCP mode) includes vault host vs notes guidance", () => {
  const context = buildExternalAgentSystemContext({
    mode: "mcp",
    chatSessionId: "chat-1",
  });
  assert.match(context, /vault_hosts_create/i);
  assert.match(context, /NOT vault_notes_create/i);
  assert.match(context, /do not silently create a Vault note/i);
});

test("buildExternalAgentSystemContext (skills mode) routes app notes to vault notes CLI", () => {
  const context = buildExternalAgentSystemContext({
    mode: "skills",
    chatSessionId: "chat-1",
  });
  assert.match(context, /vault notes create/i);
  assert.match(context, /never write remote NOTES\.md/i);
  assert.match(context, /Vault → Notes/i);
  assert.match(context, /vault_hosts_create/i);
});
