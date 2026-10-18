// The Gardens' planting (#511), placed only where the contract gives it support:
// - roof beds: the declared roof planters (campusLevels() `planter` obstacles);
// - skywalk edges: the 0.5 m edge zones, which are guard obstacles beside the 3 m route;
// - terrace troughs: hung outside each terrace guard (garden-campus-finish.js);
// - west green walls: the solid service-riser panels above the ground floor;
// - the pergola: climbers on its slats and up its posts, never below 3.3 m over the
//   walkway it shades;
// - the café's green roof.
// Nothing stands in a walking area: a plant either sits inside a published obstacle,
// hangs in the air outside the building above body clearance, or is under 5 cm.
//
// The plan is pure campus metres (u, v, z), deterministic from position seeds, so tests
// and the renderer read one composition. buildCampusPlanting draws it under the campus
// root (x = u, y = z, -z = v) from existing authored parts: procedural plants and roof
// grasses (preview/src/procedural-plants.js, roof-grasses.js) and low-poly foliage clumps.
import * as THREE from 'three';
import { GARDEN_CAMPUS_LAYOUT as CAMPUS, campusLevels } from '../../shared/garden-campus-layout.js';
import { plantRecord, plantingRandom, seedFromPosition } from './planting-palette.js';
import { buildProceduralPlants } from './procedural-plants.js';
import { buildRoofGrasses } from './roof-grasses.js';
import { spatialInstanceBatches } from './spatial-instances.js';
import { FINISH, greenWalls, planterOpenSide, terraceTroughs } from './garden-campus-finish.js';

export const PLANTING = Object.freeze({
  bed: { wall: 0.05, height: 0.45, soil: 0.03 },
  edge: { height: 0.4, step: 0.6 },
  tree: { every: 4.6, below: 0.12, crown: 0.42, trunk: 0.06 }, // columnar bed trees stop 0.12 m under the cap
  detailDistance: 60, // fine leaves submit within this many metres of the camera (green roofs use 55)
  pergolaMinZ: 3.3,
});
// Clumps turn only by quarter turns about the vertical, and only where their plan radii are
// equal, so each keeps its exact footprint for the support and clearance checks.
const quarter = rand => Math.floor(rand() * 4) * Math.PI / 2;
const PERENNIALS = ['foxtail-fern', 'mound-fern', 'agave', 'pentas', 'foxtail-fern', 'coleus'];
// Terrace beds and skywalk edges favour the lighter species: a foxtail fern's plumes cost about
// three times a mounded fern's fronds, and these beds run for hundreds of metres.
const TERRACE = ['mound-fern', 'agave', 'pentas', 'coleus', 'persian-shield', 'agave'];
const EDGE = ['pentas', 'mound-fern', 'agave', 'coleus', 'foxtail-fern', 'agave'];

// One planting plan for the whole campus.
// clumps: foliage ellipsoids {of, at: [u, v, z], radius: [ru, rv, rz], hue, tone}
// trunks: {at: [u, v, z0], height, radius}
// plants: procedural plant placements {species, at: [u, v, z], reach, seed}
// tufts:  ornamental grass {at: [u, v, z], seed}
// planters: {rect, z0, z1, wall, soil, finish} boxes drawn by the shell
export function campusPlantingPlan(layout = CAMPUS, levels = campusLevels(layout)) {
  const plan = { clumps: [], trunks: [], plants: [], tufts: [], planters: [] };
  const rng = (u, v) => plantingRandom(seedFromPosition(u * 7.1, v * 3.3));

  // Planters the contract publishes (roof beds today; terrace beds once declared): a stone
  // planter with soil and a layered perennial and grass band along its length. On a roof,
  // columnar trees stand in the bed at a steady rhythm and top out under the declared cap;
  // a terrace bed keeps to perennials, so terrace views and sky stay open.
  for (const level of levels) for (const bed of level.obstacles.filter(item => item.kind === 'planter')) {
    const [u0, v0, u1, v1] = bed.rect, alongV = v1 - v0 >= u1 - u0, tower = layout.towers.find(item => bed.id.startsWith(`${item.id}-`));
    const [lo, hi] = alongV ? [v0, v1] : [u0, u1], centre = alongV ? (u0 + u1) / 2 : (v0 + v1) / 2, half = (alongV ? u1 - u0 : v1 - v0) / 2;
    const at = (s, t, z) => alongV ? [t, s, z] : [s, t, z];
    const rim = level.z + PLANTING.bed.height, soil = rim - PLANTING.bed.soil;
    plan.planters.push({ id: bed.id, rect: [...bed.rect], z0: level.z, z1: rim, wall: PLANTING.bed.wall, finish: 'stone', open: planterOpenSide(bed.rect, level) });
    const trees = [];
    if (tower && level.z === tower.roof.z && half >= 0.45) for (let s = lo + 1.6; s < hi - 1.2; s += PLANTING.tree.every) trees.push(s);
    const top = tower ? Math.min(tower.silhouette.capZ - PLANTING.tree.below, level.z + 3.0) : level.z + 3.0, crown = Math.min(PLANTING.tree.crown, half - 0.08);
    for (const s of trees) {
      const rand = rng(...at(s, centre).slice(0, 2));
      plan.trunks.push({ at: at(s, centre, soil), height: top - 0.9 - soil, radius: PLANTING.tree.trunk });
      // Three stacked clumps: a narrow, upright crown that stays over its bed.
      // An irregular columnar crown: a main mass, a narrower top and side tufts, all over the bed.
      plan.clumps.push({ of: 'bed tree', at: at(s, centre, top - 0.95), radius: [crown * 0.9, crown * 0.9, 0.65], yaw: quarter(rand), hue: 0.26 + rand() * 0.04, tone: 0.2 + rand() * 0.05 });
      plan.clumps.push({ of: 'bed tree', at: at(s, centre, top - 0.3), radius: [crown * 0.55, crown * 0.55, 0.3], yaw: quarter(rand), hue: 0.27 + rand() * 0.04, tone: 0.22 + rand() * 0.05 });
      for (let i = 0; i < 3; i++) {
        const angle = i * 2.1 + rand(), off = crown * 0.4, r = crown * 0.5;
        plan.clumps.push({ of: 'bed tree', at: at(s + Math.cos(angle) * off, centre + Math.sin(angle) * off, top - 0.6 - rand() * 0.8), radius: [r, r, 0.26], yaw: quarter(rand), hue: 0.25 + rand() * 0.05, tone: 0.19 + rand() * 0.06 });
      }
    }
    const offset = Math.min(0.2, Math.max(0, half - PLANTING.bed.wall - 0.2)), reach = half - PLANTING.bed.wall - offset - 0.02;
    const roof = Boolean(tower && level.z === tower.roof.z), palette = roof ? PERENNIALS : TERRACE, step = roof ? 0.55 : 0.7;
    let n = 0;
    for (let s = lo + 0.35; s < hi - 0.3; s += step, n++) {
      if (trees.some(t => Math.abs(t - s) < 0.5)) continue;
      const rand = rng(...at(s, centre + 0.5).slice(0, 2));
      // Grass blades lean up to about 0.37 m from their crown: tufts stand on the centre line of a bed wide enough.
      if (n % 5 === 4 && half - PLANTING.bed.wall >= 0.4) plan.tufts.push({ at: at(s, centre, soil), seed: Math.floor(rand() * 4294967296) });
      else plan.plants.push({ species: palette[n % palette.length], at: at(s, centre + (n % 2 ? offset : -offset), soil), reach, seed: Math.floor(rand() * 4294967296) });
    }
  }

  // Ground trees the contract publishes as tree pits: a stone kerb, a trunk and a broad crown
  // whose lowest leaves stay above body clearance over the lawn and paths around it.
  for (const level of levels) for (const pit of level.obstacles.filter(item => item.kind === 'tree')) {
    const [u0, v0, u1, v1] = pit.rect, c = [(u0 + u1) / 2, (v0 + v1) / 2], rand = rng(...c), crownBase = level.z + FINISH.clearance + 0.45;
    plan.planters.push({ id: pit.id, rect: [...pit.rect], z0: level.z, z1: level.z + 0.15, wall: 0.08, finish: 'stone', open: null });
    plan.trunks.push({ at: [c[0], c[1], level.z + 0.12], height: crownBase + 1.2 - level.z, radius: 0.11 });
    for (let i = 0; i < 7; i++) {
      const angle = i * 2.399963 + rand() * 0.4, r = i ? 0.9 + rand() * 0.5 : 0, z = crownBase + 1.1 + (i ? rand() * 1.4 : 1.6);
      const size = 1.05 + rand() * 0.35;
      plan.clumps.push({ of: 'tree', at: [c[0] + Math.cos(angle) * r, c[1] + Math.sin(angle) * r, z], radius: [size, size, Math.min(size * 0.8, z - crownBase)], hue: 0.25 + rand() * 0.05, tone: 0.17 + rand() * 0.06 });
    }
  }

  // Skywalk edge zones: a low trough between the 3 m route and the outer glass guard,
  // planted with grasses and colour that stay under the guard's top.
  for (const level of levels) for (const zone of level.obstacles.filter(item => item.kind === 'guard' && /\/edge-(west|east)$/.test(item.id))) {
    const [u0, v0, u1, v1] = zone.rect, west = zone.id.endsWith('west'), rim = level.z + PLANTING.edge.height, soil = rim - PLANTING.bed.soil;
    // The glass guard stands on the outer line; the trough keeps clear of it.
    const inner = west ? [u0 + 0.06, u1 - 0.01] : [u0 + 0.01, u1 - 0.06], mid = (inner[0] + inner[1]) / 2, reach = (inner[1] - inner[0]) / 2 - 0.02;
    plan.planters.push({ id: `${zone.id}/trough`, rect: [inner[0], v0, inner[1], v1], z0: level.z, z1: rim, wall: 0.04, finish: 'bronze', open: west ? 'east' : 'west' });
    // Only reach-bounded plants here: nothing leans over the trough into the clear route.
    let n = 0;
    for (let v = v0 + 0.3; v < v1 - 0.25; v += PLANTING.edge.step, n++) {
      const rand = rng(mid, v);
      plan.plants.push({ species: EDGE[n % EDGE.length], at: [mid, v, soil], reach, seed: Math.floor(rand() * 4294967296) });
    }
  }

  // Terrace troughs: a bronze trough on the slab edge outside the guard, with cascading
  // foliage over the fascia below and a planted lip above the deck line.
  // Hanging foliage keeps body clearance over any walkable surface below it.
  const walkable = levels.flatMap(level => level.surfaces.filter(surface => surface.rect && surface.access !== 'service').map(surface => ({ z: level.z, rect: surface.rect })));
  const floorUnder = (u, v, r, below) => Math.max(-Infinity, ...walkable.filter(item => item.z < below && u + r > item.rect[0] && u - r < item.rect[2] && v + r > item.rect[1] && v - r < item.rect[3]).map(item => item.z + FINISH.clearance + 0.05));
  for (const trough of terraceTroughs(levels, layout)) {
    const [u0, v0, u1, v1] = trough.rect, alongV = v1 - v0 > u1 - u0, [ou, ov] = trough.outward;
    plan.planters.push({ id: trough.id, rect: [...trough.rect], z0: trough.z0, z1: trough.z1, wall: 0.03, finish: 'bronze', open: null });
    const lo = alongV ? v0 : u0, hi = alongV ? v1 : u1, centre = alongV ? (u0 + u1) / 2 : (v0 + v1) / 2;
    const outer = alongV ? (ou > 0 ? u1 : u0) : (ov > 0 ? v1 : v0), sign = alongV ? ou : ov;
    // A planted lip along the trough, and trailing strands of shrinking clumps down the
    // fascia, each stopping at body clearance over any terrace, deck or floor beneath.
    for (let s = lo + 0.15; s < hi - 0.12; s += 0.3) {
      const rand = rng(alongV ? centre : s, alongV ? s : centre), at = (across, along, z) => alongV ? [across, along, z] : [along, across, z];
      const along = s + (rand() - 0.5) * 0.12, r = 0.1 + rand() * 0.07;
      plan.clumps.push({ of: 'trough', at: at(centre + (rand() - 0.5) * 0.06, along, trough.z1 + 0.03 + rand() * 0.08), radius: [r, r, 0.07 + rand() * 0.1], yaw: quarter(rand), hue: 0.22 + rand() * 0.08, tone: 0.17 + rand() * 0.1 });
      if (rand() < 0.3) continue;
      const [hu, hv] = alongV ? [outer + sign * 0.06, along] : [along, outer + sign * 0.06], floor = floorUnder(hu, hv, 0.12, trough.z0);
      let z = trough.z0 + 0.12, size = 1;
      for (let link = 0, links = 2 + Math.floor(rand() * 3); link < links; link++, size *= 0.8) {
        const h = (0.16 + rand() * 0.08) * size, r = (0.08 + rand() * 0.03) * size;
        if (z - 2 * h < floor) break;
        plan.clumps.push({ of: 'trough', at: at(outer + sign * (0.04 + rand() * 0.04), along + (rand() - 0.5) * 0.08, z - h), radius: [r, r, h], yaw: quarter(rand), hue: 0.26 + rand() * 0.05, tone: 0.18 + rand() * 0.07 });
        z -= 2 * h * 0.8;
      }
    }
  }

  // West green walls: an irregular planted face over each solid service panel, outside the
  // plate edge, in clumps of varied size and depth.
  for (const wall of greenWalls(layout)) {
    const [s0, s1] = wall.span;
    for (let z = wall.z0 + 0.45; z < wall.z1 - 0.2; z += 0.45) for (let v = s0 + 0.3; v < s1 - 0.2; v += 0.5) {
      const rand = rng(wall.u + z, v), depth = 0.05 + rand() * 0.05, u = wall.u + 0.01 - depth - rand() * (FINISH.greenWall - 2 * depth - 0.03);
      plan.clumps.push({ of: 'green wall', at: [u, v + (rand() - 0.5) * 0.3, z + (rand() - 0.5) * 0.16], radius: [depth, 0.22 + rand() * 0.18, 0.2 + rand() * 0.1], yaw: 0, hue: 0.23 + rand() * 0.08, tone: 0.17 + rand() * 0.1 });
    }
  }

  // Pergola: climbers over the slats in loose patches, short tendrils that stay above
  // PLANTING.pergolaMinZ over the walkway, and vines kept inside each post's own rect.
  for (const item of layout.groundBuildings.filter(b => b.kind === 'pergola')) {
    const [u0, v0, u1, v1] = item.rect, top = item.height - 0.06;
    for (let v = v0 + 0.6; v < v1 - 0.3; v += 0.9) for (let u = u0 + 0.6; u < u1 - 0.4; u += 1.1) {
      const rand = rng(u, v), patch = Math.sin(u * 0.55) + Math.cos(v * 0.7);
      if (patch < -0.2) continue;
      plan.clumps.push({ of: 'pergola', at: [u, v, top + 0.06], radius: [0.55, 0.42, 0.16], hue: 0.25 + rand() * 0.05, tone: 0.2 + rand() * 0.07 });
      if (rand() < 0.35) plan.clumps.push({ of: 'pergola', at: [u + 0.2, v + 0.1, PLANTING.pergolaMinZ + 0.32], radius: [0.1, 0.1, 0.3], hue: 0.26, tone: 0.27 + rand() * 0.05 });
    }
    for (const post of item.posts ?? []) {
      const [p0, q0, p1, q1] = post.rect, c = [(p0 + p1) / 2, (q0 + q1) / 2], r = Math.min(p1 - p0, q1 - q0) / 2;
      for (let z = 0.5; z < item.height - 0.5; z += 0.55) plan.clumps.push({ of: 'post', at: [c[0], c[1], z], radius: [r, r, 0.3], hue: 0.26, tone: 0.26 + (z % 1) * 0.05 });
    }
  }

  // The café's green roof: sedum-like tufts on its planted slab.
  for (const item of layout.groundBuildings.filter(b => b.kind === 'cafe')) {
    const [u0, v0, u1, v1] = item.rect, z = item.height + 0.15;
    for (let v = v0 + 0.9; v < v1 - 0.6; v += 1.1) for (let u = u0 + 0.9; u < u1 - 0.6; u += 1.1) plan.tufts.push({ at: [u, v, z], seed: seedFromPosition(u, v) });
  }

  return plan;
}

// The plan as meshes in campus-local space. Returns { objects, dispose }. Shared
// procedural part geometries and materials belong to the returned meshes.
export function buildCampusPlanting(plan) {
  const objects = [], owned = { geometries: new Set(), materials: new Set() };
  const keep = mesh => { owned.geometries.add(mesh.geometry); owned.materials.add(mesh.material); return mesh; };
  const local = ([u, v, z]) => [u, z, -v];
  // Foliage clumps: low-poly ellipsoids, coloured per instance; small clumps (trough strands,
  // green walls, post vines) take the 20-face form, larger crowns the 80-face one.
  const material = new THREE.MeshStandardMaterial({ name: 'campus:foliage', color: '#ffffff', roughness: 0.92, flatShading: true });
  for (const [detail, clumps] of [[0, plan.clumps.filter(clump => Math.max(...clump.radius) < 0.3)], [1, plan.clumps.filter(clump => Math.max(...clump.radius) >= 0.3)]]) {
    if (!clumps.length) continue;
    // Faceted and turned by quarter turns, so massed clumps read as foliage rather than smooth balls.
    const geometry = new THREE.IcosahedronGeometry(1, detail), source = new THREE.InstancedMesh(geometry, material, clumps.length), dummy = new THREE.Object3D(), color = new THREE.Color();
    clumps.forEach((clump, i) => {
      // Turned about the vertical only, so each clump keeps its footprint (radius u, v) and height.
      dummy.position.fromArray(local(clump.at));dummy.rotation.set(0, clump.yaw ?? 0, 0);dummy.scale.set(clump.radius[0], clump.radius[2], clump.radius[1]);dummy.updateMatrix();
      source.setMatrixAt(i, dummy.matrix);source.setColorAt(i, color.setHSL(clump.hue, 0.42, clump.tone));
    });
    source.name = 'campus:foliage';source.castShadow = true;source.receiveShadow = true;
    for (const batch of spatialInstanceBatches(source, 24)) objects.push(keep(batch));
    source.dispose();
  }
  if (plan.trunks.length) {
    const geometry = new THREE.CylinderGeometry(1, 1.25, 1, 7), material = new THREE.MeshStandardMaterial({ name: 'campus:trunk', color: '#6b5a48', roughness: 0.9 });
    const mesh = new THREE.InstancedMesh(geometry, material, plan.trunks.length), dummy = new THREE.Object3D();
    plan.trunks.forEach((trunk, i) => {
      const [x, y, z] = local(trunk.at);dummy.position.set(x, y + trunk.height / 2, z);dummy.scale.set(trunk.radius, trunk.height, trunk.radius);dummy.updateMatrix();mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.name = 'campus:trunks';mesh.castShadow = true;mesh.receiveShadow = true;objects.push(keep(mesh));
  }
  // Fine leaves and grasses submit only near the camera, as on the authored green roofs.
  const placements = plan.plants.map(plant => {
    const rand = plantingRandom(plant.seed);
    return { plant: plantRecord(plant.species, [0, 0], rand, plant.reach), origin: local(plant.at), yaw: rand() * Math.PI * 2 };
  });
  const detail = [...buildProceduralPlants(placements), ...buildRoofGrasses(plan.tufts.map(tuft => ({ origin: local(tuft.at), seed: tuft.seed })))];
  for (const mesh of detail) {
    keep(mesh);mesh.computeBoundingSphere();
    const center = mesh.boundingSphere.center.clone(), lod = new THREE.LOD();
    lod.name = 'campus:planting detail';lod.position.copy(center);mesh.position.sub(center);
    lod.addLevel(mesh, 0);lod.addLevel(new THREE.Group(), PLANTING.detailDistance);objects.push(lod);
  }
  return {
    objects,
    counts: { clumps: plan.clumps.length, trunks: plan.trunks.length, plants: plan.plants.length, tufts: plan.tufts.length, detailMeshes: detail.length },
    dispose() {
      for (const object of objects) object.traverse(item => { if (item.isInstancedMesh) item.dispose(); });
      owned.geometries.forEach(geometry => geometry.dispose());owned.materials.forEach(material => material.dispose());
    },
  };
}
