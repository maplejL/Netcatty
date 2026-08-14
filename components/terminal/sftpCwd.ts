import { logger } from "../../lib/logger";

type SessionPwdResult = {
  success: boolean;
  cwd?: string | null;
};

type SessionPwdOptions = {
  allowHomeFallback?: boolean;
};

type ResolvePreferredTerminalCwdOptions = {
  rendererCwd?: string | null;
  sessionId?: string | null;
  getSessionPwd: (sessionId: string, options?: SessionPwdOptions) => Promise<SessionPwdResult>;
  /** When true, always probe the backend instead of trusting renderer cwd. */
  preferFreshBackend?: boolean;
};

const normalizeCwd = (cwd?: string | null): string | null => {
  if (typeof cwd !== "string" || cwd.trim().length === 0) return null;
  return cwd;
};

export type TerminalCwdTracker = {
  getRendererCwd: () => string | undefined;
  setRendererCwd: (cwd?: string | null) => string | undefined;
  clearRendererCwd: () => void;
};

export const createTerminalCwdTracker = (): TerminalCwdTracker => {
  let rendererCwd: string | undefined;

  return {
    getRendererCwd: () => rendererCwd,
    setRendererCwd: (cwd) => {
      rendererCwd = normalizeCwd(cwd) ?? undefined;
      return rendererCwd;
    },
    clearRendererCwd: () => {
      rendererCwd = undefined;
    },
  };
};

export const resolvePreferredTerminalCwd = async ({
  rendererCwd,
  sessionId,
  getSessionPwd,
  preferFreshBackend = false,
}: ResolvePreferredTerminalCwdOptions): Promise<string | null> => {
  const knownCwd = normalizeCwd(rendererCwd);
  if (!preferFreshBackend && knownCwd) return knownCwd;
  if (!sessionId) {
    logger.trace("[sftpCwd] resolve skipped: no session", { preferFreshBackend, knownCwd });
    return null;
  }

  try {
    logger.trace("[sftpCwd] probe backend cwd", { sessionId, preferFreshBackend, knownCwd });
    const result = await getSessionPwd(
      sessionId,
      preferFreshBackend ? { allowHomeFallback: false } : undefined,
    );
    const backendCwd = result.success ? normalizeCwd(result.cwd) : null;
    logger.trace("[sftpCwd] probe result", {
      sessionId,
      preferFreshBackend,
      success: result.success,
      backendCwd,
    });
    if (preferFreshBackend) return backendCwd;
    return backendCwd ?? knownCwd;
  } catch (error) {
    logger.trace("[sftpCwd] probe threw", {
      sessionId,
      preferFreshBackend,
      error: error instanceof Error ? error.message : String(error),
    });
    return preferFreshBackend ? null : knownCwd;
  }
};

export const PROBE_SESSION_CWD_AFTER_COMMAND_MS = 150;

export type ProbeBackendSessionCwdAfterCommandOptions = {
  sessionId: string;
  osc7SignalAtCommand: number;
  getOsc7Signal: () => number;
  getSessionPwd: (sessionId: string, options?: SessionPwdOptions) => Promise<SessionPwdResult>;
  canProbe?: () => boolean | Promise<boolean>;
};

/** Probe backend pwd when OSC 7 did not report after a command. */
export const probeBackendSessionCwdAfterCommand = async ({
  sessionId,
  osc7SignalAtCommand,
  getOsc7Signal,
  getSessionPwd,
  canProbe = () => true,
}: ProbeBackendSessionCwdAfterCommandOptions): Promise<string | null> => {
  if (getOsc7Signal() !== osc7SignalAtCommand) {
    logger.trace("[sftpCwd] post-command probe skipped: OSC 7 already updated", { sessionId });
    return null;
  }
  const allowed = await canProbe();
  if (!allowed || getOsc7Signal() !== osc7SignalAtCommand) {
    logger.trace("[sftpCwd] post-command probe skipped", { sessionId, allowed });
    return null;
  }

  try {
    // Never accept home-directory fallback here: after `cd` / sudo the probe
    // may only be able to read the login shell, and writing home into the
    // renderer cache makes SFTP follow jump to /root (or $HOME) and stick.
    const result = await getSessionPwd(sessionId, { allowHomeFallback: false });
    if (getOsc7Signal() !== osc7SignalAtCommand) return null;
    const cwd = result.success ? normalizeCwd(result.cwd) : null;
    logger.trace("[sftpCwd] post-command probe result", { sessionId, success: result.success, cwd });
    return cwd;
  } catch (error) {
    logger.trace("[sftpCwd] post-command probe threw", {
      sessionId,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
};

export const scheduleBackendCwdProbeAfterCommand = (
  options: ProbeBackendSessionCwdAfterCommandOptions & {
    onProbedCwd: (cwd: string) => void;
    delayMs?: number;
  },
): (() => void) => {
  const delayMs = options.delayMs ?? PROBE_SESSION_CWD_AFTER_COMMAND_MS;
  const timeoutId = setTimeout(() => {
    void probeBackendSessionCwdAfterCommand(options).then((cwd) => {
      if (cwd) options.onProbedCwd(cwd);
    });
  }, delayMs);
  return () => clearTimeout(timeoutId);
};
