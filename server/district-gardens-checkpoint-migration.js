import { createHash } from 'node:crypto';
import { createSharedWorld } from './world.js';
import { recoverDistrictTowerCheckpoint } from './district-tower-checkpoint-migration.js';
import { recoverDistrictLevelsCheckpoint } from './district-level-checkpoint-migration.js';
import { recoverDistrictInteriorCheckpoint } from './district-interior-checkpoint-migration.js';
import { recoverDistrictHeightCheckpoint } from './district-checkpoint-migration.js';
import { createWalkingEnvironment } from '../preview/src/walking.js';
import { attachGardenCampus, detachGardenCampus } from '../preview/src/garden-campus-district.js';
import { CAMPUS_BUILDING_ID, GARDEN_CAMPUS_LAYOUT as CAMPUS, campusToSource, sourceToCampus } from '../shared/garden-campus-layout.js';
import { DEFAULT_WORLD_ID } from '../preview/src/world-contract.js';

// Switching RIVER_OAKS_DISTRICT_REVISION between the garage and the Gardens (#507, #512)
// changes the district fingerprint, so the town's durable checkpoint must be re-signed
// for the district the coordinator now serves. Both directions are supported on the same
// code, so a configuration rollback is a tested path, not a code revert.
//
// - Garage to Gardens: the checkpoint must validate against the exact garage district
//   (detachGardenCampus), through the older district recoveries if it predates them.
// - Gardens to garage: the checkpoint must validate against the exact campus this code
//   builds (attachGardenCampus); a campus from another contract revision fails closed.
//
// Nobody can stand inside the garage, so a forward cutover only moves residents flying
// over the parcel. A rollback moves everyone on the campus: its platform, halls and
// campus levels. Each moved resident lands on clear street ground just outside the
// nearest mapped entry, on foot, off any seat, vehicle or level. Every account,
// creation, ledger and durable section (office grants, campus leases) is carried
// unchanged; the world validates the result and anything else refuses.
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const rejected = error => ({ ok: false, error: error ?? 'invalid_checkpoint' });
// Residents within this distance of the parcel (or over it) are moved, so a flight
// hugging a new tower's face never survives inside its clearance.
const PARCEL_MARGIN = 4.5, SPACING = 0.9;
const [U_MAX, V_MAX] = [Math.max(...CAMPUS.parcel.polygon.map(([u]) => u)), Math.max(...CAMPUS.parcel.polygon.map(([, v]) => v))];
const nearParcel = ([east, north]) => {
  const [u, v] = sourceToCampus([east, north]);
  return u > -PARCEL_MARGIN && u < U_MAX + PARCEL_MARGIN && v > -PARCEL_MARGIN && v < V_MAX + PARCEL_MARGIN;
};
// Outside each entry, on its lane, facing away from the parcel.
const EXITS = CAMPUS.entries.map(entry => {
  const outward = { E1: [0, -1], E2: [-1, 0], E3: [0, 1] }[entry.id];
  return { id: entry.id, at: [entry.position[0] + outward[0] * 6, entry.position[1] + outward[1] * 6] };
});

// The campus this code builds over a served garage, and its fingerprint, once per district.
const campuses = new WeakMap();
function campusOf(worldData) {
  if (!campuses.has(worldData)) { const data = attachGardenCampus(worldData);campuses.set(worldData, { data, fingerprint: digest(data) }); }
  return campuses.get(worldData);
}

function relocate(payload, environment, moves) {
  const placed = payload.players.filter(player => !moves.has(player.id)).map(player => player.position);
  for (const player of payload.players.filter(item => moves.has(item.id))) {
    const [u, v] = sourceToCampus(player.position), exit = [...EXITS].sort((a, b) => Math.hypot(a.at[0] - u, a.at[1] - v) - Math.hypot(b.at[0] - u, b.at[1] - v))[0];
    const [east, north] = campusToSource(exit.at);let destination = null;
    for (const radius of [0, 0.9, 1.8, 2.7, 3.6, 4.5, 6]) {
      for (let i = 0; i < (radius ? 16 : 1) && !destination; i++) {
        const angle = i / 16 * Math.PI * 2, x = east + Math.cos(angle) * radius, n = north + Math.sin(angle) * radius;
        if (!environment.isFree(x, -n) || environment.roomAt(x, -n) || nearParcel([x, n]) || placed.some(p => Math.hypot(p[0] - x, p[1] - n) < SPACING)) continue;
        destination = [x, n, environment.groundAt(x, -n)];
      }
      if (destination) break;
    }
    if (!destination) throw new Error('No clear street ground beside the campus');
    Object.assign(player, { position: destination, altitude: 0, buildingId: null, levelId: null, vehicle: null, sitting: null, cycling: null, gesture: null, gestureUntil: 0 });
    placed.push(destination);
  }
}

/** Re-sign a validated town checkpoint for the district revision this coordinator serves. */
export function recoverDistrictGardensCheckpoint({ worldData, checkpoint, worldId = DEFAULT_WORLD_ID, now, isAdmin, screeningHosts, officeLayout, campusOperators } = {}) {
  try {
    if (worldId !== DEFAULT_WORLD_ID || !worldData || !checkpoint) return rejected();
    // The same configuration the coordinator runs with, campus operators (#509) included.
    const options = { worldId, screeningHosts, officeLayout, ...(campusOperators ? { campusOperators } : {}), ...(now ? { now } : {}), ...(isAdmin ? { isAdmin } : {}) };
    const toCampus = Boolean(worldData.gardenCampus);
    // Decide before building any world: a rollback needs the exact campus this code builds.
    const { data: fromData, fingerprint } = toCampus ? { data: detachGardenCampus(worldData), fingerprint: null } : campusOf(worldData);
    if (!toCampus && checkpoint?.worldFingerprint !== fingerprint) return rejected();
    const from = createSharedWorld(fromData, options);
    let source = toCampus ? 'garage' : 'gardens';
    if (!from.restore(checkpoint).ok) {
      // Only the garage has older district revisions behind it.
      if (!toCampus) return rejected();
      const older = [recoverDistrictTowerCheckpoint, recoverDistrictLevelsCheckpoint, recoverDistrictInteriorCheckpoint, recoverDistrictHeightCheckpoint]
        .reduce((found, recover) => found?.ok ? found : recover({ worldData: fromData, checkpoint, ...options }), null);
      if (!older?.ok || !from.restore(older.checkpoint).ok) return rejected();
      source = `garage:${older.from ?? older.revision ?? 'older'}`;
    }
    const { checksum: _checksum, ...envelope } = from.checkpoint();
    const moves = new Set(envelope.payload.players.filter(player => toCampus
      ? player.altitude > 0 && nearParcel(player.position)
      : nearParcel(player.position) || player.buildingId === CAMPUS_BUILDING_ID || String(player.levelId ?? '').startsWith(`${CAMPUS_BUILDING_ID}/`)).map(player => player.id));
    relocate(envelope.payload, createWalkingEnvironment(worldData), moves);
    envelope.worldFingerprint = digest(worldData);
    const migrated = { ...envelope, checksum: digest(envelope) };
    if (!createSharedWorld(worldData, options).restore(migrated).ok) return rejected('incompatible_district');
    return { ok: true, checkpoint: migrated, from: source, to: toCampus ? 'gardens' : 'garage', moved: [...moves] };
  } catch { return rejected(); }
}
