/**
 * Detect interactive stdin prompts in PTY command output so AI exec can
 * fail early instead of waiting for the full timeout / end marker.
 */
"use strict";

const { stripAnsi, isDefaultPowerShellPromptLine } = require("./shellUtils.cjs");

const INTERACTIVE_PROMPT_ERROR =
  "Interactive prompt detected — prefer non-interactive flags; session may still need manual Ctrl+C";

const FORCED_CANCEL_ERROR =
  "Cancelled (forced — process may still be running)";

const LAST_LINE_PATTERNS = [
  /Enter the value for\b/i,
  /\bpassword\s*:\s*$/i,
  /\bpasswd\s*:\s*$/i,
  /\bpassphrase\s*:\s*$/i,
  /\[Y\/n\]\s*$/i,
  /\[y\/N\]\s*$/i,
  /\[yes\/no\]\s*$/i,
  /\(y\/n\)\s*\??\s*$/i,
  /\(yes\/no\)\s*\??\s*$/i,
  /Continue\?\s*$/i,
  /Are you sure\b/i,
  /Do you want to continue\b/i,
  /Press (?:any key|ENTER|enter|return) to continue/i,
  /\boption>\s*$/i,
];

function getLastNonEmptyLine(text) {
  const normalized = stripAnsi(text).replace(/\r/g, "\n");
  const lines = normalized.split("\n");
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const line = lines[i].replace(/\s+$/, "");
    if (line.trim()) return line;
  }
  return "";
}

function looksLikeShellIdlePrompt(line) {
  const trimmed = String(line || "").trim();
  if (!trimmed) return false;
  if (isDefaultPowerShellPromptLine(trimmed)) return true;
  if (/^[^\s@]+@[^\s:]+(?::[^\n\r]*)?[#$]$/.test(trimmed)) return true;
  if (/^[A-Za-z]:\\[^>]*>$/.test(trimmed)) return true;
  if (/^[#$%>]\s*$/.test(trimmed)) return true;
  return false;
}

/**
 * @param {string} output - Accumulated PTY stdout after the start marker
 * @returns {boolean}
 */
function looksLikeInteractivePrompt(output) {
  const lastLine = getLastNonEmptyLine(output);
  if (!lastLine) return false;
  if (looksLikeShellIdlePrompt(lastLine)) return false;

  for (const pattern of LAST_LINE_PATTERNS) {
    if (pattern.test(lastLine)) return true;
  }

  // iastool-style: "Enter the value for the driverclassname option>"
  if (/Enter the value for.*>\s*$/i.test(lastLine)) return true;

  // Short label ending with ":" that looks like a field prompt (Username:, Path:)
  const label = lastLine.trim();
  if (
    label.length <= 60 &&
    /^(?:Enter |Please |Type |Input |Confirm |Username|Password|Host|Port|Name|Value|Path|File|User)[A-Za-z0-9 _/-]{0,40}:\s*$/i.test(label)
  ) {
    return true;
  }

  // Waiting line ending with ">" that is not a shell prompt (e.g. "option>")
  if (/>\s*$/.test(lastLine) && /\b(value|option|enter|input|prompt)\b/i.test(lastLine)) {
    return true;
  }

  return false;
}

function isQuarantineWorthyError(error) {
  if (typeof error !== "string" || !error) return false;
  return (
    error.includes(FORCED_CANCEL_ERROR) ||
    error.includes("Cancelled (forced") ||
    error.includes("Interactive prompt detected")
  );
}

module.exports = {
  looksLikeInteractivePrompt,
  getLastNonEmptyLine,
  looksLikeShellIdlePrompt,
  isQuarantineWorthyError,
  INTERACTIVE_PROMPT_ERROR,
  FORCED_CANCEL_ERROR,
};
