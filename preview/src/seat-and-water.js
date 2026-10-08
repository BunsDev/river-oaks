import { groundSurfaceHeight } from './world-surface.js';
import { SIT_REACH, WATER_MS, benchSeats, boutiquePlanters, buildPlanters, buildSeats, lanePlanters, nearestPlanter, nearestSeat } from './world-interactions.js';

// Z on foot: sit on the nearest free seat (a storefront bench place, or a
// seat Jevica built), or water the nearest planter. Z while seated: stand up.
// In the shared town the server decides through the shared seating commands,
// and everyone sees the confirmed result.
// Watering is only an animation; planters keep no state.
export function createSeatAndWater({ walking, playerAvatar, getLocals = () => [], getMultiplayer = () => null, isBusy = () => false }) {
  let world = null, benches = [], staticPlanters = [], busy = false, lastWater = -Infinity;
  const builds = () => getMultiplayer()?.snapshot?.builds ?? [];
  const seats = () => [...benches, ...buildSeats(builds())];
  const planters = () => [...staticPlanters, ...buildPlanters(builds())];
  const ground = (x, north) => groundSurfaceHeight(world, x, -north);
  const sameRoom = site => (walking.environment?.roomAt?.(site.x, -site.north)?.storeId ?? null) === (walking.roomId ?? null);
  const notify = text => walking.notify?.(text);
  const residentSeats = () => new Set((getLocals() ?? []).filter(local => local.life?.seat).map(local => local.life.seat.id));

  // Seats held by a resident or another player, as `${buildId}:${slot}`.
  const taken = () => {
    const held = residentSeats(), multiplayer = getMultiplayer();
    for (const player of multiplayer?.snapshot?.players ?? [])
      if (player.sitting && player.id !== multiplayer.identity?.id) held.add(`${player.sitting.buildId}:${player.sitting.slot}`);
    return held;
  };

  async function command(message) {
    const multiplayer = getMultiplayer();
    if (!multiplayer?.connected) { notify('Reconnect before taking an action.'); return null; }
    // The seats panel sends seat commands too; one request at a time between them.
    if (busy || isBusy()) return null;
    busy = true;
    try {
      const result = await multiplayer.command(message);
      if (!result.ok) { notify(result.message ?? 'The town could not confirm that.'); return null; }
      return result;
    } catch (error) { notify(error.message); return null; }
    finally { busy = false; }
  }

  async function sit(seat) {
    if (busy) return;
    const pose = walking.getPose();
    if (!pose || pose.sitting) return;
    const result = await command({ type: 'sit', buildId: seat.buildId, slot: seat.slot });
    if (result?.player) walking.applyServerPose(result.player);
  }

  async function stand() {
    if (busy || !walking.getPose()?.sitting) return;
    const result = await command({ type: 'stand' });
    if (result?.player) walking.applyServerPose(result.player);
  }

  async function water(planter) {
    const now = performance.now();
    if (busy || now - lastWater < 1500) return;
    if (!await command({ type: 'water', planterId: planter.id })) return;
    lastWater = performance.now();
    const target = [planter.x, ground(planter.x, planter.north), -planter.north];
    // Turn to the planter: the camera looks where the body faces.
    walking.lookAt?.([planter.x, planter.north, target[1]], 0.5);
    playerAvatar.water(lastWater, target, WATER_MS);
  }

  return {
    // World data and the open-pavement test the street furniture is drawn with.
    load(next, isFree) {
      world = next;
      benches = benchSeats(world);
      staticPlanters = [...boutiquePlanters(world), ...lanePlanters(world, isFree)];
    },
    // For the seats panel: whether a seat command is in flight, storefront bench
    // places, and whether a resident holds one.
    busy: () => busy,
    benches: () => benches,
    residentHolds: key => residentSeats().has(key),
    // What Z does right now, for the walking controls.
    interaction() {
      if (!world || !walking.active || !getMultiplayer()?.connected) return null;
      const pose = walking.getPose();
      if (!pose) return null;
      // The contextual HUD and seats panel share these authoritative actions.
      // Z remains the direct shortcut in either presentation.
      if (pose.sitting) return { kind: 'stand', label: 'Stand up', run: stand, disabled: busy || isBusy() };
      if (pose.riding || pose.flying) return null;
      const position = [pose.position[0], -pose.position[2]];
      const seat = nearestSeat(seats().filter(sameRoom), position, { reach: SIT_REACH, taken: taken() });
      if (seat) return { kind: 'sit', targetId: seat.id, label: seat.kind === 'bench' ? 'Sit on the bench' : seat.kind === 'armchair' ? 'Sit in the chair' : 'Sit on the seat', run: () => sit(seat), disabled: busy || isBusy() };
      const planter = nearestPlanter(planters().filter(sameRoom), position);
      if (planter) return { kind: 'water', targetId: planter.id, label: 'Water the planter', run: () => water(planter), disabled: busy || isBusy() || playerAvatar.watering };
      return null;
    },
    // For tests and the debug overlay.
    sites() { return { seats: seats(), planters: planters(), taken: [...taken()] }; },
  };
}
