const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildCursorAgentOptions,
  buildCursorSendMessage,
  formatCursorErrorForUser,
  isCursorAgentBusyError,
  isCursorRunTerminal,
  mapCursorModels,
  runCursorTurn,
  toCursorMcpServers,
  translateCursorEvent,
  withTemporaryProcessEnv,
} = require("./cursorDriver.cjs");

function makeEmitter() {
  const calls = [];
  return {
    calls,
    text: (value) => calls.push(["text", value]),
    reasoning: (value) => calls.push(["reasoning", value]),
    reasoningEnd: () => calls.push(["reasoningEnd"]),
    toolCall: (name, args, id) => calls.push(["toolCall", name, args, id]),
    toolResult: (id, result, name) => calls.push(["toolResult", id, result, name]),
    sessionId: (id) => calls.push(["sessionId", id]),
    emitDone: () => calls.push(["done"]),
    emitError: (message) => calls.push(["error", message]),
  };
}

test("buildCursorAgentOptions uses api key, model, cwd, and injected MCP servers", () => {
  const options = buildCursorAgentOptions({
    apiKey: "cur-key",
    model: "composer-2",
    cwd: "/repo",
    injectedMcpServers: [
      {
        name: "netcatty",
        command: "node",
        args: ["server.cjs"],
        env: [{ name: "TOKEN", value: "abc" }],
      },
    ],
  });

  assert.deepEqual(options, {
    apiKey: "cur-key",
    model: { id: "composer-2", params: [{ id: "fast", value: "false" }] },
    local: { cwd: "/repo", autoReview: false },
    mcpServers: {
      netcatty: {
        type: "stdio",
        command: "node",
        args: ["server.cjs"],
        env: { TOKEN: "abc" },
      },
    },
  });
});

test("buildCursorAgentOptions falls back to CURSOR_API_KEY and composer-2.5", () => {
  const options = buildCursorAgentOptions({
    env: { CURSOR_API_KEY: "env-key" },
    cwd: "/repo",
  });

  assert.equal(options.apiKey, "env-key");
  assert.deepEqual(options.model, {
    id: "composer-2.5",
    params: [{ id: "fast", value: "false" }],
  });
});

test("parseCursorModelSelection pins fast=false when omitted (Cursor default is Fast)", () => {
  const { parseCursorModelSelection } = require("./cursorDriver.cjs");
  assert.deepEqual(parseCursorModelSelection("cursor-grok-4.5"), {
    id: "cursor-grok-4.5",
    params: [{ id: "fast", value: "false" }],
  });
  assert.deepEqual(parseCursorModelSelection("cursor-grok-4.5?effort=low"), {
    id: "cursor-grok-4.5",
    params: [
      { id: "effort", value: "low" },
      { id: "fast", value: "false" },
    ],
  });
  assert.deepEqual(parseCursorModelSelection("cursor-grok-4.5?fast=true&effort=low"), {
    id: "cursor-grok-4.5",
    params: [
      { id: "fast", value: "true" },
      { id: "effort", value: "low" },
    ],
  });
});

test("toCursorMcpServers drops invalid server configs", () => {
  assert.deepEqual(
    toCursorMcpServers([
      null,
      { name: "", command: "node" },
      { name: "ok", command: "node", args: [] },
    ]),
    { ok: { type: "stdio", command: "node", args: [], env: {} } },
  );
});

test("withTemporaryProcessEnv restores env after async work", async () => {
  const original = process.env.NETCATTY_CURSOR_TEST_ENV;
  delete process.env.NETCATTY_CURSOR_TEST_ENV;

  const value = await withTemporaryProcessEnv(
    { NETCATTY_CURSOR_TEST_ENV: "present" },
    async () => process.env.NETCATTY_CURSOR_TEST_ENV,
  );

  assert.equal(value, "present");
  assert.equal(process.env.NETCATTY_CURSOR_TEST_ENV, undefined);
  if (original !== undefined) process.env.NETCATTY_CURSOR_TEST_ENV = original;
});

test("runCursorTurn exposes runtime env while creating and sending", async () => {
  const emitter = makeEmitter();
  const observed = [];
  const sdkModule = {
    Agent: {
      async create() {
        observed.push(["create", process.env.NETCATTY_TOOL_CLI_DISCOVERY_FILE]);
        return {
          agentId: "agent-env",
          async send() {
            observed.push(["send", process.env.NETCATTY_TOOL_CLI_DISCOVERY_FILE]);
            return {
              async *stream() {
                yield { type: "assistant", message: { content: [{ type: "text", text: "ok" }] } };
              },
            };
          },
          close() {},
        };
      },
    },
  };

  await runCursorTurn({
    prompt: "hi",
    agentOptions: { apiKey: "key", model: { id: "composer-2.5" }, local: { cwd: "/repo" } },
    runtimeEnv: { NETCATTY_TOOL_CLI_DISCOVERY_FILE: "/tmp/discovery.json" },
    emitter,
    sdkModule,
  });

  assert.deepEqual(observed, [
    ["create", "/tmp/discovery.json"],
    ["send", "/tmp/discovery.json"],
  ]);
});

test("runCursorTurn passes model selection (incl. Fast params) on send", async () => {
  const emitter = makeEmitter();
  let sentOptions = null;
  const sdkModule = {
    Agent: {
      async create() {
        return {
          agentId: "agent-fast",
          async send(_message, options) {
            sentOptions = options;
            return {
              async *stream() {
                yield { type: "assistant", message: { content: [{ type: "text", text: "ok" }] } };
              },
              async wait() {
                return { status: "finished", result: "ok" };
              },
            };
          },
          close() {},
        };
      },
    },
  };

  await runCursorTurn({
    prompt: "hi",
    agentOptions: {
      apiKey: "key",
      model: { id: "composer-2.5", params: [{ id: "fast", value: "true" }] },
      local: { cwd: "/repo" },
    },
    emitter,
    sdkModule,
  });

  assert.deepEqual(sentOptions, {
    model: { id: "composer-2.5", params: [{ id: "fast", value: "true" }] },
  });
});

test("translateCursorEvent maps assistant, thinking, and tool events", () => {
  const emitter = makeEmitter();
  const state = {};

  translateCursorEvent({ type: "thinking", text: "checking" }, emitter, state);
  translateCursorEvent({
    type: "assistant",
    message: {
      content: [
        { type: "text", text: "hello" },
        { type: "tool_use", id: "tool-1", name: "read_file", input: { path: "README.md" } },
      ],
    },
  }, emitter, state);
  translateCursorEvent({
    type: "tool_call",
    call_id: "tool-1",
    name: "read_file",
    status: "completed",
    result: { content: [{ type: "text", text: "contents" }] },
  }, emitter, state);

  assert.deepEqual(emitter.calls, [
    ["reasoning", "checking"],
    ["reasoningEnd"],
    ["text", "hello"],
    ["toolCall", "read_file", { path: "README.md" }, "tool-1"],
    ["toolResult", "tool-1", "contents", "read_file"],
  ]);
});

test("translateCursorEvent uses nested Cursor MCP toolName for display", () => {
  const emitter = makeEmitter();
  const state = {};
  const args = {
    providerIdentifier: "netcatty-remote-hosts",
    toolName: "terminal_execute",
    args: { command: "uname -a" },
  };

  translateCursorEvent({
    type: "tool_call",
    call_id: "mcp-1",
    name: "mcp",
    status: "completed",
    args,
    result: { content: [{ type: "text", text: "Linux" }] },
  }, emitter, state);

  assert.deepEqual(emitter.calls, [
    ["toolCall", "terminal_execute", args, "mcp-1"],
    ["toolResult", "mcp-1", "Linux", "terminal_execute"],
  ]);
});

test("translateCursorEvent marks error status as failed", () => {
  const emitter = makeEmitter();
  const state = {};

  const failed = translateCursorEvent({ type: "status", status: "ERROR", message: "bad key" }, emitter, state);

  assert.equal(failed, true);
  assert.equal(state.failed, true);
  assert.deepEqual(emitter.calls, [["error", "bad key"]]);
});

test("translateCursorEvent rewrites Cursor authentication errors", () => {
  const emitter = makeEmitter();
  const state = {};

  const failed = translateCursorEvent({ type: "status", status: "ERROR", message: "bad API key" }, emitter, state);

  assert.equal(failed, true);
  assert.equal(state.failed, true);
  assert.deepEqual(emitter.calls, [[
    "error",
    "Cursor authentication failed. Update the Cursor API Key in Settings -> AI.",
  ]]);
});

test("formatCursorErrorForUser points users to the settings API key", () => {
  assert.equal(
    formatCursorErrorForUser("unauthorized"),
    "Cursor authentication failed. Update the Cursor API Key in Settings -> AI.",
  );
});

test("formatCursorErrorForUser includes diagnostics when message is empty", () => {
  assert.match(
    formatCursorErrorForUser("", { code: "NETWORK", status: 502, requestId: "req-1" }),
    /Cursor turn failed \(code=NETWORK, status=502, requestId=req-1\)/,
  );
});

test("isCursorRunTerminal and isCursorAgentBusyError detect SDK statuses", () => {
  assert.equal(isCursorRunTerminal("finished"), true);
  assert.equal(isCursorRunTerminal("running"), false);
  assert.equal(isCursorAgentBusyError(new Error("Agent agent-1 already has active run")), true);
  assert.equal(isCursorAgentBusyError({ name: "AgentBusyError", message: "busy" }), true);
  assert.equal(isCursorAgentBusyError(new Error("network down")), false);
});

test("runCursorTurn creates or resumes an agent, streams events, and emits done", async () => {
  const emitter = makeEmitter();
  const captured = {};
  const sdkModule = {
    Agent: {
      async create(options) {
        captured.createOptions = options;
        return {
          agentId: "agent-new",
          async send(message) {
            captured.message = message;
            return {
              id: "run-1",
              agentId: "agent-new",
              async *stream() {
                yield { type: "assistant", message: { content: [{ type: "text", text: "done" }] } };
              },
              async wait() {
                return { status: "finished", result: "done" };
              },
            };
          },
          async close() {
            captured.closed = true;
          },
        };
      },
    },
  };

  const result = await runCursorTurn({
    prompt: "hi",
    attachments: [{ mediaType: "image/png", base64Data: "abc", filename: "a.png" }],
    agentOptions: { apiKey: "key", model: { id: "composer-2" }, local: { cwd: "/repo" } },
    emitter,
    sdkModule,
  });

  assert.equal(result.sessionId, "agent-new");
  assert.deepEqual(captured.message, {
    text: "hi",
    images: [{ data: "abc", mimeType: "image/png" }],
  });
  assert.deepEqual(emitter.calls, [
    ["sessionId", "agent-new"],
    ["text", "done"],
    ["done"],
  ]);
  assert.equal(captured.closed, true);
});

test("runCursorTurn does not emit done after a Cursor error status", async () => {
  const emitter = makeEmitter();
  const sdkModule = {
    Agent: {
      async create() {
        return {
          agentId: "agent-error",
          async send() {
            return {
              async *stream() {
                yield { type: "status", status: "ERROR", message: "bad key" };
                yield { type: "assistant", message: { content: [{ type: "text", text: "late" }] } };
              },
              async wait() {
                return { status: "finished" };
              },
            };
          },
          close() {},
        };
      },
    },
  };

  const result = await runCursorTurn({
    prompt: "hi",
    agentOptions: { apiKey: "key", model: { id: "composer-2.5" }, local: { cwd: "/repo" } },
    emitter,
    sdkModule,
  });

  assert.equal(result.sessionId, "agent-error");
  assert.deepEqual(emitter.calls, [
    ["sessionId", "agent-error"],
    ["error", "bad key"],
  ]);
});

test("runCursorTurn rejects when Cursor API key is missing", async () => {
  const emitter = makeEmitter();
  const result = await runCursorTurn({
    prompt: "hi",
    agentOptions: { model: { id: "composer-2.5" }, local: { cwd: "/repo" } },
    emitter,
    sdkModule: { Agent: { create() { throw new Error("should not create"); } } },
  });
  assert.deepEqual(result, { sessionId: null });
  assert.deepEqual(emitter.calls, [[
    "error",
    "Cursor API Key is missing. Add it in Settings -> AI.",
  ]]);
});

test("runCursorTurn surfaces wait() error status", async () => {
  const emitter = makeEmitter();
  const sdkModule = {
    Agent: {
      async create() {
        return {
          agentId: "agent-wait-error",
          async send() {
            return {
              async *stream() {
                yield { type: "assistant", message: { content: [{ type: "text", text: "partial" }] } };
              },
              async wait() {
                return { status: "error", message: "quota exceeded" };
              },
            };
          },
          close() {},
        };
      },
    },
  };

  await runCursorTurn({
    prompt: "hi",
    agentOptions: { apiKey: "key", model: { id: "composer-2.5" }, local: { cwd: "/repo" } },
    emitter,
    sdkModule,
  });

  assert.deepEqual(emitter.calls, [
    ["sessionId", "agent-wait-error"],
    ["text", "partial"],
    ["error", "quota exceeded"],
  ]);
});

test("runCursorTurn still waits after stream error so the run is terminalized", async () => {
  const emitter = makeEmitter();
  let waited = false;
  const sdkModule = {
    Agent: {
      async create() {
        return {
          agentId: "agent-stream-error-wait",
          async send() {
            return {
              status: "running",
              async *stream() {
                yield { type: "status", status: "ERROR", message: "mid-run fail" };
              },
              async wait() {
                waited = true;
                return { status: "error", message: "mid-run fail" };
              },
            };
          },
          close() {},
        };
      },
    },
  };

  await runCursorTurn({
    prompt: "hi",
    agentOptions: { apiKey: "key", model: { id: "composer-2.5" }, local: { cwd: "/repo" } },
    emitter,
    sdkModule,
  });

  assert.equal(waited, true);
  assert.deepEqual(emitter.calls, [
    ["sessionId", "agent-stream-error-wait"],
    ["error", "mid-run fail"],
  ]);
});

test("runCursorTurn clears stale active runs then retries send once on AgentBusyError", async () => {
  const emitter = makeEmitter();
  let sendAttempts = 0;
  let cancelledStale = false;
  const sdkModule = {
    Agent: {
      async listRuns() {
        return {
          items: [{
            id: "stale-run",
            status: "running",
            async cancel() { cancelledStale = true; },
            async wait() { return { status: "cancelled" }; },
          }],
        };
      },
      async create() {
        return {
          agentId: "agent-busy",
          async send() {
            sendAttempts += 1;
            if (sendAttempts === 1) {
              const err = new Error("Agent agent-busy already has active run");
              err.name = "AgentBusyError";
              throw err;
            }
            return {
              status: "finished",
              async *stream() {
                yield { type: "assistant", message: { content: [{ type: "text", text: "recovered" }] } };
              },
              async wait() {
                return { status: "finished", result: "recovered" };
              },
            };
          },
          close() {},
        };
      },
    },
  };

  await runCursorTurn({
    prompt: "hi",
    agentOptions: { apiKey: "key", model: { id: "composer-2.5" }, local: { cwd: "/repo" } },
    emitter,
    sdkModule,
  });

  assert.equal(sendAttempts, 2);
  assert.equal(cancelledStale, true);
  assert.deepEqual(emitter.calls, [
    ["sessionId", "agent-busy"],
    ["text", "recovered"],
    ["done"],
  ]);
});

test("runCursorTurn returns when aborted while creating an agent", async () => {
  const emitter = makeEmitter();
  let resolveCreate;
  const createPromise = new Promise((resolve) => {
    resolveCreate = resolve;
  });
  const sdkModule = {
    Agent: {
      create() {
        return createPromise;
      },
    },
  };
  const controller = new AbortController();
  const turnPromise = runCursorTurn({
    prompt: "hi",
    agentOptions: { apiKey: "key", model: { id: "composer-2.5" }, local: { cwd: "/repo" } },
    emitter,
    signal: controller.signal,
    sdkModule,
  });

  controller.abort();
  const result = await turnPromise;
  assert.deepEqual(result, { sessionId: null });
  assert.deepEqual(emitter.calls, []);

  let closed = false;
  resolveCreate({ agentId: "late", close: () => { closed = true; } });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(closed, true);
});

test("runCursorTurn restores runtime env when aborted while creating an agent", async () => {
  const emitter = makeEmitter();
  const original = process.env.NETCATTY_CURSOR_ABORT_ENV;
  delete process.env.NETCATTY_CURSOR_ABORT_ENV;
  const sdkModule = {
    Agent: {
      create() {
        return new Promise(() => {});
      },
    },
  };
  const controller = new AbortController();
  const turnPromise = runCursorTurn({
    prompt: "hi",
    agentOptions: { apiKey: "key", model: { id: "composer-2.5" }, local: { cwd: "/repo" } },
    runtimeEnv: { NETCATTY_CURSOR_ABORT_ENV: "present" },
    emitter,
    signal: controller.signal,
    sdkModule,
  });

  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(process.env.NETCATTY_CURSOR_ABORT_ENV, "present");
  controller.abort();
  await turnPromise;
  assert.equal(process.env.NETCATTY_CURSOR_ABORT_ENV, undefined);
  if (original !== undefined) process.env.NETCATTY_CURSOR_ABORT_ENV = original;
});

test("runCursorTurn cancels a late Cursor run when aborted while sending", async () => {
  const emitter = makeEmitter();
  let resolveSend;
  let cancelled = false;
  const sendPromise = new Promise((resolve) => {
    resolveSend = resolve;
  });
  const sdkModule = {
    Agent: {
      async create() {
        return {
          agentId: "agent-send-abort",
          send() {
            return sendPromise;
          },
          close() {},
        };
      },
    },
  };
  const controller = new AbortController();
  const turnPromise = runCursorTurn({
    prompt: "hi",
    agentOptions: { apiKey: "key", model: { id: "composer-2.5" }, local: { cwd: "/repo" } },
    emitter,
    signal: controller.signal,
    sdkModule,
  });

  await new Promise((resolve) => setTimeout(resolve, 0));
  controller.abort();
  const result = await turnPromise;
  assert.deepEqual(result, { sessionId: "agent-send-abort" });
  assert.deepEqual(emitter.calls, [["sessionId", "agent-send-abort"]]);

  resolveSend({ cancel: async () => { cancelled = true; }, stream: async function* stream() {} });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(cancelled, true);
});

test("mapCursorModels keeps one row per base model and exposes Fast/effort controls", () => {
  assert.deepEqual(
    mapCursorModels([
      { id: "composer-2.5", displayName: "Composer 2.5", description: "Default" },
      {
        id: "gpt-5",
        displayName: "GPT-5",
        variants: [
          { displayName: "Standard", params: [], isDefault: true },
          { displayName: "Fast", params: [{ id: "effort", value: "low" }] },
          { displayName: "High", params: [{ id: "effort", value: "high" }] },
        ],
      },
      {
        id: "composer-2.5",
        displayName: "Composer 2.5 again",
        parameters: [
          {
            id: "fast",
            values: [{ value: "false" }, { value: "true", displayName: "Fast" }],
          },
        ],
      },
      {
        id: "gpt-5.5",
        displayName: "GPT-5.5",
        parameters: [
          {
            id: "fast",
            values: [{ value: "false" }, { value: "true", displayName: "Fast" }],
          },
          {
            id: "effort",
            values: [
              { value: "low", displayName: "Low" },
              { value: "medium", displayName: "Medium" },
              { value: "high", displayName: "High" },
            ],
          },
        ],
      },
    ]),
    [
      { id: "composer-2.5", name: "Composer 2.5", description: "Default" },
      {
        // Fast variant is effort=low; Low is already in thinkingLevels, so the
        // Fast toggle is omitted (selecting Low must not bill as *-low-fast).
        id: "gpt-5",
        name: "GPT-5",
        thinkingLevels: ["low", "high"],
        thinkingParamId: "effort",
      },
      {
        id: "gpt-5.5",
        name: "GPT-5.5",
        supportsFast: true,
        fastParams: [{ id: "fast", value: "true" }],
        thinkingLevels: ["low", "medium", "high"],
        thinkingParamId: "effort",
      },
    ],
  );
});

test("mapCursorModels keeps Fast independent from Low for dual-axis models", () => {
  assert.deepEqual(
    mapCursorModels([
      {
        id: "cursor-grok-4.5",
        displayName: "Cursor Grok 4.5",
        parameters: [
          {
            id: "fast",
            values: [{ value: "false" }, { value: "true", displayName: "Fast" }],
          },
          {
            id: "effort",
            values: [
              { value: "low", displayName: "Low" },
              { value: "high", displayName: "High" },
            ],
          },
        ],
        variants: [
          { displayName: "Low", params: [{ id: "effort", value: "low" }] },
          {
            displayName: "Low Fast",
            params: [
              { id: "effort", value: "low" },
              { id: "fast", value: "true" },
            ],
          },
        ],
      },
    ]),
    [
      {
        id: "cursor-grok-4.5",
        name: "Cursor Grok 4.5",
        supportsFast: true,
        fastParams: [{ id: "fast", value: "true" }],
        thinkingLevels: ["low", "high"],
        thinkingParamId: "effort",
      },
    ],
  );
});
