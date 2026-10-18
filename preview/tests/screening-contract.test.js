import test from 'node:test';
import assert from 'node:assert/strict';
import { IPIC_INTERIOR } from '../src/ipic-plan.js';
import {
  SCREENING_MEDIA, SCREENING_VENUES, parseScreeningCommand, screeningPositionAt, screeningStatusAt,
} from '../src/screening-contract.js';

const control = (action, more = {}) => ({ type: 'screening', action, venueId: 'ipic', epoch: 'e1', expectedRevision: 3, operationId: 'op-123456', ...more });

test('the only venue is the IPIC auditorium; it shows the approved short first and keeps the labelled fixture', () => {
  assert.deepEqual(Object.keys(SCREENING_VENUES), ['ipic']);
  assert.equal(SCREENING_VENUES.ipic.interior, IPIC_INTERIOR);
  // Host Start plays the venue's first film, so the approved short (#365) leads.
  assert.deepEqual(Object.keys(SCREENING_MEDIA), ['ipic-original-v1', 'ipic-fixture-v1']);
  const short = SCREENING_MEDIA['ipic-original-v1'];
  assert.equal(short.fixture, false);
  assert.deepEqual(short.venues, ['ipic']);
  assert.ok(short.durationMs >= 45_000 && short.durationMs <= 90_000, 'the proposed 45-90 s');
  assert.equal(short.transcript.length, 8);
  assert.ok(Object.isFrozen(short) && Object.isFrozen(short.sources) && Object.isFrozen(short.transcript));
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

// The host's chooser (#499): approved films only, the approved short first by name, not by order.
test('a host chooses among approved films; the default is named, and fixtures are for tests only', async () => {
  const { SCREENING_DEFAULT_MEDIA, screeningChoices } = await import('../src/screening-contract.js');
  assert.equal(SCREENING_DEFAULT_MEDIA.ipic, 'ipic-original-v1');
  assert.deepEqual(screeningChoices('ipic').map(film => film.id), ['ipic-original-v1'], 'the fixture is not a public choice');
  assert.deepEqual(screeningChoices('ipic', { fixtures: true }).map(film => film.id), ['ipic-original-v1', 'ipic-fixture-v1'], 'tests may list it, default still first');
  assert.deepEqual(screeningChoices('elsewhere'), []);
  for (const film of screeningChoices('ipic', { fixtures: true })) assert.ok(parseScreeningCommand(control('start', { mediaId: film.id })).ok, `${film.id} is startable`);
});

test('every film says truthfully what it carries: duration, sound, captions and a poster or none', () => {
  const short = SCREENING_MEDIA['ipic-original-v1'], fixture = SCREENING_MEDIA['ipic-fixture-v1'];
  assert.equal(short.audio, 'silent', 'the approved short has a silent track; nothing may advertise dialogue');
  assert.equal(short.poster, '/assets/ipic/screening/ipic-original-v1-poster.jpg');
  assert.equal(fixture.audio, 'test tone');
  assert.equal(fixture.poster, null, 'no poster: the chooser shows a neutral fallback');
  for (const film of Object.values(SCREENING_MEDIA)) {
    assert.ok(['silent', 'test tone', 'dialogue and music', 'music', 'dialogue'].includes(film.audio), `${film.id} audio`);
    assert.ok(film.captions?.src && film.captions.srclang === 'en', `${film.id} has English captions`);
  }
});
