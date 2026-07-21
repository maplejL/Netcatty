import type { Host } from "./models";

export type BatchSftpHostStatus = "pending" | "connecting" | "uploading" | "success" | "error" | "skipped";

export type BatchSftpSkipReason = "non-ssh" | "local" | "credentials";

export interface BatchSftpHostResult {
  hostId: string;
  label: string;
  hostname: string;
  status: BatchSftpHostStatus;
  skipReason?: BatchSftpSkipReason;
  uploaded: number;
  total: number;
  error?: string;
  fileErrors?: Array<{ fileName: string; error: string }>;
}

export function createInitialBatchSftpResult(host: Host): BatchSftpHostResult {
  return {
    hostId: host.id,
    label: host.label || host.hostname,
    hostname: host.hostname,
    status: "pending",
    uploaded: 0,
    total: 0,
  };
}

/** Remote path join that keeps POSIX semantics (SFTP targets are Unix-like). */
export function joinRemotePath(base: string, name: string): string {
  const cleanBase = (base || "/").replace(/\/+$/, "") || "";
  const cleanName = name.replace(/^\/+/, "");
  if (!cleanBase || cleanBase === "/") return `/${cleanName}`;
  return `${cleanBase}/${cleanName}`;
}

export function fileNameFromLocalPath(localPath: string): string {
  const normalized = localPath.replace(/\\/g, "/");
  const parts = normalized.split("/");
  return parts[parts.length - 1] || localPath;
}

export function isBatchSftpEligibleHost(
  host: Host,
): { ok: true } | { ok: false; reason: BatchSftpSkipReason } {
  const protocol = host.protocol ?? "ssh";
  if (protocol === "local") {
    return { ok: false, reason: "local" };
  }
  if (protocol !== "ssh") {
    return { ok: false, reason: "non-ssh" };
  }
  return { ok: true };
}
