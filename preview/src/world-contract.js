// Shared by the browser and Node transport. A missing version denotes the
// original River Oaks client. Protocol 2 adds creator assembly snapshots.
export const WORLD_PROTOCOL_VERSION = 2;
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
