// Shared by the browser and Node transport. A missing version denotes the
// original River Oaks client. Protocol 2 adds creator assembly snapshots.
export const WORLD_PROTOCOL_VERSION = 3;
// Protocol 4 adds approved furnished spaces in creator regions (#420). Each world asks
// for the lowest protocol that can draw it, so a client that predates a feature is
// refused only where that feature is placed and can still visit every other world.
export const MAX_WORLD_PROTOCOL_VERSION = 4;
export const worldProtocolVersion = world => (world?.buildingInteriors ?? [])
  .some(plan => plan?.kind === 'approved-space') ? 4 : WORLD_PROTOCOL_VERSION;
export const supportsWorldProtocol = version => Number.isInteger(version)
  && version >= WORLD_PROTOCOL_VERSION && version <= MAX_WORLD_PROTOCOL_VERSION;
/** Whether a client speaking `offered` may join a world that asks for `required`. */
export const acceptsWorldProtocol = (offered, required) => typeof offered === 'string' && /^\d{1,3}$/.test(offered)
  && Number(offered) >= required && Number(offered) <= MAX_WORLD_PROTOCOL_VERSION;
export const DEFAULT_WORLD_ID = 'river-oaks';

export function validateWorldId(value) {
  if (typeof value !== 'string' || value.length > 48 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)) {
    throw new Error('Invalid world ID');
  }
  return value;
}

export function worldIdFromSearch(search) {
  const ids = new URLSearchParams(search).getAll('world');
  if (ids.length > 1) throw new Error('Choose one world to visit.');
  return validateWorldId(ids[0] ?? DEFAULT_WORLD_ID);
}
