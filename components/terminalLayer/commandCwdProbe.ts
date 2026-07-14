import { resolveHostFollowTerminalCwd, resolveSftpFollowTerminalCwdTargetHost } from "../sftp/sftpFollowTerminalCwd";

type FollowTerminalCwdHost = {
  sftpFollowTerminalCwd?: boolean;
};

type ShouldProbeCommandCwdOptions = {
  restoreTerminalCwd: boolean;
  visibleSftpHost?: FollowTerminalCwdHost | null;
  sessionHost?: FollowTerminalCwdHost | null;
  globalSftpFollowTerminalCwd: boolean;
};

export const shouldProbeCommandCwd = ({
  restoreTerminalCwd,
  visibleSftpHost,
  sessionHost,
  globalSftpFollowTerminalCwd,
}: ShouldProbeCommandCwdOptions): boolean => {
  if (restoreTerminalCwd) return true;

  // Keep the renderer cwd cache warm whenever SFTP is open (go-to-cwd) or
  // follow is enabled on the session/global host setting.
  if (visibleSftpHost) return true;

  const followHost = resolveSftpFollowTerminalCwdTargetHost(visibleSftpHost, sessionHost);
  if (!followHost) return false;
  return resolveHostFollowTerminalCwd(
    followHost.sftpFollowTerminalCwd,
    globalSftpFollowTerminalCwd,
  );
};
