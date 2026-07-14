/**
 * Parse OSC 7 payload into a filesystem path.
 * Shells emit `file://hostname/path` (or bare `/path`). Hostnames with
 * characters that break WHATWG URL parsing (colons, spaces, etc.) must still
 * yield a usable path for SFTP follow / go-to-cwd.
 */
export const parseOsc7CwdPayload = (data: string): string | null => {
  const raw = (data || "").trim();
  if (!raw) return null;

  if (raw.startsWith("file://")) {
    try {
      const url = new URL(raw);
      const path = decodeURIComponent(url.pathname || "");
      if (path) return path;
    } catch {
      // Fall through to manual extraction for non-URL-safe hostnames.
    }
    // file://[authority]/path — authority may be empty (file:///path)
    const afterScheme = raw.slice("file://".length);
    const slash = afterScheme.indexOf("/");
    if (slash < 0) return null;
    const pathPart = afterScheme.slice(slash);
    try {
      const path = decodeURIComponent(pathPart);
      return path || null;
    } catch {
      return pathPart || null;
    }
  }

  if (raw.startsWith("/") || /^[A-Za-z]:[\\/]/.test(raw)) {
    return raw;
  }
  return null;
};
