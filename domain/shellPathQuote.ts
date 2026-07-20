/**
 * Quote a remote filesystem path for safe insertion into a shell command line.
 * Prefer single quotes (POSIX); fall back to double quotes when the path itself
 * contains a single quote.
 */
export function quoteShellPath(path: string): string {
  const value = path ?? "";
  if (value.length === 0) return "''";

  // Already fully single-quoted — leave alone.
  if (value.length >= 2 && value.startsWith("'") && value.endsWith("'") && !value.slice(1, -1).includes("'")) {
    return value;
  }

  if (!/[\s'"\\$`!*?[\]{}();|&<>]/.test(value)) {
    return value;
  }

  if (!value.includes("'")) {
    return `'${value}'`;
  }

  // Mixed quotes: end single-quote, escaped single quote, resume single-quote.
  // e.g. foo'bar -> 'foo'"'"'bar'
  return `'${value.replace(/'/g, `'\"'\"'`)}'`;
}
