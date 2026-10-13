import { Vector3, Quaternion } from 'three';
import { createRoadVehicle } from './road-vehicles.js';
import { drivingInput } from './vehicle-config.js';
import { fitCarriageToGround, stepCarriage } from './carriage-motion.js';
import { carriageFootprint, carriageContains } from './carriage-parking.js';
import { plazaSalonRack } from './plaza-salon-plan.js';
import { SEAT_REACH } from './shared-seating.js';
import { isGameplayKey } from './keyboard-input.js';

// The plaza bicycle. G beside the rack asks the town for a slot (`cycle`), then
// mounts the walking controls on a bike exactly as the car does; G while riding
// asks for a ground spot (`travel`, so the step down is not a walking-speed
// violation) and then `uncycle` hands the slot back. The bike never exists
// outside the rack and the rider: a parked bike is drawn by the plaza salon
// while its slot is free, and this controller draws the one you ride. The town
// counts the metres; the distance shown here is the ride in progress.

// A slot (world [east, north], heading 0 = south) as a carriage-motion
// placement in scene space. The mesh faces local -X and stepCarriage advances
// along (-cos yaw, +sin yaw), so a heading h is the yaw h + π/2.
export function bicyclePlacement(slot, environment) {
  const placement = { vehicle: 'bicycle', position: [slot.x, 0, -slot.north], yaw: slot.heading + Math.PI / 2, speed: 0, distance: 0, steering: 0 };
  fitCarriageToGround(placement, environment.groundAt);
  return placement;
}

// Bikes ride anywhere a walker may stand outdoors: paving, footways and roads.
// The occupancy test samples the frame between the axles, not the full
// mudguard-to-mudguard length, so a bike parked against its rack (the rear
// tyre a hand's width from the bar) and a bike brushing past a planter both
// count as clear, as a walker beside them would.
const FRAME_SHARE = 0.5;
export function bicycleCanOccupy(placement, environment) {
  return carriageFootprint({ ...placement, scale: (placement.scale ?? 1) * FRAME_SHARE }).every(([x, z]) => environment.isFree(x, z) && !environment.roomAt?.(x, z));
}

export function nearestFreeSlot(slots, [x, north], taken) {
  let best = null;
  for (const slot of slots) {
    if (taken.has(slot.id)) continue;
    const d = Math.hypot(slot.approach[0] - x, slot.approach[1] - north);
    if (d <= SEAT_REACH && (!best || d < best.d)) best = { slot, d };
  }
  return best?.slot ?? null;
}

export function createPlazaBicycle({ scene, host, walking, getMultiplayer, getLocals = () => [], getMiles = () => null, reducedMotion = false }) {
  const model = createRoadVehicle('bicycle'); model.object.visible = false; scene.add(model.object);
  let slots = [], placement = null, mounted = false, busy = false, slotId = null, lastRide = 0;
  const env = () => walking.environment ?? null;
  const taken = () => new Set(getMultiplayer()?.snapshot?.cycling?.taken ?? []);
  const notify = text => walking.notify?.(text);
  const apply = () => {
    model.object.position.fromArray(placement.position); model.object.rotation.set(placement.pitch ?? 0, placement.yaw, placement.roll ?? 0, 'YXZ');
    const up = new Vector3(0, 1, 0).applyQuaternion(model.object.quaternion.clone().invert());
    model.wheels.forEach((wheel, i) => { wheel.position.fromArray(model.spec.wheels[i]).addScaledVector(up, placement.wheelOffsets?.[i] ?? 0); wheel.rotation.set(0, i < model.spec.steeredWheels ? placement.steering ?? 0 : 0, placement.distance / model.spec.wheels[i][1], 'YXZ'); });
    model.updateSteering(placement.steering ?? 0); model.object.updateMatrixWorld(true);
  };
  const canOccupy = next => bicycleCanOccupy(next, env())
    && !(getLocals() ?? []).some(p => !p.indoor && carriageContains(next, p.position[0], next.position[1] + 1, -p.position[1], .5));
  const ride = {
    get pose() {
      const seat = model.spec.passengerSeat;
      return { kind: 'bicycle', seat: model.object.localToWorld(new Vector3(...seat)).toArray(), cameraTarget: model.object.localToWorld(new Vector3(-.6, 1.1, 0)).toArray(),
        seatToFloor: seat[1] - model.spec.passengerFloor, yaw: placement.yaw - Math.PI / 2,
        quaternion: model.object.quaternion.clone().multiply(new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), -Math.PI / 2)).toArray(), speed: placement.speed, distance: placement.distance };
    },
    step(input, delta) { const environment = env(); stepCarriage(placement, { groundAt: environment.groundAt, wheelTreads: model.wheelTreads, canOccupy }, drivingInput(input), delta); apply(); },
    brake() { if (placement) placement.speed = 0; },
    stop() { if (placement) placement.speed = 0; },
  };
  // Forget the ride: hide the bike and drop the slot; the town's snapshot
  // draws the parked bike again once the slot is free.
  const clear = () => { mounted = false; placement = null; slotId = null; model.object.visible = false; };
  const me = () => { const pose = walking.getPose(); return pose ? [pose.position[0], -pose.position[2]] : null; };
  async function take() {
    const multiplayer = getMultiplayer(), pose = walking.getPose(), environment = env();
    if (busy || mounted || !environment || !pose || pose.sitting || pose.riding || pose.flying || pose.roomId) return false;
    if (!multiplayer?.connected) { notify('Reconnect before taking a bike.'); return false; }
    const slot = nearestFreeSlot(slots, me(), taken());
    if (!slot) { notify(slots.length && taken().size >= slots.length ? 'All bikes are out.' : 'Walk up to the bike rack first.'); return false; }
    busy = true;
    try {
      const result = await multiplayer.command({ type: 'cycle', rackId: slot.rackId, slot: slot.slot });
      if (!result.ok) { notify(result.message ?? 'The town could not hand you a bike.'); return false; }
      // Stand where the town put us (on the slot) before mounting, so the next pose leaves from the saddle.
      if (result.player) walking.applyServerPose(result.player);
      placement = bicyclePlacement(slot, environment); apply(); model.object.visible = true; slotId = slot.id; mounted = true;
      if (!walking.mount(ride)) {
        clear();
        await multiplayer.command({ type: 'uncycle' }).catch(() => {});
        return false;
      }
      return true;
    } catch (error) { notify(error.message); return false; }
    finally { busy = false; }
  }
  async function stepOff() {
    const multiplayer = getMultiplayer(), environment = env();
    if (busy || !mounted || !multiplayer || !environment) return false;
    busy = true; ride.brake();
    try {
      // A ground spot beside the bike: left, right, then ahead on either side,
      // clear of the bike body and of anyone standing there.
      const c = Math.cos(placement.yaw), s = Math.sin(placement.yaw), seat = ride.pose.seat, distance = placement.distance, people = getLocals() ?? [];
      let exit = null;
      for (const [along, side] of [[0, 1], [0, -1], [-1.3, 1], [-1.3, -1]]) {
        const x = placement.position[0] + along * c + side * .9 * s, z = placement.position[2] - along * s + side * .9 * c;
        if (!environment.isFree(x, z) || environment.roomAt?.(x, z) || carriageContains(placement, x, environment.groundAt(x, z) + .9, z, .3)) continue;
        if (people.some(p => !p.indoor && Math.hypot(p.position[0] - x, p.position[1] + z) < .9)) continue;
        exit = [x, environment.groundAt(x, z), z]; break;
      }
      if (!exit) { notify('There is no clear place to step off here.'); return false; }
      // The town moves the rider to the ground spot (its correction drops the
      // walking transport, so the ride may already be over when travel resolves).
      const result = await multiplayer.travel({ position: [exit[0], -exit[2]] });
      if (!result?.ok) return false;
      // The travel already released the slot server-side; uncycle is a no-op safety net.
      await multiplayer.command({ type: 'uncycle' }).catch(() => {});
      lastRide = distance;
      const destination = result.player ? [result.player.position[0], result.player.position[2], -result.player.position[1]] : exit;
      if (walking.riding) { walking.dismount(destination); walking.setYaw(Math.atan2(destination[0] - seat[0], destination[2] - seat[2])); }
      clear();
      return true;
    } catch (error) { notify(error.message); return false; }
    // A refused travel may still have carried a correction that dropped the
    // walking transport: never leave a bike standing without its rider.
    finally { busy = false; if (!walking.riding) clear(); }
  }
  const onKey = event => {
    if (event.code !== 'KeyG' || event.repeat || event.defaultPrevented || !isGameplayKey(event)) return;
    if (mounted) { event.preventDefault(); void stepOff(); return; }
    const pose = walking.getPose();
    if (pose && !pose.riding && !pose.sitting && !pose.flying && !pose.roomId && nearestFreeSlot(slots, me(), taken())) { event.preventDefault(); void take(); }
  };
  host.addEventListener('keydown', onKey);
  return {
    load(world) {
      slots = plazaSalonRack(world);
      if (mounted && walking.riding) walking.dismount([placement.position[0], placement.position[1], placement.position[2]]);
      clear();
    },
    // What G does right now, for the walking console: the rack prompt when a
    // slot is in reach, or the way off the bike while riding.
    prompt() {
      const pose = walking.getPose();
      if (!pose || !env()) return null;
      if (mounted) return { kind: 'step-off', label: 'Step off the bike', run: stepOff, disabled: busy };
      if (pose.riding || pose.sitting || pose.flying || pose.roomId) return null;
      const here = me();
      if (!slots.some(slot => Math.hypot(slot.approach[0] - here[0], slot.approach[1] - here[1]) <= SEAT_REACH)) return null;
      const slot = nearestFreeSlot(slots, here, taken());
      const miles = getMiles();
      const label = slot ? (miles === null || miles === undefined ? 'Take a bike' : `Take a bike · ${(Math.round(miles * 10) / 10).toFixed(1)} mi so far`) : 'All bikes are out';
      return { kind: 'take-bike', targetId: slot?.id ?? null, label, run: take, disabled: busy || !slot };
    },
    update(now = performance.now()) { if (placement && mounted) { apply(); model.animate(now, placement.speed, reducedMotion); } },
    // When the town corrects a pose the walking controls drop the transport
    // before anyone else hears of it; follow, unless a step-off is mid-way and
    // will clear the ride itself.
    sync() { if (placement && !busy && !walking.riding) clear(); },
    get riding() { return mounted; }, get slotId() { return slotId; }, get placement() { return placement; },
    get rideMeters() { return placement?.distance ?? 0; }, get lastRideMeters() { return lastRide; },
    take, stepOff,
    dispose() { host.removeEventListener('keydown', onKey); model.dispose(); },
  };
}
