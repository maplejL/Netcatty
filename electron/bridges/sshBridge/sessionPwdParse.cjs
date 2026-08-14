/* eslint-disable no-undef */

function isDecimalPid(value) {
  return /^\d+$/.test(String(value || ""));
}

/**
 * Parse getSessionPwd stdout.
 * Success is an absolute path. When the active shell is another uid,
 * the remote script prints `NEED_SUDO_CWD <pid>` so the caller can
 * `sudo readlink /proc/<pid>/cwd`.
 */
function parseSessionPwdStdout(out) {
  const text = String(out || "").trim();
  if (!text) return { cwd: null, needSudoPid: null };

  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  let cwd = null;
  let needSudoPid = null;
  for (const line of lines) {
    if (line.startsWith("/")) {
      cwd = line;
      continue;
    }
    const match = /^NEED_SUDO_CWD (\d+)$/.exec(line);
    if (match) needSudoPid = match[1];
  }
  if (cwd) return { cwd, needSudoPid: null };
  if (needSudoPid && isDecimalPid(needSudoPid)) {
    return { cwd: null, needSudoPid };
  }
  return { cwd: null, needSudoPid: null };
}

module.exports = {
  isDecimalPid,
  parseSessionPwdStdout,
};
