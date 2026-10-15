import { createHash } from 'node:crypto';
import { createSharedWorld } from './world.js';
import { recoverDistrictLevelsCheckpoint } from './district-level-checkpoint-migration.js';
import { DEFAULT_WORLD_ID } from '../preview/src/world-contract.js';

// The district before the penthouse raise (main at f72a173e): the Equinox tower at its
// photographed 28 m. Only that building's height and height source differ from the raise.
const PREVIOUS_DISTRICT_SHA256 = 'b1cf4b8c73ef29a2c27a615ebb8f1f89f944b7778bf42a0a1b0717fc449f71da';
const TOWER = 'osm-way-625330785', PREVIOUS_HEIGHT = 28, RAISED_HEIGHT = 33;
const PREVIOUS_SOURCE = 'street-level reference photographs (2024-2025), estimated';
const RAISED_SOURCE = 'authored 5 m above the photographed 28 m to fit the penthouse office (#363)';
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const rejected = () => ({ ok: false, error: 'invalid_checkpoint' });

/** Re-sign a validated town for the raised penthouse tower. Older towns chain through the level migration. */
export function recoverDistrictTowerCheckpoint({ worldData, checkpoint, worldId = DEFAULT_WORLD_ID, now, isAdmin, screeningHosts, officeLayout } = {}) {
  try {
    if (worldId !== DEFAULT_WORLD_ID) return rejected();
    // Only the reviewed raise is a target: the tower at exactly 33 m with its authored source.
    const raised = worldData.buildings.find(building => building.id === TOWER);
    if (raised?.size?.[2] !== RAISED_HEIGHT || raised.height_source !== RAISED_SOURCE) return rejected();
    const previousData = structuredClone(worldData);
    const tower = previousData.buildings.find(building => building.id === TOWER);
    tower.size[2] = PREVIOUS_HEIGHT;
    tower.height_source = PREVIOUS_SOURCE;
    if (digest(previousData) !== PREVIOUS_DISTRICT_SHA256) return rejected();
    const options = { worldId, screeningHosts, officeLayout, ...(now ? { now } : {}), ...(isAdmin ? { isAdmin } : {}) };
    const previous = createSharedWorld(previousData, options);
    let from = 'before_office_tower_raise';
    if (!previous.restore(checkpoint).ok) {
      const older = recoverDistrictLevelsCheckpoint({ worldData: previousData, checkpoint, ...options });
      if (!older.ok || !previous.restore(older.checkpoint).ok) return rejected();
      from = older.from;
    }
    const { checksum: _checksum, ...envelope } = previous.checkpoint();
    envelope.worldFingerprint = digest(worldData);
    const migrated = { ...envelope, checksum: digest(envelope) };
    // A taller roof can invalidate a flight over the tower. That state still fails
    // closed, as in the earlier height migration; no player is moved.
    if (!createSharedWorld(worldData, options).restore(migrated).ok) return rejected();
    return { ok: true, checkpoint: migrated, from };
  } catch { return rejected(); }
}
