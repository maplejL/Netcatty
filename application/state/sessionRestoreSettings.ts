export const DEFAULT_RESTORE_PREVIOUS_SESSION = true;
export const DEFAULT_RESTORE_TERMINAL_CWD = true;

export const resolveRestorePreviousSessionSetting = (stored: boolean | null): boolean =>
  stored ?? DEFAULT_RESTORE_PREVIOUS_SESSION;

export const resolveRestoreTerminalCwdSetting = (stored: boolean | null): boolean =>
  stored ?? DEFAULT_RESTORE_TERMINAL_CWD;
