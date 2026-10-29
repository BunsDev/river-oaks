// The Gardens' shells in the district (#507): three stepped towers, the café, the
// pergola, the reflecting pool, the paths and both skywalks, drawn from #506's
// contract (shared/garden-campus-layout.js) and nothing else. Every storey, slab,
// terrace, roof, headhouse, facade opening and guard comes from the contract's
// floors and campusLevels(); this module adds no dimension of its own beyond
// finish thicknesses inside those volumes.
//
// One root group sits at the campus origin, turned onto the plot's grid bearing,
// so every part is an axis-aligned box in campus metres: x = u, y = z, -z = v.
// Parts are batched as one instanced draw per finish. Glazing is a thin,
// see-through curtain inset 0.1 m inside each plate edge, broken by the skywalk
// portals (3 m wide, 3.2 m clear at Floor 4) and the terrace and lobby doors, so
// a bridge never meets glass. Slabs run flush to the plate edge, so each
// occupied floor reads as a band.
//
// The finish pass (#511, garden-campus-finish.js and garden-campus-planting.js) dresses
// those shells inside the same envelopes: stone slab bands and plinths, bronze fins and
// copings, timber headhouses, soffits and canopies, planted beds, edges, troughs, green
// walls and climbers, and emissive luminaires that the time of day brightens (relight).
// It adds no light to the scene and no surface anyone stands on.
//
// Only the platform is ground (garden-campus-district.js campusGroundAt). This
// group is never registered as ground: a skywalk deck or upper floor here is
// rendering, and #508's campus levels own movement up there.
import * as THREE from 'three';
import { GARDEN_CAMPUS_LAYOUT as CAMPUS, campusLevels, campusToScene } from '../../shared/garden-campus-layout.js';
import { paverSurface, physicalSurface } from './materials.js';
import { FINISH, campusFurniture, entranceCanopies, freeRuns as runs, greenWalls, luminaires, slabBands } from './garden-campus-finish.js';
import { buildCampusPlanting, campusPlantingPlan } from './garden-campus-planting.js';
import { campusPartitions } from '../../shared/garden-campus-partitions.js';
import { applyKitFields, campusKitFinish, campusKitFinishName } from './garden-campus-kit-finish.js';

const GLASS_INSET = FINISH.glassInset, GLASS_THICKNESS = 0.04, MULLION = 0.08, MULLION_STEP = 1.5, MULLION_DEPTH = 0.18;
const PARAPET = 1, GUARD_GLASS = 0.03, RAIL = 0.06, DOOR_HEIGHT = 2.6;
const ROOM = { floor: 0.006, path: 0.012 };
// Luminaire glow (emissive intensity). Offices keep their lights on through the day; toward
// dusk (atmosphere.js `twilight`) the glow comes up to full, so lit floors read through the
// glazing without adding a light to the scene.
export const CAMPUS_GLOW = Object.freeze({ day: 0.8, dusk: 2.4 });
// TypeSafe pink (office-penthouse-furnishings.js TYPESAFE_PINK): a thin inlay under each entrance
// canopy's bronze edge. Not imported, so the office visit stays its own chunk.
const ACCENT = '#f486a1';
// The glazing is a whisper of TypeSafe pink, lifted almost to white and clear to see into: the
// towers read pink against the district's stone and bronze, and the floors behind show through.
const GLASS_TINT = '#fbe4eb', GUARD_TINT = '#fdf1f5';

/**
 * The campus shells as a Three.js group with dispose(); null without the campus. `kitFinish`
 * (garden-campus-kit-finish.js CAMPUS_KIT_FINISHES) recolours the materials below and nothing
 * else; unknown or absent is classic.
 */
export function buildGardenCampus(world, { kitFinish } = {}) {
  if (!world?.gardenCampus) return null;
  const style = campusKitFinish(kitFinish);
  const root = new THREE.Group();root.name = 'The Gardens (garden campus)';
  const [x0, y0, z0] = campusToScene([0, 0, 0]), east = CAMPUS.frame.east;
  root.position.set(x0, y0, z0);root.rotation.y = Math.atan2(east[1], east[0]);
  const materials = {
    slab: new THREE.MeshStandardMaterial({ name: 'campus:slab', color: '#d9d2c3', roughness: 0.78 }),
    // Calm limestone: the authored green roofs' path stone (green-roofs.js), metric UVs per instance.
    stone: physicalSurface('stone', { instanced: true, tileSize: 2, color: '#fff5df', textureContrast: 0.15, normalScale: new THREE.Vector2(0.15, 0.15), roughness: 0.85 }),
    core: new THREE.MeshStandardMaterial({ name: 'campus:core', color: '#b9ab94', roughness: 0.7 }),
    bronze: new THREE.MeshStandardMaterial({ name: 'campus:bronze', color: '#8a6a45', metalness: 0.75, roughness: 0.34 }),
    timber: new THREE.MeshStandardMaterial({ name: 'campus:timber', color: '#8c7660', roughness: 0.78 }),
    // Emerald-cut panes (applyEmeraldCut below), with a clear lacquer and a faint iridescence.
    glass: applyEmeraldCut(new THREE.MeshPhysicalMaterial({ name: 'campus:glass', color: GLASS_TINT, metalness: 0.1, roughness: 0.04, ior: 1.52, specularIntensity: 1,
      clearcoat: 1, clearcoatRoughness: 0.03, iridescence: 0.3, iridescenceIOR: 1.35, transparent: true, opacity: 0.28, depthWrite: false, side: THREE.DoubleSide }), style.emerald),
    guard: new THREE.MeshPhysicalMaterial({ name: 'campus:guard-glass', color: GUARD_TINT, roughness: 0.05, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide }),
    // The planted platform and the paths share the district's own grass and paver programs.
    lawn: physicalSurface('grass', { tileSize: 14, variation: 0.6, color: '#a9bb8c', roughness: 1 }),
    paving: paverSurface({ polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }),
    planting: new THREE.MeshStandardMaterial({ name: 'campus:planting', color: '#4f6b3c', roughness: 0.9 }),
    water: new THREE.MeshStandardMaterial({ name: 'campus:water', color: '#45606a', metalness: 0.2, roughness: 0.08 }),
    interior: new THREE.MeshStandardMaterial({ name: 'campus:floor', color: '#e6dfd2', roughness: 0.55 }),
    soil: new THREE.MeshStandardMaterial({ name: 'campus:soil', color: '#3d3a2e', roughness: 1 }),
    luminaire: new THREE.MeshStandardMaterial({ name: 'campus:luminaire', color: '#fff3df', emissive: '#ffd6a0', emissiveIntensity: CAMPUS_GLOW.day, roughness: 0.4 }),
    accent: new THREE.MeshStandardMaterial({ name: 'campus:accent', color: ACCENT, roughness: 0.5 }),
    partition: new THREE.MeshStandardMaterial({ name: 'campus:partition', color: '#ece6da', roughness: 0.82 }),
    door: new THREE.MeshStandardMaterial({ name: 'campus:suite-door', color: '#9a7350', roughness: 0.72 }),
  };
  materials.lawn.name = 'campus:lawn';materials.paving.name = 'campus:paving';materials.stone.name = 'campus:stone';
  for (const [key, fields] of Object.entries(style.campus)) applyKitFields(materials[key], fields);
  // A suite's walls and door stay opaque at any camera distance (near-camera-fade.js): a
  // resident walking a 3 m gallery never sees through them into a private suite.
  materials.partition.userData.nearCameraSolid = materials.door.userData.nearCameraSolid = true;
  const batches = new Map(Object.keys(materials).filter(key => !['lawn', 'paving'].includes(key)).map(key => [key, []]));
  // A box spanning [u0, u1] x [v0, v1] x [z0, z1] in campus metres.
  // Glass also carries its facade's mullion origin, so each emerald pane fills exactly one bay.
  const box = (finish, u0, v0, u1, v1, za, zb, origin) => { if (u1 - u0 > 1e-6 && v1 - v0 > 1e-6 && zb - za > 1e-6) batches.get(finish).push([u0, v0, u1, v1, za, zb, origin]); };
  // A bronze part that is a trim (rail, coping, canopy edge, fascia): the same box in the same
  // batch, remembered so a kit finish can colour it apart from the mullions (style.trim).
  const trims = new Set(), trim = (...rect) => { const parts = batches.get('bronze'), n = parts.length;box('bronze', ...rect);if (parts.length > n) trims.add(n); };

  const levels = campusLevels(CAMPUS), walls = greenWalls(CAMPUS), slab = CAMPUS.bridges[0].slab;
  // Openings in each facade at each floor, from the contract: skywalk portals, terrace doors and lobby entrances.
  const openingsAt = (tower, floor) => {
    const level = levels.find(item => item.z === floor.z0), cuts = [];
    for (const opening of level?.openings ?? []) {
      if (opening.kind === 'skywalk-portal' && CAMPUS.bridges.some(bridge => bridge.portals.some(portal => portal.id === opening.id && portal.tower === tower.id))) {
        const portal = CAMPUS.bridges.flatMap(bridge => bridge.portals).find(item => item.id === opening.id);
        cuts.push({ side: portal.side, span: [...portal.opening], height: portal.clearHeight });
      }
      if (opening.kind === 'terrace-door' && opening.id.startsWith(`${tower.id}-`)) cuts.push({ side: 'east', span: [opening.position[1] - opening.width / 2, opening.position[1] + opening.width / 2], height: DOOR_HEIGHT });
      if (opening.kind === 'entrance' && opening.id.startsWith(`${tower.id}-`)) cuts.push({ side: 'east', span: [opening.position[1] - opening.width / 2, opening.position[1] + opening.width / 2], height: DOOR_HEIGHT });
    }
    return cuts;
  };

  for (const tower of CAMPUS.towers) {
    for (const floor of tower.levels) {
      const [u0, v0, u1, v1] = floor.rect, slabTop = floor.z1;
      // Ceiling slab (the floor above, the terrace or the roof deck) over the whole plate.
      box('slab', u0, v0, u1, v1, slabTop - slab, slabTop);
      box('interior', u0 + GLASS_INSET, v0 + GLASS_INSET, u1 - GLASS_INSET, v1 - GLASS_INSET, floor.z0, floor.z0 + ROOM.floor);
      const glassTop = slabTop - slab, cuts = openingsAt(tower, floor);
      // The west service riser above the ground floor is a solid planted wall, not glass.
      for (const wall of walls.filter(item => item.floor === floor.id)) cuts.push({ side: wall.side, span: [...wall.span], solid: true });
      const facade = (side, lo, hi, fixed, horizontal, edge) => {
        const sideCuts = cuts.filter(cut => cut.side === side), out = Math.sign(edge - fixed);
        const at = (a, b, c, d, za, zb) => horizontal ? box('glass', a, c, b, d, za, zb, lo) : box('glass', c, a, d, b, za, zb, lo);
        // Full-height glass where uncut; above an opening, a transom from its head to the slab.
        for (const [a, b] of runs(lo, hi, sideCuts.map(cut => cut.span))) at(a, b, fixed - GLASS_THICKNESS / 2, fixed + GLASS_THICKNESS / 2, floor.z0, glassTop);
        for (const cut of sideCuts.filter(item => !item.solid)) at(cut.span[0], cut.span[1], fixed - GLASS_THICKNESS / 2, fixed + GLASS_THICKNESS / 2, floor.z0 + cut.height, glassTop);
        // Solid panels: a dark backing at the glazing line behind the planted face.
        for (const cut of sideCuts.filter(item => item.solid)) horizontal
          ? box('core', cut.span[0], fixed - 0.03, cut.span[1], fixed + 0.03, floor.z0, glassTop)
          : box('core', fixed - 0.03, cut.span[0], fixed + 0.03, cut.span[1], floor.z0, glassTop);
        // Bronze mullions on a 1.5 m module, never inside an opening; every second one
        // deepens into a slender fin that stops at the plate edge.
        let index = 0;
        for (let pos = lo + MULLION_STEP; pos < hi - 0.2; pos += MULLION_STEP) {
          index++;
          if (sideCuts.some(cut => pos > cut.span[0] - MULLION && pos < cut.span[1] + MULLION)) continue;
          const fin = index % FINISH.finEvery === 0, half = (fin ? FINISH.finWidth : MULLION) / 2;
          const [d0, d1] = fin ? (out > 0 ? [fixed - MULLION_DEPTH / 2, edge - 0.005] : [edge + 0.005, fixed + MULLION_DEPTH / 2]) : [fixed - MULLION_DEPTH / 2, fixed + MULLION_DEPTH / 2];
          horizontal ? box('bronze', pos - half, d0, pos + half, d1, floor.z0, glassTop) : box('bronze', d0, pos - half, d1, pos + half, floor.z0, glassTop);
        }
        // Ground floor: a stone plinth between the plate edge and the glass, broken at doors.
        if (floor.level === 1) {
          const [p0, p1] = out > 0 ? [fixed + GLASS_THICKNESS / 2 + 0.005, edge - 0.005] : [edge + 0.005, fixed - GLASS_THICKNESS / 2 - 0.005];
          for (const [a, b] of runs(lo, hi, sideCuts.map(cut => [cut.span[0] - 0.1, cut.span[1] + 0.1])))
            horizontal ? box('stone', a, p0, b, p1, 0, FINISH.plinth) : box('stone', p0, a, p1, b, 0, FINISH.plinth);
        }
      };
      facade('south', u0, u1, v0 + GLASS_INSET, true, v0);facade('north', u0, u1, v1 - GLASS_INSET, true, v1);
      facade('west', v0, v1, u0 + GLASS_INSET, false, u0);facade('east', v0, v1, u1 - GLASS_INSET, false, u1);
    }
    // The core: lift and stair shafts from the ground to the roof deck.
    const [c0, c1, c2, c3] = tower.core.rect, roof = tower.roof, head = roof.headhouse, cap = 0.25;
    box('core', tower.core.lift.rect[0], tower.core.lift.rect[1], tower.core.lift.rect[2], tower.core.lift.rect[3], 0, roof.z);
    box('core', tower.core.stair.rect[0], tower.core.stair.rect[1], tower.core.stair.rect[2], tower.core.stair.rect[3], 0, roof.z);
    // Headhouse: limestone over the shafts and the lobby part, like the parapets, with its door
    // to the east under a bronze cap at the declared headhouse top.
    box('stone', tower.core.lift.rect[0], tower.core.lift.rect[1], tower.core.lift.rect[2], tower.core.lift.rect[3], roof.z, head.z1 - cap);
    box('stone', tower.core.stair.rect[0], tower.core.stair.rect[1], tower.core.stair.rect[2], tower.core.stair.rect[3], roof.z, head.z1 - cap);
    box('stone', tower.core.lobby.rect[0], c1, c2, head.door[1] - 0.85, roof.z, head.z1 - cap);
    box('stone', tower.core.lobby.rect[0], head.door[1] + 0.85, c2, c3, roof.z, head.z1 - cap);
    box('timber', tower.core.lobby.rect[0], head.door[1] - 0.85, c2, head.door[1] + 0.85, roof.z + DOOR_HEIGHT, head.z1 - cap);
    // The roof garden's floor: flush limestone over the deck, around the headhouse.
    for (const [a, b, c, d] of [[roof.rect[0], roof.rect[1], roof.rect[2], c1], [roof.rect[0], c3, roof.rect[2], roof.rect[3]], [roof.rect[0], c1, c0, c3], [c2, c1, roof.rect[2], c3]])
      box('stone', a, b, c, d, roof.z, roof.z + ROOM.floor);
    box('bronze', c0, c1, c2, c3, head.z1 - cap, head.z1);
    // A lantern line on the cap's east face, above body clearance over the roof garden.
    box('luminaire', c2, head.door[1] - 0.8, c2 + 0.02, head.door[1] + 0.8, head.z1 - cap + 0.05, head.z1 - cap + 0.08);
  }

  // Guards, parapets and posts: every guard obstacle the contract publishes, drawn at its level.
  for (const level of levels) for (const obstacle of level.obstacles) {
    const [u0, v0, u1, v1] = obstacle.rect, z = level.z;
    if (obstacle.kind === 'guard' && obstacle.id.includes('/parapet-')) {
      box('stone', u0, v0, u1, v1, z, z + PARAPET - FINISH.coping);trim(u0, v0, u1, v1, z + PARAPET - FINISH.coping, z + PARAPET);
    } else if (obstacle.kind === 'guard' && /\/edge-(west|east)$/.test(obstacle.id)) {
      // Skywalk edge zone: a planted trough (planting plan) and a glass guard on its outer line.
      const outer = obstacle.id.endsWith('west') ? u0 : u1 - GUARD_GLASS, bridge = CAMPUS.bridges.find(item => obstacle.id.startsWith(`${item.id}/`));
      box('guard', outer, v0, outer + GUARD_GLASS, v1, z, z + bridge.guard);
      // The rail stays on the edge zone's own rect: nothing overhangs the route or a terrace.
      const rail = obstacle.id.endsWith('west') ? [u0, u0 + RAIL] : [u1 - RAIL, u1];
      trim(rail[0], v0, rail[1], v1, z + bridge.guard - RAIL, z + bridge.guard);
    } else if (obstacle.kind === 'guard') {
      // Terrace guard: glass with a bronze rail, on the rect the contract reserves for it.
      box('guard', u0, v0, u1, v1, z, z + 1.1);
      trim(u0, v0, u1, v1, z + 1.1 - RAIL, z + 1.1);
    } else if (obstacle.kind === 'post') box('timber', u0, v0, u1, v1, z, CAMPUS.groundBuildings.find(item => item.id === 'S').height);
    // The contract's finishes (#506 furnishings: planter, seat, table, tree) are drawn once
    // each, over their whole footprint, by campusFurniture and the planting plan below.
  }
  // Interior walls closing every suite and service room off the public galleries and spines,
  // and a closed timber door in bronze jambs in each suite's door (garden-campus-partitions.js).
  const partitions = campusPartitions(CAMPUS);
  for (const { rect, z0: za, z1: zb } of partitions.walls) box('partition', ...rect, za, zb);
  for (const door of partitions.doors) {
    for (const jamb of door.jambs) box('bronze', ...jamb, door.z0, door.head);
    box('bronze', ...door.headRect, door.head, door.headTop);box('door', ...door.leaf, door.z0, door.head);
  }

  // Terrace decks: timber over each part, on the slab of the tier below.
  for (const tower of CAMPUS.towers) for (const terrace of tower.terraces) for (const [u0, v0, u1, v1] of terrace.parts) box('timber', u0, v0, u1, v1, terrace.z, terrace.z + ROOM.floor);

  // Skywalks: a 0.35 m deck from facade to facade, its bottom 8 cm a timber soffit. Where a
  // deck crosses a terrace at its own level (B12 over T2's z 13 terrace), the terrace slab
  // is the deck there.
  for (const bridge of CAMPUS.bridges) {
    const [u0, v0, u1, v1] = bridge.rect, onTerrace = CAMPUS.towers.flatMap(tower => tower.terraces)
      .filter(terrace => terrace.z === bridge.deckZ).flatMap(terrace => terrace.parts).filter(part => part[1] < v1 && part[3] > v0 && part[0] < u1 && part[2] > u0);
    const spans = runs(v0, v1, onTerrace.map(part => [part[1], part[3]]));
    for (const [a, b] of spans) box('slab', u0, a, u1, b, bridge.underside + FINISH.soffit, bridge.deckZ);
    // Two soffit light lines along the deck's outer edges wash the walk beneath at dusk.
    for (const [a, b] of spans) {
      box('timber', u0, a, u1, b, bridge.underside + 0.005, bridge.underside + FINISH.soffit);
      for (const [p, q] of [[u0 + 0.06, u0 + 0.12], [u1 - 0.12, u1 - 0.06]]) box('luminaire', p, a + 0.2, q, b - 0.2, bridge.underside, bridge.underside + 0.005);
    }
    for (const [a, b] of spans) box('stone', bridge.clear[0], a, bridge.clear[2], b, bridge.deckZ, bridge.deckZ + ROOM.floor);
  }

  // Ground: café, pergola slats and pool; paths over a planted platform.
  for (const item of CAMPUS.groundBuildings) {
    const [u0, v0, u1, v1] = item.rect;
    if (item.kind === 'cafe') {
      box('slab', u0, v0, u1, v1, item.height - 0.3, item.height);box('planting', u0 + 0.3, v0 + 0.3, u1 - 0.3, v1 - 0.3, item.height, item.height + 0.15);
      box('interior', u0 + GLASS_INSET, v0 + GLASS_INSET, u1 - GLASS_INSET, v1 - GLASS_INSET, 0, ROOM.floor);
      const [, dv] = item.door, top = item.height - 0.3;
      for (const [a, b] of runs(v0, v1, [[dv - 0.85, dv + 0.85]])) box('glass', u1 - GLASS_INSET - GLASS_THICKNESS / 2, a, u1 - GLASS_INSET + GLASS_THICKNESS / 2, b, 0, top);
      box('glass', u1 - GLASS_INSET - GLASS_THICKNESS / 2, dv - 0.85, u1 - GLASS_INSET + GLASS_THICKNESS / 2, dv + 0.85, DOOR_HEIGHT, top);
      box('glass', u0 + GLASS_INSET - GLASS_THICKNESS / 2, v0, u0 + GLASS_INSET + GLASS_THICKNESS / 2, v1, 0, top);
      box('glass', u0, v0 + GLASS_INSET - GLASS_THICKNESS / 2, u1, v0 + GLASS_INSET + GLASS_THICKNESS / 2, 0, top);
      box('glass', u0, v1 - GLASS_INSET - GLASS_THICKNESS / 2, u1, v1 - GLASS_INSET + GLASS_THICKNESS / 2, 0, top);
      // A bronze fascia round the planted roof, 2 cm proud of the footprint, overhead.
      for (const [a, b, c, d] of [[u0 - 0.02, v0 - 0.02, u1 + 0.02, v0 + 0.04], [u0 - 0.02, v1 - 0.04, u1 + 0.02, v1 + 0.02], [u0 - 0.02, v0 + 0.04, u0 + 0.04, v1 - 0.04], [u1 - 0.04, v0 + 0.04, u1 + 0.02, v1 - 0.04]])
        trim(a, b, c, d, top - 0.12, item.height + 0.2);
    } else if (item.kind === 'pergola') {
      for (let v = v0 + 0.6; v < v1 - 0.3; v += 0.9) box('timber', u0, v - 0.06, u1, v + 0.06, item.height - 0.22, item.height - 0.06);
      box('timber', u0, v0, u1, v0 + 0.3, item.height - 0.4, item.height - 0.22);box('timber', u0, v1 - 0.3, u1, v1, item.height - 0.4, item.height - 0.22);
    } else if (item.kind === 'pool') {
      // A raised basin on the platform: stone coping and a still water surface below its lip.
      box('water', u0 + 0.3, v0 + 0.3, u1 - 0.3, v1 - 0.3, ROOM.floor, 0.3);
      for (const [a, b, c, d] of [[u0, v0, u1, v0 + 0.3], [u0, v1 - 0.3, u1, v1], [u0, v0, u0 + 0.3, v1], [u1 - 0.3, v0, u1, v1]]) box('stone', a, b, c, d, 0, 0.42);
    }
  }

  // Finish: slab bands, entrance canopies and luminaires (garden-campus-finish.js).
  for (const band of slabBands(CAMPUS)) box('stone', ...band.box);
  for (const canopy of entranceCanopies(CAMPUS)) {
    const [u0, v0, u1, v1] = canopy.rect;
    box('timber', u0, v0, u1 - 0.05, v1, canopy.z0, canopy.z1);trim(u1 - 0.05, v0, u1, v1, canopy.z0 - 0.04, canopy.z1 + 0.02);
    box('accent', u1 - 0.07, v0 + 0.05, u1 - 0.05, v1 - 0.05, canopy.z0 - 0.03, canopy.z0);
  }
  for (const item of luminaires(levels, CAMPUS)) box('luminaire', ...item.rect, item.z0, item.z1);
  for (const part of campusFurniture(levels)) box(part.finish, ...part.box);
  // Planting: planters as boxes here, foliage as the planting meshes below.
  const plan = campusPlantingPlan(CAMPUS, levels);
  for (const planter of plan.planters) {
    // The open face sits back by the toe light's depth, so the light reads in front of the wall
    // and wall and light together fill the planter's whole footprint.
    const [u0, v0, u1, v1] = planter.rect, w = planter.wall, t = FINISH.toeLight, inset = { east: [0, 0, t, 0], west: [t, 0, 0, 0], north: [0, 0, 0, t], south: [0, t, 0, 0] }[planter.open] ?? [0, 0, 0, 0];
    const [a0, b0, a1, b1] = [u0 + inset[0], v0 + inset[1], u1 - inset[2], v1 - inset[3]];
    for (const [p, q, r, s] of [[a0, b0, a1, b0 + w], [a0, b1 - w, a1, b1], [a0, b0 + w, a0 + w, b1 - w], [a1 - w, b0 + w, a1, b1 - w]]) box(planter.finish, p, q, r, s, planter.z0, planter.z1);
    box(planter.finish, a0 + w, b0 + w, a1 - w, b1 - w, planter.z0, planter.z0 + w);
    box('soil', a0 + w, b0 + w, a1 - w, b1 - w, planter.z0 + w, planter.z1 - 0.03);
  }

  const unit = new THREE.BoxGeometry(1, 1, 1), dummy = new THREE.Object3D(), meshes = [];
  // One pane per bay between mullions, so the emerald cut is drawn once per bay at its true size.
  batches.set('glass', batches.get('glass').flatMap(([u0, v0, u1, v1, za, zb, origin]) => {
    const alongU = u1 - u0 >= v1 - v0, edges = emeraldBays(alongU ? u0 : v0, alongU ? u1 : v1, origin);
    return edges.slice(1).map((end, i) => alongU ? [edges[i], v0, end, v1, za, zb] : [u0, edges[i], u1, end, za, zb]);
  }));
  for (const [finish, parts] of batches) {
    if (!parts.length) continue;
    const mesh = new THREE.InstancedMesh(unit, materials[finish], parts.length);mesh.name = `campus:${finish}`;
    parts.forEach(([u0, v0, u1, v1, za, zb], index) => {
      dummy.position.set((u0 + u1) / 2, (za + zb) / 2, -(v0 + v1) / 2);dummy.scale.set(u1 - u0, zb - za, v1 - v0);dummy.updateMatrix();mesh.setMatrixAt(index, dummy.matrix);
    });
    // Classic draws the hardware in one colour; a finish with a trim role tints its trims apart.
    if (finish === 'bronze' && style.trim) {
      const body = new THREE.Color(style.trim.body), accent = new THREE.Color(style.trim.accent);
      parts.forEach((part, index) => mesh.setColorAt(index, trims.has(index) ? accent : body));
    }
    mesh.castShadow = !['glass', 'guard', 'water', 'luminaire', 'soil', 'accent'].includes(finish);mesh.receiveShadow = true;mesh.userData.aoExclude = finish === 'glass' || finish === 'guard';
    root.add(mesh);meshes.push(mesh);
  }
  // The planted platform under everything: the parcel polygon, lawn finish.
  const shape = new THREE.Shape(CAMPUS.parcel.polygon.slice(0, -1).map(([u, v]) => new THREE.Vector2(u, v)));
  const platform = new THREE.ShapeGeometry(shape);platform.rotateX(-Math.PI / 2);
  const lawn = new THREE.Mesh(platform, materials.lawn);lawn.name = 'campus:platform';lawn.receiveShadow = true;root.add(lawn);
  // Paths: one paved surface in metric UVs, so the district paver runs true along the plot.
  const paths = pathGeometry(CAMPUS.paths, ROOM.path), paving = new THREE.Mesh(paths, materials.paving);
  paving.name = 'campus:paths';paving.receiveShadow = true;root.add(paving);
  const planting = buildCampusPlanting(plan);
  for (const object of planting.objects) root.add(object);

  root.userData.kitFinish = campusKitFinishName(kitFinish);
  root.userData.counts = { ...Object.fromEntries([...batches].map(([finish, parts]) => [finish, parts.length])), paving: CAMPUS.paths.length, plants: planting.counts };
  // The time of day (atmosphere.js): twilight 0 by day, 1 at its lowest light.
  root.userData.relight = ({ twilight = 0 } = {}) => {
    const t = Math.min(1, Math.max(0, Number(twilight) || 0));
    materials.luminaire.emissiveIntensity = CAMPUS_GLOW.day + (CAMPUS_GLOW.dusk - CAMPUS_GLOW.day) * t;
  };
  root.userData.dispose = () => {
    for (const mesh of meshes) mesh.dispose();
    unit.dispose();platform.dispose();paths.dispose();planting.dispose();
    // Stone, grass and paver textures are the district's shared maps; only materials are owned.
    Object.values(materials).forEach(material => material.dispose());
  };
  return root;
}

// Flat quads over every path rect, UVs in campus metres (so paver joints follow the plot).
function pathGeometry(paths, z) {
  const position = [], uv = [], index = [];
  for (const { rect: [u0, v0, u1, v1] } of paths) {
    const base = position.length / 3;
    for (const [u, v] of [[u0, v0], [u1, v0], [u1, v1], [u0, v1]]) { position.push(u, z, -v);uv.push(u, v); }
    index.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(index);geometry.computeVertexNormals();
  return geometry;
}

// Emerald-cut glazing. Each bay between mullions is one pane cut like an emerald: an octagon (a
// rectangle with chamfered corners) held in a slim bronze collet that also fills the cut corners,
// with a polished champagne lip, then four graduated steps (each narrower and flatter than the
// last) to a calm table. The cut is drawn per pixel from the pane's own size in metres (its
// instance scale), so it stays exact at any bay size and distance, at no extra draw call,
// triangle or texture. Its light is warm and quiet: facets take a whisper of champagne or blush
// by the way they face, their edges catch a soft Fresnel glow, and the table holds a low warmth.
export const EMERALD = Object.freeze({ chamfer: 0.16, maxChamfer: 0.24, bezel: 0.035, lip: 0.005,
  // Step boundaries by depth from the outline (metres) and each step's tilt (radians).
  steps: Object.freeze([0.10, 0.15, 0.19, 0.22]), tilts: Object.freeze([0.58, 0.42, 0.27, 0.13]), edgeLine: 0.0045,
  bronze: '#8a6a45', bronzeMetalness: 0.75, bronzeRoughness: 0.32,
  champagne: '#f3e4c6', blush: '#f7d3dc', fire: 0.14, glow: 0.16, warmth: 0.07 });
const emeraldChamfer = (w, h) => Math.min(EMERALD.maxChamfer, EMERALD.chamfer * Math.min(w, h));

/** The emerald outline at an inset: eight corners, counter-clockwise, in a w x h pane centred at 0. */
export function emeraldOutline(w, h, inset = 0) {
  const c = emeraldChamfer(w, h), hw = w / 2 - inset, hh = h / 2 - inset, k = Math.max(0.004, c - inset * (Math.SQRT2 - 1));
  return [[-hw + k, -hh], [hw - k, -hh], [hw, -hh + k], [hw, hh - k], [hw - k, hh], [-hw + k, hh], [-hw, hh - k], [-hw, -hh + k]];
}

/** What the shader draws at a point (metres from the pane centre): bronze, the lip, a step facet, or the table. */
export function emeraldAt([x, y], w, h) {
  const c = emeraldChamfer(w, h), qx = Math.abs(x), qy = Math.abs(y);
  const depth = -Math.max(qx - w / 2, qy - h / 2, (qx + qy - (w / 2 + h / 2 - c)) / Math.SQRT2);
  if (depth < EMERALD.bezel) return { part: 'bronze', depth };
  if (depth < EMERALD.bezel + EMERALD.lip) return { part: 'lip', depth };
  const step = EMERALD.steps.findIndex(limit => depth < limit);
  return step < 0 ? { part: 'table', depth } : { part: 'facet', step, depth };
}

/** Bay edges along [a, b]: the facade's mullion module from origin, or equal bays near 1.5 m. */
export function emeraldBays(a, b, origin, step = MULLION_STEP) {
  if (origin === undefined) {
    const n = Math.max(1, Math.round((b - a) / step));
    return Array.from({ length: n + 1 }, (_, i) => a + (b - a) * i / n);
  }
  const edges = [a];
  for (let p = origin + step; p < b - 0.2; p += step) if (p > a + 0.2) edges.push(p);
  return [...edges, b];
}

/**
 * Teach an instanced unit-box glass material the emerald cut. Returns the material. `tint`
 * replaces the collet, lip and facet colours ({ bronze, champagne, blush }); they are uniforms,
 * so the program source and its cache key are the same under every kit finish.
 */
export function applyEmeraldCut(material, tint = {}) {
  const colours = { emeraldBronze: tint.bronze ?? EMERALD.bronze, emeraldChampagne: tint.champagne ?? EMERALD.champagne, emeraldBlush: tint.blush ?? EMERALD.blush };
  const f = value => value.toFixed(4), steps = EMERALD.steps, tilts = EMERALD.tilts;
  // Nested ternaries over the step list: the ring index from 0 at the girdle, and each ring's tilt.
  const byStep = values => steps.map((limit, i) => `paneDepth < ${f(limit)} ? ${values(i)} : `).join('') + '0.0';
  material.customProgramCacheKey = () => 'campus-emerald-cut-v3';
  material.onBeforeCompile = shader => {
    for (const [name, value] of Object.entries(colours)) shader.uniforms[name] = { value: new THREE.Color(value) };
    const anchors = ['#include <common>', '#include <begin_vertex>'];
    if (!anchors.every(anchor => shader.vertexShader.includes(anchor))) throw new Error('Emerald cut: vertex anchors missing');
    shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>
varying vec2 vPane; varying vec2 vPaneSize; varying vec3 vPaneAlong; varying vec3 vPaneUp;`).replace('#include <begin_vertex>', `#include <begin_vertex>
#ifdef USE_INSTANCING
  vec3 paneScale = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
#else
  vec3 paneScale = vec3(1.0);
#endif
  bool paneAlongX = paneScale.x >= paneScale.z;
  vPane = vec2(paneAlongX ? position.x * paneScale.x : position.z * paneScale.z, position.y * paneScale.y);
  vPaneSize = vec2(paneAlongX ? paneScale.x : paneScale.z, paneScale.y);
  mat4 paneToView = modelViewMatrix;
#ifdef USE_INSTANCING
  paneToView = modelViewMatrix * instanceMatrix;
#endif
  vPaneAlong = normalize((paneToView * vec4(paneAlongX ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 0.0, 1.0), 0.0)).xyz);
  vPaneUp = normalize((paneToView * vec4(0.0, 1.0, 0.0, 0.0)).xyz);`);
    const fragmentAnchors = ['#include <common>', '#include <color_fragment>', '#include <metalnessmap_fragment>', '#include <roughnessmap_fragment>', '#include <normal_fragment_maps>', '#include <emissivemap_fragment>'];
    if (!fragmentAnchors.every(anchor => shader.fragmentShader.includes(anchor))) throw new Error('Emerald cut: fragment anchors missing');
    const bezel = f(EMERALD.bezel), lipEnd = f(EMERALD.bezel + EMERALD.lip), edge = f(EMERALD.edgeLine);
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>
varying vec2 vPane; varying vec2 vPaneSize; varying vec3 vPaneAlong; varying vec3 vPaneUp;
uniform vec3 emeraldBronze; uniform vec3 emeraldChampagne; uniform vec3 emeraldBlush;
// Depth inside the emerald outline (negative outside it) and the outline's outward direction there.
float emeraldDepth(vec2 p, vec2 size, out vec2 outward) {
  vec2 q = abs(p), halfSize = 0.5 * size;
  float c = min(${f(EMERALD.maxChamfer)}, ${f(EMERALD.chamfer)} * min(size.x, size.y));
  float dx = q.x - halfSize.x, dy = q.y - halfSize.y, dc = (q.x + q.y - (halfSize.x + halfSize.y - c)) * 0.70710678;
  vec2 s = vec2(p.x < 0.0 ? -1.0 : 1.0, p.y < 0.0 ? -1.0 : 1.0);
  float d = dx; outward = vec2(s.x, 0.0);
  if (dy > d) { d = dy; outward = vec2(0.0, s.y); }
  if (dc > d) { d = dc; outward = s * 0.70710678; }
  return -d;
}`).replace('#include <color_fragment>', `#include <color_fragment>
  vec2 paneOutward; float paneDepth = emeraldDepth(vPane, vPaneSize, paneOutward);
  // Edges are sized by their width on screen, so they stay crisp near and never shimmer far away.
  float paneAA = max(fwidth(paneDepth), 0.0005);
  // The collet: bronze to the bezel line, then a fine polished champagne lip.
  float paneMetal = 1.0 - smoothstep(${bezel} - paneAA, ${bezel} + paneAA, paneDepth);
  float paneLip = smoothstep(${bezel} - paneAA, ${bezel} + paneAA, paneDepth) * (1.0 - smoothstep(${lipEnd} - paneAA, ${lipEnd} + paneAA, paneDepth));
  float paneRing = ${byStep(i => f(steps.length - i))};
  float paneFacet = step(0.5, paneRing);
  // Each facet edge is a hairline of light, fading out once it would be thinner than a pixel.
  float paneLine = 0.0;
${steps.map(limit => `  paneLine = max(paneLine, 1.0 - smoothstep(${edge} * 0.5, ${edge} + paneAA, abs(paneDepth - ${f(limit)})));`).join('\n')}
  paneLine *= 1.0 - smoothstep(${edge}, ${edge} * 4.0, paneAA);
  // Fire, kept warm: facets facing up and sideways lean champagne, those facing down lean blush.
  vec3 paneFire = mix(emeraldBlush, emeraldChampagne, 0.5 + 0.5 * clamp(paneOutward.y + 0.35 * abs(paneOutward.x), -1.0, 1.0));
  diffuseColor.rgb = mix(diffuseColor.rgb, paneFire, ${f(EMERALD.fire)} * paneFacet * paneRing / ${f(steps.length)});
  // The table holds a low warmth, brightest near the floor, as lamplight would.
  float paneLow = 1.0 - smoothstep(-0.5 * vPaneSize.y, 0.15 * vPaneSize.y, vPane.y);
  diffuseColor.rgb = mix(diffuseColor.rgb, emeraldChampagne, ${f(EMERALD.warmth)} * paneLow * (1.0 - paneFacet));
  diffuseColor.rgb = mix(diffuseColor.rgb, emeraldChampagne, 0.32 * paneLine);
  diffuseColor.a = min(1.0, diffuseColor.a + 0.035 * paneRing + 0.22 * paneLine);
  diffuseColor.rgb = mix(diffuseColor.rgb, emeraldChampagne, paneLip);
  diffuseColor.a = mix(diffuseColor.a, 1.0, paneLip);
  diffuseColor.rgb = mix(diffuseColor.rgb, emeraldBronze, paneMetal);
  diffuseColor.a = mix(diffuseColor.a, 1.0, paneMetal);`).replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
  metalnessFactor = mix(metalnessFactor, ${EMERALD.bronzeMetalness.toFixed(3)}, max(paneMetal, paneLip));`).replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
  roughnessFactor = mix(roughnessFactor, ${EMERALD.bronzeRoughness.toFixed(3)}, paneMetal);
  roughnessFactor = mix(roughnessFactor, 0.12, paneLip);`).replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
  // Step facets fall toward the outline, each a little flatter than the one outside it.
  float paneTilt = ${byStep(i => f(tilts[i]))};
  paneTilt *= 1.0 - max(paneMetal, paneLip);
  vec3 paneSide = normalize(paneOutward.x * vPaneAlong + paneOutward.y * vPaneUp);
  normal = normalize(normal * cos(paneTilt) + paneSide * sin(paneTilt));`).replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
  // Edge light: facets glow softly at grazing angles, as cut glass does when you walk past it.
  float paneFresnel = pow(1.0 - abs(dot(normal, normalize(vViewPosition))), 3.0);
  totalEmissiveRadiance += emeraldChampagne * ${f(EMERALD.glow)} * paneFresnel * paneFacet * (1.0 - paneMetal);`);
  };
  return material;
}
