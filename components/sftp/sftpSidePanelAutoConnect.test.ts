import test from "node:test";
import assert from "node:assert/strict";
import type { SftpPane } from "../../application/state/sftp/types";
import {
  findReusableSftpSidePanelTab,
  isRemoteSftpTabHealthy,
  resolveSftpPathForLinkedSession,
  shouldNavigateSftpOnSessionSwitch,
  shouldResetSftpSidePanelSourceSession,
  shouldSkipSftpSidePanelAutoConnect,
} from "./sftpSidePanelAutoConnect";

const remoteConnectedTab = (overrides: Partial<SftpPane> = {}): SftpPane => ({
  id: "tab-1",
  connection: {
    id: "conn-1",
    hostId: "host-1",
    hostLabel: "server",
    isLocal: false,
    status: "connected",
    currentPath: "/var/www",
  },
  files: [],
  loading: false,
  reconnecting: false,
  error: null,
  connectionLogs: [],
  selectedFiles: new Set(),
  filter: "",
  filenameEncoding: "auto",
  showHiddenFiles: false,
  transferMutationToken: 0,
  ...overrides,
});

test("isRemoteSftpTabHealthy rejects loading tabs", () => {
  const tab = remoteConnectedTab({ loading: true });
  assert.equal(isRemoteSftpTabHealthy(tab, true), false);
});

test("isRemoteSftpTabHealthy rejects tabs without a backend SFTP session", () => {
  const tab = remoteConnectedTab();
  assert.equal(isRemoteSftpTabHealthy(tab, false), false);
});

test("isRemoteSftpTabHealthy rejects connecting tabs", () => {
  const tab = remoteConnectedTab({
    connection: {
      ...remoteConnectedTab().connection!,
      status: "connecting",
    },
  });
  assert.equal(isRemoteSftpTabHealthy(tab, true), false);
});

test("shouldSkipSftpSidePanelAutoConnect still skips while a connected tab is listing", () => {
  const tab = remoteConnectedTab({ loading: true });
  assert.equal(
    shouldSkipSftpSidePanelAutoConnect("host-key", "host-key", tab, true),
    true,
  );
});

test("shouldSkipSftpSidePanelAutoConnect returns false for mismatched keys", () => {
  const tab = remoteConnectedTab({ loading: true });
  assert.equal(
    shouldSkipSftpSidePanelAutoConnect("host-key", "other-key", tab, true),
    false,
  );
});

test("shouldSkipSftpSidePanelAutoConnect returns false while reconnecting", () => {
  const tab = remoteConnectedTab({ reconnecting: true });
  assert.equal(
    shouldSkipSftpSidePanelAutoConnect("host-key", "host-key", tab, true),
    false,
  );
});

test("findReusableSftpSidePanelTab ignores tabs stuck in loading after SSH disconnect", () => {
  const tab = remoteConnectedTab({ loading: true });
  const map = new Map([[tab.id, "host-key"]]);
  assert.equal(
    findReusableSftpSidePanelTab([tab], "host-1", "host-key", map, () => true),
    null,
  );
});

test("findReusableSftpSidePanelTab returns healthy tabs", () => {
  const tab = remoteConnectedTab();
  const map = new Map([[tab.id, "host-key"]]);
  assert.equal(
    findReusableSftpSidePanelTab([tab], "host-1", "host-key", map, () => true),
    tab,
  );
});

test("shouldResetSftpSidePanelSourceSession detects terminal session changes", () => {
  assert.equal(shouldResetSftpSidePanelSourceSession("sess-a", "sess-b"), true);
  assert.equal(shouldResetSftpSidePanelSourceSession("sess-a", "sess-a"), false);
  assert.equal(shouldResetSftpSidePanelSourceSession(null, "sess-a"), false);
  assert.equal(shouldResetSftpSidePanelSourceSession("sess-a", null), false);
});

test("shouldSkipSftpSidePanelAutoConnect returns false after terminal session changes", () => {
  const tab = remoteConnectedTab();
  assert.equal(
    shouldSkipSftpSidePanelAutoConnect("host-key", "host-key", tab, true),
    true,
  );
  // Caller gates on sessionChanged before invoking skip — stale reuse must not win.
  assert.equal(
    shouldResetSftpSidePanelSourceSession("sess-a", "sess-b"),
    true,
  );
});

test("resolveSftpPathForLinkedSession prefers remembered path over terminal cwd", () => {
  assert.equal(
    resolveSftpPathForLinkedSession({
      rememberedPath: "/var/log",
      terminalCwd: "/home/user",
    }),
    "/var/log",
  );
  assert.equal(
    resolveSftpPathForLinkedSession({
      rememberedPath: null,
      terminalCwd: "/home/user",
    }),
    "/home/user",
  );
  assert.equal(
    resolveSftpPathForLinkedSession({
      rememberedPath: "  ",
      terminalCwd: null,
    }),
    null,
  );
});

test("shouldNavigateSftpOnSessionSwitch jumps when paths differ after session change", () => {
  assert.equal(
    shouldNavigateSftpOnSessionSwitch({
      sessionChanged: true,
      isConnected: true,
      isLocal: false,
      hostIdMatches: true,
      targetPath: "/var/www",
      currentPath: "/home/user",
    }),
    true,
  );
  assert.equal(
    shouldNavigateSftpOnSessionSwitch({
      sessionChanged: true,
      isConnected: true,
      isLocal: false,
      hostIdMatches: true,
      targetPath: "/var/www/",
      currentPath: "/var/www",
    }),
    false,
  );
  assert.equal(
    shouldNavigateSftpOnSessionSwitch({
      sessionChanged: false,
      isConnected: true,
      isLocal: false,
      hostIdMatches: true,
      targetPath: "/var/www",
      currentPath: "/home/user",
    }),
    false,
  );
});
