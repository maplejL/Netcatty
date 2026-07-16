import test from "node:test";
import assert from "node:assert/strict";
import type { ModelMessage } from "ai";

import {
  compressMessagesForRequestTooLargeRetry,
  compressVerboseText,
  truncateTextWithHeadAndTail,
} from "./requestPayloadCompression.ts";

test("compressVerboseText collapses repeated blank lines and duplicate runs", () => {
  const input = "line1\n\n\n\n\nline2\nsame\nsame\nsame\nsame\nline3";
  const output = compressVerboseText(input);
  assert.match(output, /line1\n\n\nline2/);
  assert.ok(output.split("\nsame\n").length <= 3);
});

test("truncateTextWithHeadAndTail keeps both ends of long terminal output", () => {
  const value = `${"A".repeat(500)}${"B".repeat(20_000)}${"C".repeat(500)}`;
  const truncated = truncateTextWithHeadAndTail(value, 2_000);
  assert.ok(truncated.startsWith("AAA"));
  assert.ok(truncated.includes("[... output truncated for request size ...]"));
  assert.ok(truncated.endsWith("CCC"));
  assert.ok(truncated.length <= 2_000);
});

test("compressMessagesForRequestTooLargeRetry compresses messages without enforcing a byte budget", () => {
  const messages: ModelMessage[] = [
    { role: "user", content: "run build" },
    {
      role: "tool",
      content: [{
        type: "tool-result",
        toolCallId: "call-1",
        toolName: "terminal_execute",
        output: { type: "text", value: "X".repeat(200_000) },
      }],
    },
    {
      role: "user",
      content: [
        { type: "text", text: "please inspect this image" },
        { type: "image", image: "A".repeat(1_000_000), mediaType: "image/png" },
      ],
    },
    {
      role: "user",
      content: [
        { type: "text", text: "hosts export" },
        {
          type: "file",
          data: "B".repeat(50_000),
          mediaType: "text/csv",
          filename: "hosts.csv",
        },
      ],
    },
  ];

  const result = compressMessagesForRequestTooLargeRetry(messages);

  assert.equal(result.didAdjust, true);
  assert.deepEqual(Object.keys(result).sort(), ["didAdjust", "messages"]);
  assert.equal(result.messages.length, messages.length);

  const toolContent = result.messages[1].content;
  assert.ok(Array.isArray(toolContent));
  const toolPart = toolContent[0] as { output?: { value?: string } };
  assert.ok((toolPart.output?.value?.length ?? 0) < 5_000);

  // Vision image parts must remain so Catty can actually see screenshots.
  const imageUserContent = result.messages[2].content;
  assert.ok(Array.isArray(imageUserContent));
  assert.deepEqual(imageUserContent[1], {
    type: "image",
    image: "A".repeat(1_000_000),
    mediaType: "image/png",
  });

  // Non-image file attachments may still be omitted under size pressure.
  const fileUserContent = result.messages[3].content;
  assert.ok(Array.isArray(fileUserContent));
  assert.deepEqual(fileUserContent[1], {
    type: "text",
    text: "[file attachment omitted to keep the AI request small: filename=hosts.csv, mediaType=text/csv, 50000 chars]",
  });
});

test("compressMessagesForRequestTooLargeRetry keeps image/* file parts used by Catty", () => {
  const pngData = "iVBORw0KGgo".repeat(1000);
  const messages: ModelMessage[] = [{
    role: "user",
    content: [
      { type: "text", text: "what do you see?" },
      { type: "file", data: pngData, mediaType: "image/png", filename: "image.png" },
    ],
  }];

  const result = compressMessagesForRequestTooLargeRetry(messages);

  assert.equal(result.didAdjust, false);
  const content = result.messages[0].content;
  assert.ok(Array.isArray(content));
  assert.deepEqual(content[1], {
    type: "file",
    data: pngData,
    mediaType: "image/png",
    filename: "image.png",
  });
});

test("compressMessagesForRequestTooLargeRetry reports no adjustment for compact messages", () => {
  const messages: ModelMessage[] = [{ role: "user", content: "hello" }];

  const result = compressMessagesForRequestTooLargeRetry(messages);

  assert.equal(result.didAdjust, false);
  assert.deepEqual(result.messages, messages);
});
