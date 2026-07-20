/**
 * Temporary electron-builder config for fork release v0.1.1 (Windows x64 only).
 * Disables npmRebuild to avoid MSVC Spectre-mitigated libs requirement on this machine.
 */
const base = require('./electron-builder.config.cjs');

module.exports = {
  ...base,
  npmRebuild: false,
  win: {
    ...base.win,
    target: [
      { target: 'nsis', arch: ['x64'] },
      { target: 'portable', arch: ['x64'] },
      { target: 'zip', arch: ['x64'] },
    ],
  },
};
