import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

import {
  detectVaultImportFormat,
  importVaultHostsFromText,
  applyVaultHostImport,
} from "./vaultImport.ts";
import type { Host } from "./models.ts";

const require = createRequire(import.meta.url);
const { decodePassword } = require("../electron/bridges/finalshellCryptoBridge.cjs");

test("ssh_config import maps ForwardX11 yes to host X11 forwarding", () => {
  const result = importVaultHostsFromText("ssh_config", [
    "Host x11-host",
    "  HostName x11.example.com",
    "  User root",
    "  ForwardX11 yes",
  ].join("\n"));

  assert.equal(result.hosts.length, 1);
  assert.equal(result.hosts[0].x11Forwarding, true);
});

test("ssh_config import maps ForwardX11 no to disabled host X11 forwarding", () => {
  const result = importVaultHostsFromText("ssh_config", [
    "Host no-x11-host",
    "  HostName no-x11.example.com",
    "  User root",
    "  ForwardX11 no",
  ].join("\n"));

  assert.equal(result.hosts.length, 1);
  assert.equal(result.hosts[0].x11Forwarding, false);
});

test("ssh_config import preserves system agent authentication semantics", () => {
  const result = importVaultHostsFromText("ssh_config", [
    "Host aws-sg",
    "  HostName 1.1.1.1",
    "  Port 2222",
    "  User root",
    "  AddKeysToAgent yes",
    "  UseKeychain yes",
    "  IdentityFile ~/.ssh/aws_root",
    "  IdentitiesOnly yes",
  ].join("\n"));

  assert.equal(result.hosts.length, 1);
  assert.deepEqual(
    {
      label: result.hosts[0].label,
      hostname: result.hosts[0].hostname,
      port: result.hosts[0].port,
      username: result.hosts[0].username,
      identityFilePaths: result.hosts[0].identityFilePaths,
      useSshAgent: result.hosts[0].useSshAgent,
      identityAgent: result.hosts[0].identityAgent,
      identitiesOnly: result.hosts[0].identitiesOnly,
      addKeysToAgent: result.hosts[0].addKeysToAgent,
      useKeychain: result.hosts[0].useKeychain,
    },
    {
      label: "aws-sg",
      hostname: "1.1.1.1",
      port: 2222,
      username: "root",
      identityFilePaths: ["~/.ssh/aws_root"],
      useSshAgent: true,
      identityAgent: undefined,
      identitiesOnly: true,
      addKeysToAgent: "yes",
      useKeychain: true,
    },
  );
});

test("ssh_config IdentityAgent none prevents AddKeysToAgent from enabling agent login", () => {
  const result = importVaultHostsFromText("ssh_config", [
    "Host local-key-only",
    "  HostName server.example.com",
    "  IdentityAgent none",
    "  AddKeysToAgent yes",
    "  IdentityFile ~/.ssh/id_ed25519",
  ].join("\n"));

  assert.equal(result.hosts.length, 1);
  assert.equal(result.hosts[0].identityAgent, "none");
  assert.notEqual(result.hosts[0].useSshAgent, true);
});

test("detectVaultImportFormat recognizes csv and ssh_config exports", () => {
  assert.equal(
    detectVaultImportFormat("Label,Hostname,Port,Username\nweb,10.0.0.1,22,root"),
    "csv",
  );
  assert.equal(
    detectVaultImportFormat(["Host prod", "  HostName prod.example.com", "  User deploy"].join("\n")),
    "ssh_config",
  );
});

test("applyVaultHostImport skips duplicates by default", () => {
  const existing: Host = {
    id: "existing-1",
    label: "web",
    hostname: "10.0.0.10",
    username: "deploy",
    port: 22,
  };
  const imported = importVaultHostsFromText("csv", [
    "Label,Hostname,Port,Username",
    "web-1,10.0.0.10,22,deploy",
    "db-1,10.0.0.20,22,root",
  ].join("\n"));

  const merged = applyVaultHostImport([existing], [], imported);
  assert.equal(merged.addedCount, 1);
  assert.equal(merged.skippedExistingCount, 1);
  assert.equal(merged.hosts.length, 2);
});

const KNOWN_CIPHER = "UU8hWV51DmVNgmX/pUd0LlaEo53VTa6s";
const REAL_CONNECT_CIPHER = "CDdeCEtpNU+zQLhMngODo6l9X4JujuM9";

test("finalshell crypto bridge decrypts known public ciphertext", () => {
  assert.equal(decodePassword(KNOWN_CIPHER), "beac3d85988e");
});

test("finalshell crypto bridge decrypts real connect_config password field", () => {
  const plain = decodePassword(REAL_CONNECT_CIPHER);
  assert.ok(plain);
  assert.equal(plain.length, 8);
});

test("detectVaultImportFormat recognizes FinalShell connect JSON", () => {
  const json = JSON.stringify({
    name: "web",
    host: "10.0.0.1",
    port: 22,
    user_name: "root",
    password: "encrypted",
  });
  assert.equal(detectVaultImportFormat(json), "finalshell");
});

test("importVaultHostsFromText imports FinalShell connect files with decrypted password", () => {
  const connect = JSON.stringify({
    name: "web",
    host: "10.0.0.1",
    port: 22,
    user_name: "root",
    password_plain: "secret",
  });

  const result = importVaultHostsFromText("finalshell", connect, {
    finalshellFiles: [{ text: connect, fileName: "web_connect_config.json" }],
  });

  assert.equal(result.hosts.length, 1);
  assert.equal(result.hosts[0].hostname, "10.0.0.1");
  assert.equal(result.hosts[0].username, "root");
  assert.equal(result.hosts[0].password, "secret");
  assert.equal(result.hosts[0].group, "10.0.0");
});

test("importVaultHostsFromText imports multiple FinalShell files and config.json keys", () => {
  const config = JSON.stringify({
    secret_key_list: [
      {
        id: "key-1",
        key_data: Buffer.from("-----BEGIN OPENSSH PRIVATE KEY-----\nabc\n-----END OPENSSH PRIVATE KEY-----\n").toString("base64"),
      },
    ],
  });
  const connect = JSON.stringify({
    name: "db",
    host: "db.example.com",
    port: 2222,
    user_name: "admin",
    secret_key_id: "key-1",
    private_key_plain: "-----BEGIN OPENSSH PRIVATE KEY-----\nabc\n-----END OPENSSH PRIVATE KEY-----\n",
  });

  const result = importVaultHostsFromText("finalshell", connect, {
    finalshellFiles: [
      { text: config, fileName: "config.json" },
      { text: connect, fileName: "db_connect_config.json" },
    ],
  });

  assert.equal(result.hosts.length, 1);
  assert.equal(result.keyAttachments?.length, 1);
  assert.match(result.keyAttachments?.[0].privateKeyPem ?? "", /BEGIN OPENSSH PRIVATE KEY/);
});
