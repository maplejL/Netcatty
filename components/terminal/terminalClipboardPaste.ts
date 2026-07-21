import type { Terminal as XTerm } from "@xterm/xterm";

import { shouldConfirmMultilinePaste } from "../../domain/multilinePaste";
import { extractRootPathsFromClipboardFiles } from "./terminalHelpers";
import { pasteTextIntoTerminal } from "./runtime/terminalUserPaste";
import { requestMultilinePasteConfirm } from "./multilinePasteConfirmStore";

type ClipboardFileBridge = Pick<Partial<NetcattyBridge>, "readClipboardFiles">;

type TerminalClipboardPasteOptions = {
  bridge?: ClipboardFileBridge;
  isLocalConnection: boolean;
  onPasteData?: (data: string) => boolean | void;
  readClipboardText: () => Promise<string>;
  scrollOnPaste?: boolean;
  /** When true (default), multi-line pastes open an editable confirm dialog. */
  confirmMultilinePaste?: boolean;
  scrollToBottomAfterProgrammaticInput?: (data: string) => void;
  sessionId: string | null | undefined;
  terminalBackend: {
    writeToSession: (sessionId: string, data: string, options?: { automated?: boolean }) => void;
  };
  term: Pick<XTerm, "paste" | "scrollToBottom"> & Partial<Pick<XTerm, "focus">>;
};

export async function handleTerminalClipboardPaste({
  bridge,
  isLocalConnection,
  onPasteData,
  readClipboardText,
  scrollOnPaste = false,
  confirmMultilinePaste = true,
  scrollToBottomAfterProgrammaticInput,
  sessionId,
  terminalBackend,
  term,
}: TerminalClipboardPasteOptions): Promise<void> {
  const readClipboardFiles = bridge?.readClipboardFiles;
  if (isLocalConnection && readClipboardFiles) {
    try {
      const files = await readClipboardFiles();
      if (files.length > 0 && sessionId) {
        const paths = extractRootPathsFromClipboardFiles(files);
        if (paths.length > 0) {
          const pathsText = paths.join(" ");
          terminalBackend.writeToSession(sessionId, pathsText);
          scrollToBottomAfterProgrammaticInput?.(pathsText);
          term.focus?.();
          return;
        }
      }
    } catch {
      // Fall through to text paste.
    }
  }

  const text = await readClipboardText();
  if (text && sessionId) {
    let pasteText = text;
    if (shouldConfirmMultilinePaste(text, { enabled: confirmMultilinePaste })) {
      const result = await requestMultilinePasteConfirm(text);
      if (result.action === "cancel") return;
      pasteText = result.text;
      if (!pasteText) return;
    }
    pasteTextIntoTerminal(term, pasteText, {
      scrollOnPaste,
      onPasteData,
    });
  }
}
