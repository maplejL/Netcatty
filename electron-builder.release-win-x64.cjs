/**
 * Fast fork release config for Windows x64.
 * NSIS installer only (app update uses exe + blockmap + latest.yml).
 * Disables npmRebuild to avoid MSVC Spectre-mitigated libs on this machine.
 *
 * For portable + zip as well, use electron-builder.release-win-x64-full.cjs.
 */
const base = require('./electron-builder.config.cjs');

module.exports = {
  ...base,
  npmRebuild: false,
  win: {
    ...base.win,
    target: [
      { target: 'nsis', arch: ['x64'] },
    ],
  },
};
