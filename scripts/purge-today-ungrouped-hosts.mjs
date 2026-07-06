import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { ClassicLevel } = require("classic-level");

const STORAGE_KEY = "netcatty_hosts_v1";
const userData = path.join(
  process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"),
  "Netcatty",
);
const leveldbPath = path.join(userData, "Local Storage", "leveldb");

function localDayBounds(day = new Date()) {
  const start = new Date(day);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { startMs: start.getTime(), endMs: end.getTime() };
}

function shouldRemove(host, day) {
  if (host.group?.trim()) return false;
  if (!host.createdAt) return false;
  const { startMs, endMs } = localDayBounds(day);
  return host.createdAt >= startMs && host.createdAt < endMs;
}

function decodeStorageText(buffer) {
  let offset = 0;
  if (buffer[0] === 0x00 || buffer[0] === 0x01) {
    offset = 1;
  }
  return buffer.subarray(offset).toString("utf16le");
}

function encodeStorageText(text, originalBuffer) {
  const prefixByte = originalBuffer[0] === 0x00 || originalBuffer[0] === 0x01
    ? originalBuffer[0]
    : null;
  const encoded = Buffer.from(text, "utf16le");
  return prefixByte === null ? encoded : Buffer.concat([Buffer.from([prefixByte]), encoded]);
}

function decodeLevelDbValue(buffer) {
  return JSON.parse(decodeStorageText(buffer));
}

function encodeLevelDbValue(originalBuffer, jsonValue) {
  return encodeStorageText(JSON.stringify(jsonValue), originalBuffer);
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const dayArg = process.argv.find((arg) => arg.startsWith("--day="));
  const day = dayArg ? new Date(dayArg.slice("--day=".length)) : new Date();

  if (!fs.existsSync(leveldbPath)) {
    console.error(`LevelDB not found: ${leveldbPath}`);
    process.exit(1);
  }

  const db = new ClassicLevel(leveldbPath, { createIfMissing: false });
  let hostsKey = null;
  let hostsValue = null;

  try {
    for await (const [key, value] of db.iterator()) {
      const keyText = key.toString("utf8");
      if (keyText.includes(STORAGE_KEY)) {
        hostsKey = key;
        hostsValue = value;
      }
    }

    if (!hostsKey || !hostsValue) {
      console.error(`Storage key ${STORAGE_KEY} not found in ${leveldbPath}`);
      process.exit(1);
    }

    const hosts = decodeLevelDbValue(Buffer.from(hostsValue));
    if (!Array.isArray(hosts)) {
      console.error("Hosts payload is not an array");
      process.exit(1);
    }

    const toRemove = hosts.filter((host) => shouldRemove(host, day));
    const kept = hosts.filter((host) => !shouldRemove(host, day));

    console.log(
      JSON.stringify(
        {
          day: day.toISOString(),
          total: hosts.length,
          remove: toRemove.length,
          keep: kept.length,
          dryRun,
        },
        null,
        2,
      ),
    );

    if (dryRun) {
      return;
    }

    if (toRemove.length === 0) {
      console.log("Nothing to remove.");
      return;
    }

    const nextValue = encodeLevelDbValue(Buffer.from(hostsValue), kept);
    await db.put(hostsKey, nextValue);
    console.log(`Removed ${toRemove.length} hosts.`);
  } finally {
    await db.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
