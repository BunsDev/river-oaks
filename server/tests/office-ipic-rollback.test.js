import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createSharedWorld } from '../world.js';
import { JEVICA_ADMIN_USER_IDS } from '../admin.js';
import { createWalkingEnvironment } from '../../preview/src/walking.js';
import { SCREENING_MEDIA } from '../../preview/src/screening-contract.js';
import { OFFICE_LAYOUT_LEGACY, OFFICE_LAYOUT_PENTHOUSE, officeLayout, officeSeat } from '../../preview/src/office-layouts.js';

// Retired office configuration must not revive the one-room office. Removing a
// screening host grant remains independent and pauses playback after recovery.
const data = JSON.parse(readFileSync(new URL('../../preview/public/data/district.json', import.meta.url)));
const ipic = createWalkingEnvironment(data).rooms.find(room => room.interior === 'ipic-photo-v1');
const FILM = SCREENING_MEDIA['ipic-fixture-v1'], owner = JEVICA_ADMIN_USER_IDS[0], officeId = 'jevica-office';
const chair = officeSeat(officeLayout(OFFICE_LAYOUT_PENTHOUSE), 'desk-a1-chair');

function town({ officeLayout: layout, hosts, restore, at = 1_000_000 }) {
  const clock = { time: at };
  const world = createSharedWorld(data, { now: () => clock.time, officeLayout: layout, screeningHosts: hosts });
  if (restore) assert.deepEqual(world.restore(restore), { ok: true });
  const send = (user, message) => { clock.time += 1000; return world.command(user, message); };
  const office = (user, action, more = {}) => send(user, { type: 'office', action, officeId, ...more });
  const screening = () => world.snapshot().screenings.find(item => item.venueId === 'ipic');
  const visit = user => world.snapshot().players.find(player => player.id === user)?.office ?? null;
  return { world, clock, send, office, screening, visit };
}

test('retired layout keeps seated penthouse visits while removed host grants pause playback', () => {
  const live = town({ officeLayout: OFFICE_LAYOUT_PENTHOUSE, hosts: [{ venueId: 'ipic', userId: owner }] });
  for (const userId of [owner, 'guest', 'asker']) assert.ok(live.world.join({ userId, name: userId }).ok);
  assert.equal(live.office(owner, 'invite', { peerId: 'guest' }).ok, true);
  assert.equal(live.office('asker', 'request').ok, false);
  const entrance = live.office('guest', 'list').offices[0].entrance;
  assert.equal(live.send('guest', { type: 'travel', position: entrance }).ok, true);
  assert.equal(live.office('guest', 'enter').ok, true);
  // Walk to creative desk 01 and sit.
  let at = live.visit('guest').position;
  for (const to of [[1.8, 2.5], chair.stand]) {
    while (Math.hypot(to[0] - at[0], to[1] - at[1]) > 1e-9) {
      const t = Math.min(1, 2.4 / Math.hypot(to[0] - at[0], to[1] - at[1])), next = [at[0] + (to[0] - at[0]) * t, at[1] + (to[1] - at[1]) * t];
      assert.equal(live.office('guest', 'move', { position: next, yaw: 0, layout: OFFICE_LAYOUT_PENTHOUSE }).ok, true);
      at = next;
    }
  }
  assert.equal(live.office('guest', 'sit', { seatId: chair.id, layout: OFFICE_LAYOUT_PENTHOUSE }).ok, true);
  // Jevica hosts the fixture in IPIC.
  assert.equal(live.send(owner, { type: 'travel', storeId: ipic.storeId, mode: 'enter' }).ok, true);
  const before = live.screening();
  assert.equal(live.send(owner, { type: 'screening', action: 'start', venueId: 'ipic', epoch: before.epoch, expectedRevision: before.revision, operationId: 'rollback-start-01', mediaId: FILM.id }).ok, true);
  live.clock.time += 4000; live.world.step(0.05);
  const saved = live.world.checkpoint(), playing = live.screening();
  assert.equal(saved.version, 12);
  assert.equal(playing.status, 'playing');
  assert.deepEqual(live.visit('guest').seat, { id: chair.id });

  // Roll back: the same current code, the legacy layout, no host grants, restored within the handoff grace.
  const back = town({ officeLayout: OFFICE_LAYOUT_LEGACY, hosts: [], restore: saved, at: live.clock.time + 500 });
  assert.deepEqual(back.visit('guest'), live.visit('guest'), 'penthouse visit and seat survive retired configuration');
  const restored = back.world.checkpoint();
  assert.equal(restored.version, 12, 'the compatible writer is kept');
  assert.deepEqual(restored.payload.offices.grants, saved.payload.offices.grants, 'grants stay');
  assert.deepEqual(restored.payload.offices.requests, [], 'retired requests are not restored');
  back.clock.time += 1000; back.world.step(0.05);
  const paused = back.screening();
  assert.equal(paused.status, 'paused', 'without a host grant the film pauses');
  assert.equal(paused.epoch, playing.epoch, 'the same screening, not a reset');
  assert.ok(paused.positionMs >= 4000 && paused.positionMs <= FILM.durationMs);
  const refused = back.send(owner, { type: 'screening', action: 'play', venueId: 'ipic', epoch: paused.epoch, expectedRevision: paused.revision, operationId: 'rollback-play-01' });
  assert.equal(refused.error, 'screening_host_required', 'nobody can resume it without an explicit grant');
  assert.equal(back.visit('guest').layout, OFFICE_LAYOUT_PENTHOUSE);
  assert.equal(back.office('guest', 'sit', { seatId: chair.id, layout: OFFICE_LAYOUT_LEGACY }).error, 'office_layout_stale');

  // Re-enabling the host changes no office state; invitations carry over.
  const again = town({ officeLayout: OFFICE_LAYOUT_PENTHOUSE, hosts: [{ venueId: 'ipic', userId: owner }], restore: back.world.checkpoint(), at: back.clock.time + 500 });
  assert.deepEqual(again.visit('guest'), back.visit('guest'));
  assert.deepEqual(again.world.checkpoint().payload.offices.grants, saved.payload.offices.grants);
});
