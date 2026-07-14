import { isSameSftpPath } from "../../application/state/sftp/utils";

export type SftpFollowTerminalCwdBlock = {
  connectionId: string;
  terminalCwd: string;
};

export type SftpFollowTerminalCwdContext = {
  followEnabled: boolean;
  isVisible: boolean;
  terminalCwd?: string | null;
  currentPath?: string | null;
  connectionId?: string | null;
  hasActiveWork: boolean;
  isConnected: boolean;
  /** Skip auto-follow while this terminal cwd cannot be reached on SFTP. */
  blockedFollow?: SftpFollowTerminalCwdBlock | null;
};

export const resolveHostFollowTerminalCwd = (
  hostFollowTerminalCwd: boolean | undefined,
  globalFollowTerminalCwd: boolean,
): boolean => hostFollowTerminalCwd ?? globalFollowTerminalCwd;

/** Compare cwd paths for follow/block logic (trailing slashes, Windows drive case). */
export const isSameTerminalCwdPath = (
  a?: string | null,
  b?: string | null,
): boolean => {
  if (a == null || b == null) return false;
  const left = a.trim();
  const right = b.trim();
  if (!left || !right) return false;
  return isSameSftpPath(left, right);
};

export const resolveSftpFollowTerminalCwdTargetHost = <T>(
  visibleHost: T | null | undefined,
  fallbackHost: T | null | undefined,
): T | null => visibleHost ?? fallbackHost ?? null;

export const mergeLatestFollowTerminalCwdHostSetting = <
  T extends { id?: string; sftpFollowTerminalCwd?: boolean },
>(
  displayHost: T | null | undefined,
  latestHost: T | null | undefined,
  pendingFollowOverride?: boolean,
): T | null => {
  if (!displayHost) return latestHost ?? null;
  if (!latestHost || latestHost.id !== displayHost.id) return displayHost;

  return {
    ...latestHost,
    ...displayHost,
    sftpFollowTerminalCwd:
      latestHost.sftpFollowTerminalCwd !== undefined
        ? latestHost.sftpFollowTerminalCwd
        : pendingFollowOverride,
  };
};

/** Clear a follow block once the user reaches the blocked cwd through any navigation. */
export const shouldClearBlockedFollowOnReach = (
  blockedFollow: SftpFollowTerminalCwdBlock | null | undefined,
  connectionId: string | null | undefined,
  currentPath: string | null | undefined,
  loading: boolean,
): boolean => {
  if (loading || !blockedFollow || !connectionId || !currentPath) return false;
  return (
    blockedFollow.connectionId === connectionId
    && isSameTerminalCwdPath(blockedFollow.terminalCwd, currentPath)
  );
};

/** Whether SFTP should auto-navigate to match the linked terminal cwd. */
export const shouldFollowTerminalCwdNavigate = ({
  followEnabled,
  isVisible,
  terminalCwd,
  currentPath,
  connectionId,
  hasActiveWork,
  isConnected,
  blockedFollow,
}: SftpFollowTerminalCwdContext): boolean => {
  if (!followEnabled || !isVisible || !isConnected) return false;
  if (hasActiveWork) return false;
  if (!terminalCwd || terminalCwd.trim().length === 0) return false;
  if (
    blockedFollow
    && connectionId
    && blockedFollow.connectionId === connectionId
    && isSameTerminalCwdPath(blockedFollow.terminalCwd, terminalCwd)
  ) {
    return false;
  }
  // No current path yet (still connecting) — still allow first follow jump.
  if (currentPath && isSameTerminalCwdPath(currentPath, terminalCwd)) return false;
  return true;
};
