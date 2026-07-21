import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CLAUDE_MODEL_PRESETS,
  CODEBUDDY_MODEL_PRESETS,
  CODEX_MODEL_PRESETS,
  CURSOR_MODEL_PRESETS,
  getAgentModelPresets,
  resolveSlashModelSelection,
} from './types';

test('getAgentModelPresets returns CodeBuddy fallback models for command paths', () => {
  assert.deepEqual(
    getAgentModelPresets('/opt/homebrew/bin/codebuddy'),
    CODEBUDDY_MODEL_PRESETS,
  );
  assert.ok(CODEBUDDY_MODEL_PRESETS.some((model) => model.id === 'deepseek-v4-pro'));
});

test('getAgentModelPresets keeps Codex presets separate from CodeBuddy presets', () => {
  assert.deepEqual(getAgentModelPresets('codex'), CODEX_MODEL_PRESETS);
  assert.notDeepEqual(CODEBUDDY_MODEL_PRESETS, CODEX_MODEL_PRESETS);
});

test('getAgentModelPresets resolves Windows command paths with backslashes', () => {
  assert.deepEqual(
    getAgentModelPresets('C\\Users\\foo\\AppData\\Roaming\\npm\\codex.cmd'),
    CODEX_MODEL_PRESETS,
  );
  assert.deepEqual(
    getAgentModelPresets('C\\Program Files\\nodejs\\claude.exe'),
    CLAUDE_MODEL_PRESETS,
  );
});

test('getAgentModelPresets prefers sdkBackend over command basename', () => {
  assert.deepEqual(
    getAgentModelPresets('/Apps/WorkBuddy/bin/codebuddy', 'workbuddy'),
    CODEBUDDY_MODEL_PRESETS,
  );
  assert.deepEqual(
    getAgentModelPresets('/opt/weird/agent.exe', 'cursor'),
    CURSOR_MODEL_PRESETS,
  );
});

test('Codex GPT presets expose Fast (minimal) independent of Low effort', () => {
  const gpt = CODEX_MODEL_PRESETS.find((m) => m.id === 'gpt-5.5');
  assert.ok(gpt);
  assert.equal(gpt.supportsFast, true);
  assert.equal(gpt.fastEffort, 'minimal');
  assert.ok(gpt.thinkingLevels?.includes('low'));
  assert.ok(!gpt.thinkingLevels?.includes('minimal'));
});

test('CodeBuddy presets expose thinking levels and Fast=disabled', () => {
  const model = CODEBUDDY_MODEL_PRESETS[0];
  assert.deepEqual(model.thinkingLevels, ['adaptive', 'enabled']);
  assert.equal(model.supportsFast, true);
  assert.equal(model.fastEffort, 'disabled');
  assert.ok(!model.thinkingLevels?.includes('disabled'));
});

test('resolveSlashModelSelection encodes Fast and effort', () => {
  assert.equal(
    resolveSlashModelSelection('gpt-5.5', {
      fast: true,
      fastEffort: 'minimal',
      thinkingLevels: ['low', 'high'],
    }),
    'gpt-5.5/minimal',
  );
  assert.equal(
    resolveSlashModelSelection('gpt-5.5', {
      effort: 'high',
      fastEffort: 'minimal',
      thinkingLevels: ['low', 'high'],
    }),
    'gpt-5.5/high',
  );
  assert.equal(
    resolveSlashModelSelection('glm-5.1', {
      effort: 'adaptive',
      thinkingLevels: ['adaptive', 'enabled'],
      fastEffort: 'disabled',
    }),
    'glm-5.1/adaptive',
  );
  assert.equal(
    resolveSlashModelSelection('glm-5.1', {
      fast: true,
      thinkingLevels: ['adaptive', 'enabled'],
      fastEffort: 'disabled',
    }),
    'glm-5.1/disabled',
  );
});
