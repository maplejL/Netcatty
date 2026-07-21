import test from "node:test";
import assert from "node:assert/strict";

import {
  fileNameFromLocalPath,
  isBatchSftpEligibleHost,
  joinRemotePath,
} from "./batchSftpUpload.ts";
import type { Host } from "./models.ts";

const baseHost = (overrides: Partial<Host> = {}): Host =>
  ({
    id: "h1",
    label: "srv",
    hostname: "1.2.3.4",
    username: "root",
    port: 22,
    ...overrides,
  }) as Host;

test("joinRemotePath normalizes slashes", () => {
  assert.equal(joinRemotePath("/home/user", "a.txt"), "/home/user/a.txt");
  assert.equal(joinRemotePath("/home/user/", "a.txt"), "/home/user/a.txt");
  assert.equal(joinRemotePath("/", "a.txt"), "/a.txt");
  assert.equal(joinRemotePath("", "a.txt"), "/a.txt");
});

test("fileNameFromLocalPath handles Windows and POSIX paths", () => {
  assert.equal(fileNameFromLocalPath("C:\\Users\\a\\file.txt"), "file.txt");
  assert.equal(fileNameFromLocalPath("/tmp/file.txt"), "file.txt");
});

test("isBatchSftpEligibleHost rejects serial/local", () => {
  assert.deepEqual(isBatchSftpEligibleHost(baseHost()), { ok: true });
  assert.deepEqual(isBatchSftpEligibleHost(baseHost({ protocol: "serial" })), {
    ok: false,
    reason: "non-ssh",
  });
  assert.deepEqual(isBatchSftpEligibleHost(baseHost({ protocol: "local" })), {
    ok: false,
    reason: "local",
  });
});
