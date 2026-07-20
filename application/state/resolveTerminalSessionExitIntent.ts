export type TerminalSessionExitEvent = {
  exitCode?: number;
  signal?: number;
  error?: string;
  reason?: "exited" | "error" | "timeout" | "closed";
};

export type TerminalSessionExitIntent =
  | { kind: "closeSession" }
  | { kind: "markDisconnected" };

export function resolveTerminalSessionExitIntent(
  _evt: TerminalSessionExitEvent,
): TerminalSessionExitIntent {
  // Keep the tab for every backend exit path (shell exit / Ctrl+D, transport
  // errors, timeouts, channel closes). Users expect scrollback to remain and a
  // one-click reconnect — matching WindTerm / MobaXterm. Explicit tab close is
  // still the only way to remove a session from the workspace.
  return { kind: "markDisconnected" };
}

export function shouldCloseTerminalPopupOnExit(evt: TerminalSessionExitEvent): boolean {
  return evt.reason === "exited" && evt.exitCode === 0;
}
