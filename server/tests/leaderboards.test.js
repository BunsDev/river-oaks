import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createSharedWorld, PLAY_IDLE_MS } from '../world.js';
import { createMemoryCyclingMiles } from '../cycling-miles.js';
import { createCyclingLeaderboard } from '../cycling-api.js';
import { createWalkingEnvironment } from '../../preview/src/walking.js';
import { plazaSalonRack } from '../../preview/src/plaza-salon-plan.js';
import { BOARD_IDS } from '../../preview/src/leaderboard-boards.js';

// The town's leaderboards beyond cycling: metres walked, metres driven per
// vehicle kind and hours played, all measured by the world from what it accepts.
const data = JSON.parse(await readFile(new URL('../../preview/public/data/district.json', import.meta.url)));
const environment = createWalkingEnvironment(data);
const slot = plazaSalonRack(data)[0];
const identity = userId => ({ userId, name: userId, sessionId: `${userId}-s`, expiresAt: Date.now() + 3_600_000 });

function setup(users = ['alice']) {
  let time = 1_000_000;
  const world = createSharedWorld(data, { now: () => time });
  for (const id of users) assert.equal(world.join(identity(id)).ok, true);
  const [x, north] = slot.approach;
  for (const id of users) Object.assign(world.players.get(id), { position: [x, north, environment.groundAt(x, -north)], moveBudget: 1, liftBudget: 1 });
  const at = dx => [x - dx, north, environment.groundAt(x - dx, -north)];
  const pose = (id, dx, vehicle) => world.command(id, { type: 'pose', position: at(dx), yaw: 0, altitude: 0, ...(vehicle ? { vehicle } : {}) });
  const drained = () => Object.fromEntries(world.drainRides().map(ride => [`${ride.board}:${ride.userId}`, ride.amount]));
  return { world, pose, drained, advance: ms => { time += ms; } };
}

test('every board has an id, and vehicle kinds other than the bicycle each have one', () => {
  assert.deepEqual(BOARD_IDS, ['cycling', 'walking', 'played', 'rolls', 'motorcycle', 'hover']);
});

test('accepted steps on foot count as walking, motorcycle poses as motorcycle miles, and refused poses count for nothing', () => {
  const f = setup();
  f.advance(1000);
  assert.equal(f.pose('alice', 1.5).ok, true);
  f.advance(1000);
  assert.equal(f.pose('alice', 40).ok, false, 'a step far beyond the walking budget is corrected');
  const walked = f.drained();
  assert.equal(walked['walking:alice'], 1.5);
  f.advance(1000);
  assert.equal(f.pose('alice', 6.5, 'motorcycle').ok, true);
  const rode = f.drained();
  assert.equal(rode['motorcycle:alice'], 5);
  assert.equal(rode['walking:alice'], undefined, 'driving is not walking');
  // A travel is a jump, not a walk.
  f.advance(1000);
  assert.equal(f.world.command('alice', { type: 'travel', position: [slot.x - 30, slot.north] }).ok, true);
  assert.equal(f.drained()['walking:alice'], undefined);
});

test('hours played count connected time only until ten idle minutes, and moving or chatting starts them again', () => {
  const f = setup();
  f.advance(60_000);
  assert.equal(f.drained()['played:alice'], 60, 'a minute after joining');
  f.advance(PLAY_IDLE_MS + 60_000);
  assert.equal(f.drained()['played:alice'], PLAY_IDLE_MS / 1000 - 60, 'an idle tab earns up to ten minutes after its last move');
  f.advance(60_000);
  assert.equal(f.drained()['played:alice'], undefined, 'and nothing after that');
  // A pose with no movement or turn (a page re-sending its pose) is not play.
  assert.equal(f.pose('alice', 0).ok, true);
  f.advance(60_000);
  assert.equal(f.drained()['played:alice'], undefined);
  assert.equal(f.world.command('alice', { type: 'chat', text: 'back' }).ok, true);
  f.advance(30_000);
  assert.equal(f.drained()['played:alice'], 30);
  // Leaving banks the last stretch; erasure forgets whatever is unbanked.
  f.advance(10_000);
  assert.equal(f.world.leave('alice'), true);
  assert.equal(f.drained()['played:alice'], 10);
});

test('the store keeps each board apart, ranks within a board, and erasure clears every board', async () => {
  const store = createMemoryCyclingMiles();
  await store.add('alice', 1609.344, 'Alice', 'walking');
  await store.add('bob', 3600 * 2.5, 'Bob', 'played');
  await store.add('alice', 900, 'Alice', 'played');
  assert.deepEqual(await store.top(5, 'played'), [{ userId: 'bob', name: 'Bob', total: 9000 }, { userId: 'alice', name: 'Alice', total: 900 }]);
  assert.deepEqual(await store.top(5), [], 'cycling is the default board and has nobody');
  await assert.rejects(store.add('alice', 1, 'Alice', 'skydiving'), /Invalid board/);
  const board = createCyclingLeaderboard({ store });
  const hours = await board.board({ userId: 'alice' }, 'played');
  assert.deepEqual(hours.value.top, [{ rank: 1, name: 'Bob', value: 2.5 }, { rank: 2, name: 'Alice', value: 0.3, you: true }]);
  assert.deepEqual((await board.board({ userId: 'alice' }, 'walking')).value.me, { rank: 1, value: 1 });
  await store.eraseUser('alice');
  assert.equal(await store.rank('alice', 'walking'), null);
  assert.deepEqual((await store.top(5, 'played')).map(row => row.userId), ['bob']);
});
