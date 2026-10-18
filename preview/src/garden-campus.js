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

const GLASS_INSET = FINISH.glassInset, GLASS_THICKNESS = 0.04, MULLION = 0.08, MULLION_STEP = 1.5, MULLION_DEPTH = 0.18;
const PARAPET = 1, GUARD_GLASS = 0.03, RAIL = 0.06, DOOR_HEIGHT = 2.6;
const ROOM = { floor: 0.006, path: 0.012 };
// Luminaire glow (emissive intensity). Offices keep their lights on through the day; toward
// dusk (atmosphere.js `twilight`) the glow comes up to full, so lit floors read through the
// glazing without adding a light to the scene.
export const CAMPUS_GLOW = Object.freeze({ day: 0.8, dusk: 2.4 });
// TypeSafe pink (office-penthouse-furnishings.js TYPESAFE_PINK), an accent only: a thin inlay
// under each entrance canopy's bronze edge. Not imported, so the office visit stays its own chunk.
const ACCENT = '#f486a1';

/** The campus shells as a Three.js group with dispose(); null without the campus. */
export function buildGardenCampus(world) {
  if (!world?.gardenCampus) return null;
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
    glass: new THREE.MeshPhysicalMaterial({ name: 'campus:glass', color: '#a9c6c0', metalness: 0.1, roughness: 0.06, transparent: true, opacity: 0.34, depthWrite: false, side: THREE.DoubleSide }),
    guard: new THREE.MeshPhysicalMaterial({ name: 'campus:guard-glass', color: '#cfe0dc', roughness: 0.05, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide }),
    // The planted platform and the paths share the district's own grass and paver programs.
    lawn: physicalSurface('grass', { tileSize: 14, variation: 0.6, color: '#a9bb8c', roughness: 1 }),
    paving: paverSurface({ polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }),
    planting: new THREE.MeshStandardMaterial({ name: 'campus:planting', color: '#4f6b3c', roughness: 0.9 }),
    water: new THREE.MeshStandardMaterial({ name: 'campus:water', color: '#45606a', metalness: 0.2, roughness: 0.08 }),
    interior: new THREE.MeshStandardMaterial({ name: 'campus:floor', color: '#e6dfd2', roughness: 0.55 }),
    soil: new THREE.MeshStandardMaterial({ name: 'campus:soil', color: '#3d3a2e', roughness: 1 }),
    luminaire: new THREE.MeshStandardMaterial({ name: 'campus:luminaire', color: '#fff3df', emissive: '#ffd6a0', emissiveIntensity: CAMPUS_GLOW.day, roughness: 0.4 }),
    accent: new THREE.MeshStandardMaterial({ name: 'campus:accent', color: ACCENT, roughness: 0.5 }),
  };
  materials.lawn.name = 'campus:lawn';materials.paving.name = 'campus:paving';materials.stone.name = 'campus:stone';
  const batches = new Map(Object.keys(materials).filter(key => !['lawn', 'paving'].includes(key)).map(key => [key, []]));
  // A box spanning [u0, u1] x [v0, v1] x [z0, z1] in campus metres.
  const box = (finish, u0, v0, u1, v1, za, zb) => { if (u1 - u0 > 1e-6 && v1 - v0 > 1e-6 && zb - za > 1e-6) batches.get(finish).push([u0, v0, u1, v1, za, zb]); };

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
        const at = (a, b, c, d, za, zb) => horizontal ? box('glass', a, c, b, d, za, zb) : box('glass', c, a, d, b, za, zb);
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
      box('stone', u0, v0, u1, v1, z, z + PARAPET - FINISH.coping);box('bronze', u0, v0, u1, v1, z + PARAPET - FINISH.coping, z + PARAPET);
    } else if (obstacle.kind === 'guard' && /\/edge-(west|east)$/.test(obstacle.id)) {
      // Skywalk edge zone: a planted trough (planting plan) and a glass guard on its outer line.
      const outer = obstacle.id.endsWith('west') ? u0 : u1 - GUARD_GLASS, bridge = CAMPUS.bridges.find(item => obstacle.id.startsWith(`${item.id}/`));
      box('guard', outer, v0, outer + GUARD_GLASS, v1, z, z + bridge.guard);
      // The rail stays on the edge zone's own rect: nothing overhangs the route or a terrace.
      const rail = obstacle.id.endsWith('west') ? [u0, u0 + RAIL] : [u1 - RAIL, u1];
      box('bronze', rail[0], v0, rail[1], v1, z + bridge.guard - RAIL, z + bridge.guard);
    } else if (obstacle.kind === 'guard') {
      // Terrace guard: glass with a bronze rail, on the rect the contract reserves for it.
      box('guard', u0, v0, u1, v1, z, z + 1.1);
      box('bronze', u0, v0, u1, v1, z + 1.1 - RAIL, z + 1.1);
    } else if (obstacle.kind === 'post') box('timber', u0, v0, u1, v1, z, CAMPUS.groundBuildings.find(item => item.id === 'S').height);
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
        box('bronze', a, b, c, d, top - 0.12, item.height + 0.2);
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
    box('timber', u0, v0, u1 - 0.05, v1, canopy.z0, canopy.z1);box('bronze', u1 - 0.05, v0, u1, v1, canopy.z0 - 0.04, canopy.z1 + 0.02);
    box('accent', u1 - 0.07, v0 + 0.05, u1 - 0.05, v1 - 0.05, canopy.z0 - 0.03, canopy.z0);
  }
  for (const item of luminaires(levels, CAMPUS)) box('luminaire', ...item.rect, item.z0, item.z1);
  for (const part of campusFurniture(levels)) box(part.finish, ...part.box);
  // Planting: planters as boxes here, foliage as the planting meshes below.
  const plan = campusPlantingPlan(CAMPUS, levels);
  for (const planter of plan.planters) {
    // The open face sits 2 cm back, so its toe light reads in front of the wall.
    const [u0, v0, u1, v1] = planter.rect, w = planter.wall, inset = { east: [0, 0, 0.02, 0], west: [0.02, 0, 0, 0], north: [0, 0, 0, 0.02], south: [0, 0.02, 0, 0] }[planter.open] ?? [0, 0, 0, 0];
    const [a0, b0, a1, b1] = [u0 + inset[0], v0 + inset[1], u1 - inset[2], v1 - inset[3]];
    for (const [p, q, r, s] of [[a0, b0, a1, b0 + w], [a0, b1 - w, a1, b1], [a0, b0 + w, a0 + w, b1 - w], [a1 - w, b0 + w, a1, b1 - w]]) box(planter.finish, p, q, r, s, planter.z0, planter.z1);
    box(planter.finish, a0 + w, b0 + w, a1 - w, b1 - w, planter.z0, planter.z0 + w);
    box('soil', a0 + w, b0 + w, a1 - w, b1 - w, planter.z0 + w, planter.z1 - 0.03);
  }

  const unit = new THREE.BoxGeometry(1, 1, 1), dummy = new THREE.Object3D(), meshes = [];
  for (const [finish, parts] of batches) {
    if (!parts.length) continue;
    const mesh = new THREE.InstancedMesh(unit, materials[finish], parts.length);mesh.name = `campus:${finish}`;
    parts.forEach(([u0, v0, u1, v1, za, zb], index) => {
      dummy.position.set((u0 + u1) / 2, (za + zb) / 2, -(v0 + v1) / 2);dummy.scale.set(u1 - u0, zb - za, v1 - v0);dummy.updateMatrix();mesh.setMatrixAt(index, dummy.matrix);
    });
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
