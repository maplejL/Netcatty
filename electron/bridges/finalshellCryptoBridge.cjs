"use strict";

const crypto = require("node:crypto");

class JavaRandom {
  constructor(seed) {
    let s = BigInt(seed);
    if (s < 0n) {
      s = (1n << 64n) + (s & ((1n << 64n) - 1n));
    }
    s = BigInt.asIntN(64, s);
    this.seed = (s ^ 0x5deece66dn) & ((1n << 48n) - 1n);
  }

  next(bits) {
    this.seed = (this.seed * 0x5deece66dn + 0xbn) & ((1n << 48n) - 1n);
    const unsigned = Number(this.seed >> BigInt(48 - bits));
    if (bits === 32) {
      return unsigned >= 0x80000000 ? unsigned - 0x100000000 : unsigned;
    }
    return unsigned;
  }

  nextInt(bound) {
    if ((bound & -bound) === bound) {
      return (bound * this.next(31)) >> 31;
    }
    let bits;
    let val;
    do {
      bits = this.next(31);
      val = bits % bound;
    } while (bits - val + (bound - 1) < 0);
    return val;
  }

  nextLong() {
    const hi = BigInt(this.next(32));
    const lo = BigInt(this.next(32));
    return (hi << 32n) + lo;
  }
}

function toSignedByte(byte) {
  return byte > 127 ? byte - 256 : byte;
}

function javaLongToBytes(value) {
  const bytes = Buffer.alloc(8);
  let unsigned = BigInt.asIntN(64, BigInt(value));
  if (unsigned < 0n) {
    unsigned += 1n << 64n;
  }
  for (let i = 7; i >= 0; i -= 1) {
    bytes[i] = Number(unsigned & 0xffn);
    unsigned >>= 8n;
  }
  return bytes;
}

function ranDomKey(head) {
  const r1 = new JavaRandom(toSignedByte(head[5]));
  const n127 = r1.nextInt(127);
  if (n127 === 0) {
    throw new Error("FinalShell key derivation failed (random zero).");
  }
  const ks = 3680984568597093857n / BigInt(n127);
  const rng = new JavaRandom(ks);
  const t = toSignedByte(head[0]);
  for (let i = 0; i < (t > 0 ? t : 0); i += 1) {
    rng.nextLong();
  }
  const n = rng.nextLong();
  const r2 = new JavaRandom(n);
  const parts = [
    javaLongToBytes(BigInt(toSignedByte(head[4]))),
    javaLongToBytes(r2.nextLong()),
    javaLongToBytes(BigInt(toSignedByte(head[7]))),
    javaLongToBytes(BigInt(toSignedByte(head[3]))),
    javaLongToBytes(r2.nextLong()),
    javaLongToBytes(BigInt(toSignedByte(head[1]))),
    javaLongToBytes(rng.nextLong()),
    javaLongToBytes(BigInt(toSignedByte(head[2]))),
  ];
  return crypto.createHash("md5").update(Buffer.concat(parts)).digest();
}

function decodePassword(encryptedBase64) {
  if (!encryptedBase64 || typeof encryptedBase64 !== "string") {
    return null;
  }
  const buf = Buffer.from(encryptedBase64.trim(), "base64");
  if (buf.length <= 8) {
    return null;
  }
  const head = buf.subarray(0, 8);
  const encrypted = buf.subarray(8);
  const key = ranDomKey(head).subarray(0, 8);
  const decipher = crypto.createDecipheriv("des-ecb", key, null);
  decipher.setAutoPadding(true);
  const plain = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return plain.toString("utf8");
}

function decodePrivateKey(keyDataBase64) {
  if (!keyDataBase64 || typeof keyDataBase64 !== "string") {
    return null;
  }
  return Buffer.from(keyDataBase64.trim(), "base64").toString("utf8");
}

function loadSecretKeyMap(configText) {
  if (!configText || typeof configText !== "string") {
    return {};
  }
  try {
    const data = JSON.parse(configText);
    const list = data?.secret_key_list;
    if (!Array.isArray(list)) {
      return {};
    }
    const map = {};
    for (const item of list) {
      if (!item || typeof item !== "object") continue;
      const id = typeof item.id === "string" ? item.id.trim() : "";
      const keyData = typeof item.key_data === "string" ? item.key_data.trim() : "";
      if (id && keyData) {
        map[id] = keyData;
      }
    }
    return map;
  } catch {
    return {};
  }
}

function registerHandlers(ipcMain) {
  ipcMain.handle("netcatty:finalshell:decodePassword", (_event, encrypted) => {
    try {
      return { ok: true, password: decodePassword(encrypted) };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });

  ipcMain.handle("netcatty:finalshell:decodePrivateKey", (_event, keyData) => {
    try {
      return { ok: true, privateKey: decodePrivateKey(keyData) };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });
}

module.exports = {
  decodePassword,
  decodePrivateKey,
  loadSecretKeyMap,
  registerHandlers,
};
