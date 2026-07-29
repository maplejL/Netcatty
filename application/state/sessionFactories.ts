import type { Host, SerialConfig, TerminalSession } from "../../domain/models";

export interface LocalTerminalOptions {
  shellType?: TerminalSession["shellType"];
  shell?: string;
  shellArgs?: string[];
  shellName?: string;
  shellIcon?: string;
  localStartDir?: string;
  /** Run after the local shell is ready (e.g. coding CLI jump). */
  startupCommand?: string;
  codingCliProviderId?: TerminalSession["codingCliProviderId"];
  /** History row to update in place when this session was opened via jump. */
  codingCliHistoryEntryId?: string;
  customName?: string;
}

/**
 * Stable hostId for all Local Terminal sessions.
 *
 * Autocomplete command history is keyed by hostId. Using `local-${sessionId}`
 * made every new Local Terminal look like a brand-new host, so history
 * suggestions never accumulated across opens (issue #2037).
 */
export const LOCAL_TERMINAL_HOST_ID = "local-terminal";

export const createLocalTerminalSession = (
  sessionId: string,
  options?: LocalTerminalOptions,
): TerminalSession => ({
  id: sessionId,
  hostId: LOCAL_TERMINAL_HOST_ID,
  hostLabel: options?.customName || options?.shellName || "Local Terminal",
  hostname: "localhost",
  username: "local",
  status: "connecting",
  protocol: "local",
  shellType: options?.shellType,
  localShell: options?.shell,
  localShellArgs: options?.shellArgs,
  localShellName: options?.shellName,
  localShellIcon: options?.shellIcon,
  localStartDir: options?.localStartDir,
  ...(options?.startupCommand ? { startupCommand: options.startupCommand } : {}),
  ...(options?.codingCliProviderId ? { codingCliProviderId: options.codingCliProviderId } : {}),
  ...(options?.codingCliHistoryEntryId
    ? { codingCliHistoryEntryId: options.codingCliHistoryEntryId }
    : {}),
  ...(options?.customName ? { customName: options.customName } : {}),
});

export const createSerialTerminalSession = (
  sessionId: string,
  config: SerialConfig,
  options?: { charset?: string },
): TerminalSession => {
  const portName = config.path.split("/").pop() || config.path;
  return {
    id: sessionId,
    hostId: `serial-${sessionId}`,
    hostLabel: `Serial: ${portName}`,
    hostname: config.path,
    username: "",
    status: "connecting",
    protocol: "serial",
    serialConfig: config,
    charset: options?.charset,
  };
};

export const createHostTerminalSession = (
  sessionId: string,
  host: Host,
): TerminalSession => {
  if (host.protocol === "serial") {
    const serialConfig: SerialConfig = host.serialConfig || {
      path: host.hostname,
      baudRate: host.port || 115200,
      dataBits: 8,
      stopBits: 1,
      parity: "none",
      flowControl: "none",
      localEcho: false,
      lineMode: false,
    };
    const portName = serialConfig.path.split("/").pop() || serialConfig.path;
    return {
      id: sessionId,
      hostId: host.id,
      hostLabel: host.label || `Serial: ${portName}`,
      hostname: serialConfig.path,
      username: "",
      status: "connecting",
      protocol: "serial",
      serialConfig,
      charset: host.charset,
    };
  }

  return {
    id: sessionId,
    hostId: host.id,
    hostLabel: host.label,
    hostname: host.hostname,
    username: host.username,
    status: "connecting",
    protocol: host.protocol,
    port: host.port,
    moshEnabled: host.moshEnabled,
    etEnabled: host.etEnabled,
    charset: host.charset,
  };
};
