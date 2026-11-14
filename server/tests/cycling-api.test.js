import test from 'node:test';
import assert from 'node:assert/strict';
import { createCyclingLeaderboard } from '../cycling-api.js';
import { createMemoryCyclingMiles } from '../cycling-miles.js';

// The leaderboard read: the top riders in miles to one decimal, the caller's own
// rank even outside the top, a short cache per instance, and no user ids.
test('the board lists the top riders in miles with the caller ranked, and never leaks ids', async () => {
  let time = 1000;
  const store = createMemoryCyclingMiles();
  for (let i = 0; i < 25; i++) await store.add(`rider-${i}`, (25 - i) * 1609.344, `Rider ${i}`);
  const board = createCyclingLeaderboard({ store, now: () => time });
  const page = await board.read({ userId: 'rider-22', name: 'Rider 22' });
  assert.equal(page.status, 200);
  assert.equal(page.value.limit, 20);
  assert.equal(page.value.top.length, 20);
  assert.deepEqual(page.value.top[0], { rank: 1, name: 'Rider 0', miles: 25 });
  assert.deepEqual(page.value.top[19], { rank: 20, name: 'Rider 19', miles: 6 });
  assert.deepEqual(page.value.me, { rank: 23, miles: 3 }, 'the caller is ranked even outside the top 20');
  assert.ok(page.value.top.every(row => !('userId' in row)), 'no ids leave the server');
  assert.equal((await board.read({ userId: 'nobody', name: 'Nobody' })).value.me, null);
});

test('miles round to one decimal and the top is cached for ten seconds per instance', async () => {
  let time = 1000;
  const store = createMemoryCyclingMiles();
  await store.add('alice', 2500, 'Alice');
  const board = createCyclingLeaderboard({ store, now: () => time });
  assert.deepEqual((await board.read({ userId: 'alice' })).value.top, [{ rank: 1, name: 'Alice', miles: 1.6, you: true }]);
  await store.add('bob', 5000, 'Bob');
  assert.equal((await board.read({ userId: 'bob' })).value.top.length, 1, 'within the cache window the top is unchanged');
  assert.deepEqual((await board.read({ userId: 'bob' })).value.me, { rank: 1, miles: 3.1 }, 'but the caller row is live');
  time += 10001;
  assert.equal((await board.read({ userId: 'bob' })).value.top[0].name, 'Bob');
});

test('without a store the board is unavailable', async () => {
  assert.equal((await createCyclingLeaderboard({ store: null }).read({ userId: 'alice' })).status, 503);
});
