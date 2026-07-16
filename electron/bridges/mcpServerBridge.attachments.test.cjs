const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const bridge = require("./mcpServerBridge.cjs");

test("registered chat attachments can be listed and read by path or filename", async (t) => {
  t.after(() => bridge.cleanup());

  bridge.updateAttachmentMetadata([
    {
      filename: "note.txt",
      mediaType: "text/plain",
      filePath: "/tmp/netcatty-note.txt",
      base64Data: Buffer.from("hello attachment").toString("base64"),
    },
  ], "chat-a");

  const listed = bridge.handleListAttachments({ chatSessionId: "chat-a" });
  assert.equal(listed.ok, true);
  assert.equal(listed.attachments.length, 1);
  assert.equal(listed.attachments[0].filename, "note.txt");
  assert.equal(listed.attachments[0].mediaType, "text/plain");
  assert.equal(listed.attachments[0].sizeBytes, 16);
  assert.match(String(listed.attachments[0].filePath || ""), /netcatty-note\.txt$/);

  const byPath = bridge.handleReadAttachment({
    chatSessionId: "chat-a",
    filePath: listed.attachments[0].filePath,
  });
  assert.equal(byPath.ok, true);
  assert.equal(byPath.text, "hello attachment");

  const byName = bridge.handleReadAttachment({
    chatSessionId: "chat-a",
    filename: "note.txt",
  });
  assert.equal(byName.ok, true);
  assert.equal(byName.base64Data, Buffer.from("hello attachment").toString("base64"));
});

test("image attachments return vision guidance without base64 payload", async (t) => {
  t.after(() => bridge.cleanup());

  const pngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  bridge.updateAttachmentMetadata([
    {
      filename: "screenshot.png",
      mediaType: "image/png",
      filePath: "/tmp/screenshot.png",
      base64Data: pngBytes.toString("base64"),
    },
  ], "chat-img");

  const result = bridge.handleReadAttachment({
    chatSessionId: "chat-img",
    filename: "screenshot.png",
  });

  assert.equal(result.ok, true);
  assert.equal(result.imageInUserMessage, true);
  assert.equal(result.mediaType, "image/png");
  assert.equal(result.sizeBytes, pngBytes.length);
  assert.equal(result.base64Data, undefined);
  assert.match(result.guidance, /vision/i);
  assert.match(result.guidance, /OCR/i);
});

test("attachment reads reject unregistered local paths", async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "netcatty-attachment-test-"));
  const secretPath = path.join(dir, "secret.txt");
  fs.writeFileSync(secretPath, "secret");
  t.after(() => {
    bridge.cleanup();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  bridge.updateAttachmentMetadata([
    {
      filename: "allowed.txt",
      mediaType: "text/plain",
      filePath: path.join(dir, "allowed.txt"),
      base64Data: Buffer.from("allowed").toString("base64"),
    },
  ], "chat-a");

  const result = bridge.handleReadAttachment({
    chatSessionId: "chat-a",
    filePath: secretPath,
  });

  assert.equal(result.ok, false);
  assert.match(result.error, /not registered/i);
});
