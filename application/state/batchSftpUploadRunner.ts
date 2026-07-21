import {
  createInitialBatchSftpResult,
  fileNameFromLocalPath,
  isBatchSftpEligibleHost,
  joinRemotePath,
  type BatchSftpHostResult,
} from "../../domain/batchSftpUpload";
import type { Host, Identity, KnownHost, SSHKey, TerminalSettings } from "../../domain/models";
import { buildSftpHostCredentials } from "./sftp/useSftpHostCredentials";
import { netcattyBridge } from "../../infrastructure/services/netcattyBridge";

export type BatchSftpUploadRunnerOptions = {
  hosts: Host[];
  allHosts: Host[];
  keys: SSHKey[];
  identities: Identity[];
  knownHosts?: KnownHost[];
  terminalSettings?: Pick<TerminalSettings, "verifyHostKeys" | "keepaliveInterval" | "keepaliveCountMax">;
  localPaths: string[];
  remoteDir: string;
  concurrency?: number;
  onHostUpdate: (result: BatchSftpHostResult) => void;
  isCancelled?: () => boolean;
};

async function uploadOneFile(
  sftpId: string,
  localPath: string,
  remoteDir: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const bridge = netcattyBridge.get();
  if (!bridge?.startStreamTransfer) {
    return { ok: false, error: "Stream transfer unavailable" };
  }

  const fileName = fileNameFromLocalPath(localPath);
  const remotePath = joinRemotePath(remoteDir, fileName);
  const transferId = `batch-sftp-${crypto.randomUUID()}`;

  return new Promise((resolve) => {
    void bridge
      .startStreamTransfer!(
        {
          transferId,
          sourcePath: localPath,
          targetPath: remotePath,
          sourceType: "local",
          targetType: "sftp",
          targetSftpId: sftpId,
        },
        undefined,
        () => resolve({ ok: true }),
        (error) => resolve({ ok: false, error: error || "Upload failed" }),
      )
      .then((startResult) => {
        if (startResult?.error) {
          resolve({ ok: false, error: startResult.error });
        }
      })
      .catch((err) => {
        resolve({
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        });
      });
  });
}

async function uploadToHost(
  host: Host,
  options: BatchSftpUploadRunnerOptions,
): Promise<BatchSftpHostResult> {
  const base = createInitialBatchSftpResult(host);
  base.total = options.localPaths.length;

  const eligibility = isBatchSftpEligibleHost(host);
  if (!eligibility.ok) {
    return { ...base, status: "skipped", skipReason: eligibility.reason };
  }

  if (options.isCancelled?.()) {
    return { ...base, status: "error", error: "Cancelled" };
  }

  options.onHostUpdate({ ...base, status: "connecting" });

  const bridge = netcattyBridge.get();
  if (!bridge?.openSftp || !bridge.closeSftp) {
    return { ...base, status: "error", error: "SFTP bridge unavailable" };
  }

  let sftpId: string | null = null;
  try {
    const credentials = buildSftpHostCredentials({
      host,
      hosts: options.allHosts,
      keys: options.keys,
      identities: options.identities,
      knownHosts: options.knownHosts,
      terminalSettings: options.terminalSettings,
    });
    sftpId = await bridge.openSftp(credentials);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/credential|decrypt|passphrase|password|auth/i.test(message)) {
      return { ...base, status: "skipped", skipReason: "credentials", error: message };
    }
    return { ...base, status: "error", error: message };
  }

  options.onHostUpdate({ ...base, status: "uploading", uploaded: 0 });

  const fileErrors: Array<{ fileName: string; error: string }> = [];
  let uploaded = 0;

  try {
    for (const localPath of options.localPaths) {
      if (options.isCancelled?.()) {
        return {
          ...base,
          status: "error",
          uploaded,
          error: "Cancelled",
          fileErrors: fileErrors.length ? fileErrors : undefined,
        };
      }
      const result = await uploadOneFile(sftpId, localPath, options.remoteDir.trim() || "/");
      if (result.ok) {
        uploaded += 1;
      } else {
        fileErrors.push({
          fileName: fileNameFromLocalPath(localPath),
          error: result.error,
        });
      }
      options.onHostUpdate({
        ...base,
        status: "uploading",
        uploaded,
        fileErrors: fileErrors.length ? [...fileErrors] : undefined,
      });
    }
  } finally {
    try {
      await bridge.closeSftp(sftpId);
    } catch {
      // ignore close errors
    }
  }

  if (fileErrors.length === options.localPaths.length) {
    return {
      ...base,
      status: "error",
      uploaded,
      error: fileErrors[0]?.error || "All uploads failed",
      fileErrors,
    };
  }

  if (fileErrors.length > 0) {
    return {
      ...base,
      status: "error",
      uploaded,
      error: `${fileErrors.length} file(s) failed`,
      fileErrors,
    };
  }

  return { ...base, status: "success", uploaded };
}

/**
 * Fan out the same local file set to many SSH hosts via independent SFTP sessions.
 * Hosts run with limited concurrency; files within a host are sequential.
 */
export async function runBatchSftpUpload(
  options: BatchSftpUploadRunnerOptions,
): Promise<BatchSftpHostResult[]> {
  const concurrency = Math.max(1, Math.min(options.concurrency ?? 3, 8));
  const results = new Map<string, BatchSftpHostResult>();

  for (const host of options.hosts) {
    const initial = createInitialBatchSftpResult(host);
    initial.total = options.localPaths.length;
    results.set(host.id, initial);
    options.onHostUpdate(initial);
  }

  let index = 0;
  const workers = Array.from({ length: Math.min(concurrency, options.hosts.length) }, async () => {
    while (index < options.hosts.length) {
      if (options.isCancelled?.()) break;
      const current = options.hosts[index];
      index += 1;
      const result = await uploadToHost(current, options);
      results.set(current.id, result);
      options.onHostUpdate(result);
    }
  });

  await Promise.all(workers);
  return options.hosts.map((h) => results.get(h.id)!);
}
