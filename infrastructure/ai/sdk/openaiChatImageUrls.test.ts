import assert from 'node:assert/strict';
import test from 'node:test';

import {
  normalizeOpenAIChatImageUrlsInBody,
  toOpenAIChatImageUrl,
} from './openaiChatImageUrls';

test('toOpenAIChatImageUrl wraps raw base64 as a data URL', () => {
  assert.equal(
    toOpenAIChatImageUrl('iVBORw0KGgo='),
    'data:image/png;base64,iVBORw0KGgo=',
  );
});

test('toOpenAIChatImageUrl leaves data and http URLs alone', () => {
  assert.equal(
    toOpenAIChatImageUrl('data:image/jpeg;base64,abc'),
    'data:image/jpeg;base64,abc',
  );
  assert.equal(
    toOpenAIChatImageUrl('https://example.com/a.png'),
    'https://example.com/a.png',
  );
});

test('toOpenAIChatImageUrl accepts mime;base64 without data: prefix', () => {
  assert.equal(
    toOpenAIChatImageUrl('image/webp;base64,xyz'),
    'data:image/webp;base64,xyz',
  );
});

test('normalizeOpenAIChatImageUrlsInBody rewrites bare base64 image_url values', () => {
  const body = JSON.stringify({
    model: 'gpt-4o',
    stream: true,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'what is this?' },
          {
            type: 'image_url',
            image_url: { url: 'iVBORw0KGgo=' },
          },
        ],
      },
    ],
  });

  const next = normalizeOpenAIChatImageUrlsInBody(body);
  const parsed = JSON.parse(next) as {
    messages: Array<{ content: Array<{ type: string; image_url?: { url: string } }> }>;
  };
  assert.equal(
    parsed.messages[0].content[1].image_url?.url,
    'data:image/png;base64,iVBORw0KGgo=',
  );
});

test('normalizeOpenAIChatImageUrlsInBody is a no-op for valid data URLs', () => {
  const body = JSON.stringify({
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image_url',
            image_url: { url: 'data:image/png;base64,abc' },
          },
        ],
      },
    ],
  });
  assert.equal(normalizeOpenAIChatImageUrlsInBody(body), body);
});

test('normalizeOpenAIChatImageUrlsInBody leaves non-JSON bodies unchanged', () => {
  assert.equal(normalizeOpenAIChatImageUrlsInBody('not-json'), 'not-json');
});
