import {
  buildBatchExecCommandPayload,
  createInitialBatchExecResult,
  truncateBatchExecOutput,
  type BatchExecHostResult,
} from '../../domain/batchExec';
import type { Host, Identity, SSHKey } from '../../domain/models';

type ExecCommandFn = (options: Parameters<NetcattyBridge['execCommand']>[0]) => Promise<{
  stdout: string;
  stderr: string;
  code: number | null;
}>;

const DEFAULT_CONCURRENCY = 8;

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) return [];
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  const worker = async () => {
    while (nextIndex < items.length) {
      const current = nextIndex;
      nextIndex += 1;
      results[current] = await mapper(items[current], current);
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => worker()),
  );
  return results;
}

export async function runBatchExecForHosts(args: {
  hosts: Host[];
  command: string;
  keys: SSHKey[];
  identities?: Identity[];
  execCommand: ExecCommandFn;
  concurrency?: number;
  onHostUpdate?: (result: BatchExecHostResult) => void;
}): Promise<BatchExecHostResult[]> {
  const { hosts, command, keys, identities, execCommand, concurrency = DEFAULT_CONCURRENCY, onHostUpdate } = args;
  const trimmedCommand = command.trim();
  if (!trimmedCommand) {
    return hosts.map((host) => ({
      ...createInitialBatchExecResult(host),
      status: 'skipped',
      error: 'empty-command',
    }));
  }

  return mapWithConcurrency(hosts, concurrency, async (host) => {
    const base = createInitialBatchExecResult(host);
    const running: BatchExecHostResult = { ...base, status: 'running' };
    onHostUpdate?.(running);

    const built = buildBatchExecCommandPayload({
      host,
      command: trimmedCommand,
      keys,
      identities,
    });

    if ('error' in built) {
      const skipped: BatchExecHostResult = {
        ...base,
        status: 'skipped',
        skipReason: built.error,
        error: built.error,
      };
      onHostUpdate?.(skipped);
      return skipped;
    }

    try {
      const result = await execCommand(built.payload);
      const stdout = truncateBatchExecOutput(result.stdout ?? '');
      const stderr = truncateBatchExecOutput(result.stderr ?? '');
      const exitCode = result.code;
      const success = exitCode === 0 || (exitCode == null && !stderr.trim());
      const finalResult: BatchExecHostResult = {
        ...base,
        status: success ? 'success' : 'error',
        exitCode,
        stdout,
        stderr,
        error: success ? undefined : stderr.trim() || `exit ${exitCode ?? 'unknown'}`,
      };
      onHostUpdate?.(finalResult);
      return finalResult;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const failed: BatchExecHostResult = {
        ...base,
        status: 'error',
        error: message,
      };
      onHostUpdate?.(failed);
      return failed;
    }
  });
}
