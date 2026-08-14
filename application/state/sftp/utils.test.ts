import test from "node:test";
import assert from "node:assert/strict";

import {
  getParentPath,
  getSftpFilterAfterPathChange,
  getSftpFilterAfterPathChangeError,
  isConcreteTransferTargetPath,
  isSftpPermissionDeniedError,
  shouldClearSftpFilterForPathChange,
  shouldApplySftpSoftRefreshRevision,
  shouldUseBackgroundSftpSoftRefresh,
} from "./utils";

test("concrete transfer target paths exclude temporary placeholders", () => {
  assert.equal(isConcreteTransferTargetPath({ targetPath: "/Users/alice/Downloads/report.pdf" }), true);
  assert.equal(isConcreteTransferTargetPath({ targetPath: "C:\\Users\\alice\\Downloads\\report.pdf" }), true);
  assert.equal(isConcreteTransferTargetPath({ targetPath: "(temp)" }), false);
  assert.equal(isConcreteTransferTargetPath({ targetPath: "   " }), false);
});

test("SFTP filter clears when entering a different directory", () => {
  assert.equal(shouldClearSftpFilterForPathChange("/srv", "/srv/app"), true);
  assert.equal(getSftpFilterAfterPathChange("/srv", "/srv/app", "log"), "");
});

test("SFTP filter clears when navigating to the parent directory", () => {
  assert.equal(shouldClearSftpFilterForPathChange("/srv/app", getParentPath("/srv/app")), true);
  assert.equal(getSftpFilterAfterPathChange("/srv/app", getParentPath("/srv/app"), "dist"), "");
});

test("SFTP filter stays when refreshing the same directory", () => {
  assert.equal(shouldClearSftpFilterForPathChange("/srv/app", "/srv/app"), false);
  assert.equal(shouldClearSftpFilterForPathChange("/srv/app", "/srv/app/"), false);
  assert.equal(shouldClearSftpFilterForPathChange("C:\\Users\\alice", "c:/Users/alice"), false);
  assert.equal(getSftpFilterAfterPathChange("/srv/app", "/srv/app", "log"), "log");
  assert.equal(getSftpFilterAfterPathChange("/srv/app", "/srv/app/", "log"), "log");
  assert.equal(getSftpFilterAfterPathChange("C:\\Users\\alice", "c:/Users/alice", "docs"), "docs");
});

test("SFTP filter restores when changed-directory navigation fails", () => {
  assert.equal(getSftpFilterAfterPathChangeError(true, "log", "typed-while-loading"), "log");
});

test("SFTP filter preserves in-flight edits when same-directory refresh fails", () => {
  assert.equal(getSftpFilterAfterPathChangeError(false, "log", "typed-while-loading"), "typed-while-loading");
});

test("background soft refresh only applies for soft same-path lists with existing files", () => {
  assert.equal(
    shouldUseBackgroundSftpSoftRefresh({
      soft: true,
      currentPath: "/home/ubuntu",
      targetPath: "/home/ubuntu",
      existingFileCount: 12,
    }),
    true,
  );
  assert.equal(
    shouldUseBackgroundSftpSoftRefresh({
      soft: true,
      currentPath: "/home/ubuntu",
      targetPath: "/home/ubuntu/",
      existingFileCount: 3,
    }),
    true,
  );
  assert.equal(
    shouldUseBackgroundSftpSoftRefresh({
      soft: true,
      currentPath: "/home/ubuntu",
      targetPath: "/tmp",
      existingFileCount: 12,
    }),
    false,
  );
  assert.equal(
    shouldUseBackgroundSftpSoftRefresh({
      soft: true,
      currentPath: "/home/ubuntu",
      targetPath: "/home/ubuntu",
      existingFileCount: 0,
    }),
    false,
  );
  assert.equal(
    shouldUseBackgroundSftpSoftRefresh({
      soft: false,
      currentPath: "/home/ubuntu",
      targetPath: "/home/ubuntu",
      existingFileCount: 12,
    }),
    false,
  );
});

test("soft-refresh revision applies once per bump and skips disconnected/busy panes", () => {
  const base = {
    isVisible: true,
    revision: 4,
    lastHandledRevision: 3,
    hasConnection: true,
    hasActiveWork: false,
  };
  assert.equal(shouldApplySftpSoftRefreshRevision(base), true);
  assert.equal(shouldApplySftpSoftRefreshRevision({ ...base, lastHandledRevision: 4 }), false);
  assert.equal(shouldApplySftpSoftRefreshRevision({ ...base, revision: 0 }), false);
  assert.equal(shouldApplySftpSoftRefreshRevision({ ...base, isVisible: false }), false);
  assert.equal(shouldApplySftpSoftRefreshRevision({ ...base, hasConnection: false }), false);
  assert.equal(shouldApplySftpSoftRefreshRevision({ ...base, hasActiveWork: true }), false);
});

test("isSftpPermissionDeniedError matches ssh2 write failures", () => {
  assert.equal(isSftpPermissionDeniedError(new Error("Permission denied")), true);
  assert.equal(isSftpPermissionDeniedError(new Error("EACCES: permission denied, open '/etc/nginx/nginx.conf'")), true);
  assert.equal(isSftpPermissionDeniedError(new Error("SFTP session not found")), false);
});
