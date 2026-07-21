const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const fast = require(path.join(root, "electron-builder.release-win-x64.cjs"));
const full = require(path.join(root, "electron-builder.release-win-x64-full.cjs"));
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));

test("fast release config targets NSIS x64 only", () => {
  assert.equal(fast.npmRebuild, false);
  assert.deepEqual(fast.win.target, [{ target: "nsis", arch: ["x64"] }]);
});

test("full release config keeps NSIS, portable, and zip", () => {
  assert.equal(full.npmRebuild, false);
  assert.deepEqual(full.win.target, [
    { target: "nsis", arch: ["x64"] },
    { target: "portable", arch: ["x64"] },
    { target: "zip", arch: ["x64"] },
  ]);
});

test("package.json exposes fast and full release scripts", () => {
  assert.match(pkg.scripts["pack:win-x64:release"], /release-win-x64\.ps1/);
  assert.match(pkg.scripts["pack:win-x64:release:full"], /-Full/);
  assert.match(pkg.scripts["release:win-x64"], /-Upload/);
  assert.match(pkg.scripts["release:win-x64:full"], /-Full -Upload/);
});
