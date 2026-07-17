/**
 * OpenAI chat vision gateways often require image_url.url to be either an
 * http(s) URL or a full data:image/...;base64,... URL.
 *
 * @ai-sdk/openai chat conversion intentionally puts *raw* base64 into
 * image_url.url for file parts with data payloads (after AI SDK strips any
 * data: URL we passed as file.data). Re-wrap raw base64 before the body leaves
 * the renderer so gateways that reject bare base64 still work.
 */

const DATA_OR_HTTP_URL = /^(data:|https?:\/\/)/i;

export function toOpenAIChatImageUrl(url: unknown, mediaTypeHint = 'image/png'): string | null {
  if (typeof url !== 'string') return null;
  const value = url.trim();
  if (!value) return null;
  if (DATA_OR_HTTP_URL.test(value)) return value;

  // Some SDKs emit `image/png;base64,AAAA` without the data: prefix.
  if (/^image\/[a-z0-9.+-]+;base64,/i.test(value)) {
    return `data:${value}`;
  }

  const mime = (mediaTypeHint || 'image/png').trim() || 'image/png';
  return `data:${mime};base64,${value}`;
}

function normalizeImageUrlPart(part: Record<string, unknown>): boolean {
  if (part.type !== 'image_url') return false;
  const imageUrl = part.image_url;
  if (!imageUrl || typeof imageUrl !== 'object') return false;
  const record = imageUrl as Record<string, unknown>;
  const next = toOpenAIChatImageUrl(record.url);
  if (next == null || next === record.url) return false;
  record.url = next;
  return true;
}

function normalizeContent(content: unknown): boolean {
  if (!Array.isArray(content)) return false;
  let changed = false;
  for (const part of content) {
    if (!part || typeof part !== 'object') continue;
    if (normalizeImageUrlPart(part as Record<string, unknown>)) {
      changed = true;
    }
  }
  return changed;
}

/**
 * Walk an OpenAI chat request body and rewrite bare base64 image_url.url values
 * into data URLs. Returns the original string when nothing changes or body is
 * not JSON chat messages.
 */
export function normalizeOpenAIChatImageUrlsInBody(body: string): string {
  if (!body || typeof body !== 'string') return body;

  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return body;
  }

  if (!parsed || typeof parsed !== 'object') return body;
  const messages = (parsed as { messages?: unknown }).messages;
  if (!Array.isArray(messages)) return body;

  let changed = false;
  for (const message of messages) {
    if (!message || typeof message !== 'object') continue;
    if (normalizeContent((message as { content?: unknown }).content)) {
      changed = true;
    }
  }

  return changed ? JSON.stringify(parsed) : body;
}
