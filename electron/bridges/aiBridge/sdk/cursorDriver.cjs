"use strict";

/**
 * Cursor backend driver — wraps @cursor/sdk.
 *
 * Cursor SDK local agents use Agent.create({ apiKey, model, local:{cwd},
 * mcpServers }) and stream SDKMessage events from run.stream().
 */
const os = require("os");
const path = require("path");
const { mcpEnvPairsToObject } = require("./injectMcp.cjs");

const DEFAULT_CURSOR_MODEL = "composer-2.5";

/**
 * Electron packaged apps often launch with cwd = System32 / Windows.
 * Cursor local agents need a real writable workspace directory.
 */
function resolveCursorLocalCwd(cwd) {
  const candidate = String(cwd || "").trim();
  if (candidate) {
    const normalized = path.resolve(candidate).toLowerCase();
    const systemRoot = String(process.env.SystemRoot || "C:\\Windows").toLowerCase();
    const isWindowsSystemDir =
      process.platform === "win32" &&
      (normalized === systemRoot ||
        normalized.startsWith(systemRoot + path.sep) ||
        normalized.includes(`${path.sep}system32`) ||
        normalized.includes(`${path.sep}syswow64`));
    if (!isWindowsSystemDir) return candidate;
  }
  try {
    return os.homedir();
  } catch {
    return process.cwd();
  }
}

function toCursorMcpServers(injectedMcpServers) {
  const servers = {};
  for (const cfg of injectedMcpServers || []) {
    if (!cfg || !cfg.name || !cfg.command) continue;
    servers[cfg.name] = {
      type: "stdio",
      command: cfg.command,
      args: cfg.args || [],
      env: mcpEnvPairsToObject(cfg.env),
    };
  }
  return servers;
}

function parseCursorModelSelection(model) {
  const raw = String(model || DEFAULT_CURSOR_MODEL).trim() || DEFAULT_CURSOR_MODEL;
  const queryIndex = raw.indexOf("?");
  // Cursor defaults models with a Fast variant (composer-2.5, cursor-grok-4.5,
  // …) to Fast when `fast` is omitted. Always pin false unless the caller
  // encoded an explicit fast param.
  if (queryIndex < 0) {
    return { id: raw, params: [{ id: "fast", value: "false" }] };
  }

  const id = raw.slice(0, queryIndex);
  const search = new URLSearchParams(raw.slice(queryIndex + 1));
  const params = [];
  for (const [paramId, value] of search.entries()) {
    if (paramId && value) params.push({ id: paramId, value });
  }
  if (!params.some((param) => param.id === "fast")) {
    params.push({ id: "fast", value: "false" });
  }
  return params.length > 0 ? { id, params } : { id };
}

function buildCursorAgentOptions({ apiKey, env, model, cwd, injectedMcpServers }) {
  const effectiveApiKey = apiKey || env?.CURSOR_API_KEY || process.env.CURSOR_API_KEY;
  const options = {
    apiKey: effectiveApiKey,
    model: parseCursorModelSelection(model),
    local: {
      cwd: resolveCursorLocalCwd(cwd || process.cwd()),
      autoReview: false,
    },
  };
  const mcpServers = toCursorMcpServers(injectedMcpServers);
  if (Object.keys(mcpServers).length > 0) options.mcpServers = mcpServers;
  return options;
}

function applyTemporaryProcessEnv(env) {
  if (!env || typeof env !== "object") return () => {};
  const previous = new Map();
  for (const [key, value] of Object.entries(env)) {
    if (typeof value !== "string") continue;
    previous.set(key, Object.prototype.hasOwnProperty.call(process.env, key) ? process.env[key] : undefined);
    process.env[key] = value;
  }

  return () => {
    for (const [key, value] of previous.entries()) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  };
}

async function withTemporaryProcessEnv(env, fn) {
  const restore = applyTemporaryProcessEnv(env);
  try {
    return await fn();
  } finally {
    restore();
  }
}

function buildCursorSendMessage(prompt, attachments) {
  const images = [];
  for (const attachment of Array.isArray(attachments) ? attachments : []) {
    if (!attachment?.base64Data || !attachment?.mediaType) continue;
    if (!String(attachment.mediaType).toLowerCase().startsWith("image/")) continue;
    images.push({ data: attachment.base64Data, mimeType: attachment.mediaType });
  }
  if (images.length === 0) return String(prompt || "");
  return { text: String(prompt || ""), images };
}

function resultToText(result) {
  if (result == null) return "";
  if (typeof result === "string") return result;
  if (typeof result === "number" || typeof result === "boolean") return String(result);
  const content = result.content;
  if (Array.isArray(content)) {
    return content
      .map((block) => {
        if (!block) return "";
        if (typeof block.text === "string") return block.text;
        if (block.type === "image") return "[image]";
        return JSON.stringify(block);
      })
      .join("");
  }
  return JSON.stringify(result);
}

function redactCursorSecret(value) {
  return String(value || "")
    .replace(/crsr[_-]?[A-Za-z0-9_-]{8,}/g, "[redacted-cursor-key]")
    .replace(/Bearer\s+[A-Za-z0-9._~+/-]+=*/gi, "Bearer [redacted-token]");
}

function cursorErrorDiagnostics(error) {
  if (!error || typeof error !== "object") {
    return { message: redactCursorSecret(error) };
  }
  return {
    name: error.name || null,
    message: redactCursorSecret(error.message || String(error)),
    code: error.code || null,
    status: error.status || null,
    operation: error.operation || null,
    endpoint: error.endpoint || null,
    requestId: error.requestId || null,
    isRetryable: typeof error.isRetryable === "boolean" ? error.isRetryable : null,
    cause: error.cause && typeof error.cause === "object"
      ? {
        name: error.cause.name || null,
        message: redactCursorSecret(error.cause.message || String(error.cause)),
      }
      : null,
  };
}

function isCursorAuthMessage(message) {
  return /api.?key|auth|unauthorized|unauthenticated/i.test(String(message || ""));
}

async function logCursorApiKeyValidation(resolvedModule, apiKey) {
  if (!apiKey || typeof resolvedModule?.Cursor?.me !== "function") return;
  try {
    const user = await resolvedModule.Cursor.me({ apiKey });
    console.info("[Cursor SDK] API key validation ok", {
      hasUserId: user?.userId != null,
      hasEmail: Boolean(user?.email),
      createdAt: user?.createdAt || null,
    });
  } catch (error) {
    console.warn("[Cursor SDK] API key validation failed", cursorErrorDiagnostics(error));
  }
}

function closeReasoning(state, emitter) {
  if (state?.reasoningOpen) {
    emitter.reasoningEnd();
    state.reasoningOpen = false;
  }
}

function emitCursorToolCallOnce(event, emitter, state, toolName, args, id) {
  if (!id) return false;
  if (!state.emittedToolCalls) state.emittedToolCalls = new Set();
  if (state.emittedToolCalls.has(id)) return false;
  state.emittedToolCalls.add(id);
  emitter.toolCall(toolName || "tool", args && typeof args === "object" ? args : {}, id);
  return true;
}

function emitCursorToolResultOnce(event, emitter, state, id, result, toolName) {
  if (!id) return false;
  if (!state.emittedToolResults) state.emittedToolResults = new Set();
  if (state.emittedToolResults.has(id)) return false;
  state.emittedToolResults.add(id);
  emitter.toolResult(id, resultToText(result), toolName);
  return true;
}

function getCursorDisplayToolName(rawName, args) {
  const name = String(rawName || "").trim();
  const input = args && typeof args === "object" ? args : {};
  const nestedToolName = typeof input.toolName === "string" ? input.toolName.trim() : "";
  if ((name === "mcp" || name === "tool" || !name) && nestedToolName) {
    return nestedToolName;
  }
  return name || nestedToolName || "tool";
}

function formatCursorErrorForUser(message, diagnostics) {
  const text = String(message || "").trim();
  if (/api.?key|auth|unauthorized|unauthenticated/i.test(text)) {
    return "Cursor authentication failed. Update the Cursor API Key in Settings -> AI.";
  }
  if (text) return text;

  const parts = [];
  if (diagnostics?.code) parts.push(`code=${diagnostics.code}`);
  if (diagnostics?.status != null) parts.push(`status=${diagnostics.status}`);
  if (diagnostics?.operation) parts.push(`op=${diagnostics.operation}`);
  if (diagnostics?.requestId) parts.push(`requestId=${diagnostics.requestId}`);
  if (diagnostics?.cause?.message) parts.push(String(diagnostics.cause.message).trim());
  if (parts.length > 0) {
    return `Cursor turn failed (${parts.join(", ")})`;
  }
  return "Cursor turn failed. Check Settings -> AI Cursor API Key, model, and network.";
}

function extractCursorStatusErrorMessage(event) {
  if (!event || typeof event !== "object") return "";
  const candidates = [
    event.message,
    event.error,
    event.error?.message,
    event.detail,
    event.details,
    event.reason,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
    if (candidate && typeof candidate === "object" && typeof candidate.message === "string") {
      const nested = candidate.message.trim();
      if (nested) return nested;
    }
  }
  return "";
}

function translateCursorEvent(event, emitter, state = {}) {
  if (!event || typeof event !== "object") return;

  switch (event.type) {
    case "thinking":
      if (event.text) {
        emitter.reasoning(String(event.text));
        state.reasoningOpen = true;
      }
      return;
    case "assistant": {
      closeReasoning(state, emitter);
      const content = event.message?.content;
      if (!Array.isArray(content)) return;
      for (const block of content) {
        if (!block) continue;
        if (block.type === "text" && block.text) {
          emitter.text(String(block.text));
        } else if (block.type === "tool_use") {
          emitCursorToolCallOnce(
            event,
            emitter,
            state,
            getCursorDisplayToolName(block.name, block.input),
            block.input,
            block.id,
          );
        }
      }
      return;
    }
    case "tool_call": {
      closeReasoning(state, emitter);
      const id = event.call_id;
      const name = getCursorDisplayToolName(event.name, event.args);
      if (event.status === "running") {
        emitCursorToolCallOnce(event, emitter, state, name, event.args, id);
      } else if (event.status === "completed" || event.status === "error") {
        emitCursorToolCallOnce(event, emitter, state, name, event.args, id);
        emitCursorToolResultOnce(event, emitter, state, id, event.result || event.error || "", name);
      }
      return;
    }
    case "status":
      if (event.status === "ERROR" || event.status === "error" || event.status === "FAILED") {
        closeReasoning(state, emitter);
        state.failed = true;
        const statusMessage = extractCursorStatusErrorMessage(event);
        state.errorMessage = statusMessage;
        console.warn("[Cursor SDK] status error", {
          message: redactCursorSecret(statusMessage),
          status: event.status || null,
          code: event.code || event.error?.code || null,
        });
        emitter.emitError(formatCursorErrorForUser(statusMessage, cursorErrorDiagnostics(event)));
        return true;
      }
      return false;
    default:
      return false;
  }
}

class CursorTurnAbortError extends Error {
  constructor() {
    super("Cursor turn aborted");
    this.name = "CursorTurnAbortError";
  }
}

function isCursorTurnAbortError(error) {
  return error instanceof CursorTurnAbortError || error?.name === "CursorTurnAbortError";
}

/** Cursor RunStatus terminal values — non-terminal blocks the next agent.send(). */
function isCursorRunTerminal(status) {
  const normalized = String(status || "").toLowerCase();
  return (
    normalized === "finished"
    || normalized === "error"
    || normalized === "cancelled"
    || normalized === "failed"
    || normalized === "canceled"
  );
}

function isCursorAgentBusyError(error) {
  if (!error) return false;
  if (error.name === "AgentBusyError" || error.code === "agent_busy") return true;
  return /already has active run/i.test(String(error.message || error));
}

/**
 * Cancel a leftover Cursor run and wait until it is terminal so the next
 * agent.send() is not rejected with "already has active run".
 */
async function cancelCursorRunBestEffort(run, Agent, cwd) {
  if (!run) return;
  try {
    if (typeof run.cancel === "function") {
      await run.cancel();
    } else if (run.id && typeof Agent?.cancelRun === "function") {
      await Agent.cancelRun(run.id, { runtime: "local", cwd });
    }
  } catch (err) {
    console.warn("[Cursor SDK] cancel run failed", redactCursorSecret(err?.message || err));
  }
  try {
    if (typeof run.wait === "function") {
      await run.wait();
    } else if (run.id && typeof Agent?.getRun === "function") {
      // Poll once via getRun is not enough; prefer wait when available.
      const latest = await Agent.getRun(run.id, { runtime: "local", cwd });
      if (latest && !isCursorRunTerminal(latest.status) && typeof latest.cancel === "function") {
        await latest.cancel().catch(() => {});
        if (typeof latest.wait === "function") await latest.wait().catch(() => {});
      }
    }
  } catch {
    // Best effort — store may already mark cancelled.
  }
}

/**
 * Clear non-terminal runs for an agent before send/resume follow-up.
 * Cursor persists activeRunId locally; Stop/abort without terminalizing leaves
 * the next turn failing with AgentBusyError.
 */
async function clearActiveCursorRuns(Agent, agentId, cwd) {
  if (!agentId || typeof Agent?.listRuns !== "function") return false;
  let cleared = false;
  try {
    const listed = await Agent.listRuns(agentId, { runtime: "local", cwd });
    const items = Array.isArray(listed?.items)
      ? listed.items
      : (Array.isArray(listed) ? listed : []);
    for (const run of items) {
      if (!run || isCursorRunTerminal(run.status)) continue;
      console.warn("[Cursor SDK] Clearing non-terminal run before send", {
        agentId,
        runId: run.id || null,
        status: run.status || null,
      });
      await cancelCursorRunBestEffort(run, Agent, cwd);
      cleared = true;
    }
  } catch (err) {
    console.warn("[Cursor SDK] listRuns before send failed", redactCursorSecret(err?.message || err));
  }
  return cleared;
}

async function abortable(promise, signal, onLateResolve) {
  if (!signal) return promise;
  if (signal.aborted) {
    promise.then((value) => onLateResolve?.(value)).catch(() => {});
    throw new CursorTurnAbortError();
  }

  let aborted = false;
  let removeAbortListener = () => {};
  const abortPromise = new Promise((_, reject) => {
    const onAbort = () => {
      aborted = true;
      reject(new CursorTurnAbortError());
    };
    signal.addEventListener("abort", onAbort, { once: true });
    removeAbortListener = () => signal.removeEventListener("abort", onAbort);
  });

  try {
    return await Promise.race([promise, abortPromise]);
  } finally {
    removeAbortListener();
    if (aborted) {
      promise.then((value) => onLateResolve?.(value)).catch(() => {});
    }
  }
}

async function runCursorTurn({
  prompt, attachments, agentOptions, runtimeEnv, resumeSessionId, emitter, signal, sdkModule,
}) {
  let resolvedModule = sdkModule;
  if (!resolvedModule) {
    try {
      resolvedModule = await import("@cursor/sdk");
    } catch {
      emitter.emitError("Cursor SDK not installed. Run: npm install @cursor/sdk");
      return { sessionId: resumeSessionId || null };
    }
  }

  if (!String(agentOptions?.apiKey || "").trim()) {
    emitter.emitError("Cursor API Key is missing. Add it in Settings -> AI.");
    return { sessionId: resumeSessionId || null };
  }

  const { Agent } = resolvedModule;
  let agent = null;
  let run = null;
  let sessionId = resumeSessionId || null;
  try {
    const restoreCreateEnv = applyTemporaryProcessEnv(runtimeEnv);
    try {
      const agentPromise = resumeSessionId && typeof Agent.resume === "function"
        ? Agent.resume(resumeSessionId, agentOptions)
        : Agent.create(agentOptions);
      agent = await abortable(agentPromise, signal, (lateAgent) => {
        try { lateAgent?.close?.(); } catch { /* best effort */ }
      });
    } finally {
      restoreCreateEnv();
    }
    sessionId = agent.agentId || sessionId;
    if (sessionId) emitter.sessionId(sessionId);
    if (signal?.aborted) return { sessionId };

    const localCwd = agentOptions?.local?.cwd;
    // Resume paths often leave a non-terminal run after Stop/stream error.
    // Clear those before send so Cursor does not throw AgentBusyError.
    if (sessionId) {
      await clearActiveCursorRuns(Agent, sessionId, localCwd);
    }

    const sendMessage = buildCursorSendMessage(prompt, attachments);
    const sendOptions = agentOptions?.model
      ? { model: agentOptions.model }
      : undefined;
    const sendWithModel = () => (
      sendOptions ? agent.send(sendMessage, sendOptions) : agent.send(sendMessage)
    );
    const onLateSendResolve = (lateRun) => {
      if (lateRun && typeof lateRun.cancel === "function") {
        void lateRun.cancel().catch(() => {});
      }
    };
    const restoreSendEnv = applyTemporaryProcessEnv(runtimeEnv);
    try {
      // Cursor updates the active model from send({ model }), not only create().
      // Fast / effort params must be passed here or mid-chat toggles and resumes
      // keep the previous selection.
      try {
        run = await abortable(sendWithModel(), signal, onLateSendResolve);
      } catch (sendErr) {
        if (signal?.aborted || isCursorTurnAbortError(sendErr)) throw sendErr;
        if (!isCursorAgentBusyError(sendErr)) throw sendErr;
        // Race: previous run still active after listRuns, or concurrent send.
        console.warn("[Cursor SDK] Agent busy on send; clearing active runs and retrying once", {
          agentId: sessionId,
          message: redactCursorSecret(sendErr?.message || sendErr),
        });
        await clearActiveCursorRuns(Agent, sessionId, localCwd);
        run = await abortable(sendWithModel(), signal, onLateSendResolve);
      }
    } finally {
      restoreSendEnv();
    }
    const state = { reasoningOpen: false };
    let hasContent = false;
    let failed = false;
    const onAbort = () => {
      if (run && typeof run.cancel === "function") {
        void run.cancel().catch(() => {});
      }
    };
    if (signal) {
      if (signal.aborted) onAbort();
      else signal.addEventListener("abort", onAbort, { once: true });
    }
    try {
      for await (const event of run.stream()) {
        if (signal?.aborted) break;
        if (event?.type === "assistant" || event?.type === "tool_call") hasContent = true;
        const streamFailed = translateCursorEvent(event, emitter, state);
        if (streamFailed || state.failed) {
          failed = true;
          break;
        }
      }

      // SDK docs: stream observes; wait() is the terminal result and catches
      // mid-flight failures that may not appear as stream status events.
      // Always wait (or cancel) so activeRunId is cleared for the next turn —
      // skipping wait after stream ERROR left agents permanently busy.
      if (signal?.aborted) {
        await cancelCursorRunBestEffort(run, Agent, localCwd);
      } else if (run && typeof run.wait === "function") {
        const waitResult = await abortable(run.wait(), signal);
        const waitStatus = String(waitResult?.status || "").toLowerCase();
        if (waitStatus === "error" || waitStatus === "failed") {
          failed = true;
          const waitMessage =
            extractCursorStatusErrorMessage(waitResult) ||
            waitResult?.error ||
            waitResult?.message ||
            `Cursor run ended with status=${waitResult?.status || "error"}`;
          state.errorMessage = String(waitMessage || "");
          console.warn("[Cursor SDK] wait() error", {
            status: waitResult?.status || null,
            message: redactCursorSecret(state.errorMessage),
            runId: waitResult?.id || run?.id || null,
          });
          // Avoid double error toast when stream already reported the failure.
          if (!state.failed) {
            emitter.emitError(formatCursorErrorForUser(state.errorMessage, cursorErrorDiagnostics(waitResult)));
          }
        } else if (!failed && !hasContent && waitResult?.result) {
          // Some SDK builds deliver final text only via wait().
          const finalText = typeof waitResult.result === "string"
            ? waitResult.result
            : resultToText(waitResult.result);
          if (finalText) {
            emitter.text(finalText);
            hasContent = true;
          }
        }
      } else if (run && !isCursorRunTerminal(run.status)) {
        await cancelCursorRunBestEffort(run, Agent, localCwd);
      }
    } finally {
      if (signal) signal.removeEventListener("abort", onAbort);
      // Last resort: if wait/cancel above did not finish, force terminalize.
      if (run && !isCursorRunTerminal(run.status)) {
        await cancelCursorRunBestEffort(run, Agent, localCwd);
      }
    }
    closeReasoning(state, emitter);
    if (failed) {
      if (isCursorAuthMessage(state.errorMessage)) {
        await logCursorApiKeyValidation(resolvedModule, agentOptions?.apiKey);
      }
      return { sessionId };
    }
    if (!hasContent && !signal?.aborted) {
      emitter.emitError("Cursor returned an empty response. Check the Cursor API Key in Settings -> AI.");
      return { sessionId };
    }
    if (!signal?.aborted) emitter.emitDone();
    return { sessionId };
  } catch (error) {
    if (isCursorTurnAbortError(error) || signal?.aborted) {
      if (run) await cancelCursorRunBestEffort(run, Agent, agentOptions?.local?.cwd);
      return { sessionId };
    }
    {
      const diagnostics = cursorErrorDiagnostics(error);
      const message = diagnostics.message || error?.message || String(error);
      console.warn("[Cursor SDK] run error", diagnostics);
      if (isCursorAuthMessage(message)) {
        await logCursorApiKeyValidation(resolvedModule, agentOptions?.apiKey);
      }
      if (isCursorAgentBusyError(error)) {
        emitter.emitError(
          "Cursor agent still has an active run from a previous turn. Stopped leftover run — send your message again.",
        );
        if (sessionId) {
          await clearActiveCursorRuns(Agent, sessionId, agentOptions?.local?.cwd);
        }
      } else {
        emitter.emitError(formatCursorErrorForUser(message, diagnostics));
      }
    }
    return { sessionId };
  } finally {
    try { await agent?.close?.(); } catch { /* best effort */ }
  }
}

/**
 * Map Cursor.models.list() into picker rows.
 *
 * Keep one row per base model id. Fast / effort controls are exposed as
 * metadata on the row so the chat input can render toggles instead of
 * flooding the picker with "GPT-5 - Fast" / "GPT-5 - High" duplicates.
 */
function isTruthyFastValue(value, displayName) {
  const raw = String(value ?? "").toLowerCase();
  if (raw === "true" || raw === "1" || raw === "yes") return true;
  return /fast/i.test(String(displayName || ""));
}

function isExplicitFastParam(param) {
  if (!param?.id || param.value == null) return false;
  if (param.id === "fast" || /fast/i.test(String(param.id))) return true;
  return false;
}

/** Fast expressed only as effort=low (no separate fast=true axis). */
function isEffortOnlyFastParams(fastParams, thinkingParamId = "effort") {
  if (!Array.isArray(fastParams) || fastParams.length !== 1) return false;
  const only = fastParams[0];
  return only?.id === thinkingParamId && String(only?.value) === "low";
}

function extractCursorModelControls(model) {
  const supports = {
    supportsFast: false,
    fastParams: null,
    thinkingLevels: null,
    thinkingParamId: null,
  };

  for (const param of model.parameters || []) {
    if (!param?.id || !Array.isArray(param.values) || param.values.length === 0) continue;
    const paramKey = `${param.id} ${param.displayName || ""}`;

    if (param.id === "fast" || /fast/i.test(paramKey)) {
      const trueVal = param.values.find((value) => isTruthyFastValue(value?.value, value?.displayName));
      if (trueVal) {
        supports.supportsFast = true;
        supports.fastParams = [{ id: param.id, value: String(trueVal.value) }];
      }
    }

    if (
      param.id === "effort"
      || /effort|thinking|reasoning/i.test(paramKey)
    ) {
      const levels = param.values
        .map((value) => (value?.value == null ? "" : String(value.value)))
        .filter(Boolean);
      if (levels.length > 0) {
        supports.thinkingLevels = levels;
        supports.thinkingParamId = param.id;
      }
    }
  }

  for (const variant of model.variants || []) {
    const displayName = String(variant?.displayName || "");
    const params = Array.isArray(variant?.params) ? variant.params : [];
    const effortParam = params.find((param) => param?.id === "effort" && param?.value != null);

    if (effortParam) {
      const level = String(effortParam.value);
      if (!supports.thinkingLevels) {
        supports.thinkingLevels = [];
        supports.thinkingParamId = "effort";
      }
      if (!supports.thinkingLevels.includes(level)) {
        supports.thinkingLevels.push(level);
      }
    }

    // Prefer an explicit fast=true axis. Never copy effort into fastParams when
    // the variant is named "Low Fast" / "Fast" — bundling effort=low with Fast
    // makes selecting Low look like Fast and bills as *-low-fast.
    if (!supports.supportsFast && /fast/i.test(displayName)) {
      const explicitFast = params
        .filter((param) => isExplicitFastParam(param))
        .map((param) => ({ id: param.id, value: String(param.value) }));
      if (explicitFast.length > 0) {
        supports.supportsFast = true;
        supports.fastParams = explicitFast;
      } else if (effortParam && String(effortParam.value) === "low") {
        // Tentative: Fast variant is literally effort=low (older Cursor catalogs).
        // Dropped below when "low" is already a normal effort choice.
        supports.supportsFast = true;
        supports.fastParams = [{ id: "effort", value: "low" }];
      }
    }
  }

  if (supports.thinkingLevels && supports.thinkingLevels.length === 0) {
    supports.thinkingLevels = null;
    supports.thinkingParamId = null;
  }

  // If Fast is only an alias for effort=low and Low is already selectable,
  // hide the Fast toggle — otherwise picking Low auto-enables Fast.
  if (
    supports.supportsFast
    && isEffortOnlyFastParams(supports.fastParams, supports.thinkingParamId || "effort")
    && supports.thinkingLevels?.includes("low")
  ) {
    supports.supportsFast = false;
    supports.fastParams = null;
  }

  if (supports.supportsFast && (!supports.fastParams || supports.fastParams.length === 0)) {
    supports.supportsFast = false;
    supports.fastParams = null;
  }

  return supports;
}

function mapCursorModels(models) {
  const out = [];
  if (!Array.isArray(models)) return out;
  const seen = new Set();
  for (const model of models) {
    if (!model?.id || seen.has(model.id)) continue;
    seen.add(model.id);
    const name = model.displayName || model.name || model.id;
    const controls = extractCursorModelControls(model);
    out.push({
      id: model.id,
      name,
      ...(model.description ? { description: model.description } : {}),
      ...(controls.supportsFast ? { supportsFast: true, fastParams: controls.fastParams } : {}),
      ...(controls.thinkingLevels
        ? { thinkingLevels: controls.thinkingLevels, thinkingParamId: controls.thinkingParamId }
        : {}),
    });
  }
  return out;
}

async function listCursorModels({ apiKey, env, sdkModule } = {}) {
  let resolvedModule = sdkModule;
  if (!resolvedModule) {
    try { resolvedModule = await import("@cursor/sdk"); } catch (err) {
      console.warn("[Cursor SDK] list models: failed to load @cursor/sdk", err?.message || err);
      return [];
    }
  }
  const effectiveApiKey = apiKey || env?.CURSOR_API_KEY || process.env.CURSOR_API_KEY;
  if (!effectiveApiKey) {
    console.warn("[Cursor SDK] list models: missing CURSOR_API_KEY");
    return [];
  }
  if (!resolvedModule.Cursor?.models?.list) {
    console.warn("[Cursor SDK] list models: Cursor.models.list unavailable");
    return [];
  }
  const models = await resolvedModule.Cursor.models.list({ apiKey: effectiveApiKey });
  return mapCursorModels(models);
}

module.exports = {
  DEFAULT_CURSOR_MODEL,
  abortable,
  applyTemporaryProcessEnv,
  buildCursorAgentOptions,
  buildCursorSendMessage,
  cancelCursorRunBestEffort,
  clearActiveCursorRuns,
  extractCursorStatusErrorMessage,
  formatCursorErrorForUser,
  isCursorAgentBusyError,
  isCursorRunTerminal,
  listCursorModels,
  mapCursorModels,
  parseCursorModelSelection,
  resolveCursorLocalCwd,
  runCursorTurn,
  toCursorMcpServers,
  translateCursorEvent,
  withTemporaryProcessEnv,
};
