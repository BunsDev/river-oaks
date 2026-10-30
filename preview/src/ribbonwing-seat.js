// The Ribbonwing's right-hand seat on this page (#777). The town owns the seat
// (server/world.js ribbonwingCommand): the pilot invites someone on foot beside
// the landed craft, they board by accepting, and the town keeps them beside the
// pilot until they step out on the ground or it sets them down. Here a passenger
// is mounted on the pilot's craft as drawn (their own landowner craft, or a remote
// pilot's), and a small panel offers the invitation, boarding and stepping out.
import { Euler, Quaternion, Vector3 } from 'three';
import { serverNow } from './server-clock.js';
import { VEHICLES } from './vehicle-config.js';
import { isGameplayKey } from './keyboard-input.js';
import './ribbonwing-seat.css';

const REACH = 8;
const REFUSALS = {
  no_ribbonwing_invite: 'That invitation has lapsed.', ribbonwing_not_landed: 'The Ribbonwing has to be on the ground first.',
  ribbonwing_seat_taken: 'The passenger seat is taken.', passenger_not_on_foot: 'They need to be on foot to board.',
  passenger_out_of_reach: 'They need to be beside the Ribbonwing.', ribbonwing_aloft: 'Wait until the Ribbonwing has landed to step out.',
  invalid_passenger: 'They are not here any more.', passenger_aboard: 'You are riding in the Ribbonwing.',
};
export const seatRefusal = result => REFUSALS[result?.error] ?? result?.message ?? 'The town did not allow that.';

/**
 * @param {{host:HTMLElement,viewport:HTMLElement,walking:any,selfId:()=>string|null,snapshot:()=>any,
 *   command:(body:object)=>Promise<any>,craftOf:(pilotId:string)=>import('three').Object3D|null}} options
 */
export function createRibbonwingSeat({ host, viewport, walking, selfId, snapshot, command, craftOf }) {
  const spec = VEHICLES.hover, seatLocal = new Vector3(...spec.passengerSeat), turn = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), -Math.PI / 2);
  const panel = document.createElement('section');
  panel.className = 'ribbonwing-seat';panel.setAttribute('aria-label', 'Ribbonwing passenger seat');panel.hidden = true;
  panel.innerHTML = '<p data-seat-status role="status" aria-live="polite"></p><div class="ribbonwing-seat-actions"><button type="button" data-seat-action hidden></button><button type="button" data-seat-cancel hidden>Cancel</button></div>';
  viewport.append(panel);
  const status = panel.querySelector('[data-seat-status]'), action = panel.querySelector('[data-seat-action]'), cancel = panel.querySelector('[data-seat-cancel]');
  let pilotId = null, controller = null, lastPose = null, busy = false, offer = null, disposed = false;
  const seatPose = () => {
    const craft = pilotId && craftOf(pilotId);
    if (!craft) return lastPose;
    craft.updateWorldMatrix(true, false);
    const quaternion = craft.getWorldQuaternion(new Quaternion()), seat = craft.localToWorld(seatLocal.clone());
    const self = snapshot()?.players?.find(player => player.id === selfId()), altitude = self?.altitude ?? 0;
    lastPose = { kind: 'hover', driver: false, seat: seat.toArray(), cameraTarget: craft.localToWorld(new Vector3(-1, 1.25, 0)).toArray(), seatToFloor: spec.passengerSeat[1] - spec.passengerFloor,
      // As a piloted ride reports it (parked-carriage.js): the craft's heading less a quarter turn.
      yaw: new Euler().setFromQuaternion(quaternion, 'YXZ').y - Math.PI / 2, quaternion: quaternion.multiply(turn).toArray(), speed: 0, distance: 0, altitude, flying: altitude > .1, landing: false };
    return lastPose;
  };
  // The walker's transport while aboard: no controls; the town moves the seat.
  const mount = () => {
    controller = { get pose() { return seatPose(); }, step() {}, stop() { controller = null; } };
    if (!seatPose() || !walking.mount(controller)) controller = null;
  };
  const run = async body => {
    if (busy) return;busy = true;
    try { const result = await command(body);if (!result?.ok) { status.textContent = seatRefusal(result);walking.notify?.(status.textContent); } return result; }
    catch (error) { status.textContent = error.message; } finally { busy = false; }
  };
  const nameOf = id => snapshot()?.players?.find(player => player.id === id)?.name ?? 'Someone';
  const show = (text, label = null, cancelling = false) => {
    panel.hidden = !text;status.textContent = text ?? '';
    action.hidden = !label;if (label) action.textContent = label;cancel.hidden = !cancelling;
  };
  action.addEventListener('click', () => offer?.());
  cancel.addEventListener('click', () => run({ action: 'cancel' }));
  // G steps a passenger out (the landowner's G is her own craft's).
  const onKey = event => { if (pilotId && event.code === 'KeyG' && !event.repeat && isGameplayKey(event)) { event.preventDefault();event.stopImmediatePropagation();offer?.(); } };
  host.addEventListener('keydown', onKey, { capture: true });
  return {
    get pilotId() { return pilotId; },
    get riding() { return Boolean(controller); },
    // Each frame: follow the town's word on this player's seat and refresh the panel.
    update() {
      if (disposed) return;
      const data = snapshot(), me = selfId(), self = data?.players?.find(player => player.id === me);
      if (!self) { show(null);return; }
      const aboard = typeof self.passengerOf === 'string' ? self.passengerOf : null;
      if (aboard && aboard !== pilotId) { pilotId = aboard;lastPose = null; }
      if (aboard && !controller && craftOf(aboard)) mount();
      if (!aboard && pilotId) {
        pilotId = null;lastPose = null;
        // Set down by the town (stepping out, or a lost pilot): walk on from where it put us.
        if (controller || walking.riding) walking.applyServerPose(self);
        controller = null;
      }
      if (pilotId) {
        const pilot = data.players.find(player => player.id === pilotId), aloft = (pilot?.altitude ?? 0) > .1;
        offer = () => { if (!aloft) run({ action: 'leave' }); };
        show(`Riding with ${nameOf(pilotId)} in the Ribbonwing${aloft ? '' : ' · G steps out'}`, 'Step out');action.disabled = aloft;return;
      }
      const invitation = data.players.find(player => player.ribbonwingInvite?.peerId === me && player.ribbonwingInvite.until > serverNow());
      if (invitation) { offer = () => run({ action: 'board', pilotId: invitation.id });show(`${nameOf(invitation.id)} invites you aboard the Ribbonwing`, 'Board');action.disabled = false;return; }
      // The landowner on the ground in her Ribbonwing may invite the nearest person on foot.
      if (self.vehicle === 'hover' && self.altitude <= .1 && !self.maneuver) {
        if (self.passengerId) { offer = null;show(`${nameOf(self.passengerId)} is riding with you`);return; }
        if (self.ribbonwingInvite) { offer = null;show(`Waiting for ${nameOf(self.ribbonwingInvite.peerId)} to board…`, null, true);return; }
        const near = data.players.filter(player => player.id !== me && !player.vehicle && !player.passengerOf && !player.sitting && player.altitude <= .1 && (player.levelId ?? null) === null)
          .map(player => ({ player, gap: Math.hypot(player.position[0] - self.position[0], player.position[1] - self.position[1]) }))
          .filter(item => item.gap <= REACH).sort((a, b) => a.gap - b.gap)[0];
        if (near) { offer = () => run({ action: 'invite', peerId: near.player.id });show('The passenger seat is free', `Invite ${near.player.name} aboard`);action.disabled = false;return; }
      } else if (self.passengerId) { offer = null;show(`${nameOf(self.passengerId)} is riding with you`);return; }
      offer = null;show(null);
    },
    dispose() { disposed = true;host.removeEventListener('keydown', onKey, { capture: true });panel.remove(); },
  };
}
