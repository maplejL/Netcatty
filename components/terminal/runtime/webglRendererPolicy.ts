/**
 * Decide whether a terminal should postpone creating its WebGL renderer until
 * the pane is actually visible.
 *
 * Every terminal that loads the WebGL addon holds a live WebGL context for its
 * whole lifetime. Batch-connecting several hosts mounts all their panes at once,
 * so without deferral the renderer creates N WebGL contexts back-to-back on the
 * main thread (and N contexts contend for the GPU, which is also the root of the
 * "garbled / 花屏" corruption in #1049/#1063). A pane that mounts hidden does not
 * need a renderer yet — it buffers output via xterm's default DOM renderer and
 * upgrades to WebGL the moment it becomes visible.
 *
 * In a workspace split, every pane is layout-visible at once but only the focused
 * pane should hold WebGL; background panes stay on the DOM renderer until focused.
 */
export function shouldCreateWebglOnMount(opts: {
  isVisible: boolean;
  inWorkspace: boolean;
  isFocusMode: boolean;
  isFocused: boolean;
}): boolean {
  if (!opts.isVisible) return false;
  if (opts.inWorkspace && !opts.isFocusMode && !opts.isFocused) return false;
  return true;
}

export function shouldDeferWebglUntilVisible(opts: {
  useWebGLAddon: boolean;
  initiallyVisible: boolean;
}): boolean {
  return opts.useWebGLAddon && !opts.initiallyVisible;
}

/** Drop WebGL when a workspace split pane loses focus so at most one context stays live. */
export function shouldSuspendWebglOnWorkspaceBlur(opts: {
  inWorkspace: boolean;
  isFocusMode: boolean;
  isFocused: boolean;
}): boolean {
  return opts.inWorkspace && !opts.isFocusMode && !opts.isFocused;
}
