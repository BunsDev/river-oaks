import test from 'node:test';
import assert from 'node:assert/strict';
import { travelRefusal } from '../src/travel-message.js';

const text = { blocked: 'Blocked text', cooldown: 'Cooldown text', fallback: 'Fallback text' };
test('known refusal codes get their player-facing text', () => {
  assert.equal(travelRefusal({ ok: false, error: 'destination_blocked', message: 'destination_blocked' }, text), 'Blocked text');
  assert.equal(travelRefusal({ ok: false, error: 'travel_cooldown', message: 'travel_cooldown' }, text), 'Cooldown text');
  assert.equal(travelRefusal({ ok: false, message: 'destination_blocked' }, text), 'Blocked text');
});
test('a bare code is never shown to the player', () => {
  for (const code of ['not_in_store', 'unknown_destination', 'invalid_destination'])
    assert.equal(travelRefusal({ ok: false, error: code, message: code }, text), 'Fallback text');
  assert.equal(travelRefusal({ ok: false }, text), 'Fallback text');
  assert.equal(travelRefusal(null, text), 'Fallback text');
});
test('a refusal that carries written text keeps it', () => {
  assert.equal(travelRefusal({ ok: false, error: 'private_home', message: 'This home is private. Jevica can invite you inside.' }, text), 'This home is private. Jevica can invite you inside.');
  assert.equal(travelRefusal({ ok: false, message: 'Reconnect before taking an action.' }, text), 'Reconnect before taking an action.');
});
