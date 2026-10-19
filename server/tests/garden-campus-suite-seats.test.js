// Suite seats on the campus floors (#510 on #508's levels, #509's leases): a tenant rides to
// Floor 2, walks through T1-201's door to its desk, sits and has a workstation; a stranger is
// refused the door and the desk; revoking the lease walks the seated tenant out to the gallery
// side of the door; a seated tenant is restored standing at the desk's stand point.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadDistrictData } from '../district-data.js';
import { createSharedWorld } from '../world.js';
import { createWalkingEnvironment } from '../../preview/src/walking.js';
import { DISTRICT_REVISION_GARDENS, campusSuiteSeatSites } from '../../preview/src/garden-campus-district.js';
import { CAMPUS_LEASE_CONTRACT } from '../../shared/garden-campus-lease-contract.js';
import { campusLevels, campusToSource, campusUnitInventory, sourceToCampus } from '../../shared/garden-campus-layout.js';

const campus = await loadDistrictData({ districtRevision: DISTRICT_REVISION_GARDENS }), DAY = 86400000;
const source = ([u, v]) => campusToSource([u, v]).slice(0, 2), L = index => `garden-campus/l${index}`;
const environments = new Map(), environmentFor = levelId => { if (!environments.has(levelId ?? '')) environments.set(levelId ?? '', createWalkingEnvironment(campus, [], levelId ?? null));return environments.get(levelId ?? ''); };
const UNIT = 'T1-F2-W-S', door = campusUnitInventory().find(unit => unit.id === UNIT).door;
const desk = campusSuiteSeatSites(campus).find(seat => seat.unitId === UNIT && seat.kind === 'desk' && seat.workstation);
let serial = 0;
const base = () => ({ operationId: `op-${String(++serial).padStart(6, '0')}`, worldId: 'river-oaks', contract: { ...CAMPUS_LEASE_CONTRACT } });

function town() {
  const clock = { time: Date.UTC(2026, 9, 18, 15) };
  const world = createSharedWorld(campus, { now: () => clock.time, campusOperators: ['op'] });
  for (const id of ['op', 'tenant', 'stranger']) assert.equal(world.join({ userId: id, name: id }).ok, true);
  const command = (userId, message) => { clock.time += 150;return world.command(userId, message); };
  const player = userId => world.snapshot().players.find(p => p.id === userId);
  const campusCommand = (userId, message) => { clock.time += 500;return world.command(userId, { type: 'campus', ...message }); };
  function walk(userId, points) {
    let at = player(userId).position;
    for (const point of points) {
      const [x, n] = source(point), count = Math.max(1, Math.ceil(Math.hypot(x - at[0], n - at[1]) / 0.12));
      for (let i = 1; i <= count; i++) {
        const self = player(userId), e = at[0] + (x - at[0]) * i / count, m = at[1] + (n - at[1]) * i / count;
        const moved = command(userId, { type: 'pose', position: [e, m, environmentFor(self.levelId).groundAt(e, -m)], yaw: 0, altitude: 0, ...(self.levelId ? { levelId: self.levelId } : {}) });
        if (!moved.ok) return { ok: false, error: moved.error, at: point };
      }
      at = [x, n];
    }
    return { ok: true };
  }
  // T1's hall, its lift to Floor 2, and the spine to just outside T1-201's door.
  function toSuiteDoor(userId) {
    assert.equal(command(userId, { type: 'travel', storeId: 'campus:T1-F1-hall', mode: 'enter' }).ok, true);
    clock.time += 1500;
    assert.deepEqual(walk(userId, [[11.6, 56.3]]), { ok: true });
    assert.equal(command(userId, { type: 'interiorLevel', portalId: 'T1-F1/lift-up' }).player.levelId, L(1));
    clock.time += 400;
    assert.deepEqual(walk(userId, [[12, 57.5], [16, 57.5], [16, door[1]]]), { ok: true }, `${userId} to T1-201's door`);
  }
  function lease(tenantId) {
    const offered = campusCommand('op', { action: 'issue', ...base(), unitId: UNIT, tenantId, startsAt: clock.time + 1000, endsAt: clock.time + 30 * DAY });
    assert.equal(offered.ok, true, JSON.stringify(offered));
    clock.time += 2000;
    const accepted = campusCommand(tenantId, { action: 'accept', ...base(), leaseId: offered.lease.id, expectedVersion: offered.lease.version });
    assert.equal(accepted.ok, true, JSON.stringify(accepted));
    return accepted.lease;
  }
  return { world, clock, command, player, walk, toSuiteDoor, lease, campusCommand };
}

test('a tenant enters their suite by its door, sits at its desk and has a workstation; a stranger has neither', () => {
  const t = town(), held = t.lease('tenant');
  t.toSuiteDoor('tenant');t.toSuiteDoor('stranger');
  assert.equal(t.walk('stranger', [[13.4, door[1]]]).error, 'private_suite', 'the door admits only the lease');
  assert.deepEqual(t.walk('tenant', [[13.4, door[1]], sourceToCampus(desk.stand)]), { ok: true }, 'through the door to the desk');
  assert.equal(t.command('stranger', { type: 'sit', buildId: desk.buildId, slot: 0 }).error, 'campus_seat_out_of_reach', 'not from the corridor');
  const sat = t.command('tenant', { type: 'sit', buildId: desk.buildId, slot: 0 });
  assert.equal(sat.ok, true, sat.error);
  assert.deepEqual([sat.player.sitting.buildId, sat.player.levelId, t.world.campusWorkstation('tenant'), t.world.campusWorkstation('stranger')], [desk.buildId, L(1), true, false]);
  assert.ok(Math.abs(sat.player.position[2] - (campusToSource([0, 0, campusLevels()[1].z])[2])) < 1e-9, 'seated on Floor 2');
  assert.equal(t.command('tenant', { type: 'pose', position: sat.player.position, yaw: 0, altitude: 0, levelId: L(1) }).ok, true, 'a still pose is fine');
  assert.equal(t.command('tenant', { type: 'interiorLevel', portalId: 'T1-F2/lift-up' }).error, 'level_requires_walking');
  const stood = t.command('tenant', { type: 'stand' });
  assert.deepEqual([stood.ok, stood.player.sitting], [true, null]);
  assert.ok(Math.hypot(stood.player.position[0] - desk.stand[0], stood.player.position[1] - desk.stand[1]) < 1e-6, 'up at the stand point');
  assert.equal(t.world.campusWorkstation('tenant'), false);
  assert.ok(held.id);
});

test('revoking the lease walks a seated tenant out of the suite to the gallery side of its door', () => {
  const t = town(), held = t.lease('tenant');
  t.toSuiteDoor('tenant');
  assert.deepEqual(t.walk('tenant', [[13.4, door[1]], sourceToCampus(desk.stand)]), { ok: true });
  assert.equal(t.command('tenant', { type: 'sit', buildId: desk.buildId, slot: 0 }).ok, true);
  const revoked = t.campusCommand('op', { action: 'revoke', ...base(), leaseId: held.id, expectedVersion: held.version });
  assert.equal(revoked.ok, true, JSON.stringify(revoked));
  const out = t.player('tenant'), [u, v] = sourceToCampus([out.position[0], out.position[1]]);
  assert.deepEqual([out.sitting, out.levelId, t.world.campusWorkstation('tenant')], [null, L(1), false]);
  assert.ok(u > 14.5 && Math.abs(v - door[1]) < 0.5, `outside T1-201's door on the spine, at [${u.toFixed(2)}, ${v.toFixed(2)}]`);
  assert.equal(t.walk('tenant', [[13.4, door[1]]]).error, 'private_suite', 'and the door no longer admits them');
});

test('a seated tenant is restored standing at the desk’s stand point, inside the suite', () => {
  const t = town();t.lease('tenant');
  t.toSuiteDoor('tenant');
  assert.deepEqual(t.walk('tenant', [[13.4, door[1]], sourceToCampus(desk.stand)]), { ok: true });
  assert.equal(t.command('tenant', { type: 'sit', buildId: desk.buildId, slot: 0 }).ok, true);
  const again = createSharedWorld(campus, { now: () => t.clock.time + 1000, campusOperators: ['op'] });
  assert.deepEqual(again.restore(t.world.checkpoint()), { ok: true });
  const restored = again.snapshot().players.find(p => p.id === 'tenant');
  assert.deepEqual([restored.sitting, restored.levelId], [null, L(1)]);
  assert.ok(Math.hypot(restored.position[0] - desk.stand[0], restored.position[1] - desk.stand[1]) < 1e-6);
});
