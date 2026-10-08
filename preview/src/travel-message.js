// Travel refusals from the town carry a code, and only some carry written text:
// the server's reject() defaults the message to the code. Never show a bare code.
const CODE = /^[a-z]+(?:_[a-z]+)+$/;
export function travelRefusal(result, { blocked, cooldown, fallback }) {
  const codes = [result?.error, result?.message];
  if (codes.includes('destination_blocked')) return blocked ?? fallback;
  if (codes.includes('travel_cooldown')) return cooldown ?? fallback;
  const message = result?.message;
  return typeof message === 'string' && message && !CODE.test(message) ? message : fallback;
}
