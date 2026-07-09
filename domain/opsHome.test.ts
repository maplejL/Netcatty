import assert from 'node:assert/strict';
import test from 'node:test';

import type { Host, TerminalSession, Workspace } from './models';
import {
  buildIpSegmentSummaries,
  buildOpsResumeItems,
  collectActiveHostIds,
  filterHostsByIpSegment,
  pickRecentHosts,
} from './opsHome.ts';

const host = (id: string, hostname: string, extras: Partial<Host> = {}): Host => ({
  id,
  label: id,
  hostname,
  username: 'root',
  tags: [],
  os: 'linux',
  port: 22,
  protocol: 'ssh',
  authMethod: 'password',
  ...extras,
});

test('pickRecentHosts sorts by lastConnectedAt descending', () => {
  const hosts = [
    host('a', '1.1.1.1', { lastConnectedAt: 100 }),
    host('b', '1.1.1.2', { lastConnectedAt: 300 }),
    host('c', '1.1.1.3', { lastConnectedAt: 200 }),
  ];
  assert.deepEqual(pickRecentHosts(hosts, 2).map((h) => h.id), ['b', 'c']);
});

test('buildIpSegmentSummaries groups IPv4 hosts by /24 segment', () => {
  const hosts = [
    host('a', '172.168.5.10', { lastConnectedAt: 50 }),
    host('b', '172.168.5.20', { lastConnectedAt: 100 }),
    host('c', '172.168.8.1'),
    host('d', 'db.local'),
  ];
  const summaries = buildIpSegmentSummaries(hosts, new Set(['a']));
  assert.equal(summaries.length, 2);
  assert.equal(summaries[0].segment, '172.168.5');
  assert.equal(summaries[0].hostCount, 2);
  assert.equal(summaries[0].activeSessionCount, 1);
  assert.equal(summaries[0].lastConnectedAt, 100);
});

test('buildOpsResumeItems lists workspaces then orphan sessions', () => {
  const workspace: Workspace = {
    id: 'ws-1',
    title: 'Prod',
    root: { id: 'p1', type: 'pane', sessionId: 's1' },
  };
  const sessions: TerminalSession[] = [
    {
      id: 's1',
      hostId: 'h1',
      hostLabel: 'web',
      hostname: '1.1.1.1',
      username: 'root',
      status: 'connected',
      workspaceId: 'ws-1',
    },
    {
      id: 's2',
      hostId: 'h2',
      hostLabel: 'db',
      hostname: '1.1.1.2',
      username: 'root',
      status: 'connected',
    },
  ];
  const items = buildOpsResumeItems(sessions, [workspace]);
  assert.equal(items.length, 2);
  assert.equal(items[0].kind, 'workspace');
  assert.equal(items[1].kind, 'session');
});

test('collectActiveHostIds tracks connected and connecting sessions', () => {
  const sessions: TerminalSession[] = [
    { id: '1', hostId: 'a', hostLabel: 'a', hostname: '1', username: 'r', status: 'connected' },
    { id: '2', hostId: 'b', hostLabel: 'b', hostname: '2', username: 'r', status: 'connecting' },
    { id: '3', hostId: 'c', hostLabel: 'c', hostname: '3', username: 'r', status: 'disconnected' },
  ];
  assert.deepEqual([...collectActiveHostIds(sessions)], ['a', 'b']);
});

test('filterHostsByIpSegment returns hosts in one segment', () => {
  const hosts = [
    host('a', '10.0.1.1'),
    host('b', '10.0.1.2'),
    host('c', '10.0.2.1'),
  ];
  assert.deepEqual(filterHostsByIpSegment(hosts, '10.0.1').map((h) => h.id), ['a', 'b']);
});
