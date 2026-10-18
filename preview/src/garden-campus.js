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
// Only the platform is ground (garden-campus-district.js campusGroundAt). This
// group is never registered as ground: a skywalk deck or upper floor here is
// rendering, and #508's campus levels own movement up there.
import * as THREE from 'three';
import { GARDEN_CAMPUS_LAYOUT as CAMPUS, campusLevels, campusToScene } from '../../shared/garden-campus-layout.js';

const GLASS_INSET = 0.1, GLASS_THICKNESS = 0.04, MULLION = 0.08, MULLION_STEP = 1.5, MULLION_DEPTH = 0.18;
const PARAPET = 1, PARAPET_THICKNESS = 0.25, GUARD_GLASS = 0.03, RAIL = 0.06, DOOR_HEIGHT = 2.6;
const ROOM = { floor: 0.006, path: 0.012 };

// A wall run [lo, hi] along one facade minus the openings that cut it.
function runs(lo, hi, cuts) {
  let free = [[lo, hi]];
  for (const [c0, c1] of cuts) free = free.flatMap(([a, b]) => [[a, Math.min(b, c0)], [Math.max(a, c1), b]].filter(([x, y]) => y - x > 0.02));
  return free;
}

/** The campus shells as a Three.js group with dispose(); null without the campus. */
export function buildGardenCampus(world) {
  if (!world?.gardenCampus) return null;
  const root = new THREE.Group();root.name = 'The Gardens (garden campus)';
  const [x0, y0, z0] = campusToScene([0, 0, 0]), east = CAMPUS.frame.east;
  root.position.set(x0, y0, z0);root.rotation.y = Math.atan2(east[1], east[0]);
  const materials = {
    slab: new THREE.MeshStandardMaterial({ name: 'campus:slab', color: '#d9d2c3', roughness: 0.78 }),
    stone: new THREE.MeshStandardMaterial({ name: 'campus:stone', color: '#c8bba4', roughness: 0.62 }),
    core: new THREE.MeshStandardMaterial({ name: 'campus:core', color: '#b9ab94', roughness: 0.7 }),
    bronze: new THREE.MeshStandardMaterial({ name: 'campus:bronze', color: '#8a6a45', metalness: 0.75, roughness: 0.34 }),
    timber: new THREE.MeshStandardMaterial({ name: 'campus:timber', color: '#9a7350', roughness: 0.72 }),
    glass: new THREE.MeshPhysicalMaterial({ name: 'campus:glass', color: '#a9c6c0', metalness: 0.1, roughness: 0.06, transparent: true, opacity: 0.34, depthWrite: false, side: THREE.DoubleSide }),
    guard: new THREE.MeshPhysicalMaterial({ name: 'campus:guard-glass', color: '#cfe0dc', roughness: 0.05, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide }),
    lawn: new THREE.MeshStandardMaterial({ name: 'campus:lawn', color: '#6f8a55', roughness: 0.95 }),
    paving: new THREE.MeshStandardMaterial({ name: 'campus:paving', color: '#cdc4b4', roughness: 0.85 }),
    planting: new THREE.MeshStandardMaterial({ name: 'campus:planting', color: '#4f6b3c', roughness: 0.9 }),
    water: new THREE.MeshStandardMaterial({ name: 'campus:water', color: '#45606a', metalness: 0.2, roughness: 0.08 }),
    interior: new THREE.MeshStandardMaterial({ name: 'campus:floor', color: '#e6dfd2', roughness: 0.55 }),
  };
  const batches = new Map(Object.keys(materials).map(key => [key, []]));
  // A box spanning [u0, u1] x [v0, v1] x [z0, z1] in campus metres.
  const box = (finish, u0, v0, u1, v1, za, zb) => { if (u1 - u0 > 1e-6 && v1 - v0 > 1e-6 && zb - za > 1e-6) batches.get(finish).push([u0, v0, u1, v1, za, zb]); };

  const levels = campusLevels(CAMPUS);
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
      const [u0, v0, u1, v1] = floor.rect, slabTop = floor.z1, slab = CAMPUS.bridges[0].slab;
      // Ceiling slab (the floor above, the terrace or the roof deck) over the whole plate.
      box('slab', u0, v0, u1, v1, slabTop - slab, slabTop);
      box('interior', u0 + GLASS_INSET, v0 + GLASS_INSET, u1 - GLASS_INSET, v1 - GLASS_INSET, floor.z0, floor.z0 + ROOM.floor);
      const glassTop = slabTop - slab, cuts = openingsAt(tower, floor);
      const facade = (side, lo, hi, fixed, horizontal) => {
        const sideCuts = cuts.filter(cut => cut.side === side);
        // Full-height glass where uncut; above an opening, a transom from its head to the slab.
        for (const [a, b] of runs(lo, hi, sideCuts.map(cut => cut.span))) horizontal
          ? box('glass', a, fixed - GLASS_THICKNESS / 2, b, fixed + GLASS_THICKNESS / 2, floor.z0, glassTop)
          : box('glass', fixed - GLASS_THICKNESS / 2, a, fixed + GLASS_THICKNESS / 2, b, floor.z0, glassTop);
        for (const cut of sideCuts) horizontal
          ? box('glass', cut.span[0], fixed - GLASS_THICKNESS / 2, cut.span[1], fixed + GLASS_THICKNESS / 2, floor.z0 + cut.height, glassTop)
          : box('glass', fixed - GLASS_THICKNESS / 2, cut.span[0], fixed + GLASS_THICKNESS / 2, cut.span[1], floor.z0 + cut.height, glassTop);
        // Bronze mullions on a 1.5 m module, never inside an opening.
        for (let at = lo + MULLION_STEP; at < hi - 0.2; at += MULLION_STEP) {
          if (sideCuts.some(cut => at > cut.span[0] - MULLION && at < cut.span[1] + MULLION)) continue;
          horizontal ? box('bronze', at - MULLION / 2, fixed - MULLION_DEPTH / 2, at + MULLION / 2, fixed + MULLION_DEPTH / 2, floor.z0, glassTop)
            : box('bronze', fixed - MULLION_DEPTH / 2, at - MULLION / 2, fixed + MULLION_DEPTH / 2, at + MULLION / 2, floor.z0, glassTop);
        }
      };
      facade('south', u0, u1, v0 + GLASS_INSET, true);facade('north', u0, u1, v1 - GLASS_INSET, true);
      facade('west', v0, v1, u0 + GLASS_INSET, false);facade('east', v0, v1, u1 - GLASS_INSET, false);
    }
    // The core: lift and stair shafts from the ground to the headhouse roof.
    const [c0, c1, c2, c3] = tower.core.rect, roof = tower.roof, head = roof.headhouse;
    box('core', tower.core.lift.rect[0], tower.core.lift.rect[1], tower.core.lift.rect[2], tower.core.lift.rect[3], 0, head.z1);
    box('core', tower.core.stair.rect[0], tower.core.stair.rect[1], tower.core.stair.rect[2], tower.core.stair.rect[3], 0, head.z1);
    // Headhouse: the lobby part of the core rises with the shafts, with its door to the east.
    box('stone', tower.core.lobby.rect[0], c1, c2, head.door[1] - 0.85, roof.z, head.z1);
    box('stone', tower.core.lobby.rect[0], head.door[1] + 0.85, c2, c3, roof.z, head.z1);
    box('stone', tower.core.lobby.rect[0], head.door[1] - 0.85, c2, head.door[1] + 0.85, roof.z + DOOR_HEIGHT, head.z1);
    box('slab', c0, c1, c2, c3, head.z1 - 0.25, head.z1);
    // Roof garden: the declared beds.
    for (const bed of roof.planting.beds) box('planting', bed.rect[0], bed.rect[1], bed.rect[2], bed.rect[3], roof.z, roof.z + 0.45);
  }

  const roofBeds = new Set(CAMPUS.towers.flatMap(tower => tower.roof.planting.beds.map(bed => bed.id)));
  // Guards, parapets and posts: every guard obstacle the contract publishes, drawn at its level.
  for (const level of levels) for (const obstacle of level.obstacles) {
    const [u0, v0, u1, v1] = obstacle.rect, z = level.z;
    if (obstacle.kind === 'guard' && obstacle.id.includes('/parapet-')) box('stone', u0, v0, u1, v1, z, z + PARAPET);
    else if (obstacle.kind === 'guard' && /\/edge-(west|east)$/.test(obstacle.id)) {
      // Skywalk edge zone: a low planter strip and a glass guard on its outer line.
      const outer = obstacle.id.endsWith('west') ? u0 : u1 - GUARD_GLASS, bridge = CAMPUS.bridges.find(item => obstacle.id.startsWith(`${item.id}/`));
      box('planting', u0, v0, u1, v1, z, z + 0.4);
      box('guard', outer, v0, outer + GUARD_GLASS, v1, z, z + bridge.guard);
      box('bronze', outer - RAIL / 2, v0, outer + GUARD_GLASS + RAIL / 2, v1, z + bridge.guard - RAIL, z + bridge.guard);
    } else if (obstacle.kind === 'guard') {
      // Terrace guard: glass with a bronze rail, on the rect the contract reserves for it.
      box('guard', u0, v0, u1, v1, z, z + 1.1);
      box('bronze', u0 - RAIL / 4, v0 - RAIL / 4, u1 + RAIL / 4, v1 + RAIL / 4, z + 1.1 - RAIL, z + 1.1);
    } else if (obstacle.kind === 'post') box('timber', u0, v0, u1, v1, z, CAMPUS.groundBuildings.find(item => item.id === 'S').height);
    // The contract's finishes (#506 furnishings), as plain massing so no collision is ever
    // invisible; #511's finish pass draws them properly. Roof beds are drawn with the roofs.
    else if (obstacle.kind === 'planter' && !roofBeds.has(obstacle.id)) box('planting', u0, v0, u1, v1, z, z + 0.45);
    else if (obstacle.kind === 'seat') box('timber', u0, v0, u1, v1, z, z + 0.45);
    else if (obstacle.kind === 'table') box('timber', u0, v0, u1, v1, z, z + 0.74);
    else if (obstacle.kind === 'tree') {
      const cu = (u0 + u1) / 2, cv = (v0 + v1) / 2;
      box('timber', cu - 0.15, cv - 0.15, cu + 0.15, cv + 0.15, z, z + 3.4);box('planting', cu - 1.4, cv - 1.4, cu + 1.4, cv + 1.4, z + 3.4, z + 5.6);
    }
  }
  // Terrace decks: timber over each part, on the slab of the tier below.
  for (const tower of CAMPUS.towers) for (const terrace of tower.terraces) for (const [u0, v0, u1, v1] of terrace.parts) box('timber', u0, v0, u1, v1, terrace.z, terrace.z + ROOM.floor);

  // Skywalks: a 0.35 m deck from facade to facade. Where a deck crosses a terrace at its own
  // level (B12 over T2's z 13 terrace), the terrace slab is the deck there.
  for (const bridge of CAMPUS.bridges) {
    const [u0, v0, u1, v1] = bridge.rect, onTerrace = CAMPUS.towers.flatMap(tower => tower.terraces)
      .filter(terrace => terrace.z === bridge.deckZ).flatMap(terrace => terrace.parts).filter(part => part[1] < v1 && part[3] > v0 && part[0] < u1 && part[2] > u0);
    const spans = runs(v0, v1, onTerrace.map(part => [part[1], part[3]]));
    for (const [a, b] of spans) box('slab', u0, a, u1, b, bridge.underside, bridge.deckZ);
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
    } else if (item.kind === 'pergola') {
      for (let v = v0 + 0.6; v < v1 - 0.3; v += 0.9) box('timber', u0, v - 0.06, u1, v + 0.06, item.height - 0.22, item.height - 0.06);
      box('timber', u0, v0, u1, v0 + 0.3, item.height - 0.4, item.height - 0.22);box('timber', u0, v1 - 0.3, u1, v1, item.height - 0.4, item.height - 0.22);
    } else if (item.kind === 'pool') {
      // A raised basin on the platform: stone coping and a still water surface below its lip.
      box('water', u0 + 0.3, v0 + 0.3, u1 - 0.3, v1 - 0.3, ROOM.floor, 0.3);
      for (const [a, b, c, d] of [[u0, v0, u1, v0 + 0.3], [u0, v1 - 0.3, u1, v1], [u0, v0, u0 + 0.3, v1], [u1 - 0.3, v0, u1, v1]]) box('stone', a, b, c, d, 0, 0.42);
    }
  }
  for (const path of CAMPUS.paths) box('paving', path.rect[0], path.rect[1], path.rect[2], path.rect[3], 0, ROOM.path);

  const unit = new THREE.BoxGeometry(1, 1, 1), dummy = new THREE.Object3D(), meshes = [];
  for (const [finish, parts] of batches) {
    if (!parts.length) continue;
    const mesh = new THREE.InstancedMesh(unit, materials[finish], parts.length);mesh.name = `campus:${finish}`;
    parts.forEach(([u0, v0, u1, v1, za, zb], index) => {
      dummy.position.set((u0 + u1) / 2, (za + zb) / 2, -(v0 + v1) / 2);dummy.scale.set(u1 - u0, zb - za, v1 - v0);dummy.updateMatrix();mesh.setMatrixAt(index, dummy.matrix);
    });
    mesh.castShadow = !['glass', 'guard', 'water', 'paving'].includes(finish);mesh.receiveShadow = true;mesh.userData.aoExclude = finish === 'glass' || finish === 'guard';
    root.add(mesh);meshes.push(mesh);
  }
  // The planted platform under everything: the parcel polygon, lawn finish.
  const shape = new THREE.Shape(CAMPUS.parcel.polygon.slice(0, -1).map(([u, v]) => new THREE.Vector2(u, v)));
  const platform = new THREE.ShapeGeometry(shape);platform.rotateX(-Math.PI / 2);
  const lawn = new THREE.Mesh(platform, materials.lawn);lawn.name = 'campus:platform';lawn.receiveShadow = true;root.add(lawn);
  root.userData.counts = Object.fromEntries([...batches].map(([finish, parts]) => [finish, parts.length]));
  root.userData.dispose = () => {
    for (const mesh of meshes) mesh.dispose();
    unit.dispose();platform.dispose();
    Object.values(materials).forEach(material => material.dispose());
  };
  return root;
}
