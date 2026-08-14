const { isDecimalPid } = require("./sessionPwdParse.cjs");

function isAbsolutePosixPath(value) {
  return typeof value === "string" && value.startsWith("/");
}

function findSudoSftpClientForSession(sftpClients, sessionId) {
  if (!sftpClients || typeof sftpClients.values !== "function") return null;
  let fallback = null;
  let sudoCount = 0;
  for (const client of sftpClients.values()) {
    if (!client?.__netcattySudoMode) continue;
    sudoCount += 1;
    if (sessionId && client.__netcattySourceSessionId === sessionId) return client;
    fallback = client;
  }
  return sudoCount === 1 ? fallback : null;
}

function callSftpPathMethod(sftp, method, remotePath, timeoutMs) {
  return new Promise((resolve) => {
    if (!sftp || typeof sftp[method] !== "function") {
      resolve(null);
      return;
    }
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve(null);
    }, timeoutMs);
    try {
      sftp[method](remotePath, (err, value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(!err && isAbsolutePosixPath(value) ? value : null);
      });
    } catch {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(null);
    }
  });
}

async function readlinkCwdViaSudoSftp(sftpClients, sessionId, pid, options = {}) {
  if (!isDecimalPid(pid)) return null;
  const client = findSudoSftpClientForSession(sftpClients, sessionId);
  if (!client) return null;

  const remotePath = `/proc/${pid}/cwd`;
  const timeoutMs = Number.isFinite(options.timeoutMs) && options.timeoutMs > 0
    ? options.timeoutMs
    : 3000;
  const sftp = client.sftp;

  const fromReadlink = await callSftpPathMethod(sftp, "readlink", remotePath, timeoutMs);
  if (fromReadlink) return fromReadlink;

  const fromRealpath = await callSftpPathMethod(sftp, "realpath", remotePath, timeoutMs);
  if (fromRealpath) return fromRealpath;

  if (typeof client.realPath === "function") {
    try {
      const value = await Promise.race([
        client.realPath(remotePath),
        new Promise((_, reject) => {
          setTimeout(() => reject(new Error("timeout")), timeoutMs);
        }),
      ]);
      return isAbsolutePosixPath(value) ? value : null;
    } catch {
      return null;
    }
  }

  return null;
}

module.exports = {
  findSudoSftpClientForSession,
  readlinkCwdViaSudoSftp,
};
