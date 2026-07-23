import assert from 'node:assert/strict';
import test from 'node:test';

import { focusExistingHostSession, handleConnectToHostImpl } from './app/AppHandlers.ts';
import type { Host, TerminalSession } from '../types';

const baseHost: Host = {
  id: 'host-1',
  label: '10.2.0.32',
  hostname: '10.2.0.32',
  username: 'root',
  tags: [],
  os: 'linux',
  protocol: 'ssh',
};

test('connect host handler returns the created terminal tab id', () => {
  const logs: unknown[] = [];
  const connectedHosts: Host[] = [];
  const result = handleConnectToHostImpl(
    () => ({
      addConnectionLog: (entry: unknown) => logs.push(entry),
      connectToHost: (host: Host) => {
        connectedHosts.push(host);
        return 'session-from-connect';
      },
      identities: [],
      keys: [],
      resolveEffectiveHost: (host: Host) => host,
      resolveHostAuth: () => ({ username: 'root' }),
      sessions: [],
      setActiveTabId: () => {},
      systemInfoRef: { current: { username: 'local-user', hostname: 'local-host' } },
    }),
    baseHost,
  );

  assert.equal(result, 'session-from-connect');
  assert.equal(connectedHosts.length, 1);
  assert.equal(logs.length, 1);
});

test('connect serial host handler returns the created terminal tab id', () => {
  const serialHost: Host = {
    ...baseHost,
    id: 'serial-1',
    label: '',
    hostname: '/dev/tty.usbserial',
    protocol: 'serial',
  };

  const result = handleConnectToHostImpl(
    () => ({
      addConnectionLog: () => {},
      connectToHost: () => 'serial-session',
      identities: [],
      keys: [],
      resolveEffectiveHost: (host: Host) => host,
      resolveHostAuth: () => ({ username: 'root' }),
      sessions: [],
      setActiveTabId: () => {},
      systemInfoRef: { current: { username: 'local-user', hostname: 'local-host' } },
    }),
    serialHost,
  );

  assert.equal(result, 'serial-session');
});

test('connect host focuses an existing session instead of creating another', () => {
  const connectedHosts: Host[] = [];
  const activated: string[] = [];
  const focused: Array<{ workspaceId: string; sessionId: string }> = [];
  const sessions: TerminalSession[] = [{
    id: 'existing-session',
    title: 'existing',
    type: 'remote',
    hostId: 'host-1',
    hostname: '10.2.0.32',
    username: 'root',
    status: 'connected',
    workspaceId: 'ws-1',
  }];

  const result = handleConnectToHostImpl(
    () => ({
      addConnectionLog: () => {
        throw new Error('should not create a connection log');
      },
      connectToHost: (host: Host) => {
        connectedHosts.push(host);
        return 'should-not-create';
      },
      identities: [],
      keys: [],
      resolveEffectiveHost: (host: Host) => host,
      resolveHostAuth: () => ({ username: 'root' }),
      sessions,
      setActiveTabId: (id: string) => activated.push(id),
      setWorkspaceFocusedSession: (workspaceId: string, sessionId: string) => {
        focused.push({ workspaceId, sessionId });
      },
      systemInfoRef: { current: { username: 'local-user', hostname: 'local-host' } },
    }),
    baseHost,
  );

  assert.equal(result, 'existing-session');
  assert.deepEqual(activated, ['ws-1']);
  assert.deepEqual(focused, [{ workspaceId: 'ws-1', sessionId: 'existing-session' }]);
  assert.equal(connectedHosts.length, 0);
});

test('focusExistingHostSession activates a standalone session tab', () => {
  const activated: string[] = [];
  const id = focusExistingHostSession(
    [{
      id: 's1',
      title: 's1',
      type: 'remote',
      hostId: 'host-1',
      hostname: 'h',
      username: 'u',
      status: 'connecting',
    }],
    'host-1',
    (tabId) => activated.push(tabId),
  );
  assert.equal(id, 's1');
  assert.deepEqual(activated, ['s1']);
});
