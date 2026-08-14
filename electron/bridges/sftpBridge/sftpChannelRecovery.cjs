/* eslint-disable no-undef */

function isSftpTimeoutError(err) {
  return /timed out/i.test(String(err?.message || err || ""));
}

/**
 * Drop a wedged SFTP channel so the next list/stat opens a fresh one.
 * ssh2 readdir has no cancel; ending the channel is the only recovery.
 */
function invalidateSftpChannel(client, sftp) {
  if (!client) return;
  const channel = sftp || client.sftp;
  try { channel?.end?.(); } catch { /* ignore */ }
  try { channel?.destroy?.(); } catch { /* ignore */ }
  try { channel?.close?.(); } catch { /* ignore */ }
  client.sftp = null;
  client._reopeningPromise = null;
}

module.exports = {
  isSftpTimeoutError,
  invalidateSftpChannel,
};
