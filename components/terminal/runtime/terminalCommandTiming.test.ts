import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import {
  beginTerminalCommandTiming,
  buildTerminalCommandTimingSegments,
  buildTerminalCommandTimingViewModel,
  clearTerminalCommandTimingTraces,
  configureTerminalCommandTiming,
  endTerminalCommandTiming,
  filterTerminalCommandTimingTraces,
  formatTerminalCommandTimingTrace,
  getTerminalCommandTimingHostKey,
  getTerminalCommandTimingSnapshot,
  getTerminalCommandTimingTraces,
  getTerminalCommandTimingViewModels,
  isTerminalCommandTimingDebugEnabled,
  listTerminalCommandTimingHostOptions,
  markTerminalCommandFirstOutput,
  markTerminalCommandFirstRender,
  markTerminalCommandWrite,
  maybeEndTerminalCommandTimingOnPrompt,
  resetTerminalCommandTimingStore,
  setTerminalCommandTimingDebugEnabled,
  subscribeTerminalCommandTiming,
} from "./terminalCommandTiming";

beforeEach(() => {
  resetTerminalCommandTimingStore();
  configureTerminalCommandTiming({
    capacity: 5,
    timeoutMs: 0,
    persist: false,
    now: (() => {
      let t = 1000;
      return () => {
        t += 10;
        return t;
      };
    })(),
  });
  // Force off regardless of localStorage hydration from prior tests / env.
  setTerminalCommandTimingDebugEnabled(false);
});

afterEach(() => {
  setTerminalCommandTimingDebugEnabled(false);
  resetTerminalCommandTimingStore();
  configureTerminalCommandTiming({ persist: false });
});

test("disabled mode is a no-op for begin and marks", () => {
  assert.equal(isTerminalCommandTimingDebugEnabled(), false);
  assert.equal(beginTerminalCommandTiming({ sessionId: "s1", command: "ls" }), null);
  markTerminalCommandWrite("s1");
  markTerminalCommandFirstOutput("s1");
  markTerminalCommandFirstRender("s1");
  assert.equal(getTerminalCommandTimingTraces().length, 0);
});

test("records submit → write → first output → first render deltas", () => {
  setTerminalCommandTimingDebugEnabled(true);
  const started = beginTerminalCommandTiming({
    sessionId: "s1",
    command: "  echo hi  ",
    hostId: "h1",
    hostLabel: "box",
  });
  assert.ok(started);
  assert.equal(started.command, "echo hi");
  assert.equal(started.sessionId, "s1");

  markTerminalCommandWrite("s1");
  markTerminalCommandFirstOutput("s1");
  markTerminalCommandFirstRender("s1");
  // Second marks are ignored (first-only).
  markTerminalCommandWrite("s1");
  markTerminalCommandFirstOutput("s1");
  markTerminalCommandFirstRender("s1");

  const traces = getTerminalCommandTimingTraces();
  assert.equal(traces.length, 1);
  const t = traces[0];
  assert.equal(t.msWrite, 10);
  assert.equal(t.msFirstOutput, 20);
  assert.equal(t.msFirstRender, 30);
  assert.equal(t.tEnd, undefined);

  const ended = endTerminalCommandTiming("s1", "manual");
  assert.ok(ended);
  assert.equal(ended.endReason, "manual");
  assert.equal(ended.msTotal, 40);
});

test("next command ends the previous open trace on the same session", () => {
  setTerminalCommandTimingDebugEnabled(true);
  beginTerminalCommandTiming({ sessionId: "s1", command: "first" });
  markTerminalCommandWrite("s1");
  beginTerminalCommandTiming({ sessionId: "s1", command: "second" });

  const traces = getTerminalCommandTimingTraces();
  assert.equal(traces.length, 2);
  assert.equal(traces[0].command, "first");
  assert.equal(traces[0].endReason, "next_command");
  assert.ok(traces[0].msTotal !== undefined);
  assert.equal(traces[1].command, "second");
  assert.equal(traces[1].tEnd, undefined);

  const snap = getTerminalCommandTimingSnapshot();
  assert.ok(snap.activeBySession.s1);
  assert.equal(snap.activeBySession.s1?.command, "second");
});

test("sessions are independent", () => {
  setTerminalCommandTimingDebugEnabled(true);
  beginTerminalCommandTiming({ sessionId: "a", command: "cmd-a" }); // t=1010
  beginTerminalCommandTiming({ sessionId: "b", command: "cmd-b" }); // t=1020
  markTerminalCommandWrite("a"); // t=1030 → a.msWrite = 20
  markTerminalCommandFirstOutput("b"); // t=1040 → b.msFirstOutput = 20

  const snap = getTerminalCommandTimingSnapshot();
  assert.equal(snap.activeBySession.a?.msWrite, 20);
  assert.equal(snap.activeBySession.a?.msFirstOutput, undefined);
  assert.equal(snap.activeBySession.b?.msFirstOutput, 20);
  assert.equal(snap.activeBySession.b?.msWrite, undefined);
});

test("ring buffer drops oldest traces beyond capacity", () => {
  setTerminalCommandTimingDebugEnabled(true);
  configureTerminalCommandTiming({ capacity: 3 });
  for (let i = 0; i < 5; i += 1) {
    beginTerminalCommandTiming({ sessionId: `s${i}`, command: `c${i}` });
    endTerminalCommandTiming(`s${i}`, "manual");
  }
  const traces = getTerminalCommandTimingTraces();
  assert.equal(traces.length, 3);
  assert.equal(traces[0].command, "c2");
  assert.equal(traces[2].command, "c4");
});

test("empty command and missing session are ignored", () => {
  setTerminalCommandTimingDebugEnabled(true);
  assert.equal(beginTerminalCommandTiming({ sessionId: "s1", command: "   " }), null);
  assert.equal(beginTerminalCommandTiming({ sessionId: "", command: "ls" }), null);
  assert.equal(getTerminalCommandTimingTraces().length, 0);
});

test("formatTerminalCommandTimingTrace includes key fields", () => {
  setTerminalCommandTimingDebugEnabled(true);
  beginTerminalCommandTiming({
    sessionId: "s1",
    command: "uptime",
    hostLabel: "prod",
  });
  markTerminalCommandWrite("s1");
  endTerminalCommandTiming("s1", "session_exit");
  const [trace] = getTerminalCommandTimingTraces();
  const line = formatTerminalCommandTimingTrace(trace);
  assert.match(line, /cmd="uptime"/);
  assert.match(line, /session=s1/);
  assert.match(line, /host=prod/);
  assert.match(line, /write=\d+ms/);
  assert.match(line, /end=session_exit/);
});

test("disabling ends open traces as manual", () => {
  setTerminalCommandTimingDebugEnabled(true);
  beginTerminalCommandTiming({ sessionId: "s1", command: "sleep 1" });
  setTerminalCommandTimingDebugEnabled(false);
  const [trace] = getTerminalCommandTimingTraces();
  assert.equal(trace.endReason, "manual");
  assert.ok(trace.tEnd !== undefined);
  assert.equal(getTerminalCommandTimingSnapshot().activeBySession.s1, undefined);
});

test("buildTerminalCommandTimingSegments marks write→output bottleneck", () => {
  const segs = buildTerminalCommandTimingSegments({
    id: "t1",
    sessionId: "s1",
    command: "slow",
    tSubmit: 0,
    msWrite: 5,
    msFirstOutput: 200,
    msFirstRender: 210,
    msTotal: 220,
  });
  assert.equal(segs.length, 4);
  const bottleneck = segs.find((s) => s.isBottleneck);
  assert.equal(bottleneck?.id, "write_to_output");
  assert.equal(bottleneck?.ms, 195);
  const view = buildTerminalCommandTimingViewModel({
    id: "t1",
    sessionId: "s1",
    command: "slow",
    tSubmit: 0,
    msWrite: 5,
    msFirstOutput: 200,
    msFirstRender: 210,
    msTotal: 220,
    tEnd: 220,
  });
  assert.equal(view.status, "ended");
  assert.equal(view.bottleneckId, "write_to_output");
});

test("getTerminalCommandTimingViewModels returns newest first", () => {
  setTerminalCommandTimingDebugEnabled(true);
  beginTerminalCommandTiming({ sessionId: "s1", command: "a" });
  endTerminalCommandTiming("s1", "manual");
  beginTerminalCommandTiming({ sessionId: "s1", command: "b" });
  endTerminalCommandTiming("s1", "manual");
  const views = getTerminalCommandTimingViewModels();
  assert.equal(views[0].command, "b");
  assert.equal(views[1].command, "a");
});

test("subscribeTerminalCommandTiming notifies on marks and clear", async () => {
  setTerminalCommandTimingDebugEnabled(true);
  let calls = 0;
  const unsub = subscribeTerminalCommandTiming(() => {
    calls += 1;
  });
  beginTerminalCommandTiming({ sessionId: "s1", command: "ls" });
  // notifyListeners coalesces via queueMicrotask
  await new Promise((r) => setTimeout(r, 0));
  assert.ok(calls >= 1, `expected notify after begin, got ${calls}`);
  const before = calls;
  markTerminalCommandWrite("s1");
  await new Promise((r) => setTimeout(r, 0));
  assert.ok(calls > before, `expected notify after mark, got ${calls}`);
  clearTerminalCommandTimingTraces();
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(getTerminalCommandTimingTraces().length, 0);
  unsub();
});

test("maybeEndTerminalCommandTimingOnPrompt ends after first output at idle prompt", () => {
  setTerminalCommandTimingDebugEnabled(true);
  beginTerminalCommandTiming({ sessionId: "s1", command: "ll" });
  markTerminalCommandWrite("s1");
  markTerminalCommandFirstOutput("s1");
  markTerminalCommandFirstRender("s1");

  // Still running program / mid-output: do not end.
  assert.equal(
    maybeEndTerminalCommandTimingOnPrompt("s1", { isAtPrompt: false, userInput: "" }),
    null,
  );
  // User already typing next command: do not end.
  assert.equal(
    maybeEndTerminalCommandTimingOnPrompt("s1", { isAtPrompt: true, userInput: "c" }),
    null,
  );

  const ended = maybeEndTerminalCommandTimingOnPrompt("s1", {
    isAtPrompt: true,
    userInput: "",
  });
  assert.ok(ended);
  assert.equal(ended?.endReason, "prompt_return");
  assert.equal(ended?.msTotal !== undefined, true);
  // Further prompt detections must not rewrite total.
  const total = ended?.msTotal;
  assert.equal(
    maybeEndTerminalCommandTimingOnPrompt("s1", { isAtPrompt: true, userInput: "" }),
    null,
  );
  assert.equal(getTerminalCommandTimingTraces()[0].msTotal, total);
});

test("maybeEndTerminalCommandTimingOnPrompt waits for first remote output", () => {
  setTerminalCommandTimingDebugEnabled(true);
  beginTerminalCommandTiming({ sessionId: "s1", command: "sleep 1" });
  markTerminalCommandWrite("s1");
  // Pre-command idle prompt must not close the trace.
  assert.equal(
    maybeEndTerminalCommandTimingOnPrompt("s1", { isAtPrompt: true, userInput: "" }),
    null,
  );
  markTerminalCommandFirstOutput("s1");
  const ended = maybeEndTerminalCommandTimingOnPrompt("s1", {
    isAtPrompt: true,
    userInput: "",
  });
  assert.equal(ended?.endReason, "prompt_return");
});

test("filterTerminalCommandTimingTraces filters by host IP and search query", () => {
  setTerminalCommandTimingDebugEnabled(true);
  beginTerminalCommandTiming({
    sessionId: "s1",
    command: "ll",
    hostHostname: "124.222.218.97",
    hostLabel: "prod",
  });
  beginTerminalCommandTiming({
    sessionId: "s2",
    command: "cd sc",
    hostHostname: "10.0.0.2",
    hostLabel: "dev",
  });
  beginTerminalCommandTiming({
    sessionId: "s3",
    command: "uptime",
    hostHostname: "124.222.218.97",
    hostLabel: "prod",
  });

  const all = getTerminalCommandTimingTraces();
  assert.equal(all.length, 3);

  const hosts = listTerminalCommandTimingHostOptions(all);
  assert.deepEqual(hosts, ["10.0.0.2", "124.222.218.97"]);

  const byIp = filterTerminalCommandTimingTraces(all, { hostFilter: "124.222.218.97" });
  assert.equal(byIp.length, 2);
  assert.ok(byIp.every((t) => t.hostHostname === "124.222.218.97"));

  const byCmd = filterTerminalCommandTimingTraces(all, { query: "cd" });
  assert.equal(byCmd.length, 1);
  assert.equal(byCmd[0].command, "cd sc");

  const byBoth = filterTerminalCommandTimingTraces(all, {
    hostFilter: "124.222.218.97",
    query: "up",
  });
  assert.equal(byBoth.length, 1);
  assert.equal(byBoth[0].command, "uptime");

  assert.equal(getTerminalCommandTimingHostKey(all[0]), "124.222.218.97");
});
