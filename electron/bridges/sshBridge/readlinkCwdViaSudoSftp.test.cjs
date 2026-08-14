const test = require("node:test");
const assert = require("node:assert/strict");

const {
  findSudoSftpClientForSession,
  readlinkCwdViaSudoSftp,
} = require("./readlinkCwdViaSudoSftp.cjs");

test("findSudoSftpClientForSession returns the sudo client for this session", () => {
  const match = { __netcattySudoMode: true, __netcattySourceSessionId: "sess-1" };
  const clients = new Map([
    ["other", { __netcattySudoMode: true, __netcattySourceSessionId: "sess-2" }],
    ["plain", { __netcattySudoMode: false, __netcattySourceSessionId: "sess-1" }],
    ["sudo", match],
  ]);
  assert.equal(findSudoSftpClientForSession(clients, "sess-1"), match);
  assert.equal(findSudoSftpClientForSession(clients, "missing"), null);
});

test("findSudoSftpClientForSession falls back to the only sudo client", () => {
  const only = { __netcattySudoMode: true };
  const clients = new Map([
    ["plain", { __netcattySudoMode: false, __netcattySourceSessionId: "sess-1" }],
    ["sudo", only],
  ]);
  assert.equal(findSudoSftpClientForSession(clients, "sess-1"), only);
});

test("readlinkCwdViaSudoSftp uses sudo SFTP readlink for /proc/pid/cwd", async () => {
  const client = {
    __netcattySudoMode: true,
    __netcattySourceSessionId: "sess-1",
    sftp: {
      readlink(_path, cb) {
        assert.equal(_path, "/proc/4182/cwd");
        cb(null, "/data");
      },
    },
  };
  const cwd = await readlinkCwdViaSudoSftp(new Map([["sudo", client]]), "sess-1", "4182");
  assert.equal(cwd, "/data");
});

test("readlinkCwdViaSudoSftp falls back to realpath when readlink is missing", async () => {
  const client = {
    __netcattySudoMode: true,
    __netcattySourceSessionId: "sess-1",
    sftp: {
      realpath(_path, cb) {
        cb(null, "/root");
      },
    },
  };
  const cwd = await readlinkCwdViaSudoSftp(new Map([["sudo", client]]), "sess-1", "9");
  assert.equal(cwd, "/root");
});

test("readlinkCwdViaSudoSftp returns null without a sudo SFTP client", async () => {
  const cwd = await readlinkCwdViaSudoSftp(new Map(), "sess-1", "4182");
  assert.equal(cwd, null);
});

test("readlinkCwdViaSudoSftp rejects non-pid tokens", async () => {
  const client = {
    __netcattySudoMode: true,
    __netcattySourceSessionId: "sess-1",
    sftp: {
      readlink() {
        throw new Error("should not run");
      },
    },
  };
  const cwd = await readlinkCwdViaSudoSftp(new Map([["sudo", client]]), "sess-1", "4; rm");
  assert.equal(cwd, null);
});
