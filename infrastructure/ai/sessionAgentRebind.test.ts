import assert from 'node:assert/strict';
import test from 'node:test';

import type { AISession } from './types.ts';
import {
  rebindSessionAgent,
  shouldRebindActiveSessionOnAgentChange,
} from './sessionAgentRebind.ts';

function makeSession(overrides: Partial<AISession> = {}): AISession {
  return {
    id: 'sess-1',
    title: 'Chat',
    agentId: 'catty',
    scope: { type: 'global' },
    messages: [
      { id: 'm1', role: 'user', content: 'hello', timestamp: 1 },
      { id: 'm2', role: 'assistant', content: 'hi', timestamp: 2 },
    ],
    externalSessionId: 'sdk:codebuddy:abc',
    createdAt: 1,
    updatedAt: 2,
    ...overrides,
  };
}

test('rebindSessionAgent changes agentId and clears externalSessionId', () => {
  const session = makeSession();
  const next = rebindSessionAgent(session, 'discovered_workbuddy', 99);

  assert.equal(next.agentId, 'discovered_workbuddy');
  assert.equal(next.externalSessionId, undefined);
  assert.equal(next.updatedAt, 99);
  assert.equal(next.messages.length, 2);
  assert.equal(next.messages[0].content, 'hello');
  assert.notEqual(next, session);
});

test('rebindSessionAgent is a no-op when agent is unchanged', () => {
  const session = makeSession({ agentId: 'discovered_claude' });
  const next = rebindSessionAgent(session, 'discovered_claude', 99);
  assert.equal(next, session);
});

test('rebindSessionAgent ignores blank agent ids', () => {
  const session = makeSession();
  assert.equal(rebindSessionAgent(session, '  '), session);
});

test('shouldRebindActiveSessionOnAgentChange', () => {
  assert.equal(shouldRebindActiveSessionOnAgentChange(null, 'catty'), false);
  assert.equal(
    shouldRebindActiveSessionOnAgentChange(makeSession({ agentId: 'catty' }), 'catty'),
    false,
  );
  assert.equal(
    shouldRebindActiveSessionOnAgentChange(makeSession({ agentId: 'catty' }), 'discovered_workbuddy'),
    true,
  );
});
