import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { Host } from './models';
import {
  deriveIpGroupPath,
  filterOutTodayUngroupedHosts,
  isIpv4Hostname,
  shouldRemoveTodayUngroupedHost,
} from './hostIpGroup';

const host = (overrides: Partial<Host>): Host => ({
  id: 'id',
  label: 'label',
  hostname: '10.0.0.1',
  username: 'root',
  port: 22,
  os: 'linux',
  ...overrides,
});

describe('hostIpGroup', () => {
  it('derives three-octet group paths', () => {
    assert.equal(deriveIpGroupPath('172.168.5.142'), '172.168.5');
    assert.equal(deriveIpGroupPath('  10.0.88.23  '), '10.0.88');
  });

  it('rejects non-ipv4 hostnames', () => {
    assert.equal(isIpv4Hostname('db.example.com'), false);
    assert.equal(deriveIpGroupPath('db.example.com'), undefined);
  });

  it('filters today ungrouped hosts only', () => {
    const day = new Date('2026-07-06T12:00:00+08:00');
    const todayMs = day.getTime();
    const hosts = [
      host({ id: 'a', createdAt: todayMs, group: undefined }),
      host({ id: 'b', createdAt: todayMs, group: 'prod' }),
      host({ id: 'c', createdAt: todayMs - 86_400_000, group: undefined }),
    ];
    assert.equal(shouldRemoveTodayUngroupedHost(hosts[0], day), true);
    assert.equal(shouldRemoveTodayUngroupedHost(hosts[1], day), false);
    assert.deepEqual(filterOutTodayUngroupedHosts(hosts, day).map((h) => h.id), ['b', 'c']);
  });
});
