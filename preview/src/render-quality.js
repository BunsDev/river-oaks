// Graphics quality. The canvas always keeps native size; only the composer's
// internal buffers scale, so text, HUD and the page stay sharp while the scene
// renders fewer pixels on a busy GPU.
export const QUALITY_MODES = {
  auto: { label: 'Auto', note: 'Lowers scene resolution while the district is busy and restores it when frames recover.' },
  sharp: { label: 'Sharpest', note: 'Full resolution and ambient occlusion at all times, even when frames slow down.' },
  smooth: { label: 'Smoothest', note: 'Three-quarter resolution without ambient occlusion, for older laptops and long visits.' },
};
export const DEFAULT_QUALITY = 'auto';
export const SMOOTH_RENDER_SCALE = 0.75;
const storageKey = 'river-oaks-graphics';

export function normalizeQuality(value) {
  return Object.hasOwn(QUALITY_MODES, value) ? value : DEFAULT_QUALITY;
}

// A 60 Hz display delivers 16.7 ms frames. A window median at or above 26 ms
// means the GPU is missing every other refresh, so Auto steps resolution down.
// It steps back up only after several calm windows, and never straight back to
// a scale that just failed: that ceiling lifts after a wait that doubles each
// time the same scale fails again, so a borderline GPU settles instead of
// oscillating between two resolutions.
export function createRenderScaleGovernor({ min = 0.6, max = 1, slowMs = 26, fastMs = 18, windowSize = 45, calmWindows = 3, ceilingWindows = 8 } = {}) {
  let scale = max, samples = [], calm = 0, ceiling = Infinity, ceilingWait = 0, ceilingPatience = ceilingWindows;
  const round = value => Math.round(value * 100) / 100;
  return {
    get scale() { return scale; },
    reset(next = max) { scale = next; samples = []; calm = 0; ceiling = Infinity; ceilingWait = 0; ceilingPatience = ceilingWindows; },
    // Feed one frame interval in milliseconds; returns the scale to render at.
    sample(ms) {
      // Tab switches, asset decoding and GC pauses are not a steady workload.
      if (!(ms > 0) || ms > 250) return scale;
      samples.push(ms);
      if (samples.length < windowSize) return scale;
      samples.sort((a, b) => a - b);
      const median = samples[samples.length >> 1];
      samples = [];
      if (ceilingWait > 0 && --ceilingWait === 0) ceiling = Infinity;
      if (median >= slowMs) {
        calm = 0;
        if (scale > min) {
          // Failing again before the last ceiling lifted: wait twice as long.
          if (ceilingWait > 0) ceilingPatience = Math.min(64, ceilingPatience * 2);
          ceiling = scale; ceilingWait = ceilingPatience;
          scale = Math.max(min, round(scale * 0.85));
        }
      } else if (median <= fastMs && ++calm >= calmWindows) {
        calm = 0;
        const next = Math.min(max, round(scale + 0.1));
        if (next < ceiling) scale = next;
      } else if (median > fastMs) calm = 0;
      return scale;
    },
  };
}

// The Settings control. `apply` receives { mode, scale, occlusion } whenever the
// effective quality changes; `sample` is fed each animation frame's interval.
export function createQualityControl({ apply, storage = globalThis.localStorage }) {
  let mode = DEFAULT_QUALITY, lastScale = null, lastOcclusion = null, frames = 0, frameTime = 0, fps = 0;
  try { mode = normalizeQuality(storage?.getItem(storageKey)); } catch { /* Storage may be disabled; Auto still works. */ }
  const governor = createRenderScaleGovernor();
  const element = document.createElement('div');
  element.className = 'graphics-control';
  const heading = document.createElement('div'); heading.className = 'section-label';
  const readout = document.createElement('output'); readout.id = 'quality-readout'; readout.setAttribute('aria-live', 'off');
  heading.append('Graphics', readout);
  const group = document.createElement('div'); group.className = 'atmosphere-presets quality-modes';
  group.setAttribute('role', 'group'); group.setAttribute('aria-label', 'Graphics quality');
  const note = document.createElement('p'); note.className = 'quiet-note quality-note'; note.id = 'quality-note';
  const buttons = Object.entries(QUALITY_MODES).map(([key, { label }]) => {
    const button = document.createElement('button'); button.type = 'button'; button.dataset.quality = key; button.textContent = label;
    button.setAttribute('aria-describedby', note.id);
    button.addEventListener('click', () => select(key, true));
    return button;
  });
  group.append(...buttons);
  element.append(heading, group, note);

  function effective() {
    if (mode === 'sharp') return { scale: 1, occlusion: true };
    if (mode === 'smooth') return { scale: SMOOTH_RENDER_SCALE, occlusion: false };
    return { scale: governor.scale, occlusion: true };
  }
  function publish() {
    const { scale, occlusion } = effective();
    if (scale !== lastScale || occlusion !== lastOcclusion) { lastScale = scale; lastOcclusion = occlusion; apply({ mode, scale, occlusion }); }
    readout.textContent = `${Math.round(scale * 100)}% · ${fps ? `${fps} fps` : '…'}`;
  }
  function select(next, persist = false) {
    mode = normalizeQuality(next);
    if (mode === 'auto') governor.reset();
    buttons.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.quality === mode)));
    note.textContent = QUALITY_MODES[mode].note;
    if (persist) try { storage?.setItem(storageKey, mode); } catch { /* Keep the choice for this page session. */ }
    publish();
  }
  select(mode);
  return {
    element,
    get mode() { return mode; },
    get stats() { return { mode, scale: lastScale, occlusion: lastOcclusion, fps }; },
    select,
    sample(ms) {
      if (mode === 'auto') governor.sample(ms);
      frames++; frameTime += ms;
      if (frameTime >= 1000) { fps = Math.round(frames * 1000 / frameTime); frames = 0; frameTime = 0; publish(); }
      else if (mode === 'auto' && governor.scale !== lastScale) publish();
    },
  };
}
