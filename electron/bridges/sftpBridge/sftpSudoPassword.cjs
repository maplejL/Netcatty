"use strict";

function readSessionSudoPassword(session) {
  if (!session || typeof session !== "object") return "";
  if (typeof session.systemManagerSudoPassword === "string" && session.systemManagerSudoPassword) {
    return session.systemManagerSudoPassword;
  }
  if (typeof session.sudoProbePassword === "string" && session.sudoProbePassword) {
    return session.sudoProbePassword;
  }
  return "";
}

function getSessionById(sessions, sessionId) {
  if (!sessions || !sessionId) return null;
  if (typeof sessions.get === "function") {
    return sessions.get(sessionId) || null;
  }
  return sessions[sessionId] || null;
}

/**
 * Password for `sudo -S sftp-server`. Prefer the explicit SFTP option, then
 * the linked terminal session's saved sudo / login password so key-only hosts
 * can still escalate after `sudo -i`.
 */
function resolveSftpSudoPassword(options, sessions) {
  if (typeof options?.password === "string" && options.password.length > 0) {
    return options.password;
  }
  return readSessionSudoPassword(getSessionById(sessions, options?.sourceSessionId));
}

module.exports = {
  readSessionSudoPassword,
  resolveSftpSudoPassword,
};
