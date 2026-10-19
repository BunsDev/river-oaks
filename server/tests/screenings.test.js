import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createSharedWorld } from '../world.js';
import { parseScreeningHosts } from '../screenings.js';
import { createWalkingEnvironment } from '../../preview/src/walking.js';
import { SCREENING_MEDIA } from '../../preview/src/screening-contract.js';

const data = JSON.parse(readFileSync(new URL('../../preview/public/data/district.json', import.meta.url)));
const ipic = createWalkingEnvironment(data).rooms.find(room => room.interior === 'ipic-photo-v1');
const FILM = SCREENING_MEDIA['ipic-fixture-v1'];
const VIEW_KEYS = ['anchorServerTimeMs', 'durationMs', 'epoch', 'hostId', 'mediaId', 'positionMs', 'revision', 'screeningId', 'status', 'venueId'];

// A town with an IPIC host grant, a viewer, an admin without a grant, and a granted host on the street.
function fixture({ hosts = [{ venueId: 'ipic', userId: 'host' }, { venueId: 'ipic', userId: 'street-host' }], restore, at = 1_000_000 } = {}) {
  const clock = { time: at };
  const town = createSharedWorld(data, { now: () => clock.time, isAdmin: id => id === 'admin', screeningHosts: hosts });
  if (restore) assert.deepEqual(town.restore(restore), { ok: true });
  else {
    for (const id of ['host', 'viewer', 'admin', 'street-host']) town.join({ userId: id, name: id });
    for (const id of ['host', 'viewer', 'admin']) assert.equal(town.command(id, { type: 'travel', storeId: ipic.storeId, mode: 'enter' }).ok, true, id);
  }
  let op = 0;
  const f = {
    town, clock,
    tick(ms) { clock.time += ms; town.step(ms / 1000); },
    view: () => town.snapshot().screenings.find(item => item.venueId === 'ipic'),
    send(userId, action, more = {}, { sessionId = `${userId}-session` } = {}) {
      clock.time += 600; // stay inside the command ledger's refill rate
      const current = f.view();
      return town.command(userId, { type: 'screening', action, venueId: 'ipic', epoch: current.epoch, expectedRevision: current.revision, operationId: `op-${String(++op).padStart(6, '0')}`, ...more }, { sessionId });
    },
  };
  return f;
}
const start = (f, userId = 'host') => f.send(userId, 'start', { mediaId: FILM.id });

test('the world exposes its server clock and one stopped IPIC timeline with only public fields', () => {
  const f = fixture(), snapshot = f.town.snapshot();
  assert.equal(f.town.serverTime(), f.clock.time, 'transports stamp frames with the clock that anchors screenings');
  assert.equal(snapshot.screenings.length, 1);
  const view = f.view();
  assert.deepEqual(Object.keys(view).sort(), VIEW_KEYS);
  assert.equal(view.status, 'stopped');
  assert.equal(view.revision, 0);
  assert.equal(view.mediaId, null);
  assert.match(view.epoch, /^[A-Za-z0-9_-]{8,64}$/);
});

test('viewers, an admin without a grant, an absent grant and a host outside the venue cannot control playback', () => {
  const f = fixture(), before = f.view();
  assert.equal(start(f, 'viewer').error, 'screening_host_required');
  assert.equal(start(f, 'admin').error, 'screening_host_required', 'office ownership and admin status are not a venue grant');
  assert.equal(start(f, 'street-host').error, 'screening_not_in_venue');
  const nobody = fixture({ hosts: [] });
  assert.equal(start(nobody).error, 'screening_host_required', 'no grant configured fails closed');
  assert.deepEqual(f.view(), before);
  // Sitting in a recliner is not a grant either.
  assert.equal(f.town.command('viewer', { type: 'screening', action: 'sync', venueId: 'ipic' }).canHost, false);
  assert.equal(f.town.command('host', { type: 'screening', action: 'sync', venueId: 'ipic' }).canHost, true);
});

test('a host starts, pauses and resumes one server-anchored timeline that everyone reads', () => {
  const f = fixture();
  const started = start(f);
  assert.equal(started.ok, true, started.error);
  assert.equal(started.serverTimeMs, f.clock.time);
  const t0 = f.clock.time;
  let view = f.view();
  assert.deepEqual({ status: view.status, positionMs: view.positionMs, anchor: view.anchorServerTimeMs, duration: view.durationMs, host: view.hostId, revision: view.revision },
    { status: 'playing', positionMs: 0, anchor: t0, duration: FILM.durationMs, host: 'host', revision: 1 });
  assert.match(view.screeningId, /^ipic-/);
  f.tick(2500);
  const paused = f.send('host', 'pause');
  assert.equal(paused.ok, true, paused.error);
  view = f.view();
  assert.equal(view.status, 'paused');
  assert.equal(view.positionMs, f.clock.time - t0, 'pause lands on the server-computed position');
  const pausedAt = view.positionMs;
  f.tick(5000);
  assert.equal(f.view().positionMs, pausedAt, 'a paused film does not advance');
  assert.equal(f.send('host', 'play').ok, true);
  assert.equal(f.view().positionMs, pausedAt);
  assert.equal(f.view().anchorServerTimeMs, f.clock.time);
  assert.equal(f.send('host', 'play').error, 'screening_not_paused');
  assert.equal(f.send('host', 'start', { mediaId: FILM.id }).error, 'screening_in_progress');
});

test('a retried operation has one effect, and a reused id with another payload is refused', () => {
  const f = fixture();
  const message = { type: 'screening', action: 'start', venueId: 'ipic', epoch: f.view().epoch, expectedRevision: 0, operationId: 'retry-000001', mediaId: FILM.id };
  const first = f.town.command('host', message, { sessionId: 's1' });
  assert.equal(first.ok, true);
  f.clock.time += 600;
  const again = f.town.command('host', message, { sessionId: 's1' });
  assert.equal(again.ok, true);
  assert.equal(again.replayed, true);
  assert.equal(f.view().revision, 1, 'the retry did not apply twice');
  f.clock.time += 600;
  assert.equal(f.town.command('host', { ...message, action: 'stop', mediaId: undefined }, { sessionId: 's1' }).error, 'invalid_screening');
  const { mediaId, ...stop } = message;
  assert.equal(f.town.command('host', { ...stop, action: 'stop' }, { sessionId: 's1' }).error, 'screening_operation_conflict');
  // The same id from another session is a different operation, checked against the current revision.
  f.clock.time += 600;
  assert.equal(f.town.command('host', message, { sessionId: 's2' }).error, 'screening_stale');
  assert.equal(f.view().status, 'playing');
});

test('stale revisions and earlier epochs cannot rewind a newer timeline', () => {
  const f = fixture();
  const old = f.view();
  assert.equal(start(f).ok, true);
  f.tick(1000);
  assert.equal(f.send('host', 'pause').ok, true);
  const stale = f.town.command('host', { type: 'screening', action: 'stop', venueId: 'ipic', epoch: old.epoch, expectedRevision: 1, operationId: 'stale-000001' });
  assert.equal(stale.error, 'screening_stale');
  assert.equal(f.view().status, 'paused');
  f.town.reset();
  const reset = f.view();
  assert.equal(reset.status, 'stopped');
  assert.notEqual(reset.epoch, old.epoch);
  assert.ok(reset.revision > 2, 'revision never decreases');
  const prior = f.town.command('host', { type: 'screening', action: 'start', venueId: 'ipic', epoch: old.epoch, expectedRevision: reset.revision, operationId: 'prior-000001', mediaId: FILM.id });
  assert.equal(prior.error, 'screening_stale');
  assert.equal(f.view().status, 'stopped');
});

test('the film ends at its duration, an explicit start replays it, and stop resets it', () => {
  const f = fixture();
  assert.equal(start(f).ok, true);
  const anchor = f.view().anchorServerTimeMs;
  f.tick(FILM.durationMs + 5000);
  const ended = f.view();
  assert.equal(ended.status, 'ended');
  assert.equal(ended.positionMs, FILM.durationMs);
  assert.equal(ended.anchorServerTimeMs, anchor + FILM.durationMs);
  assert.equal(f.send('host', 'pause').error, 'screening_not_playing');
  assert.equal(start(f).ok, true, 'replay is an explicit new start');
  assert.equal(f.view().positionMs, 0);
  assert.equal(f.send('host', 'stop').ok, true);
  assert.deepEqual([f.view().status, f.view().positionMs, f.view().hostId], ['stopped', 0, null]);
});

// The host's film choice (#499): Start carries the chosen allowlisted id, and nothing else picks it.
test('after film A ends the host starts film B by id; the server takes its duration, and refuses ids it does not allowlist', () => {
  const ORIGINAL = SCREENING_MEDIA['ipic-original-v1'], f = fixture();
  assert.equal(f.send('host', 'start', { mediaId: ORIGINAL.id }).ok, true);
  f.tick(ORIGINAL.durationMs + 1000);
  assert.deepEqual([f.view().status, f.view().mediaId], ['ended', ORIGINAL.id], 'the ended snapshot still names film A');
  const before = f.view();
  for (const mediaId of ['ipic-unknown-v9', undefined, '', 'https://example.com/film.mp4', '../ipic-original-v1', 'IPIC-ORIGINAL-V1', 'constructor', '__proto__'])
    assert.equal(f.send('host', 'start', mediaId === undefined ? {} : { mediaId }).error, 'invalid_screening', `refused: ${mediaId}`);
  assert.deepEqual(f.view(), before, 'a refused choice changes nothing');
  const started = f.send('host', 'start', { mediaId: FILM.id });
  assert.equal(started.ok, true);
  assert.deepEqual([f.view().mediaId, f.view().durationMs, f.view().positionMs, f.view().status], [FILM.id, FILM.durationMs, 0, 'playing'], 'film B, with its own allowlisted duration');
  // A client cannot attach a duration, a URL or an approval to its choice.
  const current = f.view();
  for (const extra of [{ durationMs: 1 }, { src: '/x.mp4' }, { approved: true }])
    assert.equal(f.town.command('host', { type: 'screening', action: 'start', venueId: 'ipic', epoch: current.epoch, expectedRevision: current.revision, operationId: 'op-extra-0001', mediaId: ORIGINAL.id, ...extra }, { sessionId: 'host-session' }).error, 'invalid_screening');
});

test('two hosts racing to start different films: one wins, the other is stale and must sync', () => {
  const ORIGINAL = SCREENING_MEDIA['ipic-original-v1'];
  const f = fixture({ hosts: [{ venueId: 'ipic', userId: 'host' }, { venueId: 'ipic', userId: 'viewer' }] });
  const seen = f.view();
  const ask = (userId, mediaId, operationId) => { f.clock.time += 600; return f.town.command(userId, { type: 'screening', action: 'start', venueId: 'ipic', epoch: seen.epoch, expectedRevision: seen.revision, operationId, mediaId }, { sessionId: `${userId}-session` }); };
  assert.equal(ask('host', ORIGINAL.id, 'op-race-host-01').ok, true);
  assert.equal(ask('viewer', FILM.id, 'op-race-other-1').error, 'screening_stale', 'the second host saw the old revision');
  assert.equal(f.view().mediaId, ORIGINAL.id, 'the winner’s film plays; nobody overrode it silently');
  // The winner's lost reply, resent with its exact payload, applies once.
  const replay = ask('host', ORIGINAL.id, 'op-race-host-01');
  assert.deepEqual([replay.ok, replay.replayed], [true, true]);
  // The same operation id with another film is a different request, refused rather than mutated.
  assert.equal(ask('host', FILM.id, 'op-race-host-01').error, 'screening_operation_conflict');
});

test('losing the host pauses at the server position: leaving town, walking out, and a lapsed grant', () => {
  const leaving = fixture();
  assert.equal(start(leaving).ok, true);
  const t0 = leaving.clock.time;
  leaving.clock.time += 3000;
  leaving.town.leave('host');
  assert.deepEqual([leaving.view().status, leaving.view().positionMs], ['paused', 3000]);
  leaving.tick(4000);
  assert.equal(leaving.view().positionMs, 3000);
  assert.equal(leaving.view().anchorServerTimeMs, t0 + 3000);

  const walking = fixture();
  assert.equal(start(walking).ok, true);
  walking.clock.time += 600;
  assert.equal(walking.town.command('host', { type: 'travel', storeId: ipic.storeId, mode: 'leave' }).ok, true);
  walking.tick(50);
  assert.equal(walking.view().status, 'paused');

  const lapsing = fixture({ hosts: [{ venueId: 'ipic', userId: 'host', until: 1_000_000 + 10_000 }] });
  assert.equal(start(lapsing).ok, true);
  lapsing.tick(11_000);
  assert.equal(lapsing.view().status, 'paused');
  assert.equal(lapsing.view().positionMs, 10_000 - 600, 'paused at the instant the grant lapsed, not when a tick noticed');
  assert.equal(lapsing.view().anchorServerTimeMs, 1_000_000 + 10_000);
  assert.equal(lapsing.send('host', 'play').error, 'screening_host_required');
});

test('a checkpoint keeps playing across a quick handoff and pauses after an outage', () => {
  const f = fixture();
  assert.equal(start(f).ok, true);
  f.tick(2000);
  const saved = f.town.checkpoint();
  assert.ok(saved.version >= 9, 'screenings persist from checkpoint v9');
  const quick = fixture({ restore: saved, at: f.clock.time + 3000 });
  assert.equal(quick.view().status, 'playing', 'a lease handoff keeps the shared film running');
  assert.equal(quick.view().anchorServerTimeMs, f.view().anchorServerTimeMs);
  const outage = fixture({ restore: saved, at: f.clock.time + 60_000 });
  assert.deepEqual([outage.view().status, outage.view().positionMs], ['paused', 2000], 'an outage never jumps the film forward');
});

test('a restored checkpoint with a forged timeline fails closed', () => {
  const f = fixture();
  assert.equal(start(f).ok, true);
  const good = f.town.checkpoint();
  const forged = [
    s => { s.venues[0].positionMs = Number.MAX_VALUE; },
    s => { s.venues[0].durationMs = 1; },
    s => { s.venues[0].mediaId = 'https://example.com/film.mp4'; },
    s => { s.venues[0].status = 'rewinding'; },
    s => { s.venues[0].revision = -1; },
    s => { s.venues[0].venueId = 'elsewhere'; },
    s => { s.venues[0].note = 'private desk text'; },
    s => { s.receipts = Array.from({ length: 65 }, (_, i) => ({ key: `k${i}`, digest: 'a'.repeat(64), reply: {} })); },
    s => { s.epoch = ''; },
  ];
  for (const mutate of forged) {
    const town = createSharedWorld(data, { now: () => f.clock.time, screeningHosts: [] });
    const copy = structuredClone(good);
    mutate(copy.payload.screenings);
    // Re-sign so only the screening validator can refuse it.
    assert.equal(town.restore(resealed(copy)).ok, false, String(mutate));
  }
});

test('host grants parse strictly and grant nothing when malformed', () => {
  assert.deepEqual(parseScreeningHosts(''), []);
  assert.deepEqual(parseScreeningHosts('ipic:user_1, ipic:user_2@2026-12-01T00:00:00Z'), [
    { venueId: 'ipic', userId: 'user_1', until: null },
    { venueId: 'ipic', userId: 'user_2', until: Date.parse('2026-12-01T00:00:00Z') },
  ]);
  assert.deepEqual(parseScreeningHosts('lobby:user_1,ipic:,ipic:user@not-a-date,:user,ipic:a:b'), []);
});

// Recompute the checkpoint checksum the way the world signs it, so a test can
// prove the screening validator, not the checksum, refuses a forged record.
function resealed(checkpoint) {
  const { checksum, ...envelope } = checkpoint;
  return { ...envelope, checksum: createHash('sha256').update(JSON.stringify(envelope)).digest('hex') };
}

test('the historical 12-second fixture resets only screening state and fences old replies on restore', () => {
  for (const status of ['playing', 'paused', 'ended', 'stopped']) {
    const f = fixture();
    assert.equal(start(f).ok, true);
    if (status === 'paused') assert.equal(f.send('host', 'pause').ok, true);
    if (status === 'ended') f.tick(FILM.durationMs);
    if (status === 'stopped') assert.equal(f.send('host', 'stop').ok, true);
    const saved = f.town.checkpoint();
    // Rebuild the exact pre-#398 media contract; no Git history needed in CI.
    // #398 reused this id for the bundled 30-second clip.
    for (const item of [saved.payload.screenings.venues[0], ...saved.payload.screenings.receipts.map(r => r.reply.screening)]) {
      if (item.mediaId === FILM.id) {
        item.durationMs = 12_000;
        if (item.status === 'ended') item.positionMs = 12_000;
      }
    }
    const old = resealed(saved), retained = structuredClone(old);
    const restored = fixture({ restore: old, at: f.clock.time });
    assert.equal(restored.view().status, 'stopped', status);
    assert.notEqual(restored.view().epoch, old.payload.screenings.epoch, status);
    assert.equal(restored.view().revision, old.payload.screenings.venues[0].revision + 1);
    assert.equal(restored.town.checkpoint().payload.screenings.receipts.length, 0);
    assert.deepEqual(restored.town.snapshot().players, f.town.snapshot().players);
    const retry = { type: 'screening', action: 'start', venueId: 'ipic', mediaId: FILM.id,
      epoch: old.payload.screenings.epoch, expectedRevision: 0, operationId: 'op-000001' };
    assert.equal(restored.town.command('host', retry, { sessionId: 'host-session' }).error, 'screening_stale');
    assert.equal(start(restored).ok, true);
    assert.equal(restored.view().durationMs, FILM.durationMs);
    assert.deepEqual(old, retained, 'migration does not mutate its input');
  }
});

test('historical fixture migration still rejects corrupt timelines and receipts', () => {
  const f = fixture(); assert.equal(start(f).ok, true);
  const saved = f.town.checkpoint();
  saved.payload.screenings.venues[0].durationMs = 12_000;
  saved.payload.screenings.receipts[0].reply.screening.durationMs = 12_000;
  for (const mutate of [
    s => { s.venues[0].durationMs = 12_001; },
    s => { s.venues[0].positionMs = 12_001; },
    s => { s.venues[0].status = 'ended'; s.venues[0].positionMs = 1; },
    s => { s.venues[0].mediaId = 'unknown-legacy-media'; },
    s => { s.receipts[0].reply.screening.positionMs = 12_001; },
    s => { s.receipts[0].reply.screening.epoch = 'other-epoch'; },
  ]) {
    const bad = structuredClone(saved); mutate(bad.payload.screenings);
    const target = createSharedWorld(data);
    assert.equal(target.restore(resealed(bad)).ok, false, String(mutate));
    assert.deepEqual(target.snapshot().players, []);
  }
});

// Rollback compatibility for the two-film milestone (#502): a checkpoint written while hosts switched films keeps
// every media id and duration it names, in the live timeline and in the operation receipts, and restores on this
// build, stopped or playing; a resent start after the restore still applies once.
test('a checkpoint whose timeline and receipts name both films restores, stopped or playing, and retries stay idempotent', () => {
  const ORIGINAL = SCREENING_MEDIA['ipic-original-v1'], f = fixture();
  assert.equal(f.send('host', 'start', { mediaId: ORIGINAL.id }).ok, true);
  f.tick(3000);
  assert.equal(f.send('host', 'stop').ok, true);
  const current = f.view();
  const resend = { type: 'screening', action: 'start', venueId: 'ipic', epoch: current.epoch, expectedRevision: current.revision, operationId: 'op-rollback-01', mediaId: FILM.id };
  f.clock.time += 600;
  assert.equal(f.town.command('host', resend, { sessionId: 'host-session' }).ok, true);
  f.tick(2000);
  const playing = f.town.checkpoint();
  const named = JSON.stringify(playing.screenings ?? playing);
  for (const id of [ORIGINAL.id, FILM.id]) assert.ok(named.includes(id), `the checkpoint keeps ${id}`);
  const restored = fixture({ restore: playing, at: f.clock.time + 2000 });
  assert.deepEqual([restored.view().status, restored.view().mediaId, restored.view().durationMs], ['playing', FILM.id, FILM.durationMs], 'the second film resumes after a quick handoff');
  restored.clock.time += 600;
  const replay = restored.town.command('host', resend, { sessionId: 'host-session' });
  assert.deepEqual([replay.ok, replay.replayed, restored.view().revision], [true, true, f.view().revision], 'a resent start after the restore applies once');
  // Stopped, with receipts naming both films: the stopped venue still restores.
  assert.equal(f.send('host', 'stop').ok, true);
  const stopped = fixture({ restore: f.town.checkpoint(), at: f.clock.time + 60_000 });
  assert.deepEqual([stopped.view().status, stopped.view().mediaId], ['stopped', null]);
});
