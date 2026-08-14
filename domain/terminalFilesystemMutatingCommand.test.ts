import assert from "node:assert/strict";
import { test } from "node:test";

import {
  classifyFilesystemMutatingCommand,
  isFilesystemMutatingCommand,
  isInteractivePrivilegeEscalationCommand,
  resolveSftpSoftRefreshDelayMs,
  SFTP_SOFT_REFRESH_DELAY_MS,
  SFTP_SOFT_REFRESH_LONG_DELAY_MS,
} from "./terminalFilesystemMutatingCommand";

test("detects common mutating builtins and tools", () => {
  for (const line of [
    "touch foo",
    "mkdir -p bar",
    "rm -rf tmp",
    "mv a b",
    "cp -r src dest",
    "chmod 755 script.sh",
    "wget https://example.com/a.tgz",
    "curl -O https://example.com/a.tgz",
    "tar -xzf archive.tar.gz",
    "sudo rm -f /tmp/x",
    "FOO=1 touch stamped",
  ]) {
    assert.equal(isFilesystemMutatingCommand(line), true, line);
  }
});

test("detects git mutating subcommands and redirects", () => {
  assert.equal(isFilesystemMutatingCommand("git clone https://example.com/repo.git"), true);
  assert.equal(isFilesystemMutatingCommand("git pull --rebase"), true);
  assert.equal(isFilesystemMutatingCommand("git status"), false);
  assert.equal(isFilesystemMutatingCommand("echo hi > out.txt"), true);
  assert.equal(isFilesystemMutatingCommand("echo hi >> out.txt"), true);
  assert.equal(isFilesystemMutatingCommand("cat < in.txt"), false);
});

test("ignores read-only / navigation commands", () => {
  for (const line of [
    "ls -la",
    "cd /tmp",
    "pwd",
    "cat README.md",
    "less log.txt",
    "ssh other-host",
    "echo hello",
  ]) {
    assert.equal(isFilesystemMutatingCommand(line), false, line);
  }
});

test("classifies long-running mutators for longer soft-refresh delay", () => {
  assert.deepEqual(classifyFilesystemMutatingCommand("touch x"), {
    mutates: true,
    longRunning: false,
  });
  assert.deepEqual(classifyFilesystemMutatingCommand("wget https://x/y"), {
    mutates: true,
    longRunning: true,
  });
  assert.equal(resolveSftpSoftRefreshDelayMs("touch x"), SFTP_SOFT_REFRESH_DELAY_MS);
  assert.equal(resolveSftpSoftRefreshDelayMs("git clone https://x/y"), SFTP_SOFT_REFRESH_LONG_DELAY_MS);
  assert.equal(resolveSftpSoftRefreshDelayMs("ls"), 0);
});

test("detects interactive privilege escalation but ignores one-shot sudo", () => {
  for (const line of [
    "sudo -i",
    "sudo -s",
    "sudo --login",
    "sudo -iu root",
    "sudo su",
    "sudo su -",
    "sudo bash",
    "su",
    "su -",
    "doas -s",
  ]) {
    assert.equal(isInteractivePrivilegeEscalationCommand(line), true, line);
  }
  for (const line of [
    "sudo ls",
    "sudo systemctl restart nginx",
    "sudo -n true",
    "sudo",
    "ls",
  ]) {
    assert.equal(isInteractivePrivilegeEscalationCommand(line), false, line);
  }
});
