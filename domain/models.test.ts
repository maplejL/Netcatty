import assert from 'node:assert/strict';
import test from 'node:test';

import { keyEventToString, matchesKeyBinding } from './models.ts';
import {
  findKeyBindingConflict,
  normalizeKeyBindingString,
  resetModifierOnlyHotkeyTracking,
  trackModifierOnlyHotkeyEvent,
  type KeyBinding,
} from './models/keyBindings.ts';

const keyboardEvent = (
  key: string,
  code: string,
  modifiers: Partial<KeyboardEvent> = {},
): KeyboardEvent => ({
  key,
  code,
  type: 'keydown',
  altKey: false,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  ...modifiers,
}) as KeyboardEvent;

test('shortcut matching falls back to physical keys for non-Latin layouts', () => {
  const event = keyboardEvent('\u0446', 'KeyW', { ctrlKey: true });

  assert.equal(matchesKeyBinding(event, 'Ctrl + W', false), true);
  assert.equal(keyEventToString(event, false), 'Ctrl + W');
});

test('shortcut matching respects Latin characters from non-QWERTY layouts', () => {
  const event = keyboardEvent('w', 'Comma', { ctrlKey: true });

  assert.equal(matchesKeyBinding(event, 'Ctrl + W', false), true);
  assert.equal(matchesKeyBinding(event, 'Ctrl + ,', false), false);
  assert.equal(keyEventToString(event, false), 'Ctrl + W');
});

test('shortcut matching respects non-ASCII Latin layout characters', () => {
  const event = keyboardEvent('ß', 'Minus', { ctrlKey: true });

  assert.equal(matchesKeyBinding(event, 'Ctrl + ß', false), true);
  assert.equal(matchesKeyBinding(event, 'Ctrl + -', false), false);
  assert.equal(keyEventToString(event, false), 'Ctrl + ß');
});

test('shortcut matching respects punctuation characters from non-QWERTY layouts', () => {
  const event = keyboardEvent(',', 'KeyW', { ctrlKey: true });

  assert.equal(matchesKeyBinding(event, 'Ctrl + ,', false), true);
  assert.equal(matchesKeyBinding(event, 'Ctrl + W', false), false);
  assert.equal(keyEventToString(event, false), 'Ctrl + ,');
});

test('shortcut matching keeps physical digit ranges layout-independent', () => {
  const event = keyboardEvent('&', 'Digit1', { ctrlKey: true });

  assert.equal(matchesKeyBinding(event, 'Ctrl + [1...9]', false), true);
  assert.equal(keyEventToString(event, false), 'Ctrl + &');
});

test('shortcut matching preserves shifted number-row symbols', () => {
  const event = keyboardEvent('!', 'Digit1', { ctrlKey: true, shiftKey: true });

  assert.equal(matchesKeyBinding(event, 'Ctrl + Shift + !', false), true);
  assert.equal(matchesKeyBinding(event, 'Ctrl + Shift + 1', false), false);
  assert.equal(keyEventToString(event, false), 'Ctrl + Shift + !');
});

test('bare Alt binding matches on clean keyup only', () => {
  resetModifierOnlyHotkeyTracking();

  const altDown = keyboardEvent('Alt', 'AltLeft', { altKey: true, type: 'keydown' });
  trackModifierOnlyHotkeyEvent(altDown);
  assert.equal(matchesKeyBinding(altDown, 'Alt', false), false);

  const altUp = keyboardEvent('Alt', 'AltLeft', { type: 'keyup' });
  trackModifierOnlyHotkeyEvent(altUp);
  assert.equal(matchesKeyBinding(altUp, 'Alt', false), true);
});

test('bare Alt binding does not fire after Alt+letter chords', () => {
  resetModifierOnlyHotkeyTracking();

  trackModifierOnlyHotkeyEvent(
    keyboardEvent('Alt', 'AltLeft', { altKey: true, type: 'keydown' }),
  );
  trackModifierOnlyHotkeyEvent(
    keyboardEvent('h', 'KeyH', { altKey: true, type: 'keydown' }),
  );
  trackModifierOnlyHotkeyEvent(
    keyboardEvent('h', 'KeyH', { altKey: true, type: 'keyup' }),
  );

  const altUp = keyboardEvent('Alt', 'AltLeft', { type: 'keyup' });
  trackModifierOnlyHotkeyEvent(altUp);
  assert.equal(matchesKeyBinding(altUp, 'Alt', false), false);

  // Next clean Alt press/release should work again.
  trackModifierOnlyHotkeyEvent(
    keyboardEvent('Alt', 'AltLeft', { altKey: true, type: 'keydown' }),
  );
  const altUp2 = keyboardEvent('Alt', 'AltLeft', { type: 'keyup' });
  trackModifierOnlyHotkeyEvent(altUp2);
  assert.equal(matchesKeyBinding(altUp2, 'Alt', false), true);
});

test('normalizeKeyBindingString treats Alt aliases as equal', () => {
  assert.equal(normalizeKeyBindingString('Alt'), 'Alt');
  assert.equal(normalizeKeyBindingString('⌥'), 'Alt');
  assert.equal(normalizeKeyBindingString('alt'), 'Alt');
  assert.equal(normalizeKeyBindingString('Ctrl + Alt + H'), 'Ctrl + Alt + H');
  assert.equal(normalizeKeyBindingString('Alt + Ctrl + h'), 'Ctrl + Alt + H');
});

test('findKeyBindingConflict reports occupied shortcuts', () => {
  const bindings: KeyBinding[] = [
    {
      id: 'open-history',
      action: 'openHistory',
      label: 'Open Command History Popup',
      mac: '⌘ + Shift + H',
      pc: 'Ctrl + Shift + H',
      category: 'terminal',
    },
    {
      id: 'move-focus',
      action: 'moveFocus',
      label: 'Move focus',
      mac: '⌥',
      pc: 'Alt',
      category: 'navigation',
    },
  ];

  const conflict = findKeyBindingConflict(bindings, 'open-history', 'pc', 'Alt');
  assert.equal(conflict?.bindingId, 'move-focus');
  assert.equal(findKeyBindingConflict(bindings, 'move-focus', 'pc', 'Alt'), null);
  assert.equal(findKeyBindingConflict(bindings, 'open-history', 'pc', 'Ctrl + Shift + G'), null);
});
