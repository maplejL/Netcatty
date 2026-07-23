import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildHostSessionPresenceMap,
  findBestSessionForHost,
  getHostSessionPresence,
} from './hostSessionPresence.ts';
import type { TerminalSession } from './models.ts';

const session = (
  partial: Partial<TerminalSession> & Pick<TerminalSession, 'id' | 'hostId' | 'status'>,
): TerminalSession => ({
  title: partial.title || partial.id,
  type: 'remote',
  hostname: 'h',
  username: 'u',
  ...partial,
});

test('buildHostSessionPresenceMap prefers connected over disconnected', () => {
  const map = buildHostSessionPresenceMap([
    session({ id: 'a', hostId: 'h1', status: 'disconnected' }),
    session({ id: 'b', hostId: 'h1', status: 'connected' }),
    session({ id: 'c', hostId: 'h2', status: 'connecting' }),
  ]);
  assert.equal(map.get('h1'), 'connected');
  assert.equal(map.get('h2'), 'connecting');
  assert.equal(getHostSessionPresence(map, 'h3'), 'none');
});

test('findBestSessionForHost returns connected session when present', () => {
  const sessions = [
    session({ id: 'd', hostId: 'h1', status: 'disconnected' }),
    session({ id: 'c', hostId: 'h1', status: 'connected', workspaceId: 'ws-1' }),
  ];
  const best = findBestSessionForHost(sessions, 'h1');
  assert.equal(best?.id, 'c');
  assert.equal(best?.workspaceId, 'ws-1');
  assert.equal(findBestSessionForHost(sessions, 'missing'), undefined);
});
