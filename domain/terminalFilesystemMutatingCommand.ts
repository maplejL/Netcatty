/**
 * Heuristic: does a submitted shell line likely mutate files in the CWD?
 * Used to soft-refresh an open SFTP sidebar after terminal commands (#2383).
 * False negatives are acceptable; false positives only cost an extra list.
 */

const SIMPLE_MUTATING_COMMANDS = new Set([
  "touch",
  "mkdir",
  "rmdir",
  "rm",
  "mv",
  "cp",
  "ln",
  "chmod",
  "chown",
  "chgrp",
  "install",
  "truncate",
  "dd",
  "tee",
  "wget",
  "curl",
  "tar",
  "unzip",
  "gunzip",
  "gzip",
  "bzip2",
  "xz",
  "zip",
  "rsync",
  "scp",
  "sftp",
]);

const GIT_MUTATING_SUBCOMMANDS = new Set([
  "clone",
  "checkout",
  "pull",
  "fetch",
  "clean",
  "reset",
  "stash",
  "merge",
  "rebase",
  "cherry-pick",
  "apply",
  "am",
  "add",
  "rm",
  "mv",
  "commit",
]);

const LONG_RUNNING_MUTATORS = new Set(["wget", "curl", "git", "rsync", "scp", "tar"]);

const STRIP_ENV_ASSIGN = /^(?:[A-Za-z_][\w]*=(?:'(?:\\'|[^'])*'|"(?:\\.|[^"\\])*"|[^\s;|&]+)\s+)*/;
const STRIP_SUDO = /^(?:sudo|doas)(?:\s+-[\w-]+)*(?:\s+[A-Za-z_][\w]*=[^\s]+)*\s+/;

/** First pipeline/command segment before `;`, `|`, `&&`, `||`. */
function firstCommandSegment(line: string): string {
  const trimmed = line.trim();
  if (!trimmed) return "";
  const cut = trimmed.search(/\s*(?:&&|\|\||[;|])/);
  return (cut >= 0 ? trimmed.slice(0, cut) : trimmed).trim();
}

function tokenize(segment: string): string[] {
  const tokens: string[] = [];
  const re = /'(?:\\'|[^'])*'|"(?:\\.|[^"\\])*"|[^\s]+/g;
  for (let match = re.exec(segment); match; match = re.exec(segment)) {
    tokens.push(match[0]);
  }
  return tokens;
}

function unquote(token: string): string {
  if (
    (token.startsWith("'") && token.endsWith("'"))
    || (token.startsWith('"') && token.endsWith('"'))
  ) {
    return token.slice(1, -1);
  }
  return token;
}

function basenameCommand(token: string): string {
  const raw = unquote(token);
  const slash = Math.max(raw.lastIndexOf("/"), raw.lastIndexOf("\\"));
  return (slash >= 0 ? raw.slice(slash + 1) : raw).toLowerCase();
}

function hasRedirectMutation(segment: string): boolean {
  // `>` / `>>` / `&>` rewrite files; `<` alone is read-only.
  return /(?:^|[^>])>{1,2}|&>/.test(segment);
}

export type FilesystemMutatingCommandInfo = {
  mutates: boolean;
  /** Prefer a longer soft-refresh delay (downloads / clones). */
  longRunning: boolean;
};

export function classifyFilesystemMutatingCommand(commandLine: string): FilesystemMutatingCommandInfo {
  const segment = firstCommandSegment(commandLine);
  if (!segment) return { mutates: false, longRunning: false };

  if (hasRedirectMutation(segment)) {
    return { mutates: true, longRunning: false };
  }

  let rest = segment.replace(STRIP_ENV_ASSIGN, "");
  rest = rest.replace(STRIP_SUDO, "");
  const tokens = tokenize(rest).filter((token) => !token.startsWith("-") || token === "--");
  if (tokens.length === 0) return { mutates: false, longRunning: false };

  // Drop remaining env assigns that slipped through.
  let index = 0;
  while (index < tokens.length && /^[A-Za-z_][\w]*=/.test(tokens[index])) {
    index += 1;
  }
  if (index >= tokens.length) return { mutates: false, longRunning: false };

  const cmd = basenameCommand(tokens[index]);
  if (SIMPLE_MUTATING_COMMANDS.has(cmd)) {
    return { mutates: true, longRunning: LONG_RUNNING_MUTATORS.has(cmd) };
  }

  if (cmd === "git") {
    const sub = tokens.slice(index + 1).find((token) => !token.startsWith("-"));
    if (!sub) return { mutates: false, longRunning: false };
    const subCmd = unquote(sub).toLowerCase();
    if (GIT_MUTATING_SUBCOMMANDS.has(subCmd)) {
      return {
        mutates: true,
        longRunning: subCmd === "clone" || subCmd === "pull" || subCmd === "fetch",
      };
    }
  }

  return { mutates: false, longRunning: false };
}

export function isFilesystemMutatingCommand(commandLine: string): boolean {
  return classifyFilesystemMutatingCommand(commandLine).mutates;
}

export const SFTP_SOFT_REFRESH_DELAY_MS = 450;
export const SFTP_SOFT_REFRESH_LONG_DELAY_MS = 1600;

export function resolveSftpSoftRefreshDelayMs(commandLine: string): number {
  const info = classifyFilesystemMutatingCommand(commandLine);
  if (!info.mutates) return 0;
  return info.longRunning ? SFTP_SOFT_REFRESH_LONG_DELAY_MS : SFTP_SOFT_REFRESH_DELAY_MS;
}
