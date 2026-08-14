"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { parseArgs } = require("./netcatty-tool-cli.cjs");

test("parseArgs consumes snippet multi-line run mode flag", () => {
  const { positionals, opts } = parseArgs([
    "node",
    "netcatty-tool-cli",
    "snippets",
    "update",
    "--snippet-id",
    "snippet-1",
    "--multi-line-run-mode",
    "lineDelay",
    "--json",
  ]);

  assert.deepEqual(positionals, ["snippets", "update"]);
  assert.equal(opts.snippetId, "snippet-1");
  assert.equal(opts.multiLineRunMode, "lineDelay");
  assert.equal(opts.json, true);
});

test("parseArgs consumes vault notes create flags", () => {
  const { positionals, opts } = parseArgs([
    "node",
    "netcatty-tool-cli",
    "vault",
    "notes",
    "create",
    "--title",
    "mihomo notes",
    "--content",
    "# heading\nbody",
    "--group",
    "ops",
    "--tags",
    '["proxy"]',
    "--linked-host-ids",
    '["host-1"]',
    "--json",
  ]);

  assert.deepEqual(positionals, ["vault", "notes", "create"]);
  assert.equal(opts.title, "mihomo notes");
  assert.equal(opts.content, "# heading\nbody");
  assert.equal(opts.group, "ops");
  assert.equal(opts.tags, '["proxy"]');
  assert.equal(opts.linkedHostIds, '["host-1"]');
  assert.equal(opts.json, true);
});

test("parseArgs consumes vault notes get note-id", () => {
  const { positionals, opts } = parseArgs([
    "node",
    "netcatty-tool-cli",
    "vault",
    "notes",
    "get",
    "--note-id",
    "note-123",
    "--json",
  ]);

  assert.deepEqual(positionals, ["vault", "notes", "get"]);
  assert.equal(opts.noteId, "note-123");
});
