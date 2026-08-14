const test = require("node:test");
const assert = require("node:assert/strict");

const { isDecimalPid, parseSessionPwdStdout } = require("./sessionPwdParse.cjs");

test("parseSessionPwdStdout accepts a normal absolute cwd", () => {
  assert.deepEqual(parseSessionPwdStdout("/etc/nginx/locations\n"), {
    cwd: "/etc/nginx/locations",
    needSudoPid: null,
  });
});

test("parseSessionPwdStdout extracts NEED_SUDO_CWD when readlink is blocked", () => {
  assert.deepEqual(parseSessionPwdStdout("NEED_SUDO_CWD 4182\n"), {
    cwd: null,
    needSudoPid: "4182",
  });
});

test("parseSessionPwdStdout prefers a real cwd over a sudo marker", () => {
  assert.deepEqual(parseSessionPwdStdout("NEED_SUDO_CWD 9\n/var/log\n"), {
    cwd: "/var/log",
    needSudoPid: null,
  });
});

test("parseSessionPwdStdout rejects empty or non-path output", () => {
  assert.deepEqual(parseSessionPwdStdout(""), { cwd: null, needSudoPid: null });
  assert.deepEqual(parseSessionPwdStdout("Could not determine cwd"), {
    cwd: null,
    needSudoPid: null,
  });
});

test("isDecimalPid rejects non-pid tokens", () => {
  assert.equal(isDecimalPid("4182"), true);
  assert.equal(isDecimalPid("4; rm -rf /"), false);
  assert.equal(isDecimalPid(""), false);
});
