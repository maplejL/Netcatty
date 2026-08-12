import type { TerminalSession } from "../../domain/models";

export type TerminalReconnectMode = "restored" | "manual" | "automatic";

export const getInitialTerminalStatus = (): TerminalSession["status"] => (
  "connecting"
);

export const shouldStartTerminalBackend = (): boolean => true;

export const shouldSuppressHostStartupCommandOnReconnect = (
  mode: TerminalReconnectMode,
): boolean => mode === "automatic";

/**
 * Manual and restored reconnects are a fresh "connect" for automation scripts.
 * Automatic reconnect after a drop must not re-run onConnect scripts mid-session.
 */
export const shouldResetConnectAutomationOnReconnect = (
  mode: TerminalReconnectMode,
): boolean => mode !== "automatic";
