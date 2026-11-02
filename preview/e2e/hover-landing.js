// Before a Ribbonwing journey lands or lifts off, move clear of anything that would stop it (#841).
// A landing craft stops over anything solid (carriage-motion.js stepHoverLift) and, inside an
// obstacle's flight margin, cannot drive on either; a craft parked inside that margin (wider
// than the one for driving) cannot lift. Since the Five Rooms, the Ribbon's posts run beside the
// street every Ribbonwing journey flies up from the spawn, and Val (2026-11-01) kept them solid
// to flight: the journeys land and lift clear, as a player would.
//
// The spot under the craft is checked with the rule the page uses (hoverClear on walking.js's
// environment for the served district) at every height of the descent, there and a metre ahead
// (climbClear), so the craft does not stop on the edge of a margin. While it is blocked, this picks the nearest clear spot
// at the craft's current heading and steers toward it in short hops (driving, or aloft): the
// first hop learns which way KeyA turns. Call it aloft before pressing G; on the ground,
// reverseClear backs a craft out before Space.
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

export async function clearHoverSpot(page, { focus, hops = 20, label = 'landing' }) {
  const environment = await environmentFor(page);
  const craft = () => page.evaluate(() => { const p = window.__riverCarriage().placement; return p && { vehicle: 'hover', position: p.position, yaw: p.yaw, altitude: 0 }; });
  const hop = async (keys, ms) => {
    await focus();
    for (const key of keys) await page.keyboard.down(key);
    await page.waitForTimeout(ms);
    for (const key of keys) await page.keyboard.up(key);
    await page.waitForFunction(() => Math.abs(window.__riverCarriage().placement?.speed ?? 0) < 0.3, null, { timeout: 15000 }).catch(() => {});
  };
  let state = await craft(), target = null, raise = null;
  for (let n = 0; n < hops && !climbClear(state, environment); n++) {
    target = nearestClear(state, environment); // at the current heading: each turn moves the hull's samples
    if (!target) break;
    // The craft moves along (-cos yaw, sin yaw) in scene x, z; raising yaw turns it toward
    // (sin yaw, cos yaw). Turn toward the target, or drive straight once it is ahead.
    const to = [target[0] - state.position[0], target[2] - state.position[2]], length = Math.hypot(...to) || 1;
    const ahead = (-Math.cos(state.yaw) * to[0] + Math.sin(state.yaw) * to[1]) / length, side = (Math.sin(state.yaw) * to[0] + Math.cos(state.yaw) * to[1]) / length;
    const reverse = ahead < -0.3, forward = reverse ? 'KeyS' : 'KeyW';
    if (Math.abs(side) < 0.25) await hop([forward], 500);
    else {
      const wantRaise = (side > 0) !== reverse;
      const key = raise === null ? 'KeyA' : (wantRaise === raise ? 'KeyA' : 'KeyD');
      const before = state.yaw;
      await hop([forward, key], 600);
      const after = await craft();
      if (raise === null && Math.abs(after.yaw - before) > 0.01) raise = (after.yaw > before) === (key === 'KeyA');
    }
    state = await craft();
  }
  if (climbClear(state, environment)) return { east: state.position[0], north: -state.position[2] };
  throw new Error(`${label}: no clear spot for the craft after ${hops} hops (at ${state?.position[0].toFixed(2)}, ${(-state?.position[2]).toFixed(2)}; target ${target ? `${target[0].toFixed(2)}, ${(-target[2]).toFixed(2)}` : 'none'})`);
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
