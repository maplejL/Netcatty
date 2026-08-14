"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { resolveSftpSudoPassword } = require("./sftpSudoPassword.cjs");

test("resolveSftpSudoPassword prefers the explicit SFTP password", () => {
  const sessions = new Map([
    ["sess-1", { sudoProbePassword: "from-session" }],
  ]);
  assert.equal(
    resolveSftpSudoPassword({ password: "from-host", sourceSessionId: "sess-1" }, sessions),
    "from-host",
  );
});

test("resolveSftpSudoPassword uses the linked terminal session password", () => {
  const sessions = new Map([
    ["sess-1", { sudoProbePassword: "login-pw" }],
  ]);
  assert.equal(
    resolveSftpSudoPassword({ password: "", sourceSessionId: "sess-1" }, sessions),
    "login-pw",
  );
});

test("resolveSftpSudoPassword prefers the system-manager sudo password", () => {
  const sessions = new Map([
    ["sess-1", {
      systemManagerSudoPassword: "sudo-pw",
      sudoProbePassword: "login-pw",
    }],
  ]);
  assert.equal(
    resolveSftpSudoPassword({ sourceSessionId: "sess-1" }, sessions),
    "sudo-pw",
  );
});

test("resolveSftpSudoPassword returns empty without a usable secret", () => {
  assert.equal(resolveSftpSudoPassword({ password: "" }, new Map()), "");
  assert.equal(resolveSftpSudoPassword({ sourceSessionId: "missing" }, new Map()), "");
});
