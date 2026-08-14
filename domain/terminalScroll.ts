import type { TerminalSettings } from "./models";

/** xterm `scrollSensitivity` default is 1; slightly slower is easier to control on Windows wheels. */
export const DEFAULT_TERMINAL_SCROLL_SENSITIVITY = 0.5;
export const MIN_TERMINAL_SCROLL_SENSITIVITY = 0.2;
export const MAX_TERMINAL_SCROLL_SENSITIVITY = 3;
const FAST_SCROLL_SENSITIVITY_MULTIPLIER = 5;

export const normalizeScrollSensitivity = (value: unknown): number => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_TERMINAL_SCROLL_SENSITIVITY;
  }
  const clamped = Math.min(
    MAX_TERMINAL_SCROLL_SENSITIVITY,
    Math.max(MIN_TERMINAL_SCROLL_SENSITIVITY, value),
  );
  return Math.round(clamped * 10) / 10;
};

export const resolveFastScrollSensitivity = (scrollSensitivity: number): number =>
  Math.max(1, normalizeScrollSensitivity(scrollSensitivity) * FAST_SCROLL_SENSITIVITY_MULTIPLIER);

const hasPrintableTerminalInput = (data: string): boolean => {
  if (data.includes("\x1b")) {
    return false;
  }

  for (const char of data) {
    const codePoint = char.codePointAt(0);
    if (codePoint === undefined) {
      continue;
    }
    if (codePoint >= 0x20 && codePoint !== 0x7f && codePoint !== 0x1b) {
      return true;
    }
  }
  return false;
};

export const shouldEnableNativeUserInputAutoScroll = (
  settings?: Partial<TerminalSettings> | null,
): boolean => settings?.scrollOnInput ?? true;

export const shouldScrollOnTerminalInput = (
  settings: Partial<TerminalSettings> | null | undefined,
  data: string,
): boolean => {
  const scrollOnInput = settings?.scrollOnInput ?? true;
  const scrollOnKeyPress = settings?.scrollOnKeyPress ?? false;

  if (!scrollOnInput && !scrollOnKeyPress) {
    return false;
  }

  return hasPrintableTerminalInput(data) ? scrollOnInput : scrollOnKeyPress;
};

export const shouldScrollOnTerminalOutput = (
  settings?: Partial<TerminalSettings> | null,
): boolean => settings?.scrollOnOutput ?? false;

export const shouldScrollOnTerminalPaste = (
  settings?: Partial<TerminalSettings> | null,
): boolean => settings?.scrollOnPaste ?? true;
