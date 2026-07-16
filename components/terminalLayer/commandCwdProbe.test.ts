import test from "node:test";
import assert from "node:assert/strict";

import { shouldProbeCommandCwd } from "./commandCwdProbe";

test("probes command cwd for session restore even when the SFTP panel is not visible", () => {
  assert.equal(
    shouldProbeCommandCwd({
      restoreTerminalCwd: true,
      visibleSftpHost: null,
      sessionHost: { sftpFollowTerminalCwd: false },
      globalSftpFollowTerminalCwd: false,
    }),
    true,
  );
});

test("does not probe command cwd when neither session restore nor follow cwd is enabled", () => {
  assert.equal(
    shouldProbeCommandCwd({
      restoreTerminalCwd: false,
      visibleSftpHost: null,
      sessionHost: { sftpFollowTerminalCwd: false },
      globalSftpFollowTerminalCwd: false,
    }),
    false,
  );
});

test("probes command cwd whenever the SFTP panel is open so go-to-cwd stays warm", () => {
  assert.equal(
    shouldProbeCommandCwd({
      restoreTerminalCwd: false,
      visibleSftpHost: { sftpFollowTerminalCwd: false },
      sessionHost: { sftpFollowTerminalCwd: false },
      globalSftpFollowTerminalCwd: false,
    }),
    true,
  );
});

test("probes command cwd from session host follow even when SFTP panel is closed", () => {
  assert.equal(
    shouldProbeCommandCwd({
      restoreTerminalCwd: false,
      visibleSftpHost: null,
      sessionHost: { sftpFollowTerminalCwd: true },
      globalSftpFollowTerminalCwd: false,
    }),
    true,
  );
});

test("probes command cwd for visible SFTP follow cwd using host override", () => {
  assert.equal(
    shouldProbeCommandCwd({
      restoreTerminalCwd: false,
      visibleSftpHost: { sftpFollowTerminalCwd: true },
      sessionHost: { sftpFollowTerminalCwd: false },
      globalSftpFollowTerminalCwd: false,
    }),
    true,
  );
});

test("visible SFTP host still probes even when host follow override is off", () => {
  // SFTP open keeps the cache warm for go-to-cwd; follow navigation is gated elsewhere.
  assert.equal(
    shouldProbeCommandCwd({
      restoreTerminalCwd: false,
      visibleSftpHost: { sftpFollowTerminalCwd: false },
      sessionHost: { sftpFollowTerminalCwd: true },
      globalSftpFollowTerminalCwd: true,
    }),
    true,
  );
});

test("probes when global follow is on and session host inherits it", () => {
  assert.equal(
    shouldProbeCommandCwd({
      restoreTerminalCwd: false,
      visibleSftpHost: null,
      sessionHost: { sftpFollowTerminalCwd: undefined },
      globalSftpFollowTerminalCwd: true,
    }),
    true,
  );
});
