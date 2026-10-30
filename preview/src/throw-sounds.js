// Short, synthesized sounds for the throwing games (no audio files): a whoosh as a dart,
// ball, puck or axe leaves the hand, and what it meets: a dart's thunk into the board, a
// ball's tap on linen and clink on a glass, a puck's slide and knock, an axe's thud into
// wood or clatter off it. Each is a few WebAudio nodes (filtered noise and oscillators)
// that stop themselves, or stop early when a slide ends sooner. The context is made inside
// a throw's own click or key (unlock), since WebKit starts audio only in the gesture and a
// shared throw's first sound waits for the town's reply. Quiet by default; one switch,
// remembered per viewer, turns every game's sounds off.

const KEY = 'river-oaks-game-sounds';
let shared = null;
// The sound being built collects its voices here, so play() can hand back a stop.
let voices = null;

export function createThrowSounds({ storage = globalThis.localStorage, AudioContextClass = globalThis.AudioContext ?? globalThis.webkitAudioContext, volume = 0.3 } = {}) {
  let context = null, noise = null, on = true;
  try { on = storage?.getItem(KEY) !== 'off'; } catch { /* storage may be unavailable */ }
  const listeners = new Set();

  function audio() {
    if (!on || !AudioContextClass) return null;
    try { context ??= new AudioContextClass(); } catch { return null; }
    if (context.state === 'suspended') void context.resume?.();
    if (!noise) {
      noise = context.createBuffer(1, Math.floor(context.sampleRate * 0.5), context.sampleRate);
      const data = noise.getChannelData(0);
      let seed = 0x2545f491;
      for (let i = 0; i < data.length; i++) { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; data[i] = seed / 2 ** 31 - 1; }
    }
    return context;
  }
  // One envelope: a gain that rises fast and dies away over `length` seconds.
  const envelope = (ctx, at, peak, length) => {
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak * volume), at + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + length);
    gain.connect(ctx.destination);
    return gain;
  };
  // Filtered noise: a burst (a click, a thud's attack, a slide's hiss, a whoosh's air).
  function hiss(ctx, at, { type = 'lowpass', from, to = from, q = 0.8, peak, length }) {
    const source = ctx.createBufferSource(), filter = ctx.createBiquadFilter(), gain = envelope(ctx, at, peak, length);
    source.buffer = noise; filter.type = type; filter.Q.value = q;
    filter.frequency.setValueAtTime(from, at); filter.frequency.exponentialRampToValueAtTime(to, at + length);
    source.connect(filter).connect(gain);
    source.start(at); source.stop(at + length + 0.02);
    voices?.push({ node: source, gain });
  }
  // A tone that falls from `from` to `to` Hz: a thud's body, a glass's ring.
  function tone(ctx, at, { from, to = from, peak, length, type = 'sine' }) {
    const oscillator = ctx.createOscillator(), gain = envelope(ctx, at, peak, length);
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(from, at); oscillator.frequency.exponentialRampToValueAtTime(to, at + length);
    oscillator.connect(gain);
    oscillator.start(at); oscillator.stop(at + length + 0.02);
    voices?.push({ node: oscillator, gain });
  }
  // Fades a sound's voices out over a few milliseconds and stops them.
  const silence = (ctx, list) => () => {
    const at = ctx.currentTime;
    for (const { node, gain } of list) {
      try { gain.gain.cancelScheduledValues?.(at); gain.gain.setTargetAtTime?.(0.0001, at, 0.015); node.stop(at + 0.08); } catch { /* already stopped */ }
    }
  };

  // `strength` (0–1) scales how hard it sounds; `seconds` sets a slide's length.
  const SOUNDS = {
    release: (ctx, at, { strength = 0.6 }) => hiss(ctx, at, { type: 'bandpass', from: 380, to: 1500, q: 1.2, peak: 0.22 * strength, length: 0.2 }),
    dart: (ctx, at, { strength = 0.7 }) => { hiss(ctx, at, { from: 2400, to: 700, peak: 0.55 * strength, length: 0.05 }); tone(ctx, at, { from: 190, to: 120, peak: 0.5 * strength, length: 0.11 }); },
    'dart-miss': (ctx, at) => { hiss(ctx, at, { from: 700, to: 300, peak: 0.35, length: 0.09 }); tone(ctx, at, { from: 110, to: 80, peak: 0.25, length: 0.12 }); },
    tap: (ctx, at, { strength = 0.6 }) => { hiss(ctx, at, { type: 'highpass', from: 1800, peak: 0.25 * strength, length: 0.03 }); tone(ctx, at, { from: 950, to: 700, peak: 0.25 * strength, length: 0.05 }); },
    clink: (ctx, at, { strength = 0.6 }) => { tone(ctx, at, { from: 2650, to: 2600, peak: 0.22 * strength, length: 0.32 }); tone(ctx, at, { from: 3970, to: 3900, peak: 0.12 * strength, length: 0.22 }); },
    plop: (ctx, at) => { tone(ctx, at, { from: 380, to: 140, peak: 0.45, length: 0.14 }); hiss(ctx, at, { from: 900, to: 400, peak: 0.12, length: 0.08 }); },
    slide: (ctx, at, { seconds = 1, strength = 0.6 }) => hiss(ctx, at, { from: 520, to: 260, q: 0.6, peak: 0.16 * strength, length: Math.min(3, Math.max(0.2, seconds)) }),
    knock: (ctx, at, { strength = 0.6 }) => { tone(ctx, at, { from: 1250, to: 900, peak: 0.35 * strength, length: 0.05, type: 'triangle' }); hiss(ctx, at, { type: 'highpass', from: 2500, peak: 0.2 * strength, length: 0.025 }); },
    'axe-stick': (ctx, at) => { hiss(ctx, at, { from: 1400, to: 300, peak: 0.6, length: 0.08 }); tone(ctx, at, { from: 120, to: 70, peak: 0.6, length: 0.18 }); },
    'axe-bounce': (ctx, at) => { tone(ctx, at, { from: 1650, to: 1500, peak: 0.25, length: 0.16, type: 'triangle' }); hiss(ctx, at, { type: 'bandpass', from: 2200, q: 2, peak: 0.3, length: 0.06 });
      hiss(ctx, at + 0.11, { type: 'bandpass', from: 1700, q: 2, peak: 0.18, length: 0.05 }); tone(ctx, at + 0.18, { from: 160, to: 110, peak: 0.2, length: 0.1 }); },
  };

  return {
    kinds: Object.keys(SOUNDS),
    // Plays a sound now (or `delay` seconds from now) and returns { stop } to end it early, or
    // null when sounds are off or unavailable. A broken audio stack never throws into a game.
    play(kind, options = {}) {
      try {
        const recipe = SOUNDS[kind], ctx = recipe && audio();
        if (!ctx) return null;
        const built = voices = [];
        recipe(ctx, ctx.currentTime + 0.005 + (options.delay ?? 0), options);
        return { stop: silence(ctx, built) };
      } catch { return null; } finally { voices = null; }
    },
    // Makes or wakes the context inside a throw's click or key handler. False when off or unavailable.
    unlock() { try { return Boolean(audio()); } catch { return false; } },
    enabled: () => on,
    setEnabled(next) {
      on = Boolean(next);
      try { storage?.setItem(KEY, on ? 'on' : 'off'); } catch { /* storage may be unavailable */ }
      if (!on) void context?.suspend?.();
      for (const listener of listeners) listener(on);
    },
    // Sheets keep their Sound buttons in step when another sheet flips the switch.
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
  };
}

// The one switch every throwing game shares in the page.
export const throwSounds = () => (shared ??= createThrowSounds());

// A Sound toggle for a game sheet's actions row, kept in step with the shared switch.
export function soundToggle(sounds = throwSounds()) {
  const button = document.createElement('button');
  button.type = 'button'; button.dataset.gameSound = ''; button.textContent = 'Sound';
  const sync = on => { button.setAttribute('aria-pressed', String(on)); button.title = on ? 'Game sounds on' : 'Game sounds off'; };
  sync(sounds.enabled());
  sounds.subscribe(sync);
  button.addEventListener('click', () => sounds.setEnabled(!sounds.enabled()));
  return button;
}

// The same switch as a Settings row (Audio), always reachable: the games' sounds and the
// Ribbonwing's fans, canopy, gear and maneuver sounds all follow it.
export function soundSetting(sounds = throwSounds()) {
  const label = document.createElement('label'), text = document.createElement('span'), input = document.createElement('input');
  label.className = 'layer-row'; text.textContent = 'Game and vehicle sounds';
  input.type = 'checkbox'; input.dataset.gameSoundSetting = ''; input.checked = sounds.enabled();
  sounds.subscribe(on => { input.checked = on; });
  input.addEventListener('change', () => sounds.setEnabled(input.checked));
  label.append(text, input);
  return label;
}
