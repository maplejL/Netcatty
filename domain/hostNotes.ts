export const DEFAULT_HOST_NOTES_EXCERPT_MAX_LENGTH = 48;

export type SummarizeHostNotesOptions = {
  maxLength?: number;
};

/**
 * Best-effort plain-text excerpt from Host.notes Markdown for list/card scan.
 * Does not mutate the stored notes field.
 */
export function summarizeHostNotes(
  notes: string | undefined | null,
  options: SummarizeHostNotesOptions = {},
): string | null {
  if (notes == null) return null;
  const maxLength = options.maxLength ?? DEFAULT_HOST_NOTES_EXCERPT_MAX_LENGTH;
  if (!Number.isFinite(maxLength) || maxLength <= 0) return null;

  let text = notes.replace(/\r\n?/g, "\n");

  // Links: keep visible label
  text = text.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1");
  // Images: drop or keep alt
  text = text.replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1");
  // Fenced / inline code markers
  text = text.replace(/```[\s\S]*?```/g, " ");
  text = text.replace(/`([^`]+)`/g, "$1");
  // Headings / list / blockquote markers at line start
  text = text.replace(/^\s{0,3}#{1,6}\s+/gm, "");
  text = text.replace(/^\s{0,3}[-*+]\s+/gm, "");
  text = text.replace(/^\s{0,3}\d+\.\s+/gm, "");
  text = text.replace(/^\s{0,3}>\s?/gm, "");
  // Emphasis / strikethrough wrappers
  text = text.replace(/(\*\*|__)(.*?)\1/g, "$2");
  text = text.replace(/(\*|_)(.*?)\1/g, "$2");
  text = text.replace(/~~(.*?)~~/g, "$1");
  // Remaining bare markers often left after incomplete pairs
  text = text.replace(/[*_~`#]/g, " ");

  text = text.replace(/\s+/g, " ").trim();
  if (!text) return null;

  if (text.length <= maxLength) return text;
  if (maxLength === 1) return "…";
  return `${text.slice(0, maxLength - 1)}…`;
}
