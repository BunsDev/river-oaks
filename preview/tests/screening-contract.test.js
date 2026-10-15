import test from 'node:test';
import assert from 'node:assert/strict';
import { IPIC_INTERIOR } from '../src/ipic-plan.js';
import {
  SCREENING_MEDIA, SCREENING_VENUES, parseScreeningCommand, screeningPositionAt, screeningStatusAt,
} from '../src/screening-contract.js';

const control = (action, more = {}) => ({ type: 'screening', action, venueId: 'ipic', epoch: 'e1', expectedRevision: 3, operationId: 'op-123456', ...more });

test('the only venue is the IPIC auditorium and the only media is the bundled fixture', () => {
  assert.deepEqual(Object.keys(SCREENING_VENUES), ['ipic']);
  assert.equal(SCREENING_VENUES.ipic.interior, IPIC_INTERIOR);
  assert.deepEqual(Object.keys(SCREENING_MEDIA), ['ipic-fixture-v1']);
  const fixture = SCREENING_MEDIA['ipic-fixture-v1'];
  assert.equal(fixture.fixture, true);
  assert.deepEqual(fixture.venues, ['ipic']);
  assert.ok(Number.isSafeInteger(fixture.durationMs) && fixture.durationMs > 0 && fixture.durationMs <= 10 * 60_000);
  assert.ok(Object.isFrozen(SCREENING_VENUES) && Object.isFrozen(SCREENING_MEDIA) && Object.isFrozen(fixture) && Object.isFrozen(fixture.venues));
});

test('a control command parses only its own bounded fields', () => {
  assert.deepEqual(parseScreeningCommand(control('start', { mediaId: 'ipic-fixture-v1' })),
    { ok: true, command: { action: 'start', venueId: 'ipic', epoch: 'e1', expectedRevision: 3, operationId: 'op-123456', mediaId: 'ipic-fixture-v1' } });
  for (const action of ['play', 'pause', 'stop']) assert.equal(parseScreeningCommand(control(action)).ok, true, action);
  assert.deepEqual(parseScreeningCommand({ type: 'screening', action: 'sync', venueId: 'ipic' }), { ok: true, command: { action: 'sync', venueId: 'ipic' } });
});

test('viewer-supplied timeline, media and identity fields are refused', () => {
  const refused = [
    control('start'), // start needs a media id
    control('start', { mediaId: 'https://example.com/film.mp4' }),
    control('start', { mediaId: 'unknown-film' }),
    control('play', { mediaId: 'ipic-fixture-v1' }), // media only on start
    control('play', { positionMs: 5000 }), control('play', { durationMs: 1 }), control('play', { url: 'x' }),
    control('play', { hostId: 'me' }), control('play', { ownerId: 'me' }), control('play', { anchorServerTimeMs: 0 }),
    control('seek'), control('delete'), control('play', { venueId: 'elsewhere' }), control('play', { venueId: 7 }),
    control('play', { expectedRevision: -1 }), control('play', { expectedRevision: 1.5 }), control('play', { expectedRevision: Number.NaN }),
    control('play', { expectedRevision: Infinity }), control('play', { expectedRevision: 2 ** 60 }), control('play', { expectedRevision: '3' }),
    control('play', { operationId: 'short' }), control('play', { operationId: 'x'.repeat(65) }), control('play', { operationId: 'has space 123' }),
    control('play', { operationId: undefined }), control('play', { epoch: '' }), control('play', { epoch: 'e'.repeat(65) }), control('play', { epoch: 3 }),
    { type: 'screening', action: 'sync', venueId: 'ipic', epoch: 'e1' }, { type: 'pose', action: 'play' }, null, [], 'play',
  ];
  for (const message of refused) assert.deepEqual(parseScreeningCommand(message), { ok: false, error: 'invalid_screening' }, JSON.stringify(message));
});

test('position projects from the server anchor and never passes the duration or runs backwards', () => {
  const playing = { status: 'playing', positionMs: 2000, anchorServerTimeMs: 10_000, durationMs: 12_000 };
  assert.equal(screeningPositionAt(playing, 10_000), 2000);
  assert.equal(screeningPositionAt(playing, 13_500), 5500);
  assert.equal(screeningPositionAt(playing, 9_000), 2000, 'a client clock behind the anchor does not rewind');
  assert.equal(screeningPositionAt(playing, 1e12), 12_000);
  assert.equal(screeningStatusAt(playing, 19_999), 'playing');
  assert.equal(screeningStatusAt(playing, 20_000), 'ended');
  const paused = { ...playing, status: 'paused' };
  assert.equal(screeningPositionAt(paused, 1e12), 2000);
  assert.equal(screeningStatusAt(paused, 1e12), 'paused');
  assert.equal(screeningPositionAt({ ...playing, status: 'stopped', positionMs: 0 }, 1e12), 0);
  assert.equal(screeningPositionAt(playing, Number.NaN), 2000, 'a non-finite clock reads the anchored position');
});
