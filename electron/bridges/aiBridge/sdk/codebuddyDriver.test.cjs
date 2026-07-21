const test = require("node:test");
const assert = require("node:assert/strict");
const {
  buildCodebuddyQueryOptions,
  buildCodebuddyPromptInput,
  classifyCodebuddySpawnError,
  codebuddyBuiltinTools,
  formatCodebuddyCliMissingError,
  mapCodebuddyModels,
  runCodebuddyTurn,
  translateCodebuddyMessage,
} = require("./codebuddyDriver.cjs");

function collector() {
  const events = [];
  const emitter = {
    text: (t) => events.push({ k: "text", t }),
    reasoning: (d) => events.push({ k: "reasoning", d }),
    toolCall: (name, args, id) => events.push({ k: "toolCall", name, args, id }),
    toolResult: (id, out, name) => events.push({ k: "toolResult", id, out, name }),
    status: (m) => events.push({ k: "status", m }),
    sessionId: (s) => events.push({ k: "sessionId", s }),
    emitDone: () => events.push({ k: "done" }),
    emitError: (m) => events.push({ k: "error", m }),
  };
  return { events, emitter };
}

test("buildCodebuddyQueryOptions wires SDK options in isolated mode", () => {
  const ac = new AbortController();
  const opts = buildCodebuddyQueryOptions({
    cwd: "/tmp",
    model: "codebuddy-1",
    env: { PATH: "/usr/bin", CODEBUDDY_INTERNET_ENVIRONMENT: "ioa" },
    pathToCodebuddyCode: "/opt/codebuddy/bin/codebuddy",
    abortController: ac,
    resume: "sess-1",
    injectedMcpServers: [{
      name: "netcatty-remote-hosts",
      command: "/abs/electron",
      args: ["/abs/server.cjs"],
      env: [{ name: "NETCATTY_MCP_PORT", value: "1" }],
    }],
  });

  assert.equal(opts.cwd, "/tmp");
  assert.equal(opts.model, "codebuddy-1");
  assert.equal(opts.includePartialMessages, true);
  assert.equal(opts.permissionMode, "bypassPermissions");
  assert.equal(opts.allowDangerouslySkipPermissions, true);
  assert.deepEqual(opts.extraArgs, { "dangerously-skip-permissions": null });
  assert.deepEqual(opts.settingSources, []);
  assert.equal(opts.env.CODEBUDDY_INTERNET_ENVIRONMENT, "ioa");
  assert.equal(opts.pathToCodebuddyCode, "/opt/codebuddy/bin/codebuddy");
  assert.equal(opts.abortController, ac);
  assert.equal(opts.resume, "sess-1");
  assert.deepEqual(opts.tools, []);
  // allowedTools must stay unset in mcp mode: tools:[] disables built-ins, while
  // allowedTools:[] would prevent injected Netcatty MCP tools from running.
  assert.ok(!("allowedTools" in opts));
  assert.ok(opts.disallowedTools.includes("AskUserQuestion"));
  assert.equal(opts.mcpServers["netcatty-remote-hosts"].type, "stdio");
  assert.deepEqual(opts.mcpServers["netcatty-remote-hosts"].env, { NETCATTY_MCP_PORT: "1" });
});

test("built-in tools are mode-aware", () => {
  assert.deepEqual(codebuddyBuiltinTools("mcp"), []);
  assert.deepEqual(codebuddyBuiltinTools(undefined), []);
  assert.deepEqual(codebuddyBuiltinTools("skills"), ["Bash"]);
});

test("translateCodebuddyMessage emits assistant text fallback", () => {
  const { events, emitter } = collector();
  translateCodebuddyMessage(
    { type: "assistant", message: { content: [{ type: "text", text: "hello" }] } },
    emitter,
  );
  assert.deepEqual(events, [{ k: "text", t: "hello" }]);
});

test("translateCodebuddyMessage can skip consolidated assistant text after stream deltas", () => {
  const { events, emitter } = collector();
  translateCodebuddyMessage(
    { type: "assistant", message: { content: [{ type: "text", text: "consolidated" }] } },
    emitter,
    { skipAssistantText: true },
  );
  assert.deepEqual(events, []);
});

test("translateCodebuddyMessage maps stream deltas, tool calls, and tool results", () => {
  const { events, emitter } = collector();
  translateCodebuddyMessage(
    { type: "stream_event", event: { type: "content_block_delta", delta: { type: "text_delta", text: "hi" } } },
    emitter,
  );
  translateCodebuddyMessage(
    { type: "stream_event", event: { type: "content_block_delta", delta: { type: "thinking_delta", thinking: "why" } } },
    emitter,
  );
  translateCodebuddyMessage(
    { type: "assistant", message: { content: [{ type: "tool_use", id: "tu-1", name: "Bash", input: { command: "ls" } }] } },
    emitter,
  );
  translateCodebuddyMessage(
    { type: "user", message: { content: [{ type: "tool_result", tool_use_id: "tu-1", content: "ok" }] } },
    emitter,
  );
  assert.deepEqual(events, [
    { k: "text", t: "hi" },
    { k: "reasoning", d: "why" },
    { k: "toolCall", name: "Bash", args: { command: "ls" }, id: "tu-1" },
    { k: "toolResult", id: "tu-1", out: "ok", name: undefined },
  ]);
});

test("translateCodebuddyMessage emits system session id and status text", () => {
  const { events, emitter } = collector();
  translateCodebuddyMessage(
    { type: "system", session_id: "sess-1", message: "initializing" },
    emitter,
  );
  assert.deepEqual(events, [
    { k: "sessionId", s: "sess-1" },
    { k: "status", m: "initializing" },
  ]);
});

test("runCodebuddyTurn does not duplicate assistant text after streamed text", async () => {
  const { events, emitter } = collector();
  async function* fakeQuery() {
    yield { type: "system", session_id: "sess-1" };
    yield { type: "stream_event", event: { type: "content_block_delta", delta: { type: "text_delta", text: "hello" } } };
    yield { type: "assistant", message: { content: [{ type: "text", text: "hello" }] } };
  }

  const result = await runCodebuddyTurn({
    prompt: "say hi",
    options: { abortController: new AbortController() },
    emitter,
    queryFn: () => fakeQuery(),
  });

  assert.deepEqual(result, { sessionId: "sess-1", resumeInvalidated: false });
  assert.deepEqual(events, [
    { k: "sessionId", s: "sess-1" },
    { k: "text", t: "hello" },
    { k: "done" },
  ]);
});

test("runCodebuddyTurn interrupts the SDK query as soon as abort is signaled", async () => {
  const events = [];
  let sawSession;
  const sessionSeen = new Promise((resolve) => { sawSession = resolve; });
  const emitter = {
    text: (t) => events.push({ k: "text", t }),
    reasoning: (d) => events.push({ k: "reasoning", d }),
    toolCall: (name, args, id) => events.push({ k: "toolCall", name, args, id }),
    toolResult: (id, out, name) => events.push({ k: "toolResult", id, out, name }),
    status: (m) => events.push({ k: "status", m }),
    sessionId: (s) => { events.push({ k: "sessionId", s }); sawSession(); },
    emitDone: () => events.push({ k: "done" }),
    emitError: (m) => events.push({ k: "error", m }),
  };
  const ac = new AbortController();
  let interruptCount = 0;
  let release;

  const fakeQuery = () => ({
    interrupt: async () => { interruptCount += 1; release?.(); },
    async *[Symbol.asyncIterator]() {
      yield { type: "system", session_id: "sess-1" };
      await new Promise((resolve) => { release = resolve; });
    },
  });

  const turn = runCodebuddyTurn({
    prompt: "wait",
    options: { abortController: ac },
    emitter,
    queryFn: fakeQuery,
  });

  await sessionSeen;
  ac.abort();
  const result = await turn;

  assert.deepEqual(result, { sessionId: "sess-1", resumeInvalidated: false });
  assert.ok(interruptCount >= 1);
  assert.deepEqual(events, [
    { k: "sessionId", s: "sess-1" },
    { k: "done" },
  ]);
});

test("buildCodebuddyPromptInput sends supported images as native image blocks", async () => {
  const input = buildCodebuddyPromptInput("describe this", [
    { filename: "shot.png", mediaType: "image/png", filePath: "/tmp/shot.png", base64Data: "abc" },
    { filename: "bad.svg", mediaType: "image/svg+xml", filePath: "/tmp/bad.svg", base64Data: "def" },
  ]);
  const messages = [];
  for await (const message of input) messages.push(message);
  assert.deepEqual(messages, [{
    type: "user",
    message: {
      role: "user",
      content: [
        { type: "text", text: "describe this" },
        { type: "image", source: { type: "base64", media_type: "image/png", data: "abc" } },
      ],
    },
    parent_tool_use_id: null,
  }]);
});

test("mapCodebuddyModels maps model ids and drops invalid entries", () => {
  assert.deepEqual(mapCodebuddyModels([
    // Real CLI wire shape ({id,name}) — must NOT be dropped.
    { id: "glm-5.1", name: "GLM-5.1" },
    { modelId: "cb-1", name: "CodeBuddy 1", description: "default" },
    { value: "cb-2", displayName: "CodeBuddy 2" },
    { name: "missing id" },
  ]), [
    {
      id: "glm-5.1",
      name: "GLM-5.1",
      description: undefined,
      thinkingLevels: ["adaptive", "enabled"],
      supportsFast: true,
      fastEffort: "disabled",
    },
    {
      id: "cb-1",
      name: "CodeBuddy 1",
      description: "default",
      thinkingLevels: ["adaptive", "enabled"],
      supportsFast: true,
      fastEffort: "disabled",
    },
    {
      id: "cb-2",
      name: "CodeBuddy 2",
      description: undefined,
      thinkingLevels: ["adaptive", "enabled"],
      supportsFast: true,
      fastEffort: "disabled",
    },
  ]);
  assert.deepEqual(mapCodebuddyModels(null), []);
});

test("buildCodebuddyQueryOptions splits slash thinking from model id", () => {
  const opts = buildCodebuddyQueryOptions({
    model: "glm-5.1/adaptive",
    cwd: "/tmp",
  });
  assert.equal(opts.model, "glm-5.1");
  assert.deepEqual(opts.thinking, { type: "adaptive" });

  const fast = buildCodebuddyQueryOptions({
    model: "glm-5.1/disabled",
    cwd: "/tmp",
  });
  assert.equal(fast.model, "glm-5.1");
  assert.deepEqual(fast.thinking, { type: "disabled" });

  // Unknown suffix stays on the model id (e.g. provider/model).
  const nested = buildCodebuddyQueryOptions({
    model: "vendor/custom-model",
    cwd: "/tmp",
  });
  assert.equal(nested.model, "vendor/custom-model");
  assert.equal(nested.thinking, undefined);
});

test("classifyCodebuddySpawnError does not treat bare 'not found' as missing CLI", () => {
  const modelMiss = classifyCodebuddySpawnError(new Error("Model glm-x not found"));
  assert.equal(modelMiss.isSpawnEnoent, false);
  assert.equal(modelMiss.isStaleResume, false);

  const mcpMiss = classifyCodebuddySpawnError(new Error("SDK MCP server not found: netcatty"));
  assert.equal(mcpMiss.isSpawnEnoent, false);

  const enoent = new Error("spawn node ENOENT");
  enoent.code = "ENOENT";
  assert.equal(classifyCodebuddySpawnError(enoent).isSpawnEnoent, true);

  const cliMiss = classifyCodebuddySpawnError(new Error("CodeBuddy CLI not found.\n\nPossible solutions"));
  assert.equal(cliMiss.isSpawnEnoent, true);

  const stale = classifyCodebuddySpawnError(new Error("Session not found: abc-123"));
  assert.equal(stale.isSpawnEnoent, false);
  assert.equal(stale.isStaleResume, true);
});

test("formatCodebuddyCliMissingError distinguishes WorkBuddy paths", () => {
  assert.match(
    formatCodebuddyCliMissingError(
      "C:\\\\Users\\\\u\\\\AppData\\\\Local\\\\Programs\\\\WorkBuddy\\\\resources\\\\app.asar.unpacked\\\\cli\\\\dist\\\\codebuddy.js",
    ),
    /WorkBuddy agent CLI/,
  );
  assert.match(formatCodebuddyCliMissingError("/opt/codebuddy/dist/codebuddy.js"), /CodeBuddy CLI/);
});

test("runCodebuddyTurn retries once without resume when session is stale", async () => {
  const { events, emitter } = collector();
  let calls = 0;
  const fakeQuery = ({ options }) => {
    calls += 1;
    if (calls === 1) {
      assert.equal(options.resume, "stale-session");
      return {
        async *[Symbol.asyncIterator]() {
          throw new Error("Session not found: stale-session");
        },
      };
    }
    assert.equal(options.resume, undefined);
    return {
      async *[Symbol.asyncIterator]() {
        yield {
          type: "assistant",
          session_id: "fresh-1",
          message: { content: [{ type: "text", text: "ok after retry" }] },
        };
      },
    };
  };

  const result = await runCodebuddyTurn({
    prompt: "continue",
    options: {
      resume: "stale-session",
      pathToCodebuddyCode: "/opt/codebuddy/dist/codebuddy.js",
    },
    emitter,
    queryFn: fakeQuery,
  });

  assert.equal(calls, 2);
  assert.deepEqual(result, { sessionId: "fresh-1", resumeInvalidated: true });
  assert.ok(events.some((e) => e.k === "status"));
  assert.ok(events.some((e) => e.k === "text" && e.t === "ok after retry"));
  assert.ok(events.some((e) => e.k === "done"));
  assert.ok(!events.some((e) => e.k === "error"));
});

test("runCodebuddyTurn keeps real CLI-missing errors after classification", async () => {
  const { events, emitter } = collector();
  const err = new Error("spawn C:\\\\missing\\\\codebuddy ENOENT");
  err.code = "ENOENT";
  const fakeQuery = () => ({
    async *[Symbol.asyncIterator]() {
      throw err;
    },
  });

  const result = await runCodebuddyTurn({
    prompt: "hi",
    options: {
      pathToCodebuddyCode:
        "C:\\\\Users\\\\u\\\\AppData\\\\Local\\\\Programs\\\\WorkBuddy\\\\resources\\\\app.asar.unpacked\\\\cli\\\\dist\\\\codebuddy.js",
    },
    emitter,
    queryFn: fakeQuery,
  });

  assert.equal(result.sessionId, null);
  const errorEvent = events.find((e) => e.k === "error");
  assert.ok(errorEvent);
  assert.match(errorEvent.m, /WorkBuddy agent CLI not found/);
});
