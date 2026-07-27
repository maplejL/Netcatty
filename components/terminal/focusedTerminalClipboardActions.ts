/**
 * Registry for the last-focused terminal's clipboard actions.
 *
 * Ctrl+Shift+V is often missed by xterm's custom key handler on Windows
 * (IME / focus quirks). The window hotkey path and Electron before-input
 * IPC both dispatch here so keyboard paste uses the same onPaste as the
 * context menu.
 *
 * We keep the last focused terminal until another terminal takes over or
 * it unmounts — clearing on every focusout made paste fail when the
 * helper textarea briefly lost DOM focus.
 */

export type FocusedTerminalClipboardActions = {
  onClear?: () => void;
  onCopy?: () => void;
  onPaste?: () => void | Promise<void>;
  /** Shortcut / IPC paste — no multiline confirm dialog (avoids focus races). */
  onPasteHotkey?: () => void | Promise<void>;
  onPasteSelection?: () => void;
  onSelectAll?: () => void;
};

type FocusedActionsGetter = () => FocusedTerminalClipboardActions | null | undefined;

let ownerId: string | null = null;
let focusedActionsGetter: FocusedActionsGetter | null = null;

export function setFocusedTerminalClipboardActionsGetter(
  id: string,
  getter: FocusedActionsGetter,
): void {
  ownerId = id;
  focusedActionsGetter = getter;
}

export function clearFocusedTerminalClipboardActionsGetter(id: string): void {
  if (ownerId !== id) return;
  ownerId = null;
  focusedActionsGetter = null;
}

export function runFocusedTerminalClipboardAction(action: string): boolean {
  const actions = focusedActionsGetter?.();
  if (!actions) return false;

  switch (action) {
    case "copy": {
      if (!actions.onCopy) return false;
      actions.onCopy();
      return true;
    }
    case "paste": {
      const paste = actions.onPasteHotkey ?? actions.onPaste;
      if (!paste) return false;
      void paste();
      return true;
    }
    case "pasteSelection": {
      if (!actions.onPasteSelection) return false;
      actions.onPasteSelection();
      return true;
    }
    case "selectAll": {
      if (!actions.onSelectAll) return false;
      actions.onSelectAll();
      return true;
    }
    case "clearBuffer": {
      if (!actions.onClear) return false;
      actions.onClear();
      return true;
    }
    default:
      return false;
  }
}
