import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createSharedWorld } from '../world.js';
import { JEVICA_ADMIN_USER_IDS } from '../admin.js';
import { OFFICE_LAYOUT_PENTHOUSE } from '../../preview/src/office-layouts.js';

// Walking the penthouse stair (#363 follow-up): the server derives height from the stair run,
// changes floor only where the stair meets one, and never takes a height or floor from a client.
const data = JSON.parse(readFileSync(new URL('../../preview/public/data/district.json', import.meta.url)));
const owner = JEVICA_ADMIN_USER_IDS[0], officeId = 'jevica-office', layout = OFFICE_LAYOUT_PENTHOUSE;
const L0 = 'jevica-office/l0', L1 = 'jevica-office/l1';

function setup(restore) {
  const clock = { time: 10_000 };
  const world = createSharedWorld(data, { now: () => clock.time, officeLayout: layout });
  if (restore) assert.deepEqual(world.restore(restore), { ok: true });
  else for (const userId of [owner, 'guest']) assert.ok(world.join({ userId, name: userId }).ok);
  const send = (user, action, more = {}) => { clock.time += 1000; return world.command(user, { type: 'office', action, officeId, ...more }); };
  const visit = user => world.snapshot().players.find(player => player.id === user)?.office ?? null;
  const enter = user => {
    const office = send(user, 'list').offices[0];
    clock.time += 2000;
    assert.ok(world.command(user, { type: 'travel', position: office.entrance }).ok);
    const entered = send(user, 'enter');
    assert.equal(entered.ok, true, entered.error);
  };
  // Budgeted steps of at most 2.4 m a second, as a client sends them; returns each reply.
  const walk = (user, to, step = 2.4) => {
    const replies = [];
    let at = visit(user).position;
    while (Math.hypot(to[0] - at[0], to[1] - at[1]) > 1e-9) {
      const length = Math.hypot(to[0] - at[0], to[1] - at[1]), t = Math.min(1, step / length);
      const next = [at[0] + (to[0] - at[0]) * t, at[1] + (to[1] - at[1]) * t];
      const moved = send(user, 'move', { position: next, yaw: 0, layout, levelId: visit(user).levelId });
      assert.equal(moved.ok, true, `${user} to ${next}: ${moved.error}`);
      replies.push(moved.office); at = next;
    }
    return replies;
  };
  return { world, clock, send, visit, enter, walk };
}

test('a visitor walks up the stair onto the mezzanine and back down, the server deriving every height', () => {
  const f = setup();
  f.enter(owner);
  f.walk(owner, [11.8, 4.5]);
  const up = f.walk(owner, [11.8, 15.5], 1);
  const heights = up.map(office => office.elevation);
  assert.ok(heights.every((e, i) => i === 0 || e >= heights[i - 1]), `heights only rise: ${heights.join(', ')}`);
  assert.ok(heights.some(e => e > 0.5 && e < 3.3), 'part way up, the visitor stands part way up');
  assert.deepEqual([f.visit(owner).levelId, f.visit(owner).elevation], [L1, 3.8], 'the stair head is the mezzanine');
  f.walk(owner, [11.8, 4]);
  assert.deepEqual([f.visit(owner).levelId, f.visit(owner).elevation], [L0, 0], 'and the foot is the main floor');
});

test('the stair is entered only at its foot or head, and a stale floor is still refused', () => {
  const f = setup();
  f.enter(owner);
  f.walk(owner, [9.3, 1.5]);
  f.walk(owner, [9.3, 9]);
  const before = f.visit(owner);
  assert.equal(f.send(owner, 'move', { position: [11.4, 9], yaw: 0, layout }).error, 'office_blocked', 'no side step onto the flight');
  f.walk(owner, [9.3, 4.5]);
  f.walk(owner, [11.8, 4.5]);
  f.walk(owner, [11.8, 15.5], 1);
  assert.equal(f.send(owner, 'move', { position: [11.8, 15.4], yaw: 0, layout, levelId: L0 }).error, 'office_level_stale', 'the client cannot keep a floor it has left');
  assert.notDeepEqual(f.visit(owner), before);
});

test('a checkpoint taken mid-flight restores the visitor on the stair at the same height', () => {
  const f = setup();
  f.enter(owner);
  f.walk(owner, [11.8, 4.5]);
  f.walk(owner, [11.8, 9.5], 1);
  const mid = f.visit(owner);
  assert.ok(mid.elevation > 1 && mid.elevation < 3, `mid-flight at ${mid.elevation} m`);
  const restored = setup(f.world.checkpoint());
  assert.deepEqual(restored.visit(owner), mid);
});

test('someone on the stair does not stop another visitor taking a desk chair', () => {
  const f = setup();
  f.enter(owner);
  assert.equal(f.send(owner, 'invite', { peerId: 'guest' }).ok, true);
  f.enter('guest');
  f.walk(owner, [11.8, 4.5]);
  f.walk(owner, [11.8, 9], 1);
  f.walk('guest', [3.65, 3.55]);
  const sat = f.send('guest', 'sit', { seatId: 'desk-a1-chair', layout });
  assert.equal(sat.ok, true, sat.error);
});
