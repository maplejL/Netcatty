import type { Host } from "../models";
import { deriveIpGroupPath } from "../hostIpGroup";
import { buildVaultHostFromDraft } from "../vaultHostCreate";

type VaultImportIssueLevel = "warning" | "error";

interface VaultImportIssue {
  level: VaultImportIssueLevel;
  message: string;
}

interface VaultImportStats {
  parsed: number;
  imported: number;
  skipped: number;
  duplicates: number;
}

interface VaultImportResult {
  hosts: Host[];
  groups: string[];
  issues: VaultImportIssue[];
  stats: VaultImportStats;
}

export interface FinalShellImportFile {
  text: string;
  fileName?: string;
}

export interface FinalShellImportCrypto {
  decryptPassword?: (encrypted: string) => string | null;
  decodePrivateKey?: (keyDataBase64: string) => string | null;
}

export interface FinalShellParsedConnect {
  label: string;
  hostname: string;
  port?: number;
  username?: string;
  password?: string;
  privateKeyPem?: string;
  privateKeyLabel?: string;
}

interface FinalShellConnectJson {
  id?: unknown;
  name?: unknown;
  host?: unknown;
  port?: unknown;
  user_name?: unknown;
  password?: unknown;
  secret_key_id?: unknown;
  parent_id?: unknown;
  group_name?: unknown;
}

const DEFAULT_SSH_PORT = 22;

const emptyStats = (): VaultImportStats => ({
  parsed: 0,
  imported: 0,
  skipped: 0,
  duplicates: 0,
});

const parsePort = (raw: unknown): number | undefined => {
  if (typeof raw === "number" && Number.isFinite(raw)) {
    const port = Math.trunc(raw);
    return port >= 1 && port <= 65535 ? port : undefined;
  }
  if (typeof raw === "string") {
    const port = parseInt(raw.trim(), 10);
    return Number.isFinite(port) && port >= 1 && port <= 65535 ? port : undefined;
  }
  return undefined;
};

const asTrimmedString = (raw: unknown): string | undefined => {
  if (typeof raw !== "string") return undefined;
  const trimmed = raw.trim();
  return trimmed || undefined;
};

export function isFinalShellConfigJson(text: string): boolean {
  try {
    const data = JSON.parse(text);
    return Boolean(data && typeof data === "object" && Array.isArray(data.secret_key_list));
  } catch {
    return false;
  }
}

export function isFinalShellConnectJson(text: string): boolean {
  try {
    const data = JSON.parse(text) as FinalShellConnectJson;
    if (!data || typeof data !== "object") return false;
    if (Array.isArray((data as { secret_key_list?: unknown }).secret_key_list)) {
      return false;
    }
    const host = asTrimmedString(data.host);
    if (!host) return false;
    return Boolean(
      asTrimmedString(data.user_name)
      || asTrimmedString(data.name)
      || asTrimmedString(data.password)
      || asTrimmedString(data.secret_key_id),
    );
  } catch {
    return false;
  }
}

export function loadFinalShellSecretKeyMap(configText: string): Record<string, string> {
  try {
    const data = JSON.parse(configText) as { secret_key_list?: unknown };
    const list = data?.secret_key_list;
    if (!Array.isArray(list)) return {};
    const map: Record<string, string> = {};
    for (const item of list) {
      if (!item || typeof item !== "object") continue;
      const id = asTrimmedString((item as { id?: unknown }).id);
      const keyData = asTrimmedString((item as { key_data?: unknown }).key_data);
      if (id && keyData) {
        map[id] = keyData;
      }
    }
    return map;
  } catch {
    return {};
  }
}

export function parseFinalShellConnectFile(
  text: string,
  options?: {
    fileName?: string;
    secretKeyMap?: Record<string, string>;
    crypto?: FinalShellImportCrypto;
  },
): { parsed: FinalShellParsedConnect | null; issues: VaultImportIssue[] } {
  const issues: VaultImportIssue[] = [];
  let data: FinalShellConnectJson;
  try {
    data = JSON.parse(text) as FinalShellConnectJson;
  } catch {
    return {
      parsed: null,
      issues: [{ level: "error", message: "Invalid FinalShell JSON." }],
    };
  }

  const hostname = asTrimmedString(data.host);
  if (!hostname) {
    return {
      parsed: null,
      issues: [{ level: "warning", message: "FinalShell entry is missing host." }],
    };
  }

  const label =
    asTrimmedString(data.name)
    || (options?.fileName?.replace(/_connect_config\.json$/i, "").replace(/\.json$/i, ""))
    || hostname;
  const username = asTrimmedString(data.user_name);
  const port = parsePort(data.port) ?? DEFAULT_SSH_PORT;

  let password: string | undefined;
  const plainPassword = asTrimmedString((data as { password_plain?: unknown }).password_plain);
  if (plainPassword) {
    password = plainPassword;
  } else {
    const encryptedPassword = asTrimmedString(data.password);
    if (encryptedPassword) {
      try {
        const decoded = options?.crypto?.decryptPassword?.(encryptedPassword) ?? null;
        if (decoded) {
          password = decoded;
        } else {
          issues.push({
            level: "warning",
            message: `FinalShell entry "${label}": could not decrypt password.`,
          });
        }
      } catch (error) {
        issues.push({
          level: "warning",
          message: `FinalShell entry "${label}": password decrypt failed (${error instanceof Error ? error.message : "unknown"}).`,
        });
      }
    }
  }

  let privateKeyPem: string | undefined;
  const plainPrivateKey = asTrimmedString((data as { private_key_plain?: unknown }).private_key_plain);
  if (plainPrivateKey) {
    privateKeyPem = plainPrivateKey;
  } else {
    const secretKeyId = asTrimmedString(data.secret_key_id);
    if (secretKeyId) {
      const keyData = options?.secretKeyMap?.[secretKeyId];
      if (!keyData) {
        issues.push({
          level: "warning",
          message: `FinalShell entry "${label}": missing private key in config.json (secret_key_id=${secretKeyId}).`,
        });
      } else {
        try {
          const decoded = options?.crypto?.decodePrivateKey?.(keyData) ?? null;
          if (decoded) {
            privateKeyPem = decoded;
          } else {
            issues.push({
              level: "warning",
              message: `FinalShell entry "${label}": could not decode private key.`,
            });
          }
        } catch (error) {
          issues.push({
            level: "warning",
            message: `FinalShell entry "${label}": private key decode failed (${error instanceof Error ? error.message : "unknown"}).`,
          });
        }
      }
    }
  }

  return {
    parsed: {
      label,
      hostname,
      port,
      username,
      password,
      privateKeyPem,
      privateKeyLabel: `${label} Key`,
    },
    issues,
  };
}

const hostMergeKey = (host: Host) =>
  `${(host.protocol ?? "ssh").toLowerCase()}|${host.hostname.toLowerCase()}|${host.port}|${(host.username ?? "").toLowerCase()}`;

export function importFromFinalShell(
  files: FinalShellImportFile[],
  options?: {
    secretKeyMap?: Record<string, string>;
    crypto?: FinalShellImportCrypto;
  },
): VaultImportResult & {
  keyAttachments: Array<{ hostKey: string; label: string; privateKeyPem: string }>;
} {
  const issues: VaultImportIssue[] = [];
  const keyAttachments: Array<{ hostKey: string; label: string; privateKeyPem: string }> = [];
  let secretKeyMap = { ...(options?.secretKeyMap ?? {}) };

  for (const file of files) {
    if (isFinalShellConfigJson(file.text)) {
      secretKeyMap = { ...secretKeyMap, ...loadFinalShellSecretKeyMap(file.text) };
    }
  }

  const connectFiles = files.filter((file) => isFinalShellConnectJson(file.text));
  if (connectFiles.length === 0) {
    return {
      hosts: [],
      groups: [],
      issues: [{ level: "error", message: "No FinalShell connection JSON files found." }],
      stats: emptyStats(),
      keyAttachments,
    };
  }

  const hosts: Host[] = [];
  let parsed = 0;
  let skipped = 0;

  for (const file of connectFiles) {
    parsed += 1;
    const result = parseFinalShellConnectFile(file.text, {
      fileName: file.fileName,
      secretKeyMap,
      crypto: options?.crypto,
    });
    issues.push(...result.issues);
    if (!result.parsed) {
      skipped += 1;
      continue;
    }

    const built = buildVaultHostFromDraft({
      label: result.parsed.label,
      hostname: result.parsed.hostname,
      username: result.parsed.username,
      password: result.parsed.password,
      port: result.parsed.port,
      group: deriveIpGroupPath(result.parsed.hostname),
      protocol: "ssh",
    });
    if (!built.ok) {
      skipped += 1;
      issues.push({
        level: "warning",
        message: `FinalShell entry "${result.parsed.label}": ${built.error}`,
      });
      continue;
    }

    hosts.push(built.host);
    if (result.parsed.privateKeyPem) {
      keyAttachments.push({
        hostKey: hostMergeKey(built.host),
        label: result.parsed.privateKeyLabel ?? `${result.parsed.label} Key`,
        privateKeyPem: result.parsed.privateKeyPem,
      });
    }
  }

  const seen = new Map<string, Host>();
  let duplicates = 0;
  for (const host of hosts) {
    const key = hostMergeKey(host);
    if (seen.has(key)) {
      duplicates += 1;
      continue;
    }
    seen.set(key, host);
  }

  const dedupedHosts = Array.from(seen.values());
  return {
    hosts: dedupedHosts,
    groups: [],
    issues,
    stats: {
      parsed,
      imported: dedupedHosts.length,
      skipped,
      duplicates,
    },
    keyAttachments,
  };
}
