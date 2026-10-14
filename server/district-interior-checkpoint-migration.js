import { createHash } from 'node:crypto';
import { createSharedWorld } from './world.js';
import { createWalkingEnvironment } from '../preview/src/walking.js';
import { storefrontSpot } from '../preview/src/arrival.js';
import { storeRoomsFor } from '../preview/src/store-rooms.js';
import { recoverDistrictHeightCheckpoint } from './district-checkpoint-migration.js';
import { DISTRICT_GALLERY_PLAN_SHA256 } from '../preview/src/district-interior-contract.js';
import { DEFAULT_WORLD_ID } from '../preview/src/world-contract.js';

const PREVIOUS_DISTRICT_SHA256 = '85795b095ea31135ac1247ff3cdc9a3c0d9a4dc7764633605b2bd4c4b004c374';
const GALLERY_STORE_ID = 'osm-node-8172494977';
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const rejected = () => ({ ok: false, error: 'invalid_checkpoint' });

/** Preserve a fully validated town when the reviewed gallery plan joins district data. */
export function recoverDistrictInteriorCheckpoint({ worldData, checkpoint, worldId = DEFAULT_WORLD_ID, now, isAdmin } = {}) {
  try {
    if (worldId !== DEFAULT_WORLD_ID || worldData?.buildingInteriors?.length !== 1
      || worldData.buildingInteriors[0].approvedSha256 !== DISTRICT_GALLERY_PLAN_SHA256) return rejected();
    const { approvedSha256, ...plan } = worldData.buildingInteriors[0];
    if (digest(plan) !== approvedSha256) return rejected();
    const previousData = structuredClone(worldData);
    delete previousData.buildingInteriors;
    if (digest(previousData) !== PREVIOUS_DISTRICT_SHA256) return rejected();
    const options = { worldId, ...(now ? { now } : {}), ...(isAdmin ? { isAdmin } : {}) };
    const previous = createSharedWorld(previousData, options);
    let source = checkpoint, from = 'previous_district';
    if (!previous.restore(source).ok) {
      const height = recoverDistrictHeightCheckpoint({ worldData: previousData, checkpoint, ...options });
      if (!height.ok || !previous.restore(height.checkpoint).ok) return rejected();
      source = height.checkpoint;
      from = height.revision;
    }
    const validated = previous.checkpoint();
    const { checksum: _checksum, ...envelope } = validated;
    const environment = createWalkingEnvironment(worldData);
    const previousRoom = storeRoomsFor(previousData).find(room => room.storeId === GALLERY_STORE_ID);
    const gallery = worldData.stores.find(store => store.id === GALLERY_STORE_ID);
    const plannedLocals = new Map(createSharedWorld(worldData, options).checkpoint().payload.state.locals
      .filter(local => local.storeId === GALLERY_STORE_ID).map(local => [local.id, local]));
    const needsRelocation = position => !environment.isFree(position[0], -position[1])
      || environment.roomAt(position[0], -position[1])?.storeId !== GALLERY_STORE_ID;
    const relocated = new Set();
    for (const local of envelope.payload.state.locals) {
      if (local.storeId !== GALLERY_STORE_ID || !needsRelocation(local.position)) continue;
      const landing = plannedLocals.get(local.id)?.position;
      if (!landing || needsRelocation(landing)) return rejected();
      local.position = [...landing]; relocated.add(local.id);
      if (local.life) {
        local.life.route = []; local.life.destination = null; local.life.routeVersion++;
        local.life.speed = 0; local.life.blocked = false;
      }
    }
    for (const job of envelope.payload.state.jobs ?? []) {
      if (!relocated.has(job.localId) && !relocated.has(job.helperId)) continue;
      if (!['routing', 'traveling', 'assisting'].includes(job.phase)) continue;
      job.phase = 'queued'; job.approachAttempt = 0;
      const helper = envelope.payload.state.locals.find(local => local.id === job.helperId);
      if (helper?.life) { helper.life.route = []; helper.life.destination = null; helper.life.routeVersion++; }
    }
    for (const player of envelope.payload.players) {
      if (player.altitude > 0 || !previousRoom.contains(player.position[0], player.position[1])
        || environment.isFree(player.position[0], -player.position[1])) continue;
      if (player.sitting || player.vehicle || player.cycling) return rejected();
      const outside = storefrontSpot(worldData, gallery, 'leave', {
        isFree: (x, z) => environment.isFree(x, z) && !environment.roomAt(x, z),
      });
      if (!outside || !environment.isFree(outside[0], -outside[1])) return rejected();
      player.position = [outside[0], outside[1], environment.groundAt(outside[0], -outside[1])];
    }
    envelope.worldFingerprint = digest(worldData);
    const migrated = { ...envelope, checksum: digest(envelope) };
    if (!createSharedWorld(worldData, options).restore(migrated).ok) return rejected();
    return { ok: true, checkpoint: migrated, from };
  } catch { return rejected(); }
}
