import test from 'node:test';
import assert from 'node:assert/strict';

import {
  XTERM_UNLIMITED_SCROLLBACK_CAP,
  resolveXTermPerformanceConfig,
  resolveXTermScrollback,
} from './xtermPerformance';

test('resolveXTermScrollback maps the unlimited sentinel to a 50000 row cap', () => {
  assert.equal(XTERM_UNLIMITED_SCROLLBACK_CAP, 50000);
  assert.equal(resolveXTermScrollback(0), 50000);
});

test('resolveXTermScrollback preserves explicit positive scrollback values', () => {
  assert.equal(resolveXTermScrollback(10000), 10000);
  assert.equal(resolveXTermScrollback(50000), 50000);
});

test('auto renderer prefers DOM on Windows for key-repeat smoothness (#2278)', () => {
  const win = resolveXTermPerformanceConfig({ platform: 'win32', rendererType: 'auto' });
  assert.equal(win.preferDOMRenderer, true);
  assert.equal(win.useWebGLAddon, false);

  const linux = resolveXTermPerformanceConfig({
    platform: 'linux',
    rendererType: 'auto',
    deviceMemoryGb: 16,
  });
  assert.equal(linux.preferDOMRenderer, false);
  assert.equal(linux.useWebGLAddon, true);

  const forcedWebgl = resolveXTermPerformanceConfig({
    platform: 'win32',
    rendererType: 'webgl',
  });
  assert.equal(forcedWebgl.preferDOMRenderer, false);
  assert.equal(forcedWebgl.useWebGLAddon, true);
});