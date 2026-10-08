import { createHash } from 'node:crypto';
import { createSharedWorld } from './world.js';
import { DEFAULT_WORLD_ID } from '../preview/src/world-contract.js';

const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
// Exact public district revisions: 9dd65d2, 9dd65d2^ and 297d9bb^.
// The migration is intentionally unavailable for any other target geography.
const TARGET = '85795b095ea31135ac1247ff3cdc9a3c0d9a4dc7764633605b2bd4c4b004c374';
const revisions = new Map([
  ['7061b5bd4e6631641cfa592dcc2779547d158527ce4ba50f5cdb02838f338fb4', 'before_six_facade_heights'],
  ['3204c2d04a66d424621a5c0ab5c57fae8ede77512e07f43a3f55e9d91e5fcfc4', 'before_photo_facade_heights'],
]);
const previousHeights = new Map([
  ['osm-way-625330785', 8], ['osm-way-625333006', 6.5], ['osm-way-625333008', 6.5],
  ['osm-way-878472795', 6.5], ['osm-way-878472797', 20],
]);
const earliestHeights = new Map([
  ...previousHeights, ['osm-way-625330792', 6.5], ['osm-way-625330798', 12], ['osm-way-625333009', 6.5],
]);
const rejected = () => ({ ok: false, error: 'invalid_checkpoint' });

/** Explicit height-only migration. Never resets a town or accepts an unchecked payload. */
export function recoverDistrictHeightCheckpoint({ worldData, checkpoint, worldId = DEFAULT_WORLD_ID, now, isAdmin } = {}) {
  try {
    const revision = revisions.get(checkpoint?.worldFingerprint);
    if (worldId !== DEFAULT_WORLD_ID || !revision || digest(worldData) !== TARGET) return rejected();
    const previousData = structuredClone(worldData);
    const heights = revision === 'before_photo_facade_heights' ? earliestHeights : previousHeights;
    for (const building of previousData.buildings) if (heights.has(building.id)) {
      building.size[2] = heights.get(building.id);
      building.height_source = 'estimated from tagged/default levels';
    }
    if (digest(previousData) !== checkpoint.worldFingerprint) return rejected();
    const options = { worldId, ...(now ? { now } : {}), ...(isAdmin ? { isAdmin } : {}) };
    const source = createSharedWorld(previousData, options);
    if (!source.restore(checkpoint).ok) return rejected();
    const { checksum: _checksum, ...envelope } = source.checkpoint();
    envelope.worldFingerprint = TARGET;
    const migrated = { ...envelope, checksum: digest(envelope) };
    // Taller roofs can invalidate flight positions. Such states still fail
    // closed; this migration does not teleport players or discard their wishes.
    if (!createSharedWorld(worldData, options).restore(migrated).ok) return rejected();
    return { ok: true, checkpoint: migrated, revision };
  } catch { return rejected(); }
}
