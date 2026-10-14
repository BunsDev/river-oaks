import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createSharedWorld } from './world.js';
import { recoverDistrictInteriorCheckpoint } from './district-interior-checkpoint-migration.js';
import { DISTRICT_GALLERY_LEVELS_SHA256, DISTRICT_GALLERY_PLAN_SHA256 } from '../preview/src/district-interior-contract.js';
import { createWalkingEnvironment } from '../preview/src/walking.js';
import { DEFAULT_WORLD_ID } from '../preview/src/world-contract.js';

const PREVIOUS_DISTRICT_SHA256 = '2359fcbd8c8cf0cc5dfc486b95627a41a85a269c6914461a4a22c18a70bc3691';
const previousPlan = JSON.parse(readFileSync(new URL('../preview/public/data/building-interiors/river-oaks-gallery-v1.json', import.meta.url)));
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const rejected = () => ({ ok: false, error: 'invalid_checkpoint' });

/** Re-sign only a validated one-level district checkpoint for the reviewed two-level revision. */
export function recoverDistrictLevelsCheckpoint({ worldData, checkpoint, worldId = DEFAULT_WORLD_ID, now, isAdmin } = {}) {
  try {
    const currentPlan = worldData?.buildingInteriors?.[0];
    if (worldId !== DEFAULT_WORLD_ID || worldData.buildingInteriors.length !== 1
      || currentPlan?.approvedSha256 !== DISTRICT_GALLERY_LEVELS_SHA256
      || previousPlan.approvedSha256 !== DISTRICT_GALLERY_PLAN_SHA256) return rejected();
    const { approvedSha256: currentDigest, ...currentPayload } = currentPlan;
    const { approvedSha256: previousDigest, ...previousPayload } = previousPlan;
    if (digest(currentPayload) !== currentDigest || digest(previousPayload) !== previousDigest) return rejected();
    const beforeData = { ...worldData, buildingInteriors: [previousPlan] };
    if (digest(beforeData) !== PREVIOUS_DISTRICT_SHA256) return rejected();
    const options = { worldId, ...(now ? { now } : {}), ...(isAdmin ? { isAdmin } : {}) };
    const before = createSharedWorld(beforeData, options);
    let from = 'gallery_plan_v1';
    if (!before.restore(checkpoint).ok) {
      const older = recoverDistrictInteriorCheckpoint({ worldData: beforeData, checkpoint, ...options });
      if (!older.ok || !before.restore(older.checkpoint).ok) return rejected();
      from = older.from;
    }
    const validated = before.checkpoint();
    const { checksum: _checksum, ...envelope } = validated;
    const ground = createWalkingEnvironment(worldData);
    const levelId = currentPlan.levels[0].id;
    for (const player of envelope.payload.players) {
      const room = ground.roomAt(player.position[0], -player.position[1]);
      player.buildingId = room?.planId === levelId ? currentPlan.buildingId : null;
      player.levelId = room?.planId === levelId ? levelId : null;
    }
    envelope.worldFingerprint = digest(worldData);
    const migrated = { ...envelope, checksum: digest(envelope) };
    if (!createSharedWorld(worldData, options).restore(migrated).ok) return rejected();
    return { ok: true, checkpoint: migrated, from };
  } catch { return rejected(); }
}
