import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CLAUDE_MODEL_PRESETS,
  CODEBUDDY_MODEL_PRESETS,
  CODEX_MODEL_PRESETS,
  CURSOR_MODEL_PRESETS,
  getAgentModelPresets,
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
