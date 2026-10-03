import test from 'node:test';
import assert from 'node:assert/strict';
import { PLAY_MODE_KEY, probeTown, resolveMultiplayerMode, savePlayMode, selectedPlayMode, waitForTown } from '../src/multiplayer-mode.js';

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
