import {publishCharacterQuality} from './character-quality.js';

// Graphics quality. The canvas always keeps native size; only the composer's
// internal buffers scale, so text, HUD and the page stay sharp while the scene
// renders fewer pixels on a busy GPU.
export const QUALITY_MODES = {
  auto: { label: 'Auto', note: 'Adapts scene resolution and ambient occlusion to keep the district responsive.' },
  sharp: { label: 'Sharpest', note: 'Full resolution and ambient occlusion at all times, even when frames slow down.' },
  smooth: { label: 'Smoothest', note: 'Three-quarter resolution without ambient occlusion, for older laptops and long visits.' },
};
export const DEFAULT_QUALITY = 'auto';
export const SMOOTH_RENDER_SCALE = 0.75;
const storageKey = 'river-oaks-graphics';

export function normalizeQuality(value) {
  return Object.hasOwn(QUALITY_MODES, value) ? value : DEFAULT_QUALITY;
}

// The city-kit finish (shared/city-kit/catalog.js KIT_FINISHES) for the live Commons and
// Heights (#742). Opt-in and read once per page load, so a change takes a reload:
// `?finish=pink-jet-age` for this load (`?finish=classic` overrides a stored choice), or
// localStorage['river-oaks-finish'] to keep it. Without either it is classic. The lazily
// loaded scene builders validate the name (catalog.js knownFinish), so an unknown one
// renders classic; this reader keeps the catalog out of the main bundle.
export const DEFAULT_FINISH = 'classic';
const finishStorageKey = 'river-oaks-finish';
const finishName = value => typeof value === 'string' && /^[a-z][a-z0-9-]{0,31}$/.test(value) ? value : DEFAULT_FINISH;
export function readFinishPreference({ search, storage: given } = {}) {
  try {
    const query = new URLSearchParams(search ?? globalThis.location?.search ?? '').get('finish');
    if (query !== null) return finishName(query);
  } catch { /* An unreadable address keeps the stored or default finish. */ }
  try {
    const storage = given === undefined ? globalThis.localStorage : given;
    return finishName(storage?.getItem(finishStorageKey));
  } catch { return DEFAULT_FINISH; }
}

// A 60 Hz display delivers 16.7 ms frames. A window median at or above 26 ms
// means the GPU is missing every other refresh, so Auto steps resolution down.
// Repeated missed refreshes can also hide behind a fast median while moving.
// With `tailShedding`, Auto temporarily drops the extra AO pass after two
// tail-heavy windows. It is off by default: it was measured only in the
// generated gallery on one Mac, where the gain did not hold once main moved
// (#354), and inside approved generated rooms Auto already replaces AO with
// the room's contact layer (#382). Left on, it reacts to district tails no
// device has been measured for, and gallery tails keep district AO off after
// the visitor leaves. Turn it on with `?aotail=on` for device acceptance.
// It steps back up only after several calm windows, and never straight back to
// a scale that just failed: that ceiling lifts after a wait that doubles each
// time the same scale fails again, so a borderline GPU settles instead of
// oscillating between two resolutions.
// `steadyWindows` counts the consecutive decision windows that changed neither
// scale nor AO. Each window is 45 frames, so on a slow GPU Auto takes several
// seconds to settle after it is selected; a measurement waits for this count.
export function createRenderScaleGovernor({ min = 0.6, max = 1, slowMs = 26, fastMs = 18, windowSize = 45,
  calmWindows = 3, ceilingWindows = 8, tailFraction = 0.12, tailRecoveryWindows = 120, tailShedding = false } = {}) {
  let scale = max, samples = [], calm = 0, ceiling = Infinity, ceilingWait = 0, ceilingPatience = ceilingWindows;
  let occlusion = true, floorWindows = 0, detailRecovery = 0, tailWindows = 0, tailRecoveryWait = 0, steadyWindows = 0;
  const round = value => Math.round(value * 100) / 100;
  return {
    get scale() { return scale; },
    get occlusion() { return occlusion; },
    get steadyWindows() { return steadyWindows; },
    resetMeasurements() { samples = []; calm = 0; floorWindows = 0; detailRecovery = 0; tailWindows = 0; steadyWindows = 0; },
    reset(next = max) { scale = next; samples = []; calm = 0; ceiling = Infinity; ceilingWait = 0; ceilingPatience = ceilingWindows; occlusion = true; floorWindows = 0; detailRecovery = 0; tailWindows = 0; tailRecoveryWait = 0; steadyWindows = 0; },
    // Feed one frame interval in milliseconds; returns the scale to render at.
    sample(ms) {
      // Tab switches, asset decoding and GC pauses are not a steady workload.
      if (!(ms > 0) || ms > 250) return scale;
      samples.push(ms);
      if (samples.length < windowSize) return scale;
      const previous = scale, previousOcclusion = occlusion;
      samples.sort((a, b) => a - b);
      const median = samples[samples.length >> 1];
      const tailSlow = samples.filter(interval => interval >= slowMs).length >= Math.ceil(windowSize * tailFraction);
      samples = [];
      // If pixel scaling cannot meet the budget, remove the second geometry
      // pass. Restore it only after sustained headroom at native resolution.
      if (median >= slowMs && scale === min) {
        if (++floorWindows >= 2) occlusion = false;
      } else floorWindows = 0;
      if (tailShedding && occlusion && scale === max && median <= fastMs && tailSlow) {
        if (++tailWindows >= 2) { occlusion = false; tailWindows = 0; tailRecoveryWait = tailRecoveryWindows; }
      } else tailWindows = 0;
      if (!occlusion && scale === max && median <= fastMs && !tailSlow) {
        if (tailRecoveryWait > 0) tailRecoveryWait--;
        else if (++detailRecovery >= calmWindows * 4) { occlusion = true; detailRecovery = 0; }
      } else detailRecovery = 0;
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
      steadyWindows = scale === previous && occlusion === previousOcclusion ? steadyWindows + 1 : 0;
      return scale;
    },
  };
}

// The Settings control. `apply` receives { mode, scale, occlusion } whenever the
// effective quality changes; `sample` is fed each animation frame's interval.
// `tailShedding` opts Auto into the tail rule above (device acceptance only).
export function createQualityControl({ apply, storage: given, tailShedding = false }) {
  // Reading localStorage can itself throw (blocked storage, opaque origins).
  let storage = given ?? null;
  if (given === undefined) try { storage = globalThis.localStorage; } catch { storage = null; }
  let mode = DEFAULT_QUALITY, lastScale = null, lastOcclusion = null, frames = 0, frameTime = 0, fps = 0;
  let preference = DEFAULT_QUALITY, recoveryTier = null, recoveryScale = null;
  try {
    const stored = storage?.getItem(storageKey);
    // Before recovery support this key held a bare mode string.
    let value = stored;
    try { value = JSON.parse(stored); } catch { /* Legacy string. */ }
    preference = normalizeQuality(value && typeof value === 'object' ? value.mode : value);
    recoveryTier = value && typeof value === 'object' && Object.hasOwn(QUALITY_MODES, value.recoveryTier) ? value.recoveryTier : null;
    if (recoveryTier && Number.isFinite(value.recoveryScale)) recoveryScale = Math.max(.6, Math.min(1, value.recoveryScale));
    mode = recoveryTier ?? preference;
  } catch { /* Storage may be disabled; Auto still works. */ }
  const governor = createRenderScaleGovernor({ tailShedding });
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
    if (mode === 'smooth') return { scale: Math.min(SMOOTH_RENDER_SCALE, recoveryTier === mode ? recoveryScale ?? 1 : 1), occlusion: false };
    return { scale: governor.scale, occlusion: governor.occlusion };
  }
  function publish() {
    const { scale, occlusion } = effective();
    if (scale !== lastScale || occlusion !== lastOcclusion) { lastScale = scale; lastOcclusion = occlusion; publishCharacterQuality({ mode, scale, occlusion }); apply({ mode, scale, occlusion }); }
    readout.textContent = `${Math.round(scale * 100)}% · ${fps ? `${fps} fps` : '…'}`;
  }
  function persistPreference() {
    try { storage?.setItem(storageKey, JSON.stringify({ mode: preference, recoveryTier, recoveryScale })); } catch { /* Keep the choice for this page session. */ }
  }
  function select(next, persist = false) {
    mode = normalizeQuality(next);
    if (persist) { preference = mode; recoveryTier = null; recoveryScale = null; }
    if (mode === 'auto') governor.reset();
    buttons.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.quality === mode)));
    note.textContent = QUALITY_MODES[mode].note;
    if (mode === 'smooth' && recoveryTier === mode && recoveryScale !== null && recoveryScale < SMOOTH_RENDER_SCALE)
      note.textContent = `Recovery keeps scene resolution at ${Math.round(recoveryScale * 100)}% without ambient occlusion. Choose a quality setting to change it.`;
    if (persist) persistPreference();
    publish();
  }
  select(mode);
  return {
    element,
    get mode() { return mode; },
    get stats() { return { mode, scale: lastScale, occlusion: lastOcclusion, fps, tailShedding, steadyWindows: mode === 'auto' ? governor.steadyWindows : null }; },
    select,
    stepDown() {
      recoveryScale = effective().scale;
      recoveryTier = mode === 'sharp' ? 'auto' : 'smooth';
      select(recoveryTier); persistPreference();
    },
    resetTime() { governor.resetMeasurements(); frames = 0; frameTime = 0; fps = 0; publish(); },
    sample(ms) {
      if (mode === 'auto') governor.sample(ms);
      frames++; frameTime += ms;
      if (frameTime >= 1000) { fps = Math.round(frames * 1000 / frameTime); frames = 0; frameTime = 0; publish(); }
      else if (mode === 'auto' && (governor.scale !== lastScale || governor.occlusion !== lastOcclusion)) publish();
    },
  };
}
