// @ts-check
// The Ribbonwing's mechanisms (#777): canopy, boarding steps, landing gear,
// wing tuck, fan spin and nozzle vectoring. Every value is cosmetic and is
// derived from the craft's accepted (authoritative) state through
// `ribbonwingTargets`; `createRibbonwingRig().step` moves each mechanism toward
// its target at its authored stroke rate, so an interrupted transition simply
// reverses from wherever it is. Interlocks keep the mechanisms mechanically
// consistent: steps only deploy on deployed gear with the canopy open, the
// gear only retracts with the steps stowed and the canopy shut, and the canopy
// only opens on the ground.
import { MECHANISMS } from './ribbonwing-design.js';

/** @typedef {'parked'|'boarding'|'ready'|'takeoff'|'hover'|'cruise'|'maneuver'|'recover'|'landing'} RibbonwingPhase */
/** @typedef {{canopy:number,steps:number,gear:number,tuck:number,fanRate:number,nozzlePitch:number,nozzleYaw:number}} RibbonwingMechanisms */

export const RIBBONWING_PHASES = Object.freeze(/** @type {RibbonwingPhase[]} */ (['parked', 'boarding', 'ready', 'takeoff', 'hover', 'cruise', 'maneuver', 'recover', 'landing']));

// Non-finite input falls to the neutral value (0 within the range), never to an extreme.
const clamp = (/** @type {number} */ v, /** @type {number} */ lo = 0, /** @type {number} */ hi = 1) => Math.max(lo, Math.min(hi, Number.isFinite(v) ? v : 0));

// Gear stays down below this altitude and retracts above the next one.
export const GEAR_DOWN_BELOW = 2.2;
export const GEAR_UP_ABOVE = 3.0;

/**
 * Mechanism targets for an accepted craft state.
 * @param {{phase?:RibbonwingPhase,altitude?:number,speed?:number,maxSpeed?:number,turn?:number,tuck?:number,occupied?:boolean,boarding?:boolean}} state
 * @returns {RibbonwingMechanisms}
 */
export function ribbonwingTargets({ phase = 'parked', altitude = 0, speed = 0, maxSpeed = 9, turn = 0, tuck = 0, occupied = false, boarding = false } = {}) {
  const grounded = altitude <= .1, cruise = clamp(Math.abs(speed) / Math.max(1, maxSpeed));
  const { fans, nozzles } = MECHANISMS;
  const canopy = grounded && (boarding || phase === 'boarding') ? 1 : 0;
  const gear = grounded || phase === 'landing' || altitude < GEAR_DOWN_BELOW ? 0 : altitude > GEAR_UP_ABOVE ? 1 : NaN;
  const powered = occupied || !grounded;
  const fanRate = !powered ? 0 : grounded ? fans.idle : phase === 'maneuver' ? fans.max : fans.hover - (fans.hover - fans.idle) * .45 * cruise;
  const nozzlePitch = !powered ? 0 : grounded ? nozzles.hover : phase === 'maneuver' ? nozzles.cruise : nozzles.hover + (nozzles.cruise - nozzles.hover) * cruise;
  return { canopy, steps: canopy, gear, tuck: clamp(tuck), fanRate, nozzlePitch, nozzleYaw: clamp(turn, -1, 1) * nozzles.yawLimit };
}

/** @param {Partial<RibbonwingMechanisms>} [initial] */
export function createRibbonwingRig(initial = {}) {
  /** @type {RibbonwingMechanisms} */
  const value = { canopy: 0, steps: 0, gear: 0, tuck: 0, fanRate: 0, nozzlePitch: 0, nozzleYaw: 0, ...initial };
  const toward = (/** @type {number} */ from, /** @type {number} */ to, /** @type {number} */ rate, /** @type {number} */ dt) => from + Math.sign(to - from) * Math.min(Math.abs(to - from), rate * dt);
  return {
    get value() { return { ...value }; },
    /** Advance toward `targets` by `dt` seconds (clamped to 0..0.1 s). @param {RibbonwingMechanisms} targets @param {number} dt */
    step(targets, dt) {
      const t = clamp(dt, 0, .1), { canopy, steps, gear, wings, fans, nozzles } = MECHANISMS;
      // Gear target NaN means "hold" (the band between GEAR_DOWN_BELOW and GEAR_UP_ABOVE).
      let gearTarget = Number.isNaN(targets.gear) ? value.gear : clamp(targets.gear);
      // Interlocks: gear retracts only with steps stowed and canopy shut;
      // steps deploy only on deployed gear with the canopy at least half open;
      // the canopy shuts only after the steps are nearly stowed.
      if (gearTarget > value.gear && (value.steps > 0 || value.canopy > 0)) gearTarget = value.gear;
      let stepsTarget = clamp(targets.steps);
      if (stepsTarget > value.steps && (value.gear > 0 || value.canopy < .5)) stepsTarget = value.steps;
      let canopyTarget = clamp(targets.canopy);
      if (canopyTarget < value.canopy && value.steps > .1 && value.canopy <= .5) canopyTarget = value.canopy;
      value.gear = toward(value.gear, gearTarget, 1 / gear.duration, t);
      value.steps = toward(value.steps, stepsTarget, 1 / steps.duration, t);
      value.canopy = toward(value.canopy, canopyTarget, 1 / canopy.duration, t);
      value.tuck = toward(value.tuck, clamp(targets.tuck), 1 / wings.duration, t);
      value.fanRate = toward(value.fanRate, clamp(targets.fanRate, 0, fans.max), fans.max / fans.spinUp, t);
      value.nozzlePitch = toward(value.nozzlePitch, clamp(targets.nozzlePitch, -nozzles.limit, nozzles.limit), nozzles.slew, t);
      value.nozzleYaw = toward(value.nozzleYaw, clamp(targets.nozzleYaw, -nozzles.yawLimit, nozzles.yawLimit), nozzles.slew, t);
      return { ...value };
    },
    /** Jump to targets (a craft created already in some state). @param {RibbonwingMechanisms} targets */
    settle(targets) {
      Object.assign(value, { canopy: clamp(targets.canopy), steps: clamp(targets.steps), gear: Number.isNaN(targets.gear) ? value.gear : clamp(targets.gear), tuck: clamp(targets.tuck), fanRate: targets.fanRate, nozzlePitch: targets.nozzlePitch, nozzleYaw: targets.nozzleYaw });
      return { ...value };
    },
  };
}

/** Mechanism angles (radians) for applying a rig value to the model. @param {RibbonwingMechanisms} v */
export function mechanismAngles(v) {
  const m = MECHANISMS;
  return {
    canopy: v.canopy * m.canopy.open,
    steps: m.steps.stowed + v.steps * (m.steps.deployed - m.steps.stowed),
    gear: v.gear * m.gear.retracted,
    wingSweep: v.tuck * m.wings.tuck,
    wingDroop: v.tuck * m.wings.droop,
    nozzlePitch: v.nozzlePitch,
    nozzleYaw: v.nozzleYaw,
  };
}
