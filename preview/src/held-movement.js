import { stopWalking } from './walking.js';

// Release velocity owned by each movement mode as well as the input keys.
// A chosen landing is autonomous; keep it, while cancelling held lift.
export function stopHeldMovement(state, flight, transport) {
  if (state) stopWalking(state);
  transport?.brake?.();
  if (flight?.active && !flight.landing) {
    flight.target = flight.altitude;
    flight.verticalSpeed = 0;
  }
}
