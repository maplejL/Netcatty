import assert from 'node:assert/strict';
import test from 'node:test';

import { compareHostLabels, compareHostsBySortMode } from './hostSort.ts';
import type { Host } from './models.ts';

const host = (partial: Partial<Host> & Pick<Host, 'id' | 'label'>): Host => ({
  hostname: 'h',
  username: 'u',
  tags: [],
  os: 'linux',
  ...partial,
});

test('compareHostLabels sorts numeric segments naturally', () => {
  assert.ok(compareHostLabels('host2', 'host10') < 0);
  assert.ok(compareHostLabels('host10', 'host2') > 0);
});

test('compareHostsBySortMode recent uses lastConnectedAt', () => {
  const a = host({ id: 'a', label: 'a', lastConnectedAt: 100 });
  const b = host({ id: 'b', label: 'b', lastConnectedAt: 300 });
  assert.ok(compareHostsBySortMode(a, b, 'recent') > 0);
  assert.ok(compareHostsBySortMode(b, a, 'recent') < 0);
});

test('compareHostsBySortMode newest uses createdAt', () => {
  const a = host({ id: 'a', label: 'a', createdAt: 100 });
  const b = host({ id: 'b', label: 'b', createdAt: 300 });
  assert.ok(compareHostsBySortMode(a, b, 'newest') > 0);
});
