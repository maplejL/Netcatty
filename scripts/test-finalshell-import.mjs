import fs from "node:fs";
import { createRequire } from "node:module";
import { Client } from "ssh2";

const require = createRequire(import.meta.url);
const { decodePassword } = require("../electron/bridges/finalshellCryptoBridge.cjs");
const { importVaultHostsFromText } = await import("../domain/vaultImport.ts");

const filePath = process.argv[2];
if (!filePath) {
  console.error("Usage: node --import tsx scripts/test-finalshell-import.mjs <connect_config.json>");
  process.exit(1);
}

const text = fs.readFileSync(filePath, "utf8");
const data = JSON.parse(text);
const password = decodePassword(data.password);
if (!password) {
  console.error("FAIL decrypt");
  process.exit(1);
}

const prepared = JSON.stringify({ ...data, password_plain: password });
const result = importVaultHostsFromText("finalshell", prepared, {
  finalshellFiles: [{ text: prepared, fileName: filePath.split(/[\\/]/).pop() }],
});
const host = result.hosts[0];
if (!host) {
  console.error("FAIL import", result.issues);
  process.exit(1);
}

console.log(
  "import_ok",
  JSON.stringify({
    hostname: host.hostname,
    port: host.port,
    username: host.username,
    hasPassword: Boolean(host.password),
    issueCount: result.issues.length,
  }),
);

await new Promise((resolve, reject) => {
  const conn = new Client();
  const timer = setTimeout(() => {
    conn.end();
    reject(new Error("ssh timeout"));
  }, 20000);

  conn
    .on("ready", () => {
      clearTimeout(timer);
      conn.exec("echo NETCATTY_SSH_OK", (err, stream) => {
        if (err) {
          conn.end();
          reject(err);
          return;
        }
        let out = "";
        stream.on("data", (chunk) => {
          out += chunk.toString();
        });
        stream.on("close", () => {
          conn.end();
          if (out.trim() === "NETCATTY_SSH_OK") {
            console.log("ssh_ok");
            resolve();
            return;
          }
          reject(new Error(`unexpected ssh output: ${out.trim()}`));
        });
      });
    })
    .on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    })
    .connect({
      host: host.hostname,
      port: host.port || 22,
      username: host.username,
      password: host.password,
      readyTimeout: 15000,
    });
});
