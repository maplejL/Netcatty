import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildWorkspaceRootFromSessionIds,
  collectSessionIds,
  resolveWorkspacePaneLayout,
} from './workspace.ts';

test('resolveWorkspacePaneLayout uses grid for 4 sessions in auto mode', () => {
  assert.equal(resolveWorkspacePaneLayout(4, 'auto'), 'grid');
  assert.equal(resolveWorkspacePaneLayout(3, 'auto'), 'row');
});

test('buildWorkspaceRootFromSessionIds creates a 2x2 grid for four sessions', () => {
  const root = buildWorkspaceRootFromSessionIds(['s1', 's2', 's3', 's4'], 'auto');
  assert.equal(root.type, 'split');
  assert.equal(root.type === 'split' ? root.direction : null, 'horizontal');
  assert.deepEqual(collectSessionIds(root), ['s1', 's2', 's3', 's4']);
  if (root.type !== 'split') throw new Error('expected split root');
  assert.equal(root.children.length, 2);
  for (const child of root.children) {
    assert.equal(child.type, 'split');
    if (child.type === 'split') {
      assert.equal(child.direction, 'vertical');
      assert.equal(child.children.length, 2);
    }
  }
});

test('buildWorkspaceRootFromSessionIds keeps a single row for three sessions', () => {
  const root = buildWorkspaceRootFromSessionIds(['s1', 's2', 's3'], 'auto');
  assert.equal(root.type, 'split');
  if (root.type !== 'split') throw new Error('expected split root');
  assert.equal(root.direction, 'vertical');
  assert.equal(root.children.length, 3);
});
