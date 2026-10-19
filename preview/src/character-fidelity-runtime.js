import {characterQualitySnapshot, subscribeCharacterQuality} from './character-quality.js';
import {applyCharacterRealism, loadCharacterRealismTextures, REALISM_TIERS} from './character-realism.js';

export function fidelityTierForQuality({mode = 'auto', scale = 1, occlusion = true} = {}) {
  if (mode === 'sharp') return 'high';
  if (mode === 'smooth') return 'standard';
  return scale <= .6 && !occlusion ? 'low' : scale < .85 ? 'standard' : 'high';
}

// One effect owns one avatar's temporary material/geometry state. Async maps
// cannot change a disposed instance or overtake a newer quality request.
export function createCharacterFidelity(rig, {loadTextures = loadCharacterRealismTextures} = {}) {
  let generation = 0, disposed = false, effect = null, report = {tier:'off', requestedTier:'off'};
  async function setTier(tier) {
    if (!Object.hasOwn(REALISM_TIERS, tier)) throw new TypeError('Unknown realism tier');
    if (disposed || (effect && report.requestedTier === tier && report.tier === tier && !report.fallback)) return report;
    const request = ++generation;
    let textures = null, selected = tier, fallback;
    if (tier !== 'off') {
      try { textures = await loadTextures(); }
      catch { selected = tier === 'low' ? 'low' : 'standard'; fallback = 'roughness_unavailable'; }
    }
    if (disposed || request !== generation) return report;
    effect?.dispose();
    effect = applyCharacterRealism(rig, {tier:selected, textures});
    report = {...effect.report, requestedTier:tier, ...(fallback ? {fallback} : {})};
    return report;
  }
  return {
    get report() { return structuredClone(report); },
    setTier,
    setQuality: quality => setTier(fidelityTierForQuality(quality)),
    dispose() { if (disposed) return; disposed = true; generation++; effect?.dispose(); effect = null; },
  };
}

// Subscribe before the first asynchronous map load, and wait for whichever
// request is newest when initialization settles.
export async function followCharacterQuality(control, {snapshot = characterQualitySnapshot, subscribe = subscribeCharacterQuality} = {}) {
  let pending;
  const apply = quality => { pending = control.setQuality(quality); };
  const unsubscribe = subscribe(apply);
  try {
    apply(snapshot());
    for (;;) { const current = pending; await current; if (current === pending) return unsubscribe; }
  } catch (error) { unsubscribe(); throw error; }
}
