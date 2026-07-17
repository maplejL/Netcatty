import test from 'node:test';
import assert from 'node:assert/strict';
import { toVisionImageUrl } from './cattyMessageBuilder';

test('toVisionImageUrl keeps raw base64 for the AI SDK data path', () => {
  assert.equal(toVisionImageUrl('image/png', 'iVBORw0KGgo='), 'iVBORw0KGgo=');
});

test('toVisionImageUrl strips data URL prefix to raw base64', () => {
  assert.equal(
    toVisionImageUrl('image/jpeg', 'data:image/jpeg;base64,abc'),
    'abc',
  );
});

test('toVisionImageUrl leaves http URLs alone', () => {
  assert.equal(
    toVisionImageUrl('image/png', 'https://example.com/a.png'),
    'https://example.com/a.png',
  );
});
