import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DEFAULT_JEV_VOICE, JEV_VOICES, isVoiceId, resolveJevVoice } from '../src/jev-voices.js';

test('the voice list is well formed and offers the requested voice', () => {
  assert.ok(JEV_VOICES.length >= 2, 'more than one voice to choose from');
  assert.equal(new Set(JEV_VOICES.map(voice => voice.id)).size, JEV_VOICES.length, 'IDs are unique');
  for (const voice of JEV_VOICES) { assert.ok(isVoiceId(voice.id), voice.id); assert.ok(voice.name.trim()); }
  assert.ok(JEV_VOICES.some(voice => voice.id === 'OQkHNgFcqzRY82loyxsc'), 'OQkHNgFcqzRY82loyxsc is an option');
});

test('the default voice matches the bridge default', () => {
  const python = readFileSync(new URL('../../src/river_oaks/elevenlabs_voice.py', import.meta.url), 'utf8');
  assert.match(python, new RegExp(`JEV_VOICE_ID = "${DEFAULT_JEV_VOICE}"`));
});

test('bridge-reported IDs resolve to a named voice, a custom entry, or nothing', () => {
  assert.equal(resolveJevVoice(DEFAULT_JEV_VOICE).name, 'Adam');
  assert.equal(resolveJevVoice('OQkHNgFcqzRY82loyxsc').custom, undefined);
  const custom = resolveJevVoice('abc123XYZ');
  assert.equal(custom.custom, true); assert.equal(custom.id, 'abc123XYZ');
  for (const bad of ['', 'has space', 'a'.repeat(65), null, 42, 'semi;colon']) assert.equal(resolveJevVoice(bad), null, String(bad));
});
