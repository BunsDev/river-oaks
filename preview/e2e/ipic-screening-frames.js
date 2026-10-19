// Presented-frame evidence for IPIC screenings (#502). A requested currentTime and a drift
// diagnostic reset after a seek do not show that a viewer saw the right frame. This sampler asks the
// screening's own video element for requestVideoFrameCallback metadata: the media time of each
// presented frame, the presented-frame count and when the frame was expected on screen. It
// re-attaches whenever the panel makes a new element (every visit). It is installed in the page by
// the journeys and reads nothing from the player's own diagnostics.

// Runs in the page (page.addInitScript and page.evaluate). Keeps the last 2,000 frames.
export function frameSamplerScript() {
  if (window.__screeningFrames) return;
  let video = null, samples = [];
  const watch = element => {
    const step = (now, meta) => {
      if (element !== video) return;
      samples.push({ wallMs: performance.timeOrigin + (meta.expectedDisplayTime ?? now), mediaTimeMs: meta.mediaTime * 1000, frames: meta.presentedFrames, rate: element.playbackRate, paused: element.paused });
      if (samples.length > 2000) samples.splice(0, samples.length - 2000);
      element.requestVideoFrameCallback(step);
    };
    element.requestVideoFrameCallback(step);
  };
  const poll = () => {
    const element = document.querySelector('#ipic-screening video');
    if (element !== video) { video = element; samples = []; if (element && 'requestVideoFrameCallback' in element) watch(element); }
    requestAnimationFrame(poll);
  };
  requestAnimationFrame(poll);
  window.__screeningFrames = (sinceWallMs = 0) => ({ supported: Boolean(video && 'requestVideoFrameCallback' in video), samples: samples.filter(sample => sample.wallMs >= sinceWallMs) });
}

export async function installFrameSampler(page) {
  await page.addInitScript(frameSamplerScript);
  await page.evaluate(frameSamplerScript);
}

// Two viewers' latest presented frames, projected to the later of their display times. The
// uncertainty is one frame interval per viewer plus the projection over the gap at up to the
// player's ±8 % rate correction. null when either viewer has not presented a frame.
export function presentedSpread(a, b, { frameMs = 1000 / 24, rateError = 0.08 } = {}) {
  const last = list => list?.at?.(-1) ?? null, x = last(a), y = last(b);
  if (!x || !y) return null;
  const at = Math.max(x.wallMs, y.wallMs);
  const project = s => s.mediaTimeMs + (s.paused ? 0 : (at - s.wallMs) * s.rate);
  const gap = Math.abs(x.wallMs - y.wallMs);
  return { spreadMs: Math.abs(project(x) - project(y)), uncertaintyMs: 2 * frameMs + gap * rateError, atWallMs: at, gapMs: gap };
}

// Sustained progress over a window: presented frames per second and media time per wall time.
export function framePace(samples) {
  if (!(samples?.length >= 2)) return { frames: samples?.length ?? 0, fps: 0, mediaPerWall: 0 };
  const first = samples[0], last = samples.at(-1), wall = last.wallMs - first.wallMs;
  return { frames: last.frames - first.frames, fps: wall > 0 ? (last.frames - first.frames) / wall * 1000 : 0, mediaPerWall: wall > 0 ? (last.mediaTimeMs - first.mediaTimeMs) / wall : 0, wallMs: wall };
}
