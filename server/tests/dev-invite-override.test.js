import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createSharedWorld } from '../world.js';
import { JEVICA_ADMIN_USER_IDS } from '../admin.js';

// A local development convenience (Val, 2026-10-18): with an explicit flag on the loopback dev town, every local
// identity is an invited guest of Jevica's office and of owner-only homes, never their owner.
const data = JSON.parse(readFileSync(new URL('../../preview/public/data/district.json', import.meta.url)));
const owner = JEVICA_ADMIN_USER_IDS[0], id = 'jevica-office';
function setup(options = {}) {
  let time = 10000;
  const world = createSharedWorld(data, { now: () => time, ...options });
  for (const userId of [owner, 'guest']) assert.ok(world.join({ userId, name: userId }).ok);
  const send = (user, action, more = {}) => { time += 1000; return world.command(user, { type: 'office', action, officeId: id, ...more }); };
  const lobby = user => { const office = send(user, 'list').offices[0]; time += 2000; assert.ok(world.command(user, { type: 'travel', position: office.entrance }).ok); };
  return { world, send, lobby };
}

test('with the dev override a local identity enters Jevica’s office as an invited guest, never as its owner', () => {
  const { world, send, lobby } = setup({ isDevGuest: () => true });
  assert.equal(send('guest', 'list').offices[0].access, 'invited');
  lobby('guest'); assert.ok(send('guest', 'enter').ok);
  assert.equal(world.snapshot().players.find(p => p.id === 'guest').office.id, id);
  // A guest still cannot manage guests, and the owner stays the owner.
  assert.equal(send('guest', 'invite', { peerId: owner }).error, 'office_owner_required');
  assert.equal(send(owner, 'list').offices[0].access, 'owner');
});

test('without the override the office still needs an invitation', () => {
  const { send, lobby } = setup();
  assert.equal(send('guest', 'list').offices[0].access, null);
  lobby('guest'); assert.equal(send('guest', 'enter').error, 'office_permission_required');
});

test('with the dev override an owner-only home admits a local identity and lists it as accessible', async () => {
  const { compileRegionPackage } = await import('../region-package.js');
  const { createWalkingEnvironment } = await import('../../preview/src/walking.js');
  const sample = JSON.parse(readFileSync(new URL('../../preview/public/data/sample-region.json', import.meta.url)));
  const region = { ...sample, buildings: sample.buildings.map((building, index) => index === 2
    ? { ...building, interior: { name: 'Moon House', category: 'home', entrance: 'south', access: 'owner' } } : building) };
  const worldData = compileRegionPackage(region, 'Moon Garden'), storeId = createWalkingEnvironment(worldData).rooms[0].storeId;
  const visit = options => {
    const world = createSharedWorld(worldData, { worldId: 'moon-garden', now: () => 1000, ...options });
    world.join({ userId: owner, name: 'Jevica' }); world.join({ userId: 'guest', name: 'Guest' });
    return { entered: world.command('guest', { type: 'travel', storeId, mode: 'enter' }),
      listed: world.command('guest', { type: 'homeAccess', action: 'list' }).homes.map(home => home.storeId) };
  };
  const closed = visit({}), open = visit({ isDevGuest: () => true });
  assert.equal(closed.entered.error, 'private_home');
  assert.deepEqual(closed.listed, []);
  assert.equal(open.entered.ok, true);
  assert.deepEqual(open.listed, [storeId]);
});

test('the override is honoured only on the loopback dev town, with the acceptance fixture and the explicit flag', async () => {
  const { devInviteOverride } = await import('../town.js');
  const on = { RIVER_OAKS_ACCEPTANCE_FIXTURE: '1', RIVER_OAKS_DEV_INVITE_OVERRIDE: '1' };
  assert.equal(devInviteOverride({ mode: 'local', env: on }), true);
  assert.equal(devInviteOverride({ mode: 'workos', env: on }), false, 'never with real sign-in');
  assert.equal(devInviteOverride({ mode: 'local', env: { RIVER_OAKS_ACCEPTANCE_FIXTURE: '1' } }), false, 'off unless asked for');
  assert.equal(devInviteOverride({ mode: 'local', env: { ...on, RIVER_OAKS_DEV_INVITE_OVERRIDE: 'true' } }), false, 'only the exact value 1');
  assert.equal(devInviteOverride({ mode: 'local', env: { RIVER_OAKS_DEV_INVITE_OVERRIDE: '1' } }), false, 'only with the acceptance fixture');
  assert.equal(devInviteOverride({ mode: 'local', env: { ...on, NODE_ENV: 'production' } }), false, 'never in production');
  assert.equal(devInviteOverride({ mode: 'local', env: { ...on, VERCEL: '1' } }), false, 'never on Vercel');
});
