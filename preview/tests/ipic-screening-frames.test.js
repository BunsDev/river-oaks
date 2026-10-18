import test from 'node:test';
import assert from 'node:assert/strict';
import { framePace, presentedSpread } from '../e2e/ipic-screening-frames.js';

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
