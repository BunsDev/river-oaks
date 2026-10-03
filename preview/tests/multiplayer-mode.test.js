import test from 'node:test';
import assert from 'node:assert/strict';
import { PLAY_MODE_KEY, activePlayMode, playModeReload, probeTown, resolveMultiplayerMode, savePlayMode, selectedPlayMode, switchPlayMode, waitForTown } from '../src/multiplayer-mode.js';

test('players choose their mode unless an operator explicitly overrides it', () => {
  assert.equal(resolveMultiplayerMode({ DEV: false }), 'choice');
  assert.equal(resolveMultiplayerMode({ DEV: true }), 'choice');
  assert.equal(resolveMultiplayerMode({ DEV: false, VITE_MULTIPLAYER: 'required' }), 'required');
  assert.equal(resolveMultiplayerMode({ DEV: true, VITE_MULTIPLAYER: 'auto' }), 'auto');
  assert.equal(resolveMultiplayerMode({ DEV: true, VITE_SINGLE_PLAYER: 'true' }), 'off');
  assert.equal(resolveMultiplayerMode({ DEV: true, VITE_MULTIPLAYER: 'nonsense' }), 'choice');
});

test('play mode defaults to solo and remembers an explicit multiplayer choice', () => {
  const values = new Map();
  const storage = { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) };
  assert.equal(selectedPlayMode(storage), 'solo');
  assert.equal(savePlayMode(storage, 'multiplayer'), true);
  assert.equal(values.get(PLAY_MODE_KEY), 'multiplayer');
  assert.equal(selectedPlayMode(storage), 'multiplayer');
  assert.equal(savePlayMode(storage, 'invalid'), false);
  assert.equal(selectedPlayMode({ getItem: () => { throw new Error('denied'); } }), 'solo');
});

test('returning to single player works when the browser refuses to store the choice', () => {
  // Reading returns multiplayer and every write throws, as with a locked-down store.
  const locked = { getItem: () => 'multiplayer', setItem() { throw new Error('denied'); }, removeItem() { throw new Error('denied'); } };
  const place = { href: 'https://river.example/?ao=off', reloads: 0, reload() { this.reloads++; }, replace(url) { this.href = url; } };
  switchPlayMode(locked, 'solo', place);
  assert.equal(place.reloads, 0, 'a plain reload would reopen multiplayer');
  assert.equal(new URL(place.href).searchParams.get('play'), 'solo');
  assert.equal(new URL(place.href).searchParams.get('ao'), 'off', 'other parameters survive');
  assert.deepEqual(activePlayMode(locked, new URL(place.href).search), { mode: 'solo', remembered: false });
});

test('a choice counts as saved only when the next load will read it back', () => {
  const values = new Map([[PLAY_MODE_KEY, 'multiplayer']]);
  const full = { getItem: key => values.get(key), setItem() { throw new Error('quota'); }, removeItem: key => values.delete(key) };
  // A full store can still record single player by forgetting multiplayer.
  assert.deepEqual(playModeReload(full, 'solo', 'https://river.example/?play=multiplayer'), { saved: true, url: 'https://river.example/' });
  assert.deepEqual(activePlayMode(full, ''), { mode: 'solo', remembered: true });
  // Multiplayer cannot be recorded that way, so this visit carries it instead.
  assert.deepEqual(playModeReload(full, 'multiplayer', 'https://river.example/'), { saved: false, url: 'https://river.example/?play=multiplayer' });
  assert.equal(savePlayMode({ getItem: () => null, setItem() {} }, 'multiplayer'), false, 'a write that does not stick fails');
  assert.equal(savePlayMode(null, 'solo'), false);
  const place = { href: 'https://river.example/', reloads: 0, reload() { this.reloads++; }, replace() { throw new Error('unchanged URL reloads'); } };
  switchPlayMode({ getItem: () => 'solo', setItem() {} }, 'solo', place);
  assert.equal(place.reloads, 1, 'a saved switch with nothing to carry reloads in place');
});

test('a mode carried in the URL wins for this load, and only when valid', () => {
  const storage = { getItem: () => 'multiplayer' };
  assert.deepEqual(activePlayMode(storage, '?play=solo'), { mode: 'solo', remembered: false });
  assert.deepEqual(activePlayMode(storage, '?play=sideways'), { mode: 'multiplayer', remembered: true });
  assert.deepEqual(activePlayMode(storage), { mode: 'multiplayer', remembered: true });
  assert.deepEqual(activePlayMode({ getItem() { throw new Error('denied'); } }, ''), { mode: 'solo', remembered: true });
});

const reply = (status, body, type = 'application/json') => async () => ({ ok: status < 400, status, headers: new Map([['content-type', type]]), json: async () => body });

test('the dev probe joins only with a session and otherwise plays solo', async () => {
  assert.deepEqual(await probeTown({ fetch: reply(200, { authenticated: true, development: true }) }), { join: true, signIn: false, reason: 'development' });
  assert.deepEqual(await probeTown({ fetch: reply(200, { authenticated: true }) }), { join: true, signIn: false, reason: 'signed-in' });
  assert.deepEqual(await probeTown({ fetch: reply(200, { authenticated: false }) }), { join: false, signIn: true, reason: 'signed-out' });
  assert.equal((await probeTown({ fetch: reply(503, { error: 'auth_unavailable' }) })).join, false, 'WorkOS missing never blocks');
  assert.equal((await probeTown({ fetch: reply(200, '<html>', 'text/html') })).join, false, 'an SPA fallback page is not a town');
  assert.equal((await probeTown({ fetch: async () => { throw new TypeError('connection refused'); } })).reason, 'unavailable');
});

test('auto mode joins when the town starts after the first session probe', async () => {
  let requests = 0;
  const fetch = async () => ++requests === 1
    ? reply(503, { error: 'town_starting' })()
    : reply(200, { authenticated: true, development: true })();
  const town = await waitForTown({ fetch, interval: 0, attempts: 3 });
  assert.deepEqual(town, { join: true, signIn: false, reason: 'development' });
  assert.equal(requests, 2);
});

test('auto mode leaves signed-out players in solo play without retrying', async () => {
  let requests = 0;
  const town = await waitForTown({
    fetch: async () => { requests += 1; return reply(200, { authenticated: false })(); },
    interval: 0,
    attempts: 3,
  });
  assert.deepEqual(town, { join: false, signIn: true, reason: 'signed-out' });
  assert.equal(requests, 1);
});

test('auto mode stops probing after persistent town unavailability', async () => {
  let requests = 0;
  const town = await waitForTown({
    fetch: async () => { requests += 1; return reply(503, { error: 'town_starting' })(); },
    interval: 0,
    attempts: 3,
  });
  assert.deepEqual(town, { join: false, signIn: false, reason: 'unavailable' });
  assert.equal(requests, 3);
});
