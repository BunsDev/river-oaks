import test from 'node:test';
import assert from 'node:assert/strict';
import { loadDistrictData } from '../../server/district-data.js';
import { createSharedWorld } from '../../server/world.js';
import { DISTRICT_REVISION_GARDENS } from '../src/garden-campus-district.js';
import { campusDefaultTerm, campusDirectory, campusSuiteDirections, createCampusCommands } from '../src/garden-campus-model.js';
import { CAMPUS_LEASE_LABEL } from '../../shared/garden-campus-lease-contract.js';

const gardens = await loadDistrictData({ districtRevision: DISTRICT_REVISION_GARDENS });

function town() {
  let time = Date.UTC(2026, 9, 18, 12);
  const world = createSharedWorld(gardens, { now: () => time, campusOperators: ['operator'] });
  for (const id of ['operator', 'alice', 'bob']) assert.equal(world.join({ userId: id, name: id }).ok, true);
  const client = (id, wrap = message => world.command(id, message)) => createCampusCommands({ worldId: 'river-oaks', send: async message => { time += 500;return wrap(message); } });
  const list = id => world.command(id, { type: 'campus', action: 'list' }).campus;
  return { world, client, list, now: () => time, advance(ms) { time += ms; } };
}

test('the directory reads the server answer: no charge, suites by tower and floor, and directions', () => {
  const t = town(), directory = campusDirectory(t.list('alice'), { now: t.now() });
  assert.equal(directory.label, CAMPUS_LEASE_LABEL);
  assert.equal(directory.leasing, 'owner-managed');
  assert.deepEqual(directory.towers.map(tower => tower.name), ['Grove Offices', 'The Commons', 'Atelier Offices']);
  const units = directory.towers.flatMap(tower => tower.floors.flatMap(floor => floor.units));
  assert.equal(units.length, 43);
  assert.ok(units.every(unit => unit.state === 'available' && unit.canRequest));
  assert.match(campusSuiteDirections('T1-F2-W-S'), /Grove Offices \(T1\), Floor 2: take the lift .* suite T1-201 is on the west, south end/);
  assert.equal(JSON.stringify(directory).match(/price|currency|\$|£|€/), null, 'no price or currency anywhere');
});

test('a resident asks, the operator offers, the resident accepts, and a guest is admitted', async () => {
  const t = town(), alice = t.client('alice'), operator = t.client('operator');
  const term = campusDefaultTerm(t.now());
  const asked = await alice.request('T1-F2-W-S', term);
  assert.equal(asked.ok, true, asked.message);
  let mine = campusDirectory(t.list('alice'), { now: t.now() });
  assert.equal(mine.towers[0].floors[0].units.find(unit => unit.unitId === 'T1-F2-W-S').state, 'requested');
  assert.deepEqual(mine.requests[0].actions, ['cancel']);
  // The operator's queue offers the request with its own dates; a pending request is not admission.
  const queue = campusDirectory(t.list('operator'), { now: t.now() }).manage;
  assert.deepEqual(queue.requests.map(item => [item.unitId, item.actions]), [['T1-F2-W-S', ['issue', 'decline']]]);
  assert.equal(t.world.campusSuiteAccess('alice', 'T1-F2-W-S').ok, false);
  const offered = await operator.issue({ unitId: 'T1-F2-W-S', tenantId: 'alice', startsAt: term.startsAt, endsAt: term.endsAt, requestId: queue.requests[0].id });
  assert.equal(offered.ok, true, offered.message);
  mine = campusDirectory(t.list('alice'), { now: t.now() });
  const lease = mine.leases[0];
  assert.deepEqual([lease.status, lease.actions], ['offered', ['accept', 'decline']]);
  assert.equal((await alice.accept(lease)).ok, true);
  mine = campusDirectory(t.list('alice'), { now: t.now() });
  assert.equal(mine.towers[0].floors[0].units.find(unit => unit.unitId === 'T1-F2-W-S').state, 'yours');
  assert.deepEqual(mine.leases[0].actions, ['release', 'grant']);
  assert.equal(t.world.campusSuiteAccess('alice', 'T1-F2-W-S').role, 'tenant');
  // Bob is not admitted until Alice names him; then he sees the suite as a guest and can leave it.
  assert.equal(t.world.campusSuiteAccess('bob', 'T1-F2-W-S').ok, false);
  assert.equal((await alice.grant(mine.leases[0], 'bob')).ok, true);
  const bob = campusDirectory(t.list('bob'), { now: t.now() });
  assert.equal(bob.towers[0].floors[0].units.find(unit => unit.unitId === 'T1-F2-W-S').state, 'guest');
  assert.deepEqual(bob.leases[0].actions, ['leave']);
  assert.equal((await t.client('bob').leave(bob.leases[0], 'bob')).ok, true);
  assert.equal(t.world.campusSuiteAccess('bob', 'T1-F2-W-S').ok, false);
});

test('a lost answer retries the same operation; a refusal shows the shared sentence and ends the intent', async () => {
  const t = town(), sent = [];
  let drop = true;
  const alice = t.client('alice', message => { sent.push(message);const result = t.world.command('alice', message);if (drop) { drop = false;throw new Error('timed out'); } return result; });
  const term = campusDefaultTerm(t.now());
  const first = await alice.request('T2-F2-W-S', term);
  assert.deepEqual([first.ok, first.retry], [false, true], 'no answer keeps the intent');
  assert.equal(alice.pending(), 1);
  const second = await alice.request('T2-F2-W-S', term);
  assert.equal(second.ok, true);assert.equal(second.replayed, true, 'the server replays the first operation');
  assert.equal(sent[0].operationId, sent[1].operationId);
  assert.equal(alice.pending(), 0);
  const refused = await alice.request('T2-F2-W-S', term);
  assert.equal(refused.ok, false);assert.equal(refused.message, 'You already asked for this suite.');
  assert.notEqual(sent[2].operationId, sent[0].operationId, 'a new click is a new operation');
});
