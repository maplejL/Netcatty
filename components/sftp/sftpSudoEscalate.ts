export type SftpEscalateConnectResult = {
  connectionId: string;
  ok: boolean;
  sudo: boolean;
};

export type SftpEscalateConnectionSnapshot = {
  id?: string | null;
  status?: string | null;
  sudo?: boolean;
};

/** Wait-before-probe delays after a terminal sudo so the new root shell can appear. */
export const SFTP_POST_SUDO_CWD_PROBE_DELAYS_MS = [0, 400, 1200, 2500, 4500] as const;

export const resolveSftpEscalateConnectionId = (
  connectResult: SftpEscalateConnectResult | void | null,
  current?: SftpEscalateConnectionSnapshot | null,
): string | null => {
  if (connectResult?.ok && connectResult.sudo && connectResult.connectionId) {
    return connectResult.connectionId;
  }
  if (current?.status === "connected" && current.sudo && current.id) {
    return current.id;
  }
  return null;
};

export const isAlreadyElevatedSftpConnection = (
  current?: SftpEscalateConnectionSnapshot | null,
): current is SftpEscalateConnectionSnapshot & { id: string } =>
  Boolean(current?.status === "connected" && current.sudo && current.id);

export async function probeTerminalCwdWithRetries(
  probe: () => Promise<string | null | undefined>,
  delaysMs: readonly number[] = SFTP_POST_SUDO_CWD_PROBE_DELAYS_MS,
  wait: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => {
    setTimeout(resolve, ms);
  }),
): Promise<string | null> {
  for (const delayMs of delaysMs) {
    if (delayMs > 0) await wait(delayMs);
    const cwd = (await probe())?.trim() || null;
    if (cwd) return cwd;
  }
  return null;
}
