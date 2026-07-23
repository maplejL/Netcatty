import type { Terminal as XTerm } from "@xterm/xterm";

import type { TerminalInterruptDisplayFilterReason } from "./terminalOutputPipeline";

const PENDING_INTERRUPT_SCROLL_KEY = Symbol.for("netcatty.pendingInterruptScroll");

type InterruptScrollTerm = Pick<XTerm, "scrollToBottom"> & Record<PropertyKey, unknown>;

/**
 * Ctrl+C while reviewing scrollback must jump to the live edge.
 * Call immediately on interrupt, and again after ^C / prompt is painted —
 * a single sync scrollToBottom is often overwritten by backlog drain / WebGL.
 */
export function forceTerminalScrollToBottomForInterrupt(term: Pick<XTerm, "scrollToBottom">): void {
  const target = term as InterruptScrollTerm;
  target[PENDING_INTERRUPT_SCROLL_KEY] = true;
  target.scrollToBottom();
  if (typeof requestAnimationFrame !== "function") {
    return;
  }
  requestAnimationFrame(() => {
    target.scrollToBottom();
    requestAnimationFrame(() => {
      target.scrollToBottom();
    });
  });
}

export function markPendingInterruptScroll(term: object): void {
  (term as InterruptScrollTerm)[PENDING_INTERRUPT_SCROLL_KEY] = true;
}

export function consumePendingInterruptScroll(term: object): boolean {
  const target = term as InterruptScrollTerm;
  if (!target[PENDING_INTERRUPT_SCROLL_KEY]) {
    return false;
  }
  target[PENDING_INTERRUPT_SCROLL_KEY] = false;
  return true;
}

/** Gate just released live output after Ctrl+C — keep viewport pinned to bottom. */
export function shouldForceScrollAfterInterruptDisplay(
  reason: TerminalInterruptDisplayFilterReason | undefined,
): boolean {
  return reason === "interrupt-echo"
    || reason === "prompt-candidate"
    || reason === "prompt-gap"
    || reason === "password-prompt"
    || reason === "quiet-gap"
    || reason === "max-drain";
}
