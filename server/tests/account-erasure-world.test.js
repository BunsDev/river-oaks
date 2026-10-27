import test from 'node:test';
import assert from 'node:assert/strict';
import { createSharedWorld } from '../world.js';

// Trusted fixture actors (every actor may build and wish), as in world.test.js.
const data = { scene: 'district', bounds_m: [-30,-30,30,30], walkSpawn: [-12,0,0],
  collisionPolygons: [[[-3,-8],[3,-8],[3,8],[-3,8]]], stores: [], buildings: [],
  communityLocations: [
    { id:'a',name:'Garden',position:[-12,0,0] },
    { id:'b',name:'Gallery',position:[12,0,0] },
    { id:'c',name:'Plaza',position:[0,15,0] },
    { id:'d',name:'Cafe',position:[-12,10,0] },
  ],
};
const erin = { userId:'user_erin7', name:'Erin Erasable' }, pat = { userId:'user_pat3', name:'Pat Peer' };
const traces = world => ['user_erin7','Erin Erasable','erin-private-words'].filter(needle => JSON.stringify(world.checkpoint()).includes(needle));

test('forgetting an account removes it from every section of the world checkpoint', () => {
  let time = 1000;
  const world = createSharedWorld(data, { isAdmin: () => true, now: () => time });
  assert.equal(world.join(erin).ok, true);assert.equal(world.join(pat).ok, true);
  assert.equal(world.command(erin.userId, { type:'chat', text:'erin-private-words' }).ok, true);
  assert.equal(world.command(pat.userId, { type:'chat', text:'pat-own-words' }).ok, true);
  const mine = world.command(erin.userId, { type:'build', action:'place', kind:'seat', finish:'rose', position:[-12,3], yaw:0 }).item;
  assert.equal(world.command(erin.userId, { type:'inventory', action:'save', buildId:mine.id }).ok, true);
  const theirs = world.command(pat.userId, { type:'build', action:'place', kind:'seat', finish:'rose', position:[-12,-3], yaw:0 }).item;
  assert.equal(world.command(erin.userId, { type:'wish', localId:'local-00', kind:'dragon' }).ok, true);
  time += 61000;world.step(.05);
  assert.deepEqual(traces(world), ['user_erin7','Erin Erasable','erin-private-words']);

  assert.equal(world.forgetAccount(erin.userId), true);
  assert.deepEqual(traces(world), []);
  // Pat keeps their chat line and their creation; the world restores cleanly.
  const view = world.snapshot();
  assert.deepEqual(view.players.map(player => player.id), [pat.userId]);
  assert.deepEqual(view.chat.map(entry => entry.text), ['pat-own-words']);
  assert.deepEqual(view.builds.map(item => item.id), [theirs.id]);
  const restored = createSharedWorld(data, { isAdmin: () => true, now: () => time });
  assert.deepEqual(restored.restore(JSON.parse(JSON.stringify(world.checkpoint()))), { ok:true });
  // A repeat is harmless and changes nothing that matters.
  const before = world.checkpoint().payload;
  assert.equal(world.forgetAccount(erin.userId), true);
  const after = world.checkpoint().payload;
  assert.deepEqual({ ...after, revision:0 }, { ...before, revision:0 });
});

test('someone sitting on the account\'s creation is stood up before it goes', () => {
  let time = 1000;
  const world = createSharedWorld(data, { isAdmin: () => true, now: () => time });
  world.join(erin);world.join(pat);
  const seat = world.command(erin.userId, { type:'build', action:'place', kind:'seat', finish:'rose', position:[-12,3], yaw:0 }).item;
  assert.equal(world.command(pat.userId, { type:'sit', buildId:seat.id, slot:0 }).ok, true);
  assert.equal(world.forgetAccount(erin.userId), true);
  assert.deepEqual(traces(world), []);
  assert.equal(world.snapshot().players.find(player => player.id === pat.userId).sitting ?? null, null);
  assert.deepEqual(world.snapshot().builds, []);
});

test('an office invitation and a visit end with the account, and the world restores', async () => {
  const { readFileSync } = await import('node:fs');
  const { JEVICA_ADMIN_USER_IDS } = await import('../admin.js');
  const district = JSON.parse(readFileSync(new URL('../../preview/public/data/district.json', import.meta.url)));
  const owner = JEVICA_ADMIN_USER_IDS[0];let time = 1000;
  const world = createSharedWorld(district, { now: () => time });
  for (const person of [{ userId:owner, name:'Jevica' }, erin, pat]) assert.equal(world.join(person).ok, true);
  const send = (user, action, more = {}) => { time += 1000; return world.command(user, { type:'office', action, officeId:'jevica-office', ...more }); };
  assert.equal(send(owner, 'invite', { peerId:erin.userId }).ok, true);
  assert.equal(send(owner, 'invite', { peerId:pat.userId }).ok, true);
  const office = send(erin.userId, 'list').offices[0];time += 2000;
  assert.equal(world.command(erin.userId, { type:'travel', position:office.entrance }).ok, true);time += 30000;world.step(.05);
  assert.equal(send(erin.userId, 'enter').ok, true);
  assert.ok(traces(world).includes('user_erin7'));
  world.forgetAccount(erin.userId);
  assert.deepEqual(traces(world), []);
  assert.deepEqual(send(owner, 'list').offices[0].guests.map(guest => guest.userId), [pat.userId]);
  const restored = createSharedWorld(district, { now: () => time });
  assert.deepEqual(restored.restore(JSON.parse(JSON.stringify(world.checkpoint()))), { ok:true });
});

test('campus leases, requests and receipts of the account go; another tenant keeps theirs', async () => {
  const { GARDEN_CAMPUS_ID, GARDEN_CAMPUS_VERSIONS } = await import('../../shared/garden-campus-layout.js');
  const { CAMPUS_LEASE_CONTRACT } = await import('../../shared/garden-campus-lease-contract.js');
  const served = { ...data, gardenCampus: { id: GARDEN_CAMPUS_ID, revision: 'river-oaks-gardens-3', versions: { ...GARDEN_CAMPUS_VERSIONS } } };
  const state = { time: Date.UTC(2026, 9, 18, 16) };let serial = 0;
  const world = createSharedWorld(served, { now: () => state.time, campusOperators: ['campus-operator'] });
  for (const person of [{ userId:'campus-operator', name:'Operator' }, erin, pat]) assert.equal(world.join(person).ok, true);
  const send = (id, message) => { state.time += 500; return world.command(id, { type:'campus', operationId:`op-${String(++serial).padStart(6, '0')}`, worldId:'river-oaks', contract:{ ...CAMPUS_LEASE_CONTRACT }, ...message }); };
  const startsAt = state.time + 3_600_000, endsAt = startsAt + 30 * 86_400_000;
  assert.equal(send(erin.userId, { action:'request', unitId:'T1-F2-W-S', startsAt, endsAt }).ok, true);
  assert.equal(send(pat.userId, { action:'request', unitId:'T2-F4-E-N', startsAt, endsAt }).ok, true);
  assert.equal(send('campus-operator', { action:'issue', unitId:'T3-F6-W-N', tenantId:erin.userId, startsAt:state.time + 1000, endsAt:state.time + 1000 + 30 * 86_400_000 }).ok, true);
  assert.ok(traces(world).includes('user_erin7'));
  world.forgetAccount(erin.userId);
  assert.deepEqual(traces(world), []);
  assert.ok(JSON.stringify(world.checkpoint()).includes(pat.userId));
  const restored = createSharedWorld(served, { now: () => state.time, campusOperators: ['campus-operator'] });
  assert.deepEqual(restored.restore(JSON.parse(JSON.stringify(world.checkpoint()))), { ok:true });
});

// #640 made the town's crime and police state checkpointed and strict: a fighter or a held
// player with no player record fails a restore. Forgetting an account mid-fight and
// mid-pursuit must leave neither. Its attack cooldown and its cancelled strike keep the id
// for a moment, as crime cooldowns always have (crime.js isn't this task's to change), and
// lapse within seconds.
test('an account forgotten mid-fight and under police pursuit leaves no trace, and the world restores', async () => {
  const { readFileSync } = await import('node:fs');
  const district = JSON.parse(readFileSync(new URL('../../preview/public/data/district.json', import.meta.url)));
  let time = 5_000_000;
  const options = { now: () => time, isAdmin: id => id === 'owner' };
  const world = createSharedWorld(district, options);
  for (const user of [{ userId:'owner', name:'Owner' }, erin, pat]) assert.equal(world.join(user).ok, true);
  assert.equal(world.command('owner', { type:'worldPolicy', action:'update', expectedRevision:0,
    changes:{ violence:{ mode:'forced', zones:['westcreek-lane'] } } }).ok, true);
  const target = world.snapshot().crime.targets[0];
  world.players.get(erin.userId).position = [target.position[0] + 1.2, target.position[1], target.position[2]];
  assert.equal(world.command(erin.userId, { type:'attack', targetId:target.id, attackKind:'melee' }).ok, true);
  time += 300;world.step(.05);
  const pursued = () => world.snapshot().police.units.some(unit => unit.targetId === erin.userId);
  for (let i = 0; i < 100 && !pursued(); i++) { time += 100;world.step(.1); }
  assert.ok(pursued(), 'police pursue the account');
  assert.ok(world.snapshot().crime.wanted.some(entry => JSON.stringify(entry).includes(erin.userId)), 'the account is wanted');

  assert.equal(world.forgetAccount(erin.userId), true);
  const restored = createSharedWorld(district, options);
  assert.deepEqual(restored.restore(JSON.parse(JSON.stringify(world.checkpoint()))), { ok:true });
  const { police, crime } = world.checkpoint().payload;
  assert.equal(JSON.stringify(police).includes(erin.userId), false, 'no officer, surrender or hold names the account');
  assert.equal(JSON.stringify(crime.participants).includes(erin.userId), false);
  assert.equal(world.snapshot().crime.wanted.some(entry => JSON.stringify(entry).includes(erin.userId)), false, 'no stars');
  for (let i = 0; i < 5; i++) { time += 1000;world.step(.1); }
  assert.deepEqual(traces(world), [], 'the cooldown and the cancelled strike lapse');
  assert.ok(world.players.has(pat.userId), 'a peer stays');
});
