import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCommandHistoryPopupEntries,
  filterCommandHistoryPopupEntries,
  nextCommandHistorySelectionIndex,
} from "./commandHistoryPopupModel.ts";

test("buildCommandHistoryPopupEntries prefers host history and dedupes commands", () => {
  const entries = buildCommandHistoryPopupEntries({
    hostEntries: [
      { id: "h1", command: "cd /tmp", timestamp: 1 },
      { id: "h2", command: "ls", timestamp: 2 },
    ],
    globalEntries: [
      { id: "g1", command: "ls", hostId: "host-a", hostLabel: "A", timestamp: 3 },
      { id: "g2", command: "pwd", hostId: "host-a", hostLabel: "A", timestamp: 4 },
      { id: "g3", command: "whoami", hostId: "host-b", hostLabel: "B", timestamp: 5 },
    ],
    focusedHostId: "host-a",
    preferHostOnly: true,
  });

  assert.deepEqual(
    entries.map((entry) => entry.command),
    ["ls", "cd /tmp", "pwd"],
  );
});

test("filterCommandHistoryPopupEntries matches command and host label", () => {
  const entries = filterCommandHistoryPopupEntries(
    [
      { id: "1", command: "tail -f app.log" },
      { id: "2", command: "cd /home", hostLabel: "prod" },
    ],
    "prod",
  );
  assert.deepEqual(entries.map((entry) => entry.id), ["2"]);
});

test("nextCommandHistorySelectionIndex wraps around", () => {
  assert.equal(nextCommandHistorySelectionIndex(0, -1, 3), 2);
  assert.equal(nextCommandHistorySelectionIndex(2, 1, 3), 0);
  assert.equal(nextCommandHistorySelectionIndex(-1, 1, 3), 0);
});
