// Five Rooms shells (#825 M1, #839): five blank venue shells built from the spatial contract
// (config/ribbon/five-rooms.json) under the `pink-jet-age` finish. Classic builds nothing: the
// group comes back empty and untouched, so a classic scene is byte-identical.
//
// Every part is merged into one mesh per material across all five venues, so the shells cost
// at most one draw call per material in SHELL_MATERIALS (eight) however many parts they hold.
// No collision, ground or gameplay here: the Integration slice (#841) registers walls, floors and
// teardown, and the contract stays the only source of position.
import * as THREE from 'three';
import { FIVE_ROOMS_VERSION, VENUE_IDS, validateFiveRooms } from '../../../shared/city-kit/five-rooms-layout.js';
import { relightShellMaterials, shellMaterials, createShellKit, venueFrame } from './shells.js';
import { buildCounter } from './counter.js';
import { buildAtelier } from './atelier.js';
import { buildStarlightScreen } from './starlight-screen.js';
import { buildShadeGarden } from './shade-garden.js';
import { buildStudiosOverlook } from './studios-overlook.js';

export const FIVE_ROOMS_SHELL_FINISH = 'pink-jet-age';
export const VENUE_BUILDERS = Object.freeze({
  'venue:counter': buildCounter,
  'venue:atelier': buildAtelier,
  'venue:starlight-screen': buildStarlightScreen,
  'venue:shade-garden': buildShadeGarden,
  'venue:studios-overlook': buildStudiosOverlook,
});

const round = value => Math.round(value * 1000) / 1000;
const box = bounds => ({ min: bounds.min.toArray().map(round), max: bounds.max.toArray().map(round) });

/**
 * The shells for a contract. `finish` other than pink-jet-age returns an empty group. `groundAt`
 * (scene x, z -> height) is optional: when given, each venue records how far its contract floor
 * stands from the ground there (`floorDelta`), for the Integration slice to reconcile.
 */
// `interiors: false` leaves out what stands inside each footprint (floor, ceiling, back walls,
// the Shade Garden's pergola ribs) and keeps the frontage. The scene passes it while the mapped
// store rooms still fill the bays (decision 5 pending, Val 2026-11-01): their floors, ceilings
// and walls lie on the envelope's and fight for depth.
export function buildFiveRoomsShells(contract, { finish = 'classic', groundAt = null, interiors = true } = {}) {
  const group = new THREE.Group(); group.name = 'Five Rooms shells';
  if (finish !== FIVE_ROOMS_SHELL_FINISH) return group;
  validateFiveRooms(contract);
  if (contract.version !== FIVE_ROOMS_VERSION) throw new Error(`five rooms: shells read ${FIVE_ROOMS_VERSION}, not ${contract.version}`);
  const materials = shellMaterials(), kit = createShellKit(materials);
  for (const id of VENUE_IDS) {
    const venue = contract.venues.find(item => item.id === id);
    if (!venue) throw new Error(`five rooms: the contract has no ${id}`);
    VENUE_BUILDERS[id](kit, { ...venueFrame(venue), envelope: interiors });
  }
  const { merged, venues } = kit.finish();
  for (const [key, geometry] of merged) {
    geometry.computeBoundingSphere(); geometry.computeBoundingBox();
    const mesh = new THREE.Mesh(geometry, materials.get(key));
    mesh.name = `Five Rooms ${key}`;
    mesh.castShadow = !materials.get(key).transparent; mesh.receiveShadow = true;
    group.add(mesh);
  }
  const attachments = contract.venues.flatMap(venue => venue.attachments.map(item => ({ id: item.id, venue: venue.id, role: item.role, frame: item.frame ?? 'site', position: item.position, yaw: item.yaw })));
  group.userData.fiveRooms = {
    version: contract.version, finish, interiors,
    drawCalls: group.children.length,
    materials: group.children.map(mesh => mesh.material.name),
    venues: venues.map(item => {
      const [east, north] = item.frame.entrance.centre;
      return { id: item.id, label: item.label, form: item.form, parts: item.parts, bounds: box(item.bounds), floor: item.frame.floor,
        floorDelta: groundAt ? round(item.frame.floor - groundAt(east, -north)) : null };
    }),
    attachments,
  };
  group.userData.relight = atmosphere => relightShellMaterials(materials, atmosphere);
  let disposed = false;
  group.userData.dispose = () => {
    if (disposed) return; disposed = true;
    for (const mesh of group.children) mesh.geometry.dispose();
    for (const material of materials.values()) material.dispose();
  };
  return group;
}
