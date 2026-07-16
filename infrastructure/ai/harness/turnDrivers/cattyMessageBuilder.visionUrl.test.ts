import test from 'node:test';
import assert from 'node:assert/strict';
import { toVisionImageUrl } from './cattyMessageBuilder';

test('toVisionImageUrl wraps raw base64 as a data URL', () => {
  assert.equal(
    toVisionImageUrl('image/png', 'iVBORw0KGgo='),
    'data:image/png;base64,iVBORw0KGgo=',
  );
});

test('toVisionImageUrl leaves existing data URLs and http URLs alone', () => {
  assert.equal(
    toVisionImageUrl('image/jpeg', 'data:image/jpeg;base64,abc'),
    'data:image/jpeg;base64,abc',
  );
  assert.equal(
    toVisionImageUrl('image/png', 'https://example.com/a.png'),
    'https://example.com/a.png',
  );
});

test('toVisionImageUrl defaults media type when empty', () => {
  assert.equal(toVisionImageUrl('', 'abc'), 'data:image/png;base64,abc');
});
