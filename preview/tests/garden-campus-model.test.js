import test from 'node:test';
import assert from 'node:assert/strict';
import { loadDistrictData } from '../../server/district-data.js';
import { createSharedWorld } from '../../server/world.js';
import { DISTRICT_REVISION_GARDENS } from '../src/garden-campus-district.js';
import { CAMPUS_OUTCOMES_SHOWN, campusDefaultTerm, campusDirectory, campusLostGuestAccess, campusReplayChange, campusSuiteDirections, createCampusCommands } from '../src/garden-campus-model.js';
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

// #510: the server keeps each account's ended leases and closed requests with a reason;
// the directory says what happened to them in plain words, newest first and bounded.
const DAY = 86_400_000;
const outcome = (directory, unitId) => directory.outcomes.find(item => item.unitId === unitId)?.text;

test('every way a lease or a request ends reaches its own account in plain words', async () => {
  const t = town(), alice = t.client('alice'), bob = t.client('bob'), operator = t.client('operator');
  const term = () => campusDefaultTerm(t.now());
  const offer = async (unitId, tenantId, dates = term()) => {
    const answer = await operator.issue({ unitId, tenantId, ...dates });assert.equal(answer.ok, true, answer.message);
    return campusDirectory(t.list(tenantId), { now: t.now() }).leases.find(lease => lease.unitId === unitId && lease.status === 'offered');
  };
  const active = async (unitId, tenantId, dates) => {
    const lease = await offer(unitId, tenantId, dates);assert.equal((await t.client(tenantId).accept(lease)).ok, true);
    return campusDirectory(t.list(tenantId), { now: t.now() }).leases.find(item => item.unitId === unitId && item.status === 'active');
  };
  // released: the tenant gives the suite up.
  assert.equal((await alice.release(await active('T1-F2-W-S', 'alice'))).ok, true);
  // revoked: the operator ends an active lease.
  const revokedLease = await active('T1-F2-W-N', 'alice');
  assert.equal((await operator.revoke(campusDirectory(t.list('operator'), { now: t.now() }).manage.leases.find(lease => lease.id === revokedLease.id))).ok, true);
  let mine = campusDirectory(t.list('alice'), { now: t.now() });
  assert.match(outcome(mine, 'T1-F2-W-S'), /^The lease ended on \d{4}-\d\d-\d\d: you gave the suite up\.$/);
  assert.match(outcome(mine, 'T1-F2-W-N'), /^The lease ended on \d{4}-\d\d-\d\d: the campus operator ended it\.$/);
  // declined: the tenant turns an offer down; withdrawn: the operator takes one back.
  assert.equal((await alice.release(await offer('T2-F2-W-S', 'alice'))).ok, true);
  const withdrawnOffer = await offer('T2-F2-W-N', 'alice');
  assert.equal((await operator.revoke(campusDirectory(t.list('operator'), { now: t.now() }).manage.leases.find(lease => lease.id === withdrawnOffer.id))).ok, true);
  // superseded: Bob accepts his offer for a suite first, so Alice's offer for it closes.
  await offer('T3-F2-W-S', 'alice');
  assert.equal((await bob.accept(await offer('T3-F2-W-S', 'bob'))).ok, true);
  // Requests: Alice withdraws one, the operator declines one.
  assert.equal((await alice.request('T1-F3-W-S', term())).ok, true);
  assert.equal((await alice.cancel(campusDirectory(t.list('alice'), { now: t.now() }).requests.find(item => item.unitId === 'T1-F3-W-S'))).ok, true);
  assert.equal((await alice.request('T1-F3-W-N', term())).ok, true);
  assert.equal((await operator.decline(campusDirectory(t.list('operator'), { now: t.now() }).manage.requests.find(item => item.unitId === 'T1-F3-W-N'))).ok, true);

  mine = campusDirectory(t.list('alice'), { now: t.now() });
  assert.match(outcome(mine, 'T2-F2-W-S'), /^You declined this offer on \d{4}-\d\d-\d\d\.$/);
  assert.match(outcome(mine, 'T2-F2-W-N'), /^The campus operator withdrew this offer on \d{4}-\d\d-\d\d\.$/);
  assert.match(outcome(mine, 'T3-F2-W-S'), /^This offer closed on \d{4}-\d\d-\d\d: another offer for the suite was accepted first\.$/);
  assert.match(outcome(mine, 'T1-F3-W-S'), /^You withdrew your request on \d{4}-\d\d-\d\d\.$/);
  assert.match(outcome(mine, 'T1-F3-W-N'), /^The campus operator declined your request on \d{4}-\d\d-\d\d\.$/);
  assert.equal(mine.outcomes.length, CAMPUS_OUTCOMES_SHOWN, 'seven endings, the newest five shown');
  assert.equal(outcome(mine, 'T1-F2-W-S'), undefined, 'the oldest ending gives way');
  assert.deepEqual(mine.outcomes.map(item => item.at), mine.outcomes.map(item => item.at).toSorted((a, b) => b - a), 'newest first');
  // Ended records offer no action and never count as the account's suites.
  assert.ok(mine.towers.flatMap(tower => tower.floors.flatMap(floor => floor.units)).filter(unit => unit.state !== 'available').every(unit => unit.unitId === 'T3-F2-W-S' && unit.state === 'leased'));

  // Nobody else's endings: Bob sees only his own active lease; the operator, whose manage
  // queues hold every ended record, has no endings of their own.
  assert.deepEqual(campusDirectory(t.list('bob'), { now: t.now() }).outcomes, []);
  assert.deepEqual(campusDirectory(t.list('operator'), { now: t.now() }).outcomes, []);

  // expired and offer_expired: time runs out on an active lease and on an unanswered offer;
  // an unanswered request lapses after 14 days.
  const short = { startsAt: t.now(), endsAt: t.now() + 2 * 3_600_000 };
  const lateAsk = await alice.request('T3-F3-W-S', term());assert.equal(lateAsk.ok, true, lateAsk.message);
  await active('T2-F3-W-S', 'alice', short);
  await offer('T2-F3-W-N', 'alice');
  t.advance(15 * DAY);
  mine = campusDirectory(t.list('alice'), { now: t.now() });
  assert.match(outcome(mine, 'T2-F3-W-S'), /^The lease ended on \d{4}-\d\d-\d\d: its term ran out\.$/);
  assert.match(outcome(mine, 'T2-F3-W-N'), /^This offer lapsed unanswered on \d{4}-\d\d-\d\d\.$/);
  assert.match(outcome(mine, 'T3-F3-W-S'), /^Your request lapsed unanswered on \d{4}-\d\d-\d\d\.$/);
  // After 30 days an ending is no longer recent.
  t.advance(31 * DAY);
  assert.deepEqual(campusDirectory(t.list('alice'), { now: t.now() }).outcomes, []);
});

test('a request answered with an offer continues as the offer; retired records and unknown reasons stay truthful', () => {
  const now = Date.UTC(2026, 9, 24, 12), at = now - DAY;
  const base = { startsAt: now - 2 * DAY, endsAt: now + 28 * DAY, label: CAMPUS_LEASE_LABEL };
  const directory = campusDirectory({ leasing: 'owner-managed', units: [], access: [],
    leases: [{ id: 'l1', unitId: 'T1-F2-W-S', number: 'T1-201', role: 'tenant', status: 'ended', endedAt: at, endedReason: 'retired', ...base },
      { id: 'l2', unitId: 'T1-F2-W-N', number: 'T1-202', role: 'tenant', status: 'ended', endedAt: at - 1, endedReason: 'something_new', ...base }],
    requests: [{ id: 'r1', unitId: 'T2-F2-W-S', number: 'T2-201', status: 'offered', closedAt: at, ...base },
      { id: 'r2', unitId: 'T2-F2-W-N', number: 'T2-202', status: 'retired', closedAt: at - 2, ...base }] }, { now });
  assert.equal(outcome(directory, 'T1-F2-W-S'), 'This lease ended on 2026-10-23: the campus no longer offers this suite.');
  assert.equal(outcome(directory, 'T1-F2-W-N'), 'This lease ended on 2026-10-23.');
  assert.equal(outcome(directory, 'T2-F2-W-S'), undefined, 'the offer row tells what happened to that request');
  assert.equal(outcome(directory, 'T2-F2-W-N'), 'Your request closed on 2026-10-23: the campus no longer offers this suite.');
});

test('guest access the page last listed and no longer sees is reported, unless this page left it', () => {
  const guestLease = (id, unitId, number) => ({ id, unitId, number, role: 'guest', status: 'active', tenantName: 'Alice', startsAt: 0, endsAt: 1 });
  const before = { leases: [guestLease('l1', 'T1-F2-W-S', 'T1-201'), guestLease('l2', 'T1-F2-W-N', 'T1-202'), { ...guestLease('l3', 'T2-F2-W-S', 'T2-201'), role: 'tenant' }] };
  const after = { leases: [guestLease('l2', 'T1-F2-W-N', 'T1-202')] };
  assert.deepEqual(campusLostGuestAccess(before, after).map(lease => [lease.number, lease.text]),
    [['T1-201', 'Your guest access ended: Alice removed you, or the lease ended.']]);
  assert.deepEqual(campusLostGuestAccess(before, after, { left: new Set(['l1']) }), [], 'leaving on purpose is not news');
  assert.deepEqual(campusLostGuestAccess(null, after), []);
});

test('a replayed request since declined, through the real server, says so; a replay that still holds does not', async () => {
  const t = town(), sent = [];
  let drop = true;
  const alice = t.client('alice', message => { sent.push(message);const result = t.world.command('alice', message);if (drop) { drop = false;throw new Error('timed out'); } return result; });
  const term = campusDefaultTerm(t.now());
  assert.equal((await alice.request('T1-F2-W-S', term)).retry, true);
  const queue = campusDirectory(t.list('operator'), { now: t.now() }).manage;
  assert.equal((await t.client('operator').decline(queue.requests[0])).ok, true);
  const replay = await alice.request('T1-F2-W-S', term);
  assert.equal(replay.replayed, true);
  assert.match(campusReplayChange('request', replay), /^The campus operator declined your request on \d{4}-\d\d-\d\d\.$/);
  assert.equal(campusReplayChange('cancel', replay), null, 'an ending action holds');
  assert.equal(campusReplayChange('request', { ...replay, replayed: false }), null, 'only replays are checked');
  assert.equal(campusReplayChange('request', { ok: true, replayed: true, request: null }), null, 'a record the server no longer keeps cannot be judged');
});

test('a replayed operator action says what the tenant or the campus did, not what the operator did', () => {
  const ended = (endedReason, status = 'ended') => ({ ok: true, replayed: true, lease: { status, endedReason, endedAt: Date.UTC(2026, 9, 24) } });
  assert.equal(campusReplayChange('renew', ended('released')), 'The lease ended on 2026-10-24: the tenant gave the suite up.');
  assert.equal(campusReplayChange('issue', ended('declined')), 'The resident declined this offer on 2026-10-24.');
  assert.equal(campusReplayChange('issue', ended('offer_expired')), 'This offer lapsed unanswered on 2026-10-24.');
  assert.equal(campusReplayChange('renew', ended('revoked')), 'The lease ended on 2026-10-24: a campus operator ended it.');
  assert.equal(campusReplayChange('renew', ended('expired')), 'The lease ended on 2026-10-24: its term ran out.');
  // The tenant's own actions keep the tenant's wording.
  assert.equal(campusReplayChange('accept', ended('released')), 'The lease ended on 2026-10-24: you gave the suite up.');
});
