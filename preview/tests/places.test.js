import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LANDMARK_LIMIT, destinationFromSearch, nearestPlace, openSpotNear, placeLink, placesOf, positionLink } from '../src/places.js';

const world = JSON.parse(readFileSync(new URL('../public/data/district.json', import.meta.url)));
const memoryStorage = () => { const map = new Map(); return { getItem: k => map.has(k) ? map.get(k) : null, setItem: (k, v) => map.set(k, String(v)), map }; };

test('the shipped district offers arrival, every community spot and every storefront as places', () => {
  const places = placesOf(world);
  assert.equal(places[0].id, 'arrival');
  const spotIds = new Set(world.communityLocations.map(s => s.id)), shopIds = new Set(world.stores.map(s => s.id));
  assert.equal(places.filter(p => p.kind === 'spot').length, spotIds.size);
  assert.equal(places.filter(p => p.kind === 'shop').length, [...shopIds].filter(id => !spotIds.has(id)).length, 'a store that is also a community spot is one place');
  assert.equal(new Set(places.map(p => p.ref)).size, places.length, 'data ids are unique across places');
  assert.ok(places.every(p => p.kind === 'arrival' || p.id === `${p.kind}:${p.ref}`), 'ids are namespaced by kind and keep the data id as ref');
  assert.ok(places.every(p => p.position.length === 2 && p.position.every(Number.isFinite) && p.name.length > 0));
  assert.equal(new Set(places.map(p => p.id)).size, places.length, 'place ids are unique');
  assert.deepEqual(placesOf({}), []);
  assert.deepEqual(placesOf({ communityLocations: [{ id: 'bad id!', name: 'x', position: [0, 0] }, { id: 'ok', name: '  ', position: [0, 0] }, { id: 'nan', name: 'n', position: [NaN, 0] }] }), []);
});

test('the nearest place is found within reach and named places link by id', () => {
  const places = placesOf(world), spot = places.find(p => p.kind === 'spot');
  const near = nearestPlace(places, [spot.position[0] + 3, spot.position[1] - 4]);
  assert.equal(near.place.id, spot.id); assert.ok(Math.abs(near.distance - 5) < 1e-9);
  assert.equal(nearestPlace(places, [spot.position[0] + 500, spot.position[1]]), null);
  assert.equal(nearestPlace(places, null), null);
  assert.equal(placeLink(spot, 'https://x.test/'), `https://x.test/?place=${encodeURIComponent(spot.id)}`);
  const worldLink=new URL(placeLink(spot,'https://sim.jev.works/?world=moon-garden&play=multiplayer'));
  assert.equal(worldLink.searchParams.get('world'),'moon-garden');
  assert.equal(worldLink.searchParams.get('play'),'multiplayer');
  assert.equal(worldLink.searchParams.get('place'),spot.id);
  assert.equal(new URL(placeLink(spot,'https://x.test/?at=1,2')).searchParams.has('at'),false);
  assert.equal(destinationFromSearch(`?place=${encodeURIComponent(spot.id)}`, places), spot);
  assert.equal(destinationFromSearch('?place=nope', places), null);
});

test('position links round-trip and are bounded to the world', () => {
  const link = positionLink([-2765.3219, -1295.0641], 1.2345);
  assert.equal(link, '?at=-2765.32,-1295.06,1.23');
  const worldLink=new URL(positionLink([-10.123,-20.456],1.234,'https://sim.jev.works/?world=moon-garden&play=multiplayer'));
  assert.deepEqual([...worldLink.searchParams],[['world','moon-garden'],['play','multiplayer'],['at','-10.12,-20.46,1.23']]);
  assert.equal(new URL(positionLink([-10,-20],0,'https://x.test/?place=arrival')).searchParams.has('place'),false);
  const to = destinationFromSearch(link, [], world.bounds_m);
  assert.deepEqual(to.position, [-2765.32, -1295.06]); assert.equal(to.yaw, 1.23); assert.equal(to.kind, 'link');
  assert.equal(destinationFromSearch('?at=0,0', [], world.bounds_m), null, 'outside the district is refused');
  assert.equal(destinationFromSearch('?at=abc,1', [], world.bounds_m), null);
  assert.equal(destinationFromSearch('', [], world.bounds_m), null);
});

test('account landmarks load and use server-returned positions without writing device storage', async () => {
  const { createAccountLandmarks } = await import('../src/places.js');
  assert.equal(typeof createAccountLandmarks, 'function');
  const calls = [], saved = { id: 'lm-server', name: 'Garden gate', position: [9, 8], yaw: .4, createdAt: 12, worldId: 'moon-garden', worldTitle: 'Moon Garden' };
  const account = createAccountLandmarks({ request: async (action, data) => {
    calls.push([action, data]);
    if (action === 'list') return { ok: true, landmarks: [saved] };
    if (action === 'add') return { ok: true, landmark: saved };
    if (action === 'remove') return { ok: true, removed: true };
  } });
  assert.deepEqual(account.list(), []);
  await account.load();
  assert.deepEqual(account.list(), [{ ...saved, kind: 'landmark' }]);
  assert.equal((await account.add({ name: 'Garden gate', position: [1, 2], yaw: 1 })).landmark.position[0], 9);
  assert.deepEqual(calls.at(-1), ['add', { name: 'Garden gate' }]);
  assert.equal(await account.remove(saved.id, saved.worldId), true);
  assert.deepEqual(account.list(), []);
  assert.deepEqual(calls.at(-1), ['remove', { id: saved.id, worldId: saved.worldId }]);
});

test('account landmark writes wait for the initial list so a late response cannot hide a save', async () => {
  const { createAccountLandmarks } = await import('../src/places.js');
  let finishLoad;
  const calls = [];
  const account = createAccountLandmarks({ request: (action) => {
    calls.push(action);
    if (action === 'list') return new Promise(resolve => { finishLoad = resolve; });
    return Promise.resolve({ ok: true, landmark: { id: 'lm-new', name: 'New', position: [3, 4], yaw: 0, createdAt: 2 } });
  } });
  const load = account.load();
  const save = account.add({ name: 'New' });
  assert.deepEqual(calls, ['list']);
  finishLoad({ ok: true, landmarks: [{ id: 'lm-old', name: 'Old', position: [1, 2], yaw: 0, createdAt: 1 }] });
  await Promise.all([load, save]);
  assert.deepEqual(calls, ['list', 'add']);
  assert.deepEqual(account.list().map(item => item.name), ['Old', 'New']);
});

test('an open spot is the position itself, a near ring, or nothing within reach', () => {
  const blockedDisc = (x, north) => Math.hypot(x, north) > 1;
  assert.deepEqual(openSpotNear(blockedDisc, [5, 5]), [5, 5]);
  const near = openSpotNear(blockedDisc, [0, 0], 1.2);
  assert.ok(near && Math.hypot(...near) > 1 && Math.hypot(...near) <= 1.21, 'the first clear ring is used');
  assert.equal(openSpotNear(blockedDisc, [0, 0], 0.8), null, 'nothing clear within reach refuses');
  assert.equal(openSpotNear(() => true, [NaN, 0]), null);
});
