/**
 * Decide when clipboard paste into a terminal should open a confirm/edit dialog.
 * Multi-line pastes are the main risk surface (accidental scripts / mass Enter).
 */

export function countPasteLines(text: string): number {
  if (!text) return 0;
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n").length;
}

export function shouldConfirmMultilinePaste(
  text: string,
  options?: { enabled?: boolean; minLines?: number },
): boolean {
  if (options?.enabled === false) return false;
  if (!text) return false;
  const minLines = options?.minLines ?? 2;
  return countPasteLines(text) >= minLines;
}
