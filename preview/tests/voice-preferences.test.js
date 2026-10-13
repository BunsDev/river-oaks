import test from 'node:test';
import assert from 'node:assert/strict';
import { createVoicePreferences } from '../src/voice-preferences.js';

const memory = () => { const map = new Map(); return { map, getItem: key => map.get(key) ?? null, setItem: (key, value) => map.set(key, value) }; };

test('missing, invalid or hostile storage yields safe defaults: open microphone, no automatic unmute, default device', () => {
  for (const storage of [null, { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } }, { getItem: () => 'not json', setItem() {} }, { getItem: () => JSON.stringify({ deviceId: 42, pushToTalk: 'yes', autoUnmute: 1, muted: 'bob' }), setItem() {} }]) {
    const preferences = createVoicePreferences({ storage });
    assert.deepEqual(preferences.get(), { deviceId: null, pushToTalk: false, autoUnmute: false, muted: [] });
    preferences.set({ pushToTalk: true });
    assert.equal(preferences.get().pushToTalk, true, 'a blocked store still keeps the choice for this page');
  }
});

test('choices persist, mutes are per resident, and listeners hear every change', () => {
  const storage = memory();
  const preferences = createVoicePreferences({ storage });
  const seen = [];
  preferences.subscribe(next => seen.push(next.pushToTalk));
  preferences.set({ pushToTalk: true, deviceId: 'mic-1' });
  preferences.setMuted('bob', true);
  preferences.setMuted('bob', true);
  preferences.setMuted('carol', true);
  preferences.setMuted('bob', false);
  const reloaded = createVoicePreferences({ storage });
  assert.deepEqual(reloaded.get(), { deviceId: 'mic-1', pushToTalk: true, autoUnmute: false, muted: ['carol'] });
  assert.equal(reloaded.isMuted('carol'), true);
  assert.equal(reloaded.isMuted('bob'), false);
  assert.deepEqual(seen, [true, true, true, true, true]);
  preferences.set({ muted: Array.from({ length: 300 }, (_, index) => 'id' + index) });
  assert.equal(preferences.get().muted.length, 256, 'the mute list is bounded');
  assert.ok(!JSON.parse(storage.map.get('river-oaks-voice')).deviceId.includes('\u0000'));
});
