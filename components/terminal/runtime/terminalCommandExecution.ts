import type { RefObject } from "react";
import type { Terminal as XTerm } from "@xterm/xterm";
import type { Host } from "../../../types";
import {
  markPromptLineBreakCommandPending,
  type PromptLineBreakState,
} from "./promptLineBreak";
import {
  getAlignedPrompt,
  isNonPromptLine,
  reconcilePromptWithExternalCommand,
} from "../autocomplete/promptDetector";
import { beginTerminalCommandTiming } from "./terminalCommandTiming";

type TerminalCommandExecutionContext = {
  host: Pick<Host, "id" | "label" | "hostname">;
  sessionId: string;
  /** Backend session id (may differ from UI sessionId until attach). */
  sessionRef?: RefObject<string | null | undefined>;
  onCommandExecuted?: (
    command: string,
    hostId: string,
    hostLabel: string,
    sessionId: string,
  ) => void;
  onCommandSubmitted?: (
    command: string,
    hostId: string,
    hostLabel: string,
    sessionId: string,
  ) => void;
  commandBufferRef: RefObject<string>;
  promptLineBreakStateRef?: RefObject<PromptLineBreakState>;
};

export const shouldRecordShellHistory = (
  command: string,
  term?: XTerm | null,
): boolean => {
  if (!term) return true;

  const { prompt, alignedTyped } = getAlignedPrompt(term, command, true);
  if (!prompt.isAtPrompt) return false;
  if (alignedTyped?.trim() === command.trim()) return true;

  if (reconcilePromptWithExternalCommand(prompt, command)) return true;

  const liveCommand = prompt.userInput.trim();
  if (liveCommand.length === 0) {
    return !isNonPromptLine(`${prompt.promptText}${command.trim()}`);
  }
  return liveCommand === command.trim();
};

/**
 * Merge local keystroke buffer with the live prompt line after Tab complete /
 * history recall / remote line editing.
 */
export const pickSubmittedTerminalCommand = (
  fromBuffer: string,
  fromPrompt: string,
): string => {
  const buffer = (fromBuffer || "").trim();
  const prompt = (fromPrompt || "").trim();
  if (prompt && buffer) {
    // Prefer the longer form when one is a prefix of the other (Tab complete).
    if (prompt.startsWith(buffer) || buffer.startsWith(prompt)) {
      return prompt.length >= buffer.length ? prompt : buffer;
    }
    // Screen line is authoritative when both differ (history / remote edit).
    return prompt;
  }
  return prompt || buffer;
};

/**
 * Resolve the command that was actually submitted.
 *
 * Local keystroke buffer is incomplete after Tab completion / history recall /
 * remote line editing (e.g. buffer `cd /ho`, screen shows `cd /home/`). Prefer
 * the live prompt line when it is a better match, then fall back to buffer.
 */
export const resolveSubmittedTerminalCommand = (
  command: string,
  term?: XTerm | null,
): string => {
  const fromBuffer = (command || "").trim();
  let fromPrompt = "";
  if (term) {
    try {
      const { prompt } = getAlignedPrompt(term, fromBuffer, true);
      fromPrompt = (prompt.userInput || "").trim();
    } catch {
      fromPrompt = "";
    }
  }
  return pickSubmittedTerminalCommand(fromBuffer, fromPrompt);
};

export const recordTerminalCommandExecution = (
  command: string,
  ctx: TerminalCommandExecutionContext,
  term?: XTerm | null,
): string | null => {
  const cmd = resolveSubmittedTerminalCommand(command, term);
  if (cmd) {
    // Timing starts at submit (Enter / single-line paste), before writeToSession.
    // Prefer backend session id so write/output/render marks share one key.
    const timingSessionId = ctx.sessionRef?.current || ctx.sessionId;
    beginTerminalCommandTiming({
      sessionId: timingSessionId,
      command: cmd,
      hostId: ctx.host.id,
      hostLabel: ctx.host.label,
      hostHostname: ctx.host.hostname,
    });
    ctx.onCommandSubmitted?.(cmd, ctx.host.id, ctx.host.label, ctx.sessionId);
  }
  if (cmd && shouldRecordShellHistory(cmd, term)) {
    ctx.onCommandExecuted?.(cmd, ctx.host.id, ctx.host.label, ctx.sessionId);
    ctx.commandBufferRef.current = "";
    markPromptLineBreakCommandPending(ctx.promptLineBreakStateRef, term, command);
    return cmd;
  }
  ctx.commandBufferRef.current = "";
  markPromptLineBreakCommandPending(ctx.promptLineBreakStateRef, term, command);
  return null;
};
