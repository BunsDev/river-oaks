import test from 'node:test';
import assert from 'node:assert/strict';
import { probeTown, resolveMultiplayerMode, waitForTown } from '../src/multiplayer-mode.js';

test('production stays single player until the town is explicitly enabled', () => {
  assert.equal(resolveMultiplayerMode({ DEV: false }), 'off');
  assert.equal(resolveMultiplayerMode({ DEV: true }), 'auto');
  assert.equal(resolveMultiplayerMode({ DEV: false, VITE_MULTIPLAYER: 'required' }), 'required');
  assert.equal(resolveMultiplayerMode({ DEV: true, VITE_SINGLE_PLAYER: 'true' }), 'off');
  assert.equal(resolveMultiplayerMode({ DEV: true, VITE_MULTIPLAYER: 'nonsense' }), 'auto');
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
