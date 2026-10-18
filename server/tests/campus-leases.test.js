import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createSharedWorld } from '../world.js';
import { createCampusLeases, parseCampusOperators } from '../campus-leases.js';
import { JEVICA_ADMIN_USER_IDS } from '../admin.js';
import { GARDEN_CAMPUS_ID, GARDEN_CAMPUS_VERSIONS, campusSupportAt, campusUnitInventory } from '../../shared/garden-campus-layout.js';
import { CAMPUS_LEASE_CONTRACT, CAMPUS_LEASE_LABEL, CAMPUS_LEASE_LIMITS, campusLeaseUnits } from '../../shared/garden-campus-lease-contract.js';

// Garden campus tenancy (#509) through the world command path, its checkpoint and the
// module's access decision. Transports and Redis are in campus-leases-transport.test.js.
const HOUR = 3_600_000, DAY = 24 * HOUR, T0 = Date.UTC(2026, 9, 18, 16);
const OP = 'campus-operator', A = 'tenant-a', B = 'tenant-b', G = 'guest-g', S = 'stranger';
const U1 = 'T1-F2-W-S', U2 = 'T2-F4-E-N', U3 = 'T3-F6-W-N';
// #507's attachGardenCampus marks a district that serves the campus with worldData.gardenCampus;
// this stand-in carries only the marker the lease authority reads. Without it the campus is inert.
const served = world => ({ ...world, gardenCampus: { id: GARDEN_CAMPUS_ID, revision: 'river-oaks-gardens-3', versions: { ...GARDEN_CAMPUS_VERSIONS } } });
const garage = { scene: 'district', bounds_m: [-30, -30, 30, 30], walkSpawn: [-12, 0, 0], collisionPolygons: [], stores: [], buildings: [],
  communityLocations: [{ id: 'a', name: 'Garden', position: [-12, 0, 0] }] };
const small = served(garage);
const district = served(JSON.parse(readFileSync(new URL('../../preview/public/data/district.json', import.meta.url))));
const resign = saved => { const { checksum: _checksum, ...envelope } = saved; saved.checksum = createHash('sha256').update(JSON.stringify(envelope)).digest('hex'); return saved; };
let serial = 0;
const op = () => `op-${String(++serial).padStart(6, '0')}`;
const base = () => ({ operationId: op(), worldId: 'river-oaks', contract: { ...CAMPUS_LEASE_CONTRACT } });

function fixture({ operators = [OP], worldId, data = small, ids = [OP, A, B, G, S], isAdmin, clock } = {}) {
  const state = clock ?? { time: T0 };
  const world = createSharedWorld(data, { now: () => state.time, campusOperators: operators, ...(worldId ? { worldId } : {}), ...(isAdmin ? { isAdmin } : {}) });
  for (const id of ids) assert.equal(world.join({ userId: id, name: id }).ok, true);
  // Each command is half a second apart, so the world's command budget never runs dry.
  const send = (id, message) => { state.time += 500; return world.command(id, { type: 'campus', ...message }); };
  const f = {
    world, state, send, advance: ms => { state.time += ms; },
    list: id => send(id, { action: 'list' }),
    request: (id, unitId, startsAt = state.time + HOUR, endsAt = startsAt + 30 * DAY, more = {}) => send(id, { action: 'request', ...base(), unitId, startsAt, endsAt, ...more }),
    issue: (id, unitId, tenantId, { startsAt = state.time + 1000, endsAt = startsAt + 30 * DAY, requestId } = {}) =>
      send(id, { action: 'issue', ...base(), unitId, tenantId, startsAt, endsAt, ...(requestId === undefined ? {} : { requestId }) }),
    lease: (id, action, lease, more = {}) => send(id, { action, ...base(), leaseId: lease.id, expectedVersion: lease.version, ...more }),
    access: (id, unitId) => world.campusSuiteAccess(id, unitId),
  };
  // An active lease for tenant on unitId, accepted from an operator offer.
  f.active = (tenantId, unitId) => {
    const offered = f.issue(OP, unitId, tenantId);assert.equal(offered.ok, true, JSON.stringify(offered));
    f.advance(2000);
    const accepted = f.lease(tenantId, 'accept', offered.lease);assert.equal(accepted.ok, true, JSON.stringify(accepted));
    return accepted.lease;
  };
  return f;
}

test('the rentable inventory is exactly #506 suites, each returning to its public spine', () => {
  const units = campusLeaseUnits();
  assert.deepEqual(units.map(unit => unit.unitId), campusUnitInventory().map(unit => unit.id));
  assert.equal(units.length, 43);
  for (const unit of units) {
    assert.deepEqual(campusSupportAt(unit.landing.levelId, ...unit.landing.position), { surfaceId: unit.door.opensTo, kind: unit.floor === 4 ? 'gallery' : 'corridor', z: campusSupportAt(unit.levelId, ...unit.door.inside).z, access: 'public', levelId: unit.levelId }, unit.unitId);
    assert.equal(campusSupportAt(unit.levelId, ...unit.door.inside).surfaceId, unit.unitId);
  }
  const f = fixture();
  assert.deepEqual(f.world.snapshot().campus, { contract: { ...CAMPUS_LEASE_CONTRACT }, leasing: 'owner-managed', leased: [] });
  const listing = f.list(A);
  assert.equal(listing.ok, true);
  assert.deepEqual(listing.campus.units.map(unit => [unit.unitId, unit.status]), units.map(unit => [unit.unitId, 'available']));
  assert.deepEqual([listing.campus.mode, listing.campus.charge, listing.campus.label, listing.campus.operator], ['owner-managed', 'none', CAMPUS_LEASE_LABEL, false]);
});

test('leasing stays closed without a configured operator; Jevica admin is not one; other worlds have no campus', () => {
  assert.deepEqual(parseCampusOperators(' user_01ABC, ,bad id,user_01ABC,x/y '), ['user_01ABC']);
  const jevica = JEVICA_ADMIN_USER_IDS[0];
  const closed = fixture({ operators: [], ids: [jevica, A] });
  assert.equal(closed.list(A).campus.leasing, 'closed');
  assert.equal(closed.world.snapshot().campus.leasing, 'closed');
  assert.equal(closed.request(A, U1).error, 'campus_leasing_closed');
  assert.equal(closed.issue(jevica, U1, A).error, 'campus_operator_required');
  const other = fixture({ worldId: 'garden-2' });
  assert.equal(other.world.snapshot().campus, undefined);
  assert.equal(other.list(A).error, 'campus_unavailable');
  assert.equal(other.issue(OP, U1, A).error, 'campus_unavailable');
  assert.deepEqual(other.access(A, U1), { ok: false, reason: 'campus_unavailable' });
});

test('clients cannot mint units, operator authority, owners or prices; wrong world, version and terms are refused', () => {
  const f = fixture(), t = f.state.time;
  for (const forged of [{ operatorId: OP }, { tenantId: B }, { ownerId: A }, { price: 0 }, { currency: 'USD' }, { charge: 'none' }, { terms: {} }])
    assert.equal(f.request(A, U1, undefined, undefined, forged).error, 'invalid_campus_command', JSON.stringify(forged));
  assert.equal(f.send(A, { action: 'list', operator: true }).error, 'invalid_campus_command');
  assert.equal(f.send(A, { action: 'accept', ...base(), leaseId: 'lease-1', expectedVersion: 0 }).error, 'invalid_campus_command');
  assert.equal(f.request(A, 'T9-F9-W-S').error, 'campus_unknown_unit');
  assert.equal(f.request(A, `office-${'a'.repeat(64)}`).error, 'campus_unknown_unit', 'a retired personal workspace is not a unit');
  assert.equal(f.issue(A, U1, A).error, 'campus_operator_required');
  assert.equal(f.issue(OP, U1, OP).error, 'campus_invalid_tenant');
  assert.equal(f.request(OP, U1).error, 'campus_invalid_tenant');
  assert.equal(f.send(A, { action: 'request', ...base(), worldId: 'garden-2', unitId: U1, startsAt: t + HOUR, endsAt: t + DAY }).error, 'campus_world_mismatch');
  for (const contract of [{ ...CAMPUS_LEASE_CONTRACT, layout: '4.0' }, { ...CAMPUS_LEASE_CONTRACT, units: 2 }, { ...CAMPUS_LEASE_CONTRACT, id: 'old-garage' }]) {
    const stale = f.send(A, { action: 'request', ...base(), contract, unitId: U1, startsAt: t + HOUR, endsAt: t + DAY });
    assert.deepEqual([stale.error, stale.contract], ['campus_contract_stale', { ...CAMPUS_LEASE_CONTRACT }]);
  }
  const now = () => f.state.time;
  for (const [startsAt, endsAt] of [[now() - DAY, now() + DAY], [now() + HOUR, now() + HOUR + 1000], [now() + HOUR, now() + 400 * DAY], [now() + 91 * DAY, now() + 92 * DAY]])
    assert.equal(f.request(A, U1, startsAt, endsAt).error, 'campus_invalid_terms');
});

test('request, offer, accept, renew and release persist explicit no-charge terms; a pending request or offer is not admission', () => {
  const f = fixture();
  const asked = f.request(A, U1);
  assert.equal(asked.ok, true);assert.equal(asked.request.status, 'pending');
  assert.equal(f.request(A, U1).error, 'campus_request_exists');
  assert.equal(f.access(A, U1).reason, 'campus_unit_not_leased', 'a request is not admission');
  const queue = f.list(OP).campus.manage.requests;
  assert.deepEqual(queue.map(item => [item.id, item.userId, item.unitId, item.status]), [[asked.request.id, A, U1, 'pending']]);
  assert.equal(f.list(B).campus.requests.length, 0, 'another resident does not see the request');
  const offer = f.issue(OP, U1, A, { requestId: asked.request.id });
  assert.equal(offer.ok, true);
  assert.deepEqual([offer.lease.status, offer.lease.role, offer.lease.tenantId, offer.lease.version], ['offered', 'operator', A, 1]);
  assert.equal(f.list(A).campus.requests[0].status, 'offered');
  assert.equal(f.list(A).campus.requests[0].leaseId, offer.lease.id);
  const mine = f.list(A).campus.leases[0];
  assert.deepEqual([mine.role, mine.status, mine.mode, mine.charge, mine.label, mine.operatorName, mine.unitId, mine.number],
    ['tenant', 'offered', 'owner-managed', 'none', 'No charge — owner-managed', OP, U1, 'T1-201']);
  assert.equal(f.access(A, U1).reason, 'campus_unit_not_leased', 'an offer is not admission');
  f.advance(2000);
  assert.equal(f.lease(B, 'accept', offer.lease).error, 'campus_lease_unknown', 'another account cannot see or accept it');
  assert.equal(f.lease(OP, 'accept', offer.lease).error, 'campus_tenant_required');
  const accepted = f.lease(A, 'accept', offer.lease);
  assert.deepEqual([accepted.ok, accepted.lease.status, accepted.lease.version], [true, 'active', 2]);
  const access = f.access(A, U1);
  assert.deepEqual([access.ok, access.role, access.leaseId, access.until], [true, 'tenant', offer.lease.id, accepted.lease.endsAt]);
  assert.deepEqual(access.landing, campusLeaseUnits()[0].landing);
  for (const other of [B, OP, S]) assert.equal(f.access(other, U1).reason, 'campus_access_required', `${other} cannot enter`);
  assert.equal(f.access(A, U2).reason, 'campus_unit_not_leased');
  assert.deepEqual(f.list(A).campus.access.map(item => [item.unitId, item.role]), [[U1, 'tenant']]);
  // The public frame says only that the suite is taken.
  const frame = f.world.snapshot().campus;
  assert.deepEqual(frame, { contract: { ...CAMPUS_LEASE_CONTRACT }, leasing: 'owner-managed', leased: [U1] });
  assert.equal(f.list(B).campus.units.find(unit => unit.unitId === U1).status, 'leased');
  assert.equal(f.request(B, U1).error, 'campus_unit_unavailable');
  assert.equal(f.lease(A, 'renew', accepted.lease, { endsAt: accepted.lease.endsAt + DAY }).error, 'campus_operator_required');
  assert.equal(f.lease(OP, 'renew', offer.lease, { endsAt: accepted.lease.endsAt + DAY }).error, 'campus_lease_stale');
  assert.equal(f.lease(OP, 'renew', accepted.lease, { endsAt: accepted.lease.endsAt }).error, 'campus_invalid_terms', 'renewal extends');
  const renewed = f.lease(OP, 'renew', accepted.lease, { endsAt: accepted.lease.endsAt + 10 * DAY });
  assert.deepEqual([renewed.ok, renewed.lease.version, renewed.lease.endsAt], [true, 3, accepted.lease.endsAt + 10 * DAY]);
  assert.equal(f.access(A, U1).until, renewed.lease.endsAt);
  assert.equal(f.lease(A, 'release', accepted.lease).error, 'campus_lease_stale', 'a stale release cannot undo the renewal');
  const released = f.lease(A, 'release', renewed.lease);
  assert.deepEqual([released.lease.status, released.lease.endedReason], ['ended', 'released']);
  assert.equal(f.access(A, U1).reason, 'campus_unit_not_leased');
  assert.deepEqual(f.world.snapshot().campus.leased, []);
});

test('duplicate and late commands cannot double-acquire, revive a revoked lease or overwrite a newer version', () => {
  const f = fixture();
  const toA = f.issue(OP, U1, A), toB = f.issue(OP, U1, B);
  assert.equal(f.issue(OP, U1, A).error, 'campus_offer_exists');
  f.advance(2000);
  const acceptA = { action: 'accept', ...base(), leaseId: toA.lease.id, expectedVersion: 1 };
  const first = f.send(A, acceptA);
  assert.equal(first.ok, true);
  const late = f.lease(B, 'accept', toB.lease);
  assert.equal(late.error, 'campus_lease_ended', 'the other offer was superseded');
  assert.equal(f.list(B).campus.leases[0].endedReason, 'superseded');
  const replay = f.send(A, acceptA);
  assert.deepEqual([replay.ok, replay.replayed, replay.lease.version], [true, true, 2], 'a retry applies once');
  assert.equal(f.send(A, { ...acceptA, expectedVersion: 2 }).error, 'campus_operation_conflict', 'a reused id with other content fails');
  assert.equal(f.lease(A, 'accept', toA.lease).error, 'campus_lease_stale');
  assert.equal(f.lease(A, 'accept', first.lease).error, 'campus_lease_not_offered');
  assert.equal(f.list(OP).campus.manage.leases.filter(lease => lease.status === 'active').length, 1);
  const revoked = f.lease(OP, 'revoke', first.lease);
  assert.deepEqual([revoked.lease.status, revoked.lease.endedReason], ['ended', 'revoked']);
  assert.equal(f.access(A, U1).reason, 'campus_unit_not_leased');
  for (const [action, more] of [['accept', {}], ['renew', { endsAt: first.lease.endsAt + DAY }], ['grant', { peerId: G }], ['release', {}], ['revoke', {}]])
    assert.equal(f.lease(action === 'renew' || action === 'revoke' ? OP : A, action, revoked.lease, more).error, 'campus_lease_ended', action);
  const stillRevoked = f.send(A, acceptA);
  assert.deepEqual([stillRevoked.replayed, stillRevoked.lease.status], [true, 'ended'], 'a late duplicate reports the ended lease and revives nothing');
  assert.equal(f.access(A, U1).ok, false);
  const fresh = f.issue(OP, U1, A);
  assert.notEqual(fresh.lease.id, first.lease.id, 'a new lease, never the old one');
});

test('guests enter only through an explicit tenant grant, only that suite and only while the lease lasts', () => {
  const f = fixture({ ids: [OP, A, B, G, S, ...Array.from({ length: 9 }, (_, i) => `guest-${i}`)] });
  let lease = f.active(A, U1);
  const other = f.active(B, U2);
  assert.equal(f.access(G, U1).reason, 'campus_access_required');
  assert.equal(f.lease(G, 'grant', lease, { peerId: G }).error, 'campus_lease_unknown', 'a stranger cannot see the lease');
  assert.equal(f.lease(OP, 'grant', lease, { peerId: G }).error, 'campus_tenant_required', 'the operator cannot add guests');
  assert.equal(f.lease(A, 'grant', lease, { peerId: A }).error, 'campus_invalid_guest');
  lease = f.lease(A, 'grant', lease, { peerId: G }).lease;
  assert.deepEqual(lease.guests.map(guest => guest.userId), [G]);
  assert.equal(f.lease(A, 'grant', lease, { peerId: G }).error, 'campus_guest_exists');
  assert.deepEqual([f.access(G, U1).ok, f.access(G, U1).role], [true, 'guest']);
  assert.equal(f.access(G, U2).reason, 'campus_access_required', 'not another tenant suite');
  const seen = f.list(G).campus.leases[0];
  assert.deepEqual(Object.keys(seen).sort(), ['charge', 'endsAt', 'id', 'label', 'mode', 'number', 'role', 'startsAt', 'status', 'tenantName', 'unitId', 'version']);
  const managed = f.list(OP).campus.manage.leases.find(item => item.id === lease.id);
  assert.equal(managed.guestCount, 1);assert.equal(managed.guests, undefined, 'the operator does not see who the guests are');
  assert.equal(f.list(B).campus.leases.some(item => item.id === lease.id), false);
  assert.equal(f.lease(G, 'grant', lease, { peerId: S }).error, 'campus_tenant_required', 'a guest cannot invite');
  assert.equal(f.lease(B, 'ungrant', other, { peerId: G }).error, 'campus_guest_unknown');
  const left = f.lease(G, 'ungrant', lease, { peerId: G });
  assert.deepEqual([left.ok, left.lease], [true, null], 'a guest can leave on their own, and then sees nothing of the lease');
  assert.equal(f.access(G, U1).reason, 'campus_access_required');
  lease = f.list(A).campus.leases.find(item => item.id === lease.id);
  for (let i = 0; i < 8; i++) lease = f.lease(A, 'grant', lease, { peerId: `guest-${i}` }).lease;
  assert.equal(f.lease(A, 'grant', lease, { peerId: 'guest-8' }).error, 'campus_guest_limit');
  f.advance(lease.endsAt - f.state.time);
  f.world.step(0.1);
  for (const id of [A, 'guest-0', 'guest-7']) assert.equal(f.access(id, U1).reason, 'campus_unit_not_leased');
  assert.equal(f.list(A).campus.leases.find(item => item.id === lease.id).endedReason, 'expired');
  assert.deepEqual(f.list(A).campus.leases.find(item => item.id === lease.id).guests, [], 'guests end with the lease');
});

test('expiry, revocation, release and guest removal report every holder with the public landing; offers and requests lapse', () => {
  let time = T0;
  const events = [], players = new Map([[A, { name: 'Ada' }], [G, { name: 'Gus' }]]);
  const campus = createCampusLeases({ worldId: 'river-oaks', operators: [OP], players, onAccessEnded: event => events.push(event) });
  const send = (id, message) => { time += 1000; return campus.command({ id }, { type: 'campus', ...message }, time); };
  const issue = (unitId, tenantId, startsAt = time + 2000, endsAt = startsAt + 2 * DAY) => send(OP, { action: 'issue', ...base(), unitId, tenantId, startsAt, endsAt });
  const lease = (id, action, item, more = {}) => send(id, { action, ...base(), leaseId: item.id, expectedVersion: item.version, ...more });
  let one = lease(A, 'accept', issue(U1, A).lease).lease;
  one = lease(A, 'grant', one, { peerId: G }).lease;
  assert.equal(campus.suiteAccess(A, U1, one.startsAt - 1).reason, 'campus_lease_not_started');
  assert.equal(campus.suiteAccess(A, U1, one.endsAt).reason, 'campus_lease_expired', 'access ends at the instant, before any tick');
  campus.prune(one.endsAt + 5000);
  const landing = campusLeaseUnits().find(unit => unit.unitId === U1).landing;
  assert.deepEqual(events, [
    { userId: A, role: 'tenant', unitId: U1, leaseId: one.id, reason: 'expired', landing },
    { userId: G, role: 'guest', unitId: U1, leaseId: one.id, reason: 'expired', landing },
  ]);
  const ended = campus.checkpoint().leases.find(item => item.id === one.id);
  assert.deepEqual([ended.status, ended.endedAt], ['ended', one.endsAt], 'expiry is dated when it was due');
  time = one.endsAt + 10_000;events.length = 0;
  let two = lease(A, 'accept', issue(U2, A).lease).lease;
  two = lease(A, 'grant', two, { peerId: G }).lease;
  two = lease(A, 'ungrant', two, { peerId: G }).lease;
  assert.deepEqual(events.map(event => [event.userId, event.reason]), [[G, 'guest_removed']]);
  lease(OP, 'revoke', two);
  assert.deepEqual(events.map(event => [event.userId, event.reason]), [[G, 'guest_removed'], [A, 'revoked']]);
  events.length = 0;
  const three = lease(A, 'accept', issue(U3, A).lease).lease;
  lease(A, 'release', three);
  assert.deepEqual(events.map(event => [event.userId, event.role, event.reason]), [[A, 'tenant', 'released']]);
  events.length = 0;
  const pendingOffer = issue(U1, G).lease;
  const asked = send(A, { action: 'request', ...base(), unitId: U2, startsAt: time + HOUR, endsAt: time + DAY });
  campus.prune(time + CAMPUS_LEASE_LIMITS.offerTtlMs);
  campus.prune(time + CAMPUS_LEASE_LIMITS.requestTtlMs);
  const saved = campus.checkpoint();
  assert.equal(saved.leases.find(item => item.id === pendingOffer.id).endedReason, 'offer_expired');
  assert.deepEqual(saved.requests.find(item => item.id === asked.request.id).closedReason, 'expired');
  assert.deepEqual(events, [], 'nobody held access through an offer');
});

test('requests, offers, leases, guests, history and receipts stay bounded', () => {
  let time = T0;
  const campus = createCampusLeases({ worldId: 'river-oaks', operators: [OP] });
  const send = (id, message) => { time += 1000; return campus.command({ id }, { type: 'campus', ...message }, time); };
  const issue = (unitId, tenantId) => send(OP, { action: 'issue', ...base(), unitId, tenantId, startsAt: time + 5000, endsAt: time + 30 * DAY });
  const request = (id, unitId) => send(id, { action: 'request', ...base(), unitId, startsAt: time + HOUR, endsAt: time + 30 * DAY });
  assert.equal(request(A, U1).ok, true);assert.equal(request(A, U2).ok, true);
  assert.equal(request(A, U3).error, 'campus_request_limit');
  for (let i = 0; i < 4; i++) assert.equal(issue(U1, `tenant-${i}`).ok, true);
  assert.equal(issue(U1, 'tenant-4').error, 'campus_offer_limit');
  assert.equal(issue(U2, 'tenant-0').ok, true);
  assert.equal(issue(U3, 'tenant-0').error, 'campus_lease_limit');
  const units = campusLeaseUnits().map(unit => unit.unitId);
  for (let i = 0; i < 150; i++) {
    const offered = issue(units[10 + i % 30], 'churn');
    assert.equal(offered.ok, true, JSON.stringify(offered));
    assert.equal(send(OP, { action: 'revoke', ...base(), leaseId: offered.lease.id, expectedVersion: 1 }).ok, true);
  }
  const saved = campus.checkpoint();
  assert.equal(saved.leases.filter(item => item.status === 'ended').length, CAMPUS_LEASE_LIMITS.endedRetained);
  assert.equal(saved.receipts.length, CAMPUS_LEASE_LIMITS.receipts);
  assert.ok(Buffer.byteLength(JSON.stringify(saved)) < 256 * 1024);
  assert.equal(campus.validate(saved, 13, time).leases.size, saved.leases.length, 'a bounded checkpoint restores');
});

test('Jevica office access and retired workspace identities stay separate from campus tenancy', () => {
  const jevica = JEVICA_ADMIN_USER_IDS[0], workspace = `office-${'b'.repeat(64)}`;
  const f = fixture({ data: district, ids: [OP, jevica, A, G] });
  assert.equal(f.issue(jevica, U1, A).error, 'campus_operator_required', 'the office owner is not a campus operator');
  let lease = f.active(A, U1);
  lease = f.lease(A, 'grant', lease, { peerId: G }).lease;
  const office = id => f.world.command(id, { type: 'office', officeId: 'jevica-office', action: 'enter' });
  assert.equal(office(A).error, 'office_permission_required', 'a campus tenant has no office access');
  assert.equal(office(G).error, 'office_permission_required', 'a campus guest has no office access');
  f.advance(1000);
  assert.equal(f.world.command(jevica, { type: 'office', officeId: 'jevica-office', action: 'invite', peerId: S }).ok, true);
  assert.equal(f.access(S, U1).reason, 'campus_access_required', 'an office invitation grants no suite');
  assert.equal(f.access(A, workspace).reason, 'campus_unknown_unit');
  assert.equal(f.access(jevica, U1).reason, 'campus_access_required');
});

test('v13 checkpoints restore leases, guests, requests and receipts; replays survive the restore', () => {
  const f = fixture();
  let lease = f.active(A, U1);
  lease = f.lease(A, 'grant', lease, { peerId: G }).lease;
  const asked = f.request(B, U2), offer = f.issue(OP, U3, B);
  const retry = { action: 'grant', ...base(), leaseId: lease.id, expectedVersion: lease.version, peerId: S };
  assert.equal(f.send(A, retry).ok, true);
  const saved = f.world.checkpoint();
  assert.equal(saved.version, 13);
  assert.deepEqual(Object.keys(saved.payload.campus), ['serial', 'leases', 'requests', 'receipts']);
  const next = fixture({ clock: f.state });
  assert.equal(next.world.restore(saved).ok, true);
  for (const id of [A, G, S, B]) assert.deepEqual(next.access(id, U1), f.access(id, U1), id);
  assert.deepEqual(next.list(B).campus.requests.map(item => item.id), [asked.request.id]);
  assert.deepEqual(next.list(B).campus.leases.map(item => [item.id, item.status]), [[offer.lease.id, 'offered']]);
  const replay = next.send(A, retry);
  assert.deepEqual([replay.ok, replay.replayed], [true, true], 'a retry through the replacement applies once');
  assert.equal(next.list(A).campus.leases[0].guests.length, 2);
  assert.deepEqual(next.world.snapshot().campus, f.world.snapshot().campus);
});

test('supported v12 checkpoints restore with no campus; campus data cannot masquerade as an older version', () => {
  const f = fixture(), empty = f.world.checkpoint();
  const v12 = structuredClone(empty);v12.version = 12;delete v12.payload.campus;resign(v12);
  const target = fixture();
  assert.equal(target.world.restore(v12).ok, true);
  assert.deepEqual(target.world.snapshot().campus.leased, []);
  const blankV12 = structuredClone(empty);blankV12.version = 12;resign(blankV12);
  assert.equal(target.world.restore(blankV12).ok, true, 'an empty section is the same as none');
  f.active(A, U1);
  const leased = f.world.checkpoint();
  const masquerade = structuredClone(leased);masquerade.version = 12;resign(masquerade);
  assert.equal(target.world.restore(masquerade).ok, false, 'a lease cannot ride in a v12 checkpoint');
  const missing = structuredClone(leased);delete missing.payload.campus;resign(missing);
  assert.equal(target.world.restore(missing).ok, false, 'v13 requires the campus section');
  assert.equal(target.access(A, U1).reason, 'campus_unit_not_leased');
});

test('garbled campus state fails the restore closed and leaves the live world authoritative', () => {
  const f = fixture();
  let lease = f.active(A, U1);
  lease = f.lease(A, 'grant', lease, { peerId: G }).lease;
  f.issue(OP, U2, B);f.request(B, U3);
  const good = f.world.checkpoint();
  const live = fixture({ clock: f.state });
  assert.equal(live.world.restore(good).ok, true);
  const before = live.world.snapshot();
  const corrupt = [
    campus => { campus.leases.push({ ...structuredClone(campus.leases[0]), id: `lease-${campus.serial + 1}` });campus.serial++; },
    campus => { campus.leases[0].charge = 'usd'; },
    campus => { campus.leases[0].price = 1200; },
    campus => { campus.leases[0].mode = 'paid'; },
    campus => { campus.leases[0].operatorId = campus.leases[0].tenantId; },
    campus => { campus.leases[0].status = 'paid'; },
    campus => { campus.leases[0].endedReason = 'released'; },
    campus => { campus.leases[0].guests.push({ userId: A, name: 'self', grantedAt: T0 }); },
    campus => { campus.leases.find(item => item.status === 'offered').guests.push({ userId: S, name: S, grantedAt: T0 }); },
    campus => { campus.serial = 1; },
    campus => { campus.requests[0].status = 'approved'; },
    campus => { campus.receipts[0].digest = 'nope'; },
    campus => { campus.leases[0].contract = { id: CAMPUS_LEASE_CONTRACT.id, layout: 3 }; },
    campus => { campus.extra = []; },
    campus => { campus.leases = Array.from({ length: 400 }, () => campus.leases[0]); },
  ];
  for (const [index, change] of corrupt.entries()) {
    const bad = structuredClone(good);change(bad.payload.campus);resign(bad);
    assert.equal(live.world.restore(bad).ok, false, `variant ${index}`);
    assert.deepEqual(live.world.snapshot(), before, `variant ${index} leaves the world unchanged`);
    assert.equal(live.access(G, U1).ok, true);
  }
});

test('a lease on a retired unit or incompatible contract ends on restore instead of granting access', () => {
  const f = fixture();
  f.active(A, U1);f.active(B, U2);f.request(G, U3);
  const saved = f.world.checkpoint(), campus = saved.payload.campus;
  campus.leases.find(item => item.unitId === U1).contract.units = 2;
  campus.leases.find(item => item.unitId === U2).unitId = 'T2-F9-E-N';
  campus.requests[0].contract.layout = '4.0';
  resign(saved);
  const next = fixture({ clock: f.state });
  assert.equal(next.world.restore(saved).ok, true);
  assert.equal(next.access(A, U1).reason, 'campus_unit_not_leased');
  assert.equal(next.access(B, U2).reason, 'campus_unit_not_leased');
  assert.deepEqual(next.list(A).campus.leases.map(item => [item.status, item.endedReason]), [['ended', 'retired']]);
  assert.deepEqual(next.list(G).campus.requests.map(item => item.status), ['retired']);
  assert.deepEqual(next.world.snapshot().campus.leased, []);
  const again = next.world.checkpoint();
  assert.equal(fixture({ clock: f.state }).world.restore(again).ok, true, 'the retired state is itself a valid checkpoint');
});

// #512 switches RIVER_OAKS_DISTRICT_REVISION between the garage and the campus on the same
// code; its recovery re-signs the checkpoint for the other district, as refit does here.
const refit = (saved, data) => { saved.worldFingerprint = createHash('sha256').update(JSON.stringify(data)).digest('hex');return resign(saved); };
test('a district without the campus keeps the section inert byte for byte; serving it again honours the leases and expires lapsed ones', () => {
  const clock = { time: T0 }, campus = fixture({ clock });
  let lease = campus.active(A, U1);
  lease = campus.lease(A, 'grant', lease, { peerId: G }).lease;
  const startsAt = clock.time + 1000, short = campus.issue(OP, U2, B, { startsAt, endsAt: startsAt + 2 * DAY }).lease;
  campus.advance(2000);assert.equal(campus.lease(B, 'accept', short).ok, true);
  const asked = campus.request(S, U3), offer = campus.issue(OP, U3, G);
  const saved = campus.world.checkpoint(), section = JSON.stringify(saved.payload.campus);
  // (a) The garage district restores the campus section without refusing it.
  const inert = fixture({ data: garage, clock });
  assert.equal(inert.world.restore(refit(structuredClone(saved), garage)).ok, true);
  // (b) It writes the section back exactly as it was.
  assert.equal(JSON.stringify(inert.world.checkpoint().payload.campus), section);
  // (c) No access, no units, no commands and no expiry while the campus is absent.
  assert.equal(inert.world.snapshot().campus, undefined);
  assert.equal(inert.list(A).error, 'campus_unavailable');
  assert.equal(inert.issue(OP, U3, B).error, 'campus_unavailable');
  for (const [id, unitId] of [[A, U1], [G, U1], [B, U2]]) assert.deepEqual(inert.access(id, unitId), { ok: false, reason: 'campus_unavailable' });
  assert.deepEqual(inert.world.campusAccess(A), []);
  inert.advance(3 * DAY);
  for (let i = 0; i < 3; i++) inert.world.step(0.1);
  assert.equal(JSON.stringify(inert.world.checkpoint().payload.campus), section, 'nothing expired or was evicted while inert');
  // (d) Served again, the leases are honoured and the one past its end expires on the first tick.
  const back = fixture({ clock });
  assert.equal(back.world.restore(refit(inert.world.checkpoint(), small)).ok, true);
  assert.deepEqual([back.access(A, U1).role, back.access(G, U1).role], ['tenant', 'guest']);
  assert.equal(back.access(B, U2).reason, 'campus_lease_expired', 'a lapsed lease admits nobody even before the tick');
  back.world.step(0.1);
  const lapsed = back.list(B).campus.leases.find(item => item.id === short.id);
  assert.deepEqual([lapsed.status, lapsed.endedReason, lapsed.endedAt], ['ended', 'expired', short.endsAt]);
  assert.deepEqual(back.world.snapshot().campus.leased, [U1]);
  assert.equal(back.list(S).campus.requests.find(item => item.id === asked.request.id).status, 'pending');
  assert.equal(back.lease(G, 'accept', offer.lease).ok, true, 'an offer inside its 7 days still stands');
});

test('operator authority comes from the running configuration, never from the checkpoint', () => {
  const f = fixture({ ids: [OP, 'operator-2', A, B] });
  const active = f.active(A, U1), offer = f.issue(OP, U2, B);
  const saved = f.world.checkpoint();
  const replaced = fixture({ operators: ['operator-2'], ids: [OP, 'operator-2', A, B], clock: f.state });
  assert.equal(replaced.world.restore(saved).ok, true);
  assert.equal(replaced.lease(B, 'accept', offer.lease).error, 'campus_operator_retired');
  assert.equal(replaced.access(A, U1).ok, true, 'an accepted lease keeps its dates');
  assert.equal(replaced.issue(OP, U3, B).error, 'campus_operator_required', 'a removed operator cannot act');
  assert.equal(replaced.lease('operator-2', 'revoke', active).ok, true);
  const paused = fixture({ operators: [], ids: [OP, A, B], clock: f.state });
  assert.equal(paused.world.restore(saved).ok, true);
  assert.equal(paused.world.snapshot().campus.leasing, 'closed');
  assert.equal(paused.access(A, U1).ok, true);
  assert.equal(paused.lease(B, 'accept', offer.lease).error, 'campus_leasing_closed');
  assert.equal(paused.lease(A, 'release', active).ok, true, 'a tenant can always release');
});
