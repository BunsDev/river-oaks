import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeThemePreference, resolveTheme } from '../src/theme.js';

test('absent or invalid stored appearance defaults to System', () => {
  for (const value of [null, undefined, '', 'automatic', '{}']) {
    assert.equal(normalizeThemePreference(value), 'system');
  }
  for (const value of ['system', 'light', 'dark']) {
    assert.equal(normalizeThemePreference(value), value);
  }
});

test('System follows the current OS appearance, including OS changes', () => {
  assert.equal(resolveTheme('system', false), 'light');
  assert.equal(resolveTheme('system', true), 'dark');
  assert.equal(resolveTheme(null, true), 'dark');
});

test('explicit Light and Dark preferences remain stable when the OS appearance changes', () => {
  for (const osDark of [false, true]) {
    assert.equal(resolveTheme('light', osDark), 'light');
    assert.equal(resolveTheme('dark', osDark), 'dark');
  }
});
