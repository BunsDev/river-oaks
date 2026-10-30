// The Ribbonwing's sounds (#777), synthesized like the games' (throw-sounds.js), with no
// audio files: a fan hum that follows each craft's fan rate and distance, and short
// one-shots for the canopy's whir, the feet's thunk and a maneuver's whoosh. Bounded: at
// most MAX_HUMS hums (the nearest crafts within HEARING metres) and MAX_VOICES one-shots
// at once, each kind no more often than ONE_SHOT_GAP per craft. The context is made only
// after a click or key (browsers start audio there). The page's one game-sounds switch,
// or a hidden tab, silences everything. dispose() stops every node and closes the context.
import { throwSounds } from './throw-sounds.js';
import { MECHANISMS } from './ribbonwing-design.js';

export const MAX_HUMS = 2, MAX_VOICES = 6, HEARING = 45, ONE_SHOT_GAP = .4;

/**
 * @typedef {{id:string,position:number[],fanRate:number,canopy:number,gear:number,maneuvering:boolean}} CraftSound
 */
export function createRibbonwingSounds({ AudioContextClass = globalThis.AudioContext ?? globalThis.webkitAudioContext, switcher = throwSounds(), volume = .16,
  target = globalThis, isHidden = () => globalThis.document?.visibilityState === 'hidden' } = {}) {
  let context = null, disposed = false, voices = 0;
  /** @type {Map<string,{nodes:any[],gain:any,filter:any,low:any,high:any}>} */
  const hums = new Map();
  /** @type {Map<string,{canopy:number,gear:number,maneuvering:boolean,at:Record<string,number>}>} */
  const last = new Map();
  const unlock = () => {
    if (disposed || !switcher.enabled() || !AudioContextClass) return;
    try { context ??= new AudioContextClass();if (context.state === 'suspended') void context.resume?.(); } catch { context = null; }
  };
  const gestures = ['pointerdown', 'keydown'];
  for (const type of gestures) target.addEventListener?.(type, unlock, { passive: true });

  function startHum(id) {
    const ctx = context, gain = ctx.createGain(), filter = ctx.createBiquadFilter(), low = ctx.createOscillator(), high = ctx.createOscillator();
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);filter.type = 'lowpass';filter.frequency.value = 520;filter.Q.value = .7;
    low.type = 'sawtooth';high.type = 'triangle';high.detune.value = 7;
    low.connect(filter);high.connect(filter);filter.connect(gain).connect(ctx.destination);
    low.start();high.start();
    const hum = { nodes: [low, high], gain, filter, low, high };hums.set(id, hum);return hum;
  }
  function stopHum(id) {
    const hum = hums.get(id);if (!hum) return;hums.delete(id);
    try { const at = context.currentTime;hum.gain.gain.setTargetAtTime(0.0001, at, .05);for (const node of hum.nodes) node.stop(at + .3); } catch { /* already stopped */ }
  }
  // A short sound: filtered noise or a falling tone, with an envelope that ends it.
  function oneShot(kind, loudness) {
    if (voices >= MAX_VOICES) return false;
    const ctx = context, at = ctx.currentTime + .005, gain = ctx.createGain(), length = kind === 'whoosh' ? .9 : kind === 'canopy' ? .5 : .16;
    gain.gain.setValueAtTime(0.0001, at);gain.gain.exponentialRampToValueAtTime(Math.max(.0002, volume * loudness), at + (kind === 'whoosh' ? .25 : .01));
    gain.gain.exponentialRampToValueAtTime(0.0001, at + length);gain.connect(ctx.destination);
    const source = ctx.createOscillator();
    if (kind === 'gear') { source.type = 'sine';source.frequency.setValueAtTime(150, at);source.frequency.exponentialRampToValueAtTime(70, at + length);source.connect(gain); }
    else {
      const filter = ctx.createBiquadFilter();filter.type = 'bandpass';filter.Q.value = kind === 'canopy' ? 6 : 1.1;
      source.type = kind === 'canopy' ? 'square' : 'sawtooth';
      source.frequency.setValueAtTime(kind === 'canopy' ? 220 : 90, at);source.frequency.linearRampToValueAtTime(kind === 'canopy' ? 300 : 40, at + length);
      filter.frequency.setValueAtTime(kind === 'canopy' ? 900 : 400, at);filter.frequency.exponentialRampToValueAtTime(kind === 'canopy' ? 1200 : 1800, at + length);
      source.connect(filter).connect(gain);
    }
    voices++;source.onended = () => { voices = Math.max(0, voices - 1); };
    source.start(at);source.stop(at + length + .02);
    return true;
  }
  const silenceAll = () => { for (const id of [...hums.keys()]) stopHum(id); };
  const fanMax = MECHANISMS.fans.max;

  return {
    /** @param {number[]} listener world position @param {CraftSound[]} crafts @param {number} [now] seconds */
    update(listener, crafts, now = (globalThis.performance?.now() ?? Date.now()) / 1000) {
      if (disposed) return;
      const playing = Boolean(context) && switcher.enabled() && !isHidden() && Array.isArray(listener);
      const heard = !playing ? [] : crafts.map(craft => ({ craft, distance: Math.hypot(craft.position[0] - listener[0], craft.position[1] - listener[1], craft.position[2] - listener[2]) }))
        .filter(item => item.distance < HEARING).sort((a, b) => a.distance - b.distance);
      const humming = new Set(heard.filter(item => item.craft.fanRate > 0).slice(0, MAX_HUMS).map(item => item.craft.id));
      for (const id of [...hums.keys()]) if (!humming.has(id)) stopHum(id);
      for (const { craft, distance } of heard) {
        const fade = (1 - distance / HEARING) ** 2, before = last.get(craft.id), at = before?.at ?? {};
        if (humming.has(craft.id)) {
          const hum = hums.get(craft.id) ?? startHum(craft.id), rate = Math.min(1.2, craft.fanRate / fanMax), t = context.currentTime;
          hum.gain.gain.setTargetAtTime(Math.max(.0001, volume * .45 * rate * fade), t, .08);
          hum.low.frequency.setTargetAtTime(55 + 85 * rate, t, .1);hum.high.frequency.setTargetAtTime(110 + 170 * rate, t, .1);
          hum.filter.frequency.setTargetAtTime(360 + 900 * rate, t, .1);
        }
        // One-shots on a mechanism's crossing, each kind rate-limited per craft.
        const shot = (kind, loudness) => { if (now - (at[kind] ?? -Infinity) >= ONE_SHOT_GAP && oneShot(kind, loudness * fade)) at[kind] = now; };
        if (before) {
          if ((before.canopy < .5) !== (craft.canopy < .5)) shot('canopy', .5);
          if ((before.gear < .5) !== (craft.gear < .5)) shot('gear', .8);
          if (!before.maneuvering && craft.maneuvering) shot('whoosh', 1);
        }
      }
      if (!playing) silenceAll();
      for (const craft of crafts) last.set(craft.id, { canopy: craft.canopy, gear: craft.gear, maneuvering: craft.maneuvering, at: last.get(craft.id)?.at ?? {} });
      for (const id of [...last.keys()]) if (!crafts.some(craft => craft.id === id)) last.delete(id);
    },
    stats: () => ({ hums: hums.size, voices, context: context?.state ?? 'none' }),
    dispose() {
      if (disposed) return;disposed = true;
      for (const type of gestures) target.removeEventListener?.(type, unlock);
      for (const hum of hums.values()) for (const node of hum.nodes) try { node.stop(); } catch { /* already stopped */ }
      hums.clear();last.clear();
      void context?.close?.();context = null;
    },
  };
}
