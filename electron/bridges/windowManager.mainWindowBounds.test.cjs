/* eslint-disable no-undef */
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  centerBoundsInWorkArea,
  resolveDefaultNormalWindowBounds,
  resolveMainWindowOpenState,
  WINDOW_NORMAL_SIZE_RATIO,
  MIN_WINDOW_WIDTH,
  MIN_WINDOW_HEIGHT,
} = require("./windowManager.cjs");

function makeScreen(workArea, displays) {
  const area = workArea || { x: 0, y: 0, width: 1920, height: 1080 };
  const all = displays || [{ bounds: { x: area.x, y: area.y, width: area.width, height: area.height }, workArea: area }];
  return {
    getPrimaryDisplay() {
      return { workArea: area, bounds: all[0].bounds };
    },
    getAllDisplays() {
      return all;
    },
    getDisplayMatching() {
      return { workArea: area, bounds: all[0].bounds };
    },
  };
}

describe("centerBoundsInWorkArea", () => {
  it("centers both horizontally and vertically", () => {
    const workArea = { x: 100, y: 50, width: 1600, height: 1000 };
    const bounds = centerBoundsInWorkArea(workArea, 800, 600);
    assert.equal(bounds.width, 800);
    assert.equal(bounds.height, 600);
    assert.equal(bounds.x, Math.round(100 + (1600 - 800) / 2));
    assert.equal(bounds.y, Math.round(50 + (1000 - 600) / 2));
  });
});

describe("resolveDefaultNormalWindowBounds", () => {
  it("uses 75% of the work area and centers the window on both axes", () => {
    const workArea = { x: 100, y: 50, width: 1600, height: 1000 };
    const bounds = resolveDefaultNormalWindowBounds(workArea);
    assert.equal(bounds.width, Math.round(1600 * WINDOW_NORMAL_SIZE_RATIO));
    assert.equal(bounds.height, Math.round(1000 * WINDOW_NORMAL_SIZE_RATIO));
    assert.equal(bounds.x, Math.round(100 + (1600 - bounds.width) / 2));
    assert.equal(bounds.y, Math.round(50 + (1000 - bounds.height) / 2));
  });

  it("never exceeds the work area on small displays", () => {
    const workArea = { x: 0, y: 0, width: 800, height: 500 };
    const bounds = resolveDefaultNormalWindowBounds(workArea);
    // min width (1100) > work area → clamp to full work-area width, not 75%
    assert.equal(bounds.width, 800);
    assert.equal(bounds.height, 500);
    assert.ok(bounds.width <= 800);
    assert.ok(bounds.height <= 500);
  });
});

describe("resolveMainWindowOpenState", () => {
  it("defaults to maximized with 75% restore size when no saved state", () => {
    const screen = makeScreen({ x: 0, y: 0, width: 1920, height: 1080 });
    const open = resolveMainWindowOpenState(screen, null);
    assert.equal(open.isMaximized, true);
    assert.equal(open.bounds.width, Math.round(1920 * 0.75));
    assert.equal(open.bounds.height, Math.round(1080 * 0.75));
    assert.equal(open.bounds.x, Math.round((1920 - open.bounds.width) / 2));
    assert.equal(open.bounds.y, Math.round((1080 - open.bounds.height) / 2));
    assert.ok(open.bounds.width <= 1920);
    assert.ok(open.bounds.height <= 1080);
  });

  it("keeps explicit windowed state but clamps oversized saved bounds and re-centers", () => {
    const screen = makeScreen({ x: 0, y: 0, width: 1366, height: 768 });
    const open = resolveMainWindowOpenState(screen, {
      x: 10,
      y: 10,
      width: 2400,
      height: 1600,
      isMaximized: false,
      isFullScreen: false,
    });
    assert.equal(open.isMaximized, false);
    // oversized → centered 75%/min defaults
    assert.equal(open.bounds.width, MIN_WINDOW_WIDTH);
    assert.equal(open.bounds.height, Math.max(MIN_WINDOW_HEIGHT, Math.round(768 * 0.75)));
    assert.equal(open.bounds.x, Math.round((1366 - open.bounds.width) / 2));
    assert.equal(open.bounds.y, Math.round((768 - open.bounds.height) / 2));
    assert.ok(open.bounds.width <= 1366);
    assert.ok(open.bounds.height <= 768);
  });

  it("restores maximized sessions with a centered 75% normal size for unmaximize", () => {
    const screen = makeScreen({ x: 0, y: 0, width: 1440, height: 900 });
    const open = resolveMainWindowOpenState(screen, {
      x: 20,
      y: 30,
      width: 1200,
      height: 800,
      isMaximized: true,
      isFullScreen: false,
    });
    assert.equal(open.isMaximized, true);
    // Ignore stale corner restore coords — use dual-axis centered 75%/min.
    // 75% of 1440 is 1080 < MIN_WINDOW_WIDTH → lift width to min when screen allows.
    assert.equal(open.bounds.width, MIN_WINDOW_WIDTH);
    assert.equal(open.bounds.height, Math.round(900 * 0.75));
    assert.equal(open.bounds.x, Math.round((1440 - open.bounds.width) / 2));
    assert.equal(open.bounds.y, Math.round((900 - open.bounds.height) / 2));
  });

  it("re-centers when saved windowed size is lifted to the minimum", () => {
    const screen = makeScreen({ x: 0, y: 0, width: 1920, height: 1080 });
    const open = resolveMainWindowOpenState(screen, {
      x: 40,
      y: 60,
      width: 500,
      height: 400,
      isMaximized: false,
    });
    assert.equal(open.isMaximized, false);
    assert.equal(open.bounds.width, MIN_WINDOW_WIDTH);
    assert.equal(open.bounds.height, MIN_WINDOW_HEIGHT);
    assert.equal(open.bounds.x, Math.round((1920 - MIN_WINDOW_WIDTH) / 2));
    assert.equal(open.bounds.y, Math.round((1080 - MIN_WINDOW_HEIGHT) / 2));
  });

  it("keeps a still-visible windowed position when size is unchanged", () => {
    const screen = makeScreen({ x: 0, y: 0, width: 1920, height: 1080 });
    const open = resolveMainWindowOpenState(screen, {
      x: 120,
      y: 80,
      width: 1200,
      height: 800,
      isMaximized: false,
    });
    assert.equal(open.isMaximized, false);
    assert.equal(open.bounds.width, 1200);
    assert.equal(open.bounds.height, 800);
    assert.equal(open.bounds.x, 120);
    assert.equal(open.bounds.y, 80);
  });
});
