import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('./useTerminalEffects.ts', import.meta.url), 'utf8');

test('clears committed layout state when a terminal pane hides', () => {
  assert.match(source, /if \(isVisible\) return;[\s\S]*lastCommittedVisibleLayoutKeyRef\.current = null/);
  assert.match(source, /lastWebglRecoveryLayoutKeyRef\.current = null/);
});

test('forces full recovery when a terminal pane becomes visible again', () => {
  assert.match(source, /const becameVisible = isVisible && !wasVisibleRef\.current/);
  assert.match(source, /recoverTerminalAfterBecomeVisible\(\)/);
  assert.match(source, /nudgeAlternateScreenRedraw\(term\)/);
  assert.match(source, /syncPtySizeAfterLayout/);
});

test('layout recovery refit also syncs PTY size for full-screen TUIs', () => {
  assert.match(source, /runImmediateRefit\(\{ force: true, repeatOnNextFrame: false \}\);\s*finishLayoutRecoveryAfterFit\(\)/);
  assert.match(source, /finishLayoutRecoveryAfterFit/);
});

test('tab-switch suppression does not consume the visible recovery pass', () => {
  assert.match(source, /const becameVisible = isVisible && !wasVisibleRef\.current/);
  assert.match(
    source,
    /if \(!isVisible\) \{\s*wasVisibleRef\.current = false;\s*return;\s*\}[\s\S]*if \(splitResizeActive\) return;[\s\S]*wasVisibleRef\.current = true;[\s\S]*recoverTerminalAfterBecomeVisible\(\)/,
  );
  assert.doesNotMatch(source, /wasVisibleRef\.current = isVisible;\s*if \(!isVisible \|\| isResizing\) return/);
});

test('immediate visibility recovery does not wait for the next animation frame', () => {
  assert.match(source, /safeFit\(\{ force, requireVisible: true, immediate: true \}\)/);
  assert.match(source, /safeFit\(\{ force: true, requireVisible: true, immediate: true \}\)/);
});

test('visible tab recovery reuses a cached fit when the container size is unchanged', () => {
  assert.match(source, /const currentContainerSizeAlreadyFit = \(\) => \{/);
  assert.match(
    source,
    /if \(currentContainerSizeAlreadyFit\(\)\) \{\s*finishLayoutRecovery\(\);\s*flushPendingOutputScroll\(\);\s*commitVisibleLayout\(\);\s*return;\s*\}/,
  );
});

test('short unchanged tab reveals skip the recovery work entirely', () => {
  const recoverIndex = source.indexOf('const recoverTerminalAfterBecomeVisible = () => {');
  const fastPathIndex = source.indexOf('getHiddenDurationMs() < CSS_ONLY_TAB_REVEAL_MAX_HIDDEN_MS', recoverIndex);
  const webglRecoveryIndex = source.indexOf('xtermRuntimeRef.current?.ensureWebglRenderer();', recoverIndex);

  assert.ok(recoverIndex >= 0);
  assert.ok(fastPathIndex > recoverIndex);
  assert.ok(webglRecoveryIndex > fastPathIndex);
  assert.match(
    source.slice(fastPathIndex, webglRecoveryIndex),
    /currentContainerSizeAlreadyFit\(\)[\s\S]*lastWebglRecoveryLayoutKeyRef\.current = paneLayoutKey;[\s\S]*commitVisibleLayout\(\);[\s\S]*return;/,
  );
});

test('short unchanged tab reveals still flush pending hidden-output scroll', () => {
  const recoverIndex = source.indexOf('const recoverTerminalAfterBecomeVisible = () => {');
  const fastPathIndex = source.indexOf('getHiddenDurationMs() < CSS_ONLY_TAB_REVEAL_MAX_HIDDEN_MS', recoverIndex);
  const webglRecoveryIndex = source.indexOf('xtermRuntimeRef.current?.ensureWebglRenderer();', recoverIndex);
  const splitFocusSkipIndex = source.indexOf('Multi-split workspace panes stay visible', webglRecoveryIndex);

  assert.match(
    source,
    /const flushPendingOutputScroll = \(\) => \{[\s\S]*pendingOutputScrollRef\.current[\s\S]*scrollToBottom\(\)[\s\S]*pendingOutputScrollRef\.current = false;/,
  );
  assert.match(
    source.slice(fastPathIndex, webglRecoveryIndex),
    /flushPendingOutputScroll\(\);[\s\S]*commitVisibleLayout\(\);[\s\S]*return;/,
  );
  assert.match(
    source.slice(splitFocusSkipIndex, splitFocusSkipIndex + 600),
    /flushPendingOutputScroll\(\);\s*return;/,
  );
});

test('immediate tab recovery marks webgl recovery to skip the delayed duplicate pass', () => {
  assert.match(
    source,
    /const recoverTerminalAfterBecomeVisible = \(\) => \{[\s\S]*xtermRuntimeRef\.current\?\.clearTextureAtlas\(\);\s*lastWebglRecoveryLayoutKeyRef\.current = paneLayoutKey;/,
  );
  assert.match(
    source,
    /lastWebglRecoveryLayoutKeyRef\.current === paneLayoutKey\s*&& hiddenMs < CSS_ONLY_TAB_REVEAL_MAX_HIDDEN_MS/,
  );
  assert.match(
    source,
    /useLayoutEffect\(\(\) => \{[\s\S]*shouldRecoverWebglOnShow\(\)[\s\S]*clearTextureAtlas\(\);[\s\S]*runImmediateRefit\(\{ force: true, repeatOnNextFrame: false \}\)/,
  );
});

test('split workspace panes defer PTY resize until SSH handshake finishes', () => {
  assert.match(source, /shouldDeferWorkspaceHandshakeRefit/);
  assert.match(
    source,
    /if \(statusRef\.current === 'connecting'\) return;/,
  );
  assert.match(
    source,
    /status !== 'connected' \|\| !isVisible \|\| !inWorkspace \|\| isFocusMode \|\| isFocused/,
  );
});
