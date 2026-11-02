// Before a Ribbonwing journey lands or lifts off, move clear of anything that would stop it (#841).
// A landing craft stops over anything solid (carriage-motion.js stepHoverLift) and, inside an
// obstacle's flight margin, cannot drive on either; a craft parked inside that margin (wider
// than the one for driving) cannot lift. Since the Five Rooms, the Ribbon's posts run beside the
// street every Ribbonwing journey flies up from the spawn, and Val (2026-11-01) kept them solid
// to flight: the journeys land and lift clear, as a player would.
//
// The spot under the craft is checked with the rule the page uses (hoverClear on walking.js's
// environment for the served district) at every height of the descent, there and a metre ahead
// (climbClear), so the craft does not stop on the edge of a margin. While it is blocked,
// clearHoverSpot picks the nearest clear spot, turns the craft in place to face it and drives
// there, polling the placement throughout (the first turn learns which way KeyA turns). Call it
// aloft before pressing G; on the ground, reverseClear backs a craft out before Space.
import { createWalkingEnvironment } from '../src/walking.js';
import { hoverClear } from '../src/carriage-motion.js';

const environments = new Map();
async function environmentFor(page) {
  const origin = new URL(page.url()).origin;
  if (!environments.has(origin)) {
    const world = await (await page.request.get(`${origin}/data/district.json`)).json();
    environments.set(origin, createWalkingEnvironment(world));
  }
  return environments.get(origin);
}

// The nearest clear spot to `state` at its heading, out to 10 m.
function nearestClear(state, environment) {
  for (let radius = 0.5; radius <= 10; radius += 0.5)
    for (let i = 0; i < 24; i++) {
      const angle = (i / 24) * Math.PI * 2, position = [state.position[0] + Math.cos(angle) * radius, state.position[1], state.position[2] + Math.sin(angle) * radius];
      if (climbClear({ ...state, position }, environment)) return position;
    }
  return null;
}

const wrap = angle => Math.atan2(Math.sin(angle), Math.cos(angle));

export async function clearHoverSpot(page, { focus, tries = 8, timeout = 10000, label = 'landing' }) {
  const environment = await environmentFor(page);
  const craft = () => page.evaluate(() => { const p = window.__riverCarriage().placement; return p && { vehicle: 'hover', position: p.position, yaw: p.yaw, altitude: 0, speed: p.speed ?? 0 }; });
  // Hold `keys` until `done(state)` or the timeout, polling the placement: frame rate only changes how long it takes.
  const holdUntil = async (keys, done) => {
    await focus();
    for (const key of keys) await page.keyboard.down(key);
    const started = Date.now();
    try { for (let state = await craft(); !done(state) && Date.now() - started < timeout; state = await craft()) await page.waitForTimeout(40); }
    finally { for (const key of keys) await page.keyboard.up(key); }
    await page.waitForFunction(() => Math.abs(window.__riverCarriage().placement?.speed ?? 0) < 0.1, null, { timeout }).catch(() => {});
  };
  let state = await craft(), target = null, raise = null;
  for (let n = 0; n < tries && !climbClear(state, environment); n++) {
    target = nearestClear(state, environment);
    if (!target) break;
    // Aloft the craft turns in place (carriage-motion.js stepCarriage). It moves along
    // (-cos yaw, sin yaw) in scene x, z, so it faces the target at yaw atan2(dz, -dx).
    const dx = target[0] - state.position[0], dz = target[2] - state.position[2], facing = Math.atan2(dz, -dx);
    if (raise === null) {
      const before = state.yaw;
      await holdUntil(['KeyA'], now => Math.abs(wrap(now.yaw - before)) > 0.05);
      raise = wrap((await craft()).yaw - before) > 0;
    }
    const error = wrap(facing - (await craft()).yaw);
    if (Math.abs(error) > 0.08) {
      const key = (error > 0) === raise ? 'KeyA' : 'KeyD', sign = Math.sign(error);
      await holdUntil([key], now => sign * wrap(facing - now.yaw) < 0.06);
    }
    // Drive until the target is no longer ahead.
    await holdUntil(['KeyW'], now => (-Math.cos(now.yaw) * (target[0] - now.position[0]) + Math.sin(now.yaw) * (target[2] - now.position[2])) < 0.15);
    state = await craft();
  }
  if (climbClear(state, environment)) return { east: state.position[0], north: -state.position[2] };
  throw new Error(`${label}: no clear spot for the craft after ${tries} tries (at ${state?.position[0].toFixed(2)}, ${(-state?.position[2]).toFixed(2)}; target ${target ? `${target[0].toFixed(2)}, ${(-target[2]).toFixed(2)}` : 'none'})`);
}

// Back a grounded craft straight up until it may lift, keeping its heading: a drive that ends
// beside the Ribbon's first posts reverses out of their flight margin (#841). It stops once the
// whole climb (0-6 m) is clear here and a metre ahead, not on the margin's edge, where the town's
// own check could still refuse the lift. Closed loop on the clearance, so a slow runner only
// takes longer.
function climbClear(state, environment) {
  const ahead = [-Math.cos(state.yaw), Math.sin(state.yaw)];
  return [0, 1].every(offset => [0, 1, 2, 3, 4, 5, 6].every(altitude => hoverClear({ ...state, altitude, position: [state.position[0] + ahead[0] * offset, state.position[1], state.position[2] + ahead[1] * offset] }, environment)));
}
export async function reverseClear(page, { focus, timeout = 15000, label = 'lifting off' }) {
  const environment = await environmentFor(page);
  const craft = () => page.evaluate(() => { const p = window.__riverCarriage().placement; return p && { vehicle: 'hover', position: p.position, yaw: p.yaw, altitude: 0 }; });
  if (climbClear(await craft(), environment)) return 0;
  const started = Date.now();
  await focus(); await page.keyboard.down('KeyS');
  try {
    while (!climbClear(await craft(), environment)) {
      if (Date.now() - started > timeout) { const state = await craft(); throw new Error(`${label}: the craft found no clear spot reversing (at ${state.position[0].toFixed(2)}, ${(-state.position[2]).toFixed(2)})`); }
      await page.waitForTimeout(100);
    }
  } finally { await page.keyboard.up('KeyS'); }
  await page.waitForFunction(() => Math.abs(window.__riverCarriage().placement?.speed ?? 0) < 0.03, null, { timeout: 15000 }).catch(() => {});
  return Date.now() - started;
}
