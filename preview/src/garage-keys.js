import { isGameplayKey } from './keyboard-input.js';

// The world's keys for the player's own garage (#791): Q calls the ride, G boards it or steps out.
// Every account with a garage has them, not only the owner. A player aboard a ride that is not
// their own (another pilot's Ribbonwing seat, a plaza bike) leaves Q and G to that ride, so one
// press never reaches two rides whatever order their listeners run in.
export const aboardAnotherRide = (pose, ownRiding) => Boolean(pose?.riding) && !ownRiding;

export function garageKeyAction(event, { hasGarage, pose, ownRiding }) {
  if (!hasGarage || event.repeat || event.defaultPrevented || !isGameplayKey(event)) return null;
  if (aboardAnotherRide(pose, ownRiding)) return null;
  return event.code === 'KeyQ' ? 'call' : event.code === 'KeyG' ? 'ride' : null;
}
