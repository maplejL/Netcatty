const test = require("node:test");
const assert = require("node:assert/strict");

const {
  isSftpTimeoutError,
  invalidateSftpChannel,
} = require("./sftpChannelRecovery.cjs");

test("isSftpTimeoutError matches bounded list timeouts", () => {
  assert.equal(isSftpTimeoutError(new Error("SFTP readdir timed out after 15000ms")), true);
  assert.equal(isSftpTimeoutError(new Error("Permission denied")), false);
  assert.equal(isSftpTimeoutError(null), false);
});

test("invalidateSftpChannel ends the hung handle and clears the cached channel", () => {
  const ended = [];
  const sftp = {
    end: () => ended.push("end"),
    destroy: () => ended.push("destroy"),
  };
  const client = { sftp, _reopeningPromise: Promise.resolve(sftp) };

  invalidateSftpChannel(client, sftp);

  assert.equal(client.sftp, null);
  assert.equal(client._reopeningPromise, null);
  assert.deepEqual(ended, ["end", "destroy"]);
});
