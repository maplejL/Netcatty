import type { SftpPane } from "../../application/state/sftp/types";

export type SftpSidePanelTabHealth = Pick<SftpPane, "connection" | "loading" | "reconnecting">;

/** Whether a remote SFTP tab is safe to reuse without reconnecting. */
export function isRemoteSftpTabHealthy(
  tab: SftpSidePanelTabHealth,
  hasBackendSession: boolean,
): boolean {
  const conn = tab.connection;
  if (!conn || conn.isLocal) return true;
  if (conn.status !== "connected") return false;
  if (tab.loading || tab.reconnecting) return false;
  if (!hasBackendSession) return false;
  return true;
}

/**
 * Skip auto-connect when the active tab is already bound to this endpoint.
 * Listing (`loading`) is a navigation in progress — do not treat it as a
 * hung tab and reconnect, or follow-cwd / go-to-cwd get aborted mid-list.
 */
export function shouldSkipSftpSidePanelAutoConnect(
  connectionKey: string,
  connectedKey: string | null,
  activeTab: SftpSidePanelTabHealth | null | undefined,
  hasBackendSession: boolean,
): boolean {
  if (connectedKey !== connectionKey) return false;
  if (!activeTab) return false;
  const conn = activeTab.connection;
  if (!conn) return false;
  if (conn.isLocal) return true;
  if (conn.status !== "connected") return false;
  if (activeTab.reconnecting) return false;
  if (!hasBackendSession) return false;
  return true;
}

export function findReusableSftpSidePanelTab(
  tabs: SftpPane[],
  hostId: string,
  connectionKey: string,
  tabConnectionKeyMap: ReadonlyMap<string, string>,
  hasBackendSession: (connectionId: string) => boolean,
): SftpPane | null {
  const candidate = tabs.find((tab) => {
    if (!tab.connection || tab.connection.hostId !== hostId) return false;
    if (tab.connection.status === "error" || tab.connection.status === "disconnected") return false;
    return tabConnectionKeyMap.get(tab.id) === connectionKey;
  });
  if (!candidate?.connection) return null;
  if (!isRemoteSftpTabHealthy(candidate, hasBackendSession(candidate.connection.id))) {
    return null;
  }
  return candidate;
}

/** True when the linked terminal SSH session changed and SFTP must rebind. */
export function shouldResetSftpSidePanelSourceSession(
  previousSessionId: string | null | undefined,
  nextSessionId: string | null | undefined,
): boolean {
  if (!nextSessionId) return false;
  if (!previousSessionId) return false;
  return nextSessionId !== previousSessionId;
}

/**
 * Prefer session-scoped SFTP path when switching between terminal sessions on
 * the same host: remembered browse path, then live terminal cwd.
 */
export function resolveSftpPathForLinkedSession(params: {
  rememberedPath?: string | null;
  terminalCwd?: string | null;
  currentPath?: string | null;
}): string | null {
  const remembered = (params.rememberedPath || "").trim();
  if (remembered) return remembered;
  const cwd = (params.terminalCwd || "").trim();
  if (cwd) return cwd;
  return null;
}

/** Whether an already-connected same-host SFTP pane should navigate on session switch. */
export function shouldNavigateSftpOnSessionSwitch(params: {
  sessionChanged: boolean;
  isConnected: boolean;
  isLocal: boolean;
  hostIdMatches: boolean;
  targetPath: string | null;
  currentPath?: string | null;
}): boolean {
  if (!params.sessionChanged) return false;
  if (!params.isConnected || params.isLocal) return false;
  if (!params.hostIdMatches) return false;
  if (!params.targetPath) return false;
  const current = (params.currentPath || "").replace(/\/+$/, "") || "/";
  const target = params.targetPath.replace(/\/+$/, "") || "/";
  return current !== target;
}
