import test from "node:test";
import assert from "node:assert/strict";
import {
  isAlreadyElevatedSftpConnection,
  probeTerminalCwdWithRetries,
  resolveSftpEscalateConnectionId,
} from "./sftpSudoEscalate.ts";

test("resolveSftpEscalateConnectionId trusts a successful sudo connect result", () => {
  assert.equal(
    resolveSftpEscalateConnectionId(
      { connectionId: "left-new", ok: true, sudo: true },
      { id: "left-old", status: "connected", sudo: false },
    ),
    "left-new",
  );
});

test("resolveSftpEscalateConnectionId does not treat a stale non-sudo pane as success", () => {
  assert.equal(
    resolveSftpEscalateConnectionId(
      { connectionId: "left-new", ok: false, sudo: true },
      { id: "left-old", status: "connected", sudo: false },
    ),
    null,
  );
});

test("resolveSftpEscalateConnectionId keeps an already elevated connection", () => {
  assert.equal(
    resolveSftpEscalateConnectionId(
      undefined,
      { id: "left-sudo", status: "connected", sudo: true },
    ),
    "left-sudo",
  );
  assert.equal(
    isAlreadyElevatedSftpConnection({ id: "left-sudo", status: "connected", sudo: true }),
    true,
  );
  assert.equal(
    isAlreadyElevatedSftpConnection({ id: "left-1", status: "connected", sudo: false }),
    false,
  );
});

test("probeTerminalCwdWithRetries returns the first non-empty cwd", async () => {
  const seen: number[] = [];
  const cwd = await probeTerminalCwdWithRetries(
    async () => {
      seen.push(seen.length);
      return seen.length >= 2 ? "/data" : null;
    },
    [0, 10, 20],
    async () => {},
  );
  assert.equal(cwd, "/data");
  assert.deepEqual(seen, [0, 1]);
});
