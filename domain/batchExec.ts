import type { Host, Identity, SSHKey } from './models';
import { isEncryptedCredentialPlaceholder, sanitizeCredentialValue } from './credentials';
import { resolveBridgeKeyAuth, resolveHostAuth } from './sshAuth';

export type BatchExecSkipReason = 'non-ssh' | 'jump-chain' | 'credentials';

export type BatchExecHostStatus = 'pending' | 'running' | 'success' | 'error' | 'skipped';

export type BatchExecHostResult = {
  hostId: string;
  label: string;
  hostname: string;
  status: BatchExecHostStatus;
  exitCode?: number | null;
  stdout?: string;
  stderr?: string;
  error?: string;
  skipReason?: BatchExecSkipReason;
};

export type BatchExecCommandPayload = {
  hostname: string;
  username: string;
  port: number;
  command: string;
  password?: string;
  privateKey?: string;
  certificate?: string;
  publicKey?: string;
  keyId?: string;
  keySource?: 'generated' | 'imported' | 'reference';
  passphrase?: string;
  identityFilePaths?: string[];
  legacyAlgorithms?: boolean;
  skipEcdsaHostKey?: boolean;
  algorithmOverrides?: Host['algorithms'];
  enableKeyboardInteractive: boolean;
  sessionId: string;
  timeout: number;
};

const BATCH_EXEC_OUTPUT_LIMIT = 8000;

export const truncateBatchExecOutput = (text: string, maxLen = BATCH_EXEC_OUTPUT_LIMIT): string => {
  if (text.length <= maxLen) return text;
  return `${text.slice(0, maxLen)}\n...[truncated]`;
};

export const isBatchExecEligibleHost = (host: Host): { eligible: true } | { eligible: false; reason: BatchExecSkipReason } => {
  const protocol = host.protocol ?? 'ssh';
  if (protocol !== 'ssh') {
    return { eligible: false, reason: 'non-ssh' };
  }
  if (host.hostChain?.hostIds?.length) {
    return { eligible: false, reason: 'jump-chain' };
  }
  if (host.hostChaining?.trim()) {
    return { eligible: false, reason: 'jump-chain' };
  }
  return { eligible: true };
};

export const buildBatchExecCommandPayload = (args: {
  host: Host;
  command: string;
  keys: SSHKey[];
  identities?: Identity[];
  timeoutMs?: number;
}): { payload: BatchExecCommandPayload } | { error: BatchExecSkipReason | 'credentials' } => {
  const eligibility = isBatchExecEligibleHost(args.host);
  if (!eligibility.eligible) {
    return { error: eligibility.reason };
  }

  const resolved = resolveHostAuth({
    host: args.host,
    keys: args.keys,
    identities: args.identities,
  });
  const keyAuth = resolveBridgeKeyAuth({
    key: resolved.key,
    fallbackIdentityFilePaths: resolved.authMethod === 'password' || resolved.keyId
      ? undefined
      : args.host.identityFilePaths,
    passphrase: resolved.passphrase,
  });

  const password = sanitizeCredentialValue(resolved.password);
  const hasKeyMaterial = Boolean(keyAuth.privateKey || keyAuth.identityFilePaths?.length);
  const hasUnreadableCredential =
    isEncryptedCredentialPlaceholder(resolved.password) ||
    isEncryptedCredentialPlaceholder(resolved.key?.privateKey) ||
    isEncryptedCredentialPlaceholder(resolved.key?.passphrase);

  if (
    (resolved.authMethod === 'password' && isEncryptedCredentialPlaceholder(resolved.password) && !password) ||
    (resolved.authMethod !== 'password' && hasUnreadableCredential && !password && !hasKeyMaterial)
  ) {
    return { error: 'credentials' };
  }

  if (!resolved.username?.trim()) {
    return { error: 'credentials' };
  }

  return {
    payload: {
      hostname: args.host.hostname,
      username: resolved.username,
      port: args.host.port || 22,
      password,
      privateKey: keyAuth.privateKey,
      certificate: resolved.key?.certificate,
      publicKey: resolved.key?.publicKey,
      keyId: resolved.keyId,
      keySource: resolved.key?.source,
      passphrase: keyAuth.passphrase,
      identityFilePaths: keyAuth.identityFilePaths,
      legacyAlgorithms: args.host.legacyAlgorithms,
      skipEcdsaHostKey: args.host.skipEcdsaHostKey,
      algorithmOverrides: args.host.algorithms,
      command: args.command,
      enableKeyboardInteractive: true,
      sessionId: `batch-exec:${args.host.id}:${crypto.randomUUID()}`,
      timeout: args.timeoutMs ?? 30000,
    },
  };
};

export const createInitialBatchExecResult = (host: Host): BatchExecHostResult => ({
  hostId: host.id,
  label: host.label,
  hostname: host.hostname,
  status: 'pending',
});
