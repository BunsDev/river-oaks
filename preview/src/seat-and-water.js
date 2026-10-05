import { Quaternion, Vector3 } from 'three';
import { groundSurfaceHeight } from './world-surface.js';
import { WATER_MS, benchSeats, boutiquePlanters, buildPlanters, buildSeats, lanePlanters, nearestPlanter, nearestSeat } from './world-interactions.js';

const UP = new Vector3(0, 1, 0);

// Z on foot: sit on the nearest free seat, or water the nearest planter.
// Z (or moving) while seated: stand up. In the shared town the server decides
// and everyone sees it; in single player it happens here. Watering is only an
// animation; planters keep no state.
export function createSeatAndWater({ walking, playerAvatar, getLocals = () => [], getMultiplayer = () => null }) {
  let world = null, staticSeats = [], staticPlanters = [], seated = null, busy = false, lastWater = -Infinity;
  const builds = () => getMultiplayer()?.snapshot?.builds ?? [];
  const seats = () => [...staticSeats, ...buildSeats(builds())];
  const planters = () => [...staticPlanters, ...buildPlanters(builds())];
  const scene = (x, north, lift = 0) => [x, groundSurfaceHeight(world, x, -north) + lift, -north];
  const sameRoom = site => (walking.environment?.roomAt?.(site.x, -site.north)?.storeId ?? null) === (walking.roomId ?? null);
  const notify = text => walking.notify?.(text);

  // Seats held by a resident or another player.
  const taken = () => {
    const held = new Set();
    for (const local of getLocals() ?? []) if (local.life?.seat) held.add(local.life.seat.id);
    const multiplayer = getMultiplayer();
    for (const player of multiplayer?.snapshot?.players ?? []) if (player.seat && player.id !== multiplayer.selfId) held.add(player.seat.id);
    return held;
  };

  // A seat is a stationary ride: the walking controls hold the body on it and
  // the avatar takes the seated pose. Moving asks to stand.
  function controller(seat) {
    const point = scene(seat.x, seat.north, seat.height);
    return {
      pose: {
        kind: 'seat', seatId: seat.id, seat: point, seatToFloor: seat.height, yaw: seat.heading,
        quaternion: new Quaternion().setFromAxisAngle(UP, seat.heading).toArray(),
        // Frame the sitter from the front, a little to one side.
        cameraTarget: [point[0], point[1] + 0.85, point[2]], cameraDistance: 3.4, cameraYaw: seat.heading + 0.6, cameraPitch: -0.18,
      },
      step(input) { if (input.forward || input.strafe || input.lift) void stand(); },
      brake() {}, takeOver() {},
      stop() { seated = null; },
    };
  }

  function mount(seat, standAt) {
    seated = { seat, standAt, at: performance.now() };
    if (walking.mount(controller(seat))) return true;
    seated = null;
    return false;
  }

  async function sit(seat) {
    if (busy || seated) return;
    const pose = walking.getPose();
    if (!pose) return;
    const standAt = [pose.position[0], -pose.position[2]];
    const multiplayer = getMultiplayer();
    if (!multiplayer) { if (!mount(seat, standAt)) notify('You cannot sit down here.'); return; }
    busy = true;
    try {
      const result = await multiplayer.command({ type: 'interact', action: 'sit', targetId: seat.id });
      if (!result.ok) { notify(result.message ?? 'You cannot sit there.'); return; }
      if (!mount(seat, standAt)) await multiplayer.command({ type: 'interact', action: 'stand' });
    } catch (error) { notify(error.message); }
    finally { busy = false; }
  }

  async function stand() {
    if (busy || !seated) return;
    const { standAt } = seated, multiplayer = getMultiplayer();
    // Leave the seat here first: the stand request then goes out before any
    // pose from the standing spot, so the town never sees a stale seated pose.
    seated = null;
    if (walking.riding) walking.dismount(scene(standAt[0], standAt[1]));
    if (!multiplayer) return;
    busy = true;
    try {
      const result = await multiplayer.command({ type: 'interact', action: 'stand' });
      // The town returns where it stood the player up, normally the same spot.
      const position = result.ok && result.player ? [result.player.position[0], result.player.position[1]] : null;
      if (position && Math.hypot(position[0] - standAt[0], position[1] - standAt[1]) > 0.3) walking.dismount?.(scene(position[0], position[1]));
    } catch { /* The next pose moves the town too. */ }
    finally { busy = false; }
  }

  async function water(planter) {
    const now = performance.now();
    if (busy || now - lastWater < 1500) return;
    const target = scene(planter.x, planter.north);
    const multiplayer = getMultiplayer();
    if (multiplayer) {
      busy = true;
      try {
        const result = await multiplayer.command({ type: 'interact', action: 'water', targetId: planter.id });
        if (!result.ok) { notify(result.message ?? 'You cannot water that.'); return; }
      } catch (error) { notify(error.message); return; }
      finally { busy = false; }
    }
    lastWater = performance.now();
    // Turn to the planter: the camera looks where the body faces.
    walking.lookAt?.([planter.x, planter.north, target[1]], 0.5);
    playerAvatar.water(lastWater, target, WATER_MS);
  }

  return {
    // World data and the open-pavement test the street furniture is drawn with.
    load(next, isFree) {
      world = next;
      staticSeats = benchSeats(world);
      staticPlanters = [...boutiquePlanters(world), ...lanePlanters(world, isFree)];
      seated = null;
    },
    get seated() { return seated?.seat.id ?? null; },
    // For tests and the debug overlay.
    sites() { return { seats: seats(), planters: planters(), taken: [...taken()] }; },
    // What Z does right now, for the walking controls.
    interaction() {
      if (!world || !walking.active) return null;
      const pose = walking.getPose();
      if (!pose) return null;
      if (pose.riding?.kind === 'seat') return { kind: 'stand', label: 'Stand up', run: stand, disabled: busy };
      if (pose.riding || pose.flying) return null;
      const position = [pose.position[0], -pose.position[2]];
      const seat = nearestSeat(seats().filter(sameRoom), position, { taken: taken() });
      if (seat) return { kind: 'sit', targetId: seat.id, label: seat.kind === 'bench' ? 'Sit on the bench' : seat.kind === 'armchair' ? 'Sit in the chair' : 'Sit on the seat', run: () => sit(seat), disabled: busy };
      const planter = nearestPlanter(planters().filter(sameRoom), position);
      if (planter) return { kind: 'water', targetId: planter.id, label: 'Water the planter', run: () => water(planter), disabled: busy || playerAvatar.watering };
      return null;
    },
    // The town stood this player up (a seat removed, a revoked home): follow it.
    syncSelf(self) {
      // A snapshot taken just before the town seated this player can still arrive.
      if (!self || self.seat || !seated || busy || !walking.riding || performance.now() - seated.at < 2000) return;
      seated = null;
      walking.dismount(scene(self.position[0], self.position[1]));
    },
  };
}
