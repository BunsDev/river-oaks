import test from 'node:test';
import assert from 'node:assert/strict';
import { checkScreeningEvidence, framePace, presentedSpread, screeningFrameSnapshot } from '../e2e/ipic-screening-frames.js';

const frame = (wallMs, mediaTimeMs, frames, more = {}) => ({ wallMs, mediaTimeMs, frames, rate: 1, paused: false, ...more });

test('presented spread compares two viewers at one display time, with its uncertainty', () => {
  // Viewer b presented its frame 30 ms after viewer a; projected to b's time, a is 30 ms further on.
  const spread = presentedSpread([frame(1000, 5000, 120)], [frame(1030, 5100, 118)]);
  assert.equal(Math.round(spread.spreadMs), 70);
  assert.equal(spread.gapMs, 30);
  assert.ok(Math.abs(spread.uncertaintyMs - (2 * 1000 / 24 + 30 * 0.08)) < 1e-9);
  assert.equal(presentedSpread([], [frame(0, 0, 1)]), null, 'no presented frame, no claim');
  // A paused viewer does not advance while the other is projected.
  assert.equal(Math.round(presentedSpread([frame(1000, 5000, 1, { paused: true })], [frame(1500, 5000, 1, { paused: true })]).spreadMs), 0);
});

test('frame pace shows frames that actually advance, not a requested time', () => {
  const samples = Array.from({ length: 25 }, (_, i) => frame(1000 + i * 1000 / 24, 2000 + i * 1000 / 24, 50 + i));
  const pace = framePace(samples);
  assert.ok(Math.abs(pace.fps - 24) < 1e-9 && Math.abs(pace.mediaPerWall - 1) < 1e-9, JSON.stringify(pace));
  const frozen = framePace([frame(0, 4000, 10), frame(2000, 4000, 10)]);
  assert.deepEqual([frozen.frames, frozen.fps, frozen.mediaPerWall], [0, 0, 0], 'a frozen film presents nothing new');
  assert.deepEqual(framePace([]), { frames: 0, fps: 0, mediaPerWall: 0 });
});

test('a failed comparison retains raw frame clocks even when requested playback times agree', () => {
  const sample = { at: 1700000010000, perfNow: 10000, currentTime: 12, paused: false, rate: 0.92, seeking: true, generation: 4,
    presented: { mediaTimeMs: 11167, shownAt: 9900, at: 9901, frames: 20, generation: 3 },
    source: { src: '/film?private=not-for-receipts', type: 'video/webm' }, unrelated: 'not-for-receipts' };
  const snapshot = screeningFrameSnapshot(sample);
  sample.presented.frames = 21;
  assert.equal(snapshot.presented.frames, 20, 'the captured frame cannot change with later stats');
  assert.equal(snapshot.currentTime, 12);
  assert.equal(snapshot.presented.mediaTimeMs, 11167);
  assert.equal(snapshot.presented.generation, 3, 'retain a stale generation for diagnosis');
  assert.equal(snapshot.generation, 4);
  assert.equal(snapshot.rate, 0.92);
  assert.equal(snapshot.seeking, true);
  assert.equal(snapshot.at - snapshot.perfNow + snapshot.presented.shownAt, 1700000009900);
  assert.equal(snapshot.sourceType, 'video/webm');
  assert(!JSON.stringify(snapshot).includes('not-for-receipts'));
  const evidence = { checks: ['requested times agree'], samples: [{ hostFrame: snapshot }] };
  assert.throws(() => checkScreeningEvidence(833 < 500, 'presented frame limit exceeded', () => evidence), error => {
    assert.equal(error.message, 'presented frame limit exceeded');
    assert.deepEqual(error.journeyEvidence, evidence);
    return true;
  });
});

test('passing checks do not invoke diagnostic collection', () => {
  checkScreeningEvidence(true, 'passed', () => { throw new Error('must not collect'); });
});

test('failed diagnostic collection preserves the first assertion', () => {
  assert.throws(() => checkScreeningEvidence(false, 'first failure', () => { throw new Error('observer unavailable'); }), error => {
    assert.equal(error.message, 'first failure');
    assert.deepEqual(error.journeyEvidence, { captureError: 'observer unavailable' });
    return true;
  });
});
