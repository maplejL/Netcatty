import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeAISession,
  pruneSessionsForStorage,
  sanitizeAISessions,
} from "./aiStateSnapshots.ts";

test("normalizeAISession recovers missing messages and invalid scope", () => {
  const session = normalizeAISession({
    id: "ai_1",
    title: "Broken",
    agentId: "cursor",
    // messages missing
    // scope missing
  });

  assert.ok(session);
  assert.equal(session!.id, "ai_1");
  assert.deepEqual(session!.messages, []);
  assert.equal(session!.scope.type, "global");
  assert.equal(session!.agentId, "cursor");
});

test("normalizeAISession drops rows without id", () => {
  assert.equal(normalizeAISession({ title: "no-id" }), null);
  assert.equal(normalizeAISession(null), null);
});

test("sanitizeAISessions filters junk and keeps valid rows", () => {
  const sessions = sanitizeAISessions([
    null,
    { id: "ok", messages: [{ id: "m1", role: "user", content: "hi" }], scope: { type: "terminal", targetId: "t1" } },
    { title: "missing-id" },
    "not-an-object",
  ]);

  assert.equal(sessions.length, 1);
  assert.equal(sessions[0].id, "ok");
  assert.equal(sessions[0].messages.length, 1);
  assert.equal(sessions[0].scope.type, "terminal");
});

test("pruneSessionsForStorage does not throw when messages is missing", () => {
  const pruned = pruneSessionsForStorage([
    { id: "a", updatedAt: 2 } as any,
    {
      id: "b",
      updatedAt: 1,
      messages: Array.from({ length: 5 }, (_, i) => ({
        id: `m${i}`,
        role: "user",
        content: String(i),
      })),
      scope: { type: "workspace", targetId: "w1" },
      title: "B",
      agentId: "catty",
      createdAt: 1,
    },
  ]);

  assert.ok(pruned.every((s) => Array.isArray(s.messages)));
  assert.ok(pruned.some((s) => s.id === "a"));
});
