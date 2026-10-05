import test from 'node:test';
import assert from 'node:assert/strict';
import { isGameplayKey, railShortcut } from '../src/keyboard-input.js';

const key = (code, options = {}) => ({ code, key: '', target: { closest: () => null }, ...options });

test('modifier rail shortcuts stay distinct from flight and work with both primary modifiers', () => {
  for (const modifier of ['metaKey', 'ctrlKey']) {
    const event = key('KeyB', { [modifier]: true });
    assert.equal(railShortcut(event), 'rail');
    assert.equal(railShortcut({ ...event, shiftKey: true }), 'play');
    assert.equal(isGameplayKey(event), false);
    assert.equal(railShortcut(key('KeyK', { [modifier]: true })), 'commands');
  }
  assert.equal(railShortcut(key('KeyB')), null);
  assert.equal(isGameplayKey(key('KeyB')), true);
});

test('navigation honors Option physical keys and rejects composition and AltGraph', () => {
  assert.equal(railShortcut(key('Digit2', { altKey: true, key: '™' })), 'tab-1');
  assert.equal(railShortcut(key('Slash', { key: '?' })), 'commands');
  assert.equal(railShortcut(key('Slash', { key: '/' })), 'search');
  for (const options of [{ isComposing: true }, { getModifierState: name => name === 'AltGraph' }]) {
    assert.equal(railShortcut(key('KeyB', { ctrlKey: true, ...options })), null);
    assert.equal(isGameplayKey(key('KeyB', options)), false);
  }
  assert.equal(railShortcut(key('Digit2', { altKey: true, ctrlKey: true })), null);
  assert.equal(railShortcut(key('Digit2', { altKey: true, shiftKey: true })), null);
});

test('gameplay keys never consume system chords or text entry but retain sprint', () => {
  for (const options of [{ metaKey: true }, { ctrlKey: true }, { altKey: true }, { target: { closest: () => ({}) } }]) {
    for (const code of ['KeyB', 'KeyV', 'KeyT', 'KeyQ', 'KeyW']) assert.equal(isGameplayKey(key(code, options)), false);
  }
  assert.equal(isGameplayKey(key('KeyW', { shiftKey: true })), true);
});
