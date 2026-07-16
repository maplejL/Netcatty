import test from 'node:test';
import assert from 'node:assert/strict';

import type { Host } from './models.ts';
import { buildBatchExecCommandPayload, isBatchExecEligibleHost, truncateBatchExecOutput } from './batchExec.ts';

const baseHost = (overrides: Partial<Host> = {}): Host => ({
  id: 'h1',
  label: 'web-1',
  hostname: '10.0.0.1',
  username: 'root',
  tags: [],
  os: 'linux',
  password: 'secret',
  ...overrides,
});

test('isBatchExecEligibleHost accepts direct SSH hosts', () => {
  assert.deepEqual(isBatchExecEligibleHost(baseHost()), { eligible: true });
});

test('isBatchExecEligibleHost rejects jump-chain hosts', () => {
  const result = isBatchExecEligibleHost(baseHost({
    hostChain: { hostIds: ['jump-1'] },
  }));
  assert.equal(result.eligible, false);
  if (result.eligible) throw new Error('expected ineligible');
  assert.equal(result.reason, 'jump-chain');
});

test('buildBatchExecCommandPayload returns credentials for password auth', () => {
  const built = buildBatchExecCommandPayload({
    host: baseHost(),
    command: 'uptime',
    keys: [],
  });
  assert.ok('payload' in built);
  if (!('payload' in built)) return;
  assert.equal(built.payload.command, 'uptime');
  assert.equal(built.payload.username, 'root');
  assert.equal(built.payload.password, 'secret');
});

test('truncateBatchExecOutput caps long output', () => {
  const long = 'x'.repeat(9000);
  const truncated = truncateBatchExecOutput(long, 100);
  assert.ok(truncated.length < long.length);
  assert.match(truncated, /\.\.\.\[truncated\]$/);
});
