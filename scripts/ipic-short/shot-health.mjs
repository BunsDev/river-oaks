// Whether a capture take is usable (#501): the town stayed whole and the camera page kept drawing. Under heavy load
// the fixture's sockets can time out; the town then empties and the picture stops, while the recorder still writes
// a steady 25 frames a second, so frame timestamps cannot show it (the 17:00Z take of 2026-10-18 at load 212).
export const SHOT_HEALTH = Object.freeze({ maxGapMs: 250 });

// The problems with one shot's health sample ({ samples, maxGapMs, offline, unseated }) from second-capture.mjs.
export function shotHealthProblems(shot, limits = SHOT_HEALTH) {
  const health = shot.health;
  if (!health || !(health.samples > 0)) return [`${shot.id}: no health sample (taken before the check, or the sampler did not run)`];
  return [
    ...(health.offline ? [`${shot.id}: the camera page was offline for ${health.offline} of ${health.samples} samples`] : []),
    ...(health.unseated ? [`${shot.id}: fewer than two friends were seated for ${health.unseated} of ${health.samples} samples`] : []),
    ...(health.maxGapMs > limits.maxGapMs ? [`${shot.id}: the page went ${Math.round(health.maxGapMs)} ms between frames (limit ${limits.maxGapMs} ms)`] : []),
  ];
}

export const takeProblems = shots => shots.flatMap(shot => shotHealthProblems(shot));
