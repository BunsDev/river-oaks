// How a fight looks (#640 increment 4). The town decides every phase (server/crime.js,
// server/police.js); this module only reads the snapshot and turns it into a facing and a pose
// layer. A snapshot names an action's phase and the milliseconds left in it, so the client knows
// where in the swing the town is and only ever plays forward from there: a late snapshot shows the
// current phase, never an earlier one. Timings here mirror the town's proposed tuning
// (preview/tests/combat-motion.test.js checks they stay equal); the snapshot phase stays the
// authority. Poses are a procedural layer multiplied onto bones after the rig is posed
// (avatars.js update), so nothing here touches the garment-bake inputs.
import * as THREE from 'three';

// Mirrors CRIME_RULES (strikeWindupMs, contactMs, cooldownMs, counterWindupMs, counterMs,
// hitReactionMs, staggerMs, evadeMs) and POLICE_RULES.grabWindupMs.
export const COMBAT_TIMING = Object.freeze({
  strike: Object.freeze({ windup: 300, contact: 120, length: 900 }),
  counter: Object.freeze({ windup: 750, contact: 120, length: 1500 }),
  grab: 900, rivalStagger: 700, playerStagger: 600, evade: 350,
});
export const COMBAT_KINDS = Object.freeze(['strike', 'counter', 'evade', 'flinch', 'down', 'grab', 'arrest', 'surrender']);
// Timed kinds run once from 0 to 1 and end; held kinds stay at their key pose while the town says so.
const TIMED = new Set(['strike', 'counter', 'evade', 'flinch']);
const SIDES = ['left', 'right', 'back'];
// How fast a fighting body turns toward its opponent (rad/s, then an exponential settle at
// COMBAT_SETTLE per second); the feet keep the travel heading.
export const COMBAT_TURN_RATE = 14;
const COMBAT_SETTLE = 14;

const clamp01 = value => value > 1 ? 1 : value > 0 ? value : 0;
const wrap = angle => Math.atan2(Math.sin(angle), Math.cos(angle));
const unit = vector => {
  if (!Array.isArray(vector) || vector.length < 2 || !Number.isFinite(vector[0]) || !Number.isFinite(vector[1])) return null;
  const length = Math.hypot(vector[0], vector[1]);
  return length < 1e-9 ? null : [vector[0] / length, vector[1] / length];
};
// A body heading (scene yaw, the renderer's holder rotation) as an [east, north] facing, and back.
const fromBodyYaw = yaw => Number.isFinite(yaw) ? [Math.sin(yaw), -Math.cos(yaw)] : null;
// Players and rivals store the camera-style yaw, behind the body.
const fromCameraYaw = yaw => fromBodyYaw(yaw + Math.PI);
const toward = (from, to) => from && to ? unit([to[0] - from[0], to[1] - from[1]]) : null;
/** An [east, north] facing as the scene yaw a body uses (east is +x, north is -z). */
export function facingYaw(facing) {
  const direction = unit(facing);
  return direction ? Math.atan2(direction[0], -direction[1]) : null;
}

const state = (kind, progress, durationMs, facing, extra = {}) => ({ kind, progress: clamp01(progress), durationMs, facing: facing ? [facing[0], facing[1]] : null, ...extra });
const live = action => action && action.outcome !== 'cancelled' && action.phase !== 'done' && Number.isFinite(action.remainingMs);
// Milliseconds since an action started, from the phase the town reports and what is left of it.
function elapsedOf(action, T) {
  if (action.phase === 'windup') return Math.max(0, T.windup - action.remainingMs);
  if (action.phase === 'contact') return Math.max(T.windup, T.windup + T.contact - action.remainingMs);
  if (action.phase === 'recovery') return Math.max(T.windup + T.contact, T.length - action.remainingMs);
  return Infinity;
}
const sinceContact = (action, T, ageMs) => action.outcome === 'hit' && ['contact', 'recovery'].includes(action.phase) ? elapsedOf(action, T) - T.windup + ageMs : null;
const swing = (action, T, ageMs, facing, extra) => {
  const progress = (elapsedOf(action, T) + ageMs) / T.length;
  return progress < 1 ? state(action.kind, progress, T.length, facing, { id: action.id, ...extra }) : null;
};
const idle = facing => facing ? state(null, 0, 0, facing) : null;
const S = COMBAT_TIMING.strike, C = COMBAT_TIMING.counter;

/**
 * The combat state of one figure from the town's snapshot: `{ kind, progress, durationMs, facing,
 * id?, side? }`, `{ kind: null, facing }` for a figure that is engaged but between actions, or
 * null. `players` carries health; `evade` is this client's own admitted evade
 * (`{ id, remainingMs, direction }`); `ageMs` is how old the snapshot is.
 */
export function combatStateFor(id, { crime, police, players, evade, ageMs = 0 } = {}) {
  const actions = (crime?.actions ?? []).filter(live), targets = crime?.targets ?? [], units = police?.units ?? [];
  const rival = targets.find(target => target.id === id);
  if (rival) {
    const facing = rival.engagedId ? fromCameraYaw(rival.yaw) : null;
    if (rival.incapacitated || rival.health === 0) return state('down', 1, 0, facing);
    if (rival.staggered) {
      const hits = actions.filter(action => action.kind === 'strike' && action.targetId === id).map(action => sinceContact(action, S, ageMs))
        .filter(since => since !== null && since >= 0 && since < COMBAT_TIMING.rivalStagger);
      if (hits.length) return state('flinch', Math.min(...hits) / COMBAT_TIMING.rivalStagger, COMBAT_TIMING.rivalStagger, facing);
    }
    for (const action of actions) if (action.kind === 'counter' && action.actorId === id) {
      const shown = swing(action, C, ageMs, unit(action.direction) ?? facing);
      if (shown) return shown;
    }
    return idle(facing);
  }
  const unitOf = units.find(item => item.id === id);
  if (unitOf) {
    const facing = unitOf.targetId ? fromBodyYaw(unitOf.yaw) : null;
    if (unitOf.state === 'grab') return state('grab', (COMBAT_TIMING.grab - (unitOf.remainingMs ?? 0) + ageMs) / COMBAT_TIMING.grab, COMBAT_TIMING.grab, facing);
    if (unitOf.state === 'arrest') return state('arrest', 1, 0, facing);
    return null;
  }
  // A player: their own strikes, the counters and grabs aimed at them, and what the town holds them in.
  const player = players?.find(item => item.id === id);
  const mine = actions.filter(action => action.actorId === id || action.targetId === id);
  const officer = units.find(item => item.targetId === id && (item.state === 'grab' || item.state === 'arrest'))
    ?? (police?.surrendered?.includes(id) || police?.subdued?.includes(id) ? units.find(item => item.targetId === id) : null);
  const opponent = targets.find(target => target.engagedId === id)
    ?? targets.find(target => mine.some(action => (action.kind === 'strike' ? action.targetId : action.actorId) === target.id));
  const focus = officer ?? opponent;
  const facing = toward(player?.position, focus?.position)
    ?? (mine.length ? unit(mine[0].kind === 'strike' ? mine[0].direction : mine[0].direction?.map(value => -value)) : null)
    ?? (officer ? fromBodyYaw(officer.yaw + Math.PI) : null);
  const landed = mine.filter(action => action.kind === 'counter' && action.targetId === id && action.outcome === 'hit');
  if (player?.health === 0 || landed.some(action => action.effect?.down && action.effect?.health === 0)) return state('down', 1, 0, facing);
  const held = units.some(item => item.targetId === id && item.state === 'arrest') || police?.surrendered?.includes(id) || police?.subdued?.includes(id);
  if (held) return state('surrender', 1, 0, facing);
  // The evade comes from this client's own reply, already current (crime-ui.js), not from the snapshot.
  if (evade && Number.isFinite(evade.remainingMs)) {
    const progress = (COMBAT_TIMING.evade - evade.remainingMs) / COMBAT_TIMING.evade;
    if (progress < 1) return state('evade', progress, COMBAT_TIMING.evade, facing, { id: evade.id, side: SIDES.includes(evade.direction) ? evade.direction : 'back' });
  }
  const recoils = landed.map(action => [sinceContact(action, C, ageMs), action]).filter(([since]) => since !== null && since >= 0 && since < COMBAT_TIMING.playerStagger);
  if (recoils.length) {
    const [since, action] = recoils.reduce((soonest, item) => item[0] < soonest[0] ? item : soonest);
    return state('flinch', since / COMBAT_TIMING.playerStagger, COMBAT_TIMING.playerStagger, unit(action.direction?.map(value => -value)) ?? facing);
  }
  for (const action of mine) if (action.kind === 'strike' && action.actorId === id) {
    const shown = swing(action, S, ageMs, unit(action.direction) ?? facing);
    if (shown) return shown;
  }
  return idle(facing);
}

/** Where a player's fight is: the officer reaching for them first, else the rival they fight. */
export function combatFocusFor(id, { crime, police } = {}) {
  const units = police?.units ?? [];
  const officer = units.find(item => item.targetId === id && (item.state === 'grab' || item.state === 'arrest'))
    ?? (police?.surrendered?.includes(id) || police?.subdued?.includes(id) ? units.find(item => item.targetId === id) : null);
  if (officer?.position) return [...officer.position];
  const actions = (crime?.actions ?? []).filter(live), targets = crime?.targets ?? [];
  const rival = targets.find(target => target.engagedId === id)
    ?? targets.find(target => actions.some(action => (action.actorId === id && action.targetId === target.id) || (action.targetId === id && action.actorId === target.id)));
  return rival?.position ? [...rival.position] : null;
}

/** The same state `ms` later, between snapshots: timed actions advance and end, held ones hold. */
export function advanceCombat(state, ms) {
  if (!state) return null;
  if (!state.kind) return state;
  if (TIMED.has(state.kind) && state.durationMs > 0) {
    const progress = state.progress + ms / state.durationMs;
    if (progress < 1) return { ...state, progress };
    return state.facing ? { ...state, kind: null, progress: 0, durationMs: 0 } : null;
  }
  if (state.kind === 'grab' && state.progress < 1) return { ...state, progress: clamp01(state.progress + ms / state.durationMs) };
  return state;
}

/**
 * Turn the body toward the focus yaw at a bounded, refresh-rate-independent rate while the feet
 * keep the travel heading. Seated, flying, no focus or no time: unchanged.
 */
export function combatFacing(travelHeading, yaw, focusYaw, { dt = 0, seated = false, flying = false } = {}) {
  if (!Number.isFinite(focusYaw) || !Number.isFinite(yaw) || seated || flying || !(dt > 0)) return { yaw, heading: travelHeading, engaged: false };
  const diff = wrap(focusYaw - yaw);
  // Rate-limited, then an exact exponential settle (refresh-rate independent) so the last degrees do not snap.
  const step = Math.min(Math.abs(diff) * (1 - Math.exp(-COMBAT_SETTLE * dt)), COMBAT_TURN_RATE * dt);
  return { yaw: yaw + Math.sign(diff) * step, heading: travelHeading, engaged: true };
}

// Pose authoring, in each bone's rest frame (avatars.js axes): upper arm x < 0 raises the arm
// forward, lower arm z > 0 bends the elbow, spine x > 0 leans forward, spine z leans sideways.
const smooth = t => { const s = clamp01(t); return s * s * (3 - 2 * s); };
const BONE_NAMES = ['spine_01', 'spine_02', 'spine_03', 'neck_01', 'head', 'clavicle_l', 'clavicle_r', 'upperarm_l', 'upperarm_r', 'lowerarm_l', 'lowerarm_r', 'hand_l', 'hand_r'];
const scale = (pose, factor) => Object.fromEntries(Object.entries(pose).map(([bone, angles]) => [bone, angles.map(angle => angle * factor)]));
const mix = (a, b, t) => Object.fromEntries(BONE_NAMES.filter(bone => a[bone] || b[bone]).map(bone => [bone, [0, 1, 2].map(i => (a[bone]?.[i] ?? 0) * (1 - t) + (b[bone]?.[i] ?? 0) * t)]));
// Keyframes [[progress, pose], ...] interpolated smoothly; a pose at 0 and 1 of {} is the posed rig.
const track = (keys, progress) => {
  for (let i = 1; i < keys.length; i++) {
    const [p0, a] = keys[i - 1], [p1, b] = keys[i];
    if (progress <= p1) return mix(a, b, smooth((progress - p0) / (p1 - p0)));
  }
  return keys.at(-1)[1];
};
const GUARD = { upperarm_l: [-.55, 0, .15], lowerarm_l: [0, 0, 1.25] };
const DRAWN = { ...GUARD, upperarm_r: [.5, 0, -.3], lowerarm_r: [0, 0, 1.35], spine_02: [-.06, 0, 0], spine_03: [-.04, 0, 0] };
const STRUCK = { ...GUARD, upperarm_r: [-1.45, 0, -.1], lowerarm_r: [0, 0, .12], spine_02: [.1, 0, 0], spine_03: [.22, 0, 0], head: [-.05, 0, 0] };
const RAISED = { upperarm_l: [-.45, 0, .15], lowerarm_l: [0, 0, 1.1], upperarm_r: [-1.55, 0, -.2], lowerarm_r: [0, -.9, 1.45], spine_03: [-.1, 0, 0], head: [-.06, 0, 0] };
const SWUNG = { upperarm_l: [-.4, 0, .15], lowerarm_l: [0, 0, 1.0], upperarm_r: [-1.3, 0, -.05], lowerarm_r: [0, 0, .15], spine_02: [.1, 0, 0], spine_03: [.25, 0, 0] };
const LEAN_BACK = { spine_01: [-.22, 0, 0], spine_02: [-.22, 0, 0], spine_03: [-.2, 0, 0], head: [-.12, 0, 0], upperarm_l: [-.5, 0, .15], upperarm_r: [-.5, 0, -.15], lowerarm_l: [0, 0, 1.1], lowerarm_r: [0, 0, 1.1] };
const lean = sign => ({ spine_01: [-.06, 0, sign * .2], spine_02: [-.06, 0, sign * .22], spine_03: [-.05, 0, sign * .2], head: [0, 0, sign * .1], upperarm_l: [-.5, 0, .15], upperarm_r: [-.5, 0, -.15], lowerarm_l: [0, 0, 1.1], lowerarm_r: [0, 0, 1.1] });
const RECOIL = { spine_01: [-.18, 0, 0], spine_02: [-.18, 0, 0], spine_03: [-.18, 0, 0], head: [-.2, 0, .1], upperarm_l: [-.7, 0, .2], upperarm_r: [-.7, 0, -.2], lowerarm_l: [0, 0, 1.3], lowerarm_r: [0, 0, 1.3] };
const DOWN = { spine_01: [.45, 0, 0], spine_02: [.5, 0, 0], spine_03: [.5, 0, 0], neck_01: [.15, 0, 0], head: [.3, 0, 0], upperarm_l: [-.2, 0, .15], upperarm_r: [-.2, 0, -.15], lowerarm_l: [0, 0, .4], lowerarm_r: [0, 0, .4] };
const REACH = { upperarm_l: [-1.45, 0, .15], upperarm_r: [-1.45, 0, -.15], lowerarm_l: [0, 0, .2], lowerarm_r: [0, 0, .2], spine_03: [.15, 0, 0], head: [.05, 0, 0] };
const HOLD = { upperarm_l: [-.85, 0, .1], upperarm_r: [-.85, 0, -.1], lowerarm_l: [0, 0, .55], lowerarm_r: [0, 0, .55], spine_03: [.12, 0, 0], head: [.08, 0, 0] };
// Forearms twisted so the elbow bend lifts the hands, and a shrug: hands clear the neck on every rig.
const HANDS_UP = { clavicle_l: [-.3, 0, 0], clavicle_r: [-.3, 0, 0], upperarm_l: [-1.6, 0, 0], upperarm_r: [-1.6, 0, 0], lowerarm_l: [0, -1.05, 1.45], lowerarm_r: [0, -1.05, 1.45], spine_03: [-.05, 0, 0], head: [-.05, 0, 0] };
// A negative spine z leans the body to +x, the rig's left (probed on every shipped rig).
const LEAN_SIGN = -1;
const STRIKE_KEYS = [[0, {}], [S.windup / S.length, DRAWN], [(S.windup + S.contact / 2) / S.length, STRUCK], [(S.windup + S.contact) / S.length + .12, scale(STRUCK, .55)], [1, {}]];
const COUNTER_KEYS = [[0, {}], [.3 * C.windup / C.length, RAISED], [C.windup / C.length, RAISED], [(C.windup + C.contact / 2) / C.length, SWUNG], [(C.windup + C.contact) / C.length + .14, scale(SWUNG, .5)], [1, {}]];
const POSES = {
  strike: (p, { reducedMotion }) => reducedMotion ? null : track(STRIKE_KEYS, p),
  counter: (p, { reducedMotion }) => reducedMotion ? (p < C.windup / C.length ? RAISED : null) : track(COUNTER_KEYS, p),
  evade: (p, { reducedMotion, side }) => reducedMotion ? null : scale(side === 'left' ? lean(LEAN_SIGN) : side === 'right' ? lean(-LEAN_SIGN) : LEAN_BACK, Math.sin(Math.PI * p)),
  flinch: (p, { reducedMotion }) => reducedMotion ? null : scale(RECOIL, Math.sin(Math.PI * p)),
  down: () => DOWN,
  grab: (p, { reducedMotion }) => reducedMotion ? REACH : scale(REACH, smooth(p / .7)),
  arrest: () => HOLD,
  surrender: () => HANDS_UP,
};

const adjustment = new THREE.Quaternion();
/**
 * Multiply the pose for `state` onto a posed rig (`{ bones, axes }` from avatars.js
 * instantiateAvatar), scaled by `weight`. Returns whether anything was applied. Reduced motion:
 * no swings; held states and the counter's telegraph show one static key pose.
 */
export function applyCombatPose(rig, state, { weight, side, reducedMotion = false } = {}) {
  const strength = weight ?? state?.weight ?? 1;
  if (!rig?.bones || !state?.kind || !POSES[state.kind] || !(strength > 0)) return false;
  const pose = POSES[state.kind](clamp01(state.progress), { reducedMotion, side: side ?? state.side ?? 'back' });
  if (!pose) return false;
  for (const bone of rig.bones) {
    const angles = pose[bone.name];
    if (!angles) continue;
    const axes = rig.axes.get(bone);
    for (const [i, axis] of ['x', 'y', 'z'].entries()) {
      const angle = angles[i] * strength;
      if (angle) { adjustment.setFromAxisAngle(axes[axis], angle); bone.quaternion.multiply(adjustment); }
    }
  }
  return true;
}

// Ease into and out of a pose over this long; a change crossfades between at most two layers.
const EASE_MS = 240;
const layerKey = state => `${state.kind}:${state.id ?? ''}`;
/** Eases combat states in and out, crossfades a change, never runs an action backwards. */
export function createCombatBlend() {
  let layers = [], lastAt = null;
  const publish = () => layers.map(({ kind, progress, side, id, weight }) => ({ kind, progress, side, id, weight }));
  return {
    step(state, now, { reducedMotion = false } = {}) {
      const kind = state?.kind ?? null;
      if (reducedMotion) {
        layers = kind ? [{ kind, progress: state.progress, side: state.side, id: state.id, weight: 1, fading: false, since: now }] : [];
        lastAt = now; return publish();
      }
      const dt = lastAt === null ? 0 : Math.max(0, now - lastAt);
      const current = layers.at(-1);
      if (kind && current && !current.fading && current.key === layerKey(state)) {
        current.progress = Math.max(current.progress, state.progress); current.side = state.side;
      } else {
        for (const layer of layers) layer.fading = true;
        // Rises from the last frame, as the old layer falls from it, so the weights sum to one on the
        // frame of the change; after a gap in frames (hidden figure, suspended tab) it starts further in.
        if (kind) layers.push({ key: layerKey(state), kind, progress: state.progress, side: state.side, id: state.id, weight: 0, fading: false, since: lastAt ?? now });
      }
      while (layers.length > 2) layers.shift();
      const rising = layers.find(layer => !layer.fading);
      if (rising) rising.weight = clamp01((now - rising.since) / EASE_MS);
      for (const layer of layers) if (layer.fading) layer.weight = Math.min(Math.max(0, layer.weight - dt / EASE_MS), rising ? 1 - rising.weight : 1);
      layers = layers.filter(layer => !layer.fading || layer.weight > 0);
      lastAt = now;
      return publish();
    },
    reset() { layers = []; lastAt = null; },
  };
}

const parse = text => { try { return typeof text === 'string' ? JSON.parse(text) : null; } catch { return null; } };
const validFacing = facing => facing === null || facing === undefined || Array.isArray(facing) && facing.length === 2 && facing.every(Number.isFinite);
/** Reads the HUD's published `combatState` / `combatFocus` and plays the state forward from when it was first seen. */
export function createCombatReader() {
  let seen = null;
  return (dataset, now) => {
    const text = dataset?.combatState;
    if (typeof text !== 'string') seen = null;
    else if (seen?.text !== text) {
      const value = parse(text);
      const ok = value && typeof value === 'object' && COMBAT_KINDS.includes(value.kind) && Number.isFinite(value.progress) && value.progress >= 0 && value.progress <= 1
        && Number.isFinite(value.durationMs) && value.durationMs >= 0 && (value.durationMs > 0 || !(TIMED.has(value.kind) || value.kind === 'grab')) && validFacing(value.facing) && (value.side === undefined || SIDES.includes(value.side))
        && (value.id === undefined || typeof value.id === 'string');
      seen = ok ? { text, at: now, state: { kind: value.kind, progress: value.progress, durationMs: value.durationMs, facing: value.facing ?? null, ...(value.side ? { side: value.side } : {}), ...(value.id ? { id: value.id } : {}) } } : null;
    }
    const focus = parse(dataset?.combatFocus);
    return { state: seen ? advanceCombat(seen.state, now - seen.at) : null, focus: Array.isArray(focus) && focus.length === 3 && focus.every(Number.isFinite) ? focus : null };
  };
}

/** The local player's side: reads the HUD, faces the focus while engaged, blends their own pose. */
export function createLocalCombat() {
  const read = createCombatReader(), blend = createCombatBlend();
  return {
    update({ dataset, now, dt, position, yaw, heading, seated = false, flying = false, reducedMotion = false }) {
      const { state, focus } = read(dataset, now);
      const layers = blend.step(state, now, { reducedMotion });
      const focusYaw = focus && position ? Math.atan2(focus[0] - position.x, -focus[1] - position.z) : null;
      const turned = combatFacing(heading, yaw, focusYaw, { dt, seated, flying });
      return { yaw: turned.engaged ? turned.yaw : null, heading: turned.heading, layers, active: layers.length > 0, state, focus };
    },
    reset() { blend.reset(); },
  };
}
