/**
 * Full fork release config for Windows x64 (NSIS + portable + zip).
 * Slower than electron-builder.release-win-x64.cjs; use when you need all artifacts.
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
