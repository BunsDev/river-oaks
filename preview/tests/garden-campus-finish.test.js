import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { loadDistrictData } from '../../server/district-data.js';
import { attachGardenCampus } from '../src/garden-campus-district.js';
import { CAMPUS_GLOW, buildGardenCampus } from '../src/garden-campus.js';
import { FINISH, campusFurniture, expressedStoreys, luminaires, slabBands, terraceTroughs } from '../src/garden-campus-finish.js';
import { PLANTING, campusPlantingPlan } from '../src/garden-campus-planting.js';
import { GARDEN_CAMPUS_LAYOUT as CAMPUS, campusLevels } from '../../shared/garden-campus-layout.js';
import { campusPartitions } from '../../shared/garden-campus-partitions.js';

const campus = attachGardenCampus(await loadDistrictData());
const levels = campusLevels(CAMPUS), EPS = 1e-6, CLEAR = FINISH.clearance;

// Every drawn part of the campus root as a campus-metre box {u0, v0, z0, u1, v1, z1, name}:
// each instance's geometry bounds through its own matrix, relative to the root.
function campusBoxes(root) {
  root.updateMatrixWorld(true);
  const inverse = root.matrixWorld.clone().invert(), out = [], m = new THREE.Matrix4(), instance = new THREE.Matrix4(), corner = new THREE.Vector3();
  root.traverse(mesh => {
    if (!mesh.isMesh) return;
    mesh.geometry.computeBoundingBox();
    const { min, max } = mesh.geometry.boundingBox, count = mesh.isInstancedMesh ? mesh.count : 1;
    for (let i = 0; i < count; i++) {
      m.multiplyMatrices(inverse, mesh.matrixWorld);
      if (mesh.isInstancedMesh) { mesh.getMatrixAt(i, instance);m.multiply(instance); }
      const box = { u0: Infinity, v0: Infinity, z0: Infinity, u1: -Infinity, v1: -Infinity, z1: -Infinity, name: mesh.name };
      for (let c = 0; c < 8; c++) {
        corner.set(c & 1 ? max.x : min.x, c & 2 ? max.y : min.y, c & 4 ? max.z : min.z).applyMatrix4(m);
        box.u0 = Math.min(box.u0, corner.x);box.u1 = Math.max(box.u1, corner.x);box.z0 = Math.min(box.z0, corner.y);box.z1 = Math.max(box.z1, corner.y);
        box.v0 = Math.min(box.v0, -corner.z);box.v1 = Math.max(box.v1, -corner.z);
      }
      out.push(box);
    }
  });
  return out;
}
const root = buildGardenCampus(campus), boxes = campusBoxes(root);
const inside = ([u0, v0, u1, v1], [u, v], e = EPS) => u >= u0 - e && u <= u1 + e && v >= v0 - e && v <= v1 + e;
const overlaps = (box, [u0, v0, u1, v1]) => Math.min(box.u1, u1) - Math.max(box.u0, u0) > EPS && Math.min(box.v1, v1) - Math.max(box.v0, v0) > EPS;
function inPolygon([u, v], polygon) {
  let hit = false;
  for (let i = 0, j = polygon.length - 2; i < polygon.length - 1; j = i++) {
    const [ui, vi] = polygon[i], [uj, vj] = polygon[j];
    if ((vi > v) !== (vj > v) && u < (uj - ui) * (v - vi) / (vj - vi) + ui) hit = !hit;
  }
  return hit;
}

test('the finished campus stays inside each declared silhouette: parapets, headhouses and planting under the cap', () => {
  for (const tower of CAMPUS.towers) {
    const [u0, v0, u1, v1] = tower.tiers[0].rect, own = boxes.filter(b => (b.u0 + b.u1) / 2 > u0 - 1 && (b.u0 + b.u1) / 2 < u1 + 1 && (b.v0 + b.v1) / 2 > v0 - 1 && (b.v0 + b.v1) / 2 < v1 + 1);
    const top = Math.max(...own.map(b => b.z1));
    assert.ok(top <= tower.silhouette.capZ + EPS, `${tower.id} reaches ${top}, cap ${tower.silhouette.capZ}`);
    assert.ok(top > tower.silhouette.parapetTop, `${tower.id} roof garden rises over its parapet`);
    // Above the parapet only the headhouse (to its declared top) and planting in the roof's
    // published planters (its bed and any furnishing planter) stand.
    const head = tower.roof.headhouse.rect, beds = levels.find(level => level.z === tower.roof.z).obstacles.filter(item => item.kind === 'planter' && item.id.startsWith(`${tower.id}-`)).map(item => item.rect);
    for (const b of own.filter(item => item.z1 > tower.silhouette.parapetTop + EPS)) {
      const centre = [(b.u0 + b.u1) / 2, (b.v0 + b.v1) / 2];
      if (inside(head, centre, 0.05)) assert.ok(b.z1 <= tower.silhouette.headhouseTop + EPS, `${b.name} over ${tower.id}'s headhouse`);
      else assert.ok(beds.some(bed => inside(bed, [b.u0, b.v0]) && inside(bed, [b.u1, b.v1])), `${b.name} at ${centre} rises over ${tower.id}'s parapet outside its bed`);
    }
    // Parapets end exactly at the declared parapet top: stone below a bronze coping.
    const parapets = levels.find(level => level.z === tower.roof.z).obstacles.filter(item => item.id.startsWith(`${tower.roof.id}/parapet-`));
    for (const parapet of parapets) {
      const drawn = boxes.filter(b => Math.abs(b.u0 - parapet.rect[0]) < EPS && Math.abs(b.u1 - parapet.rect[2]) < EPS && Math.abs(b.v0 - parapet.rect[1]) < EPS && Math.abs(b.v1 - parapet.rect[3]) < EPS);
      assert.deepEqual(drawn.map(b => b.name).sort(), ['campus:bronze', 'campus:stone'], parapet.id);
      assert.ok(Math.abs(Math.max(...drawn.map(b => b.z1)) - tower.silhouette.parapetTop) < EPS, `${parapet.id} top`);
    }
  }
});

// Allowed places for anything at body height on a level: published obstacles, a plate's
// facade line (the shell's glazing and its 0.18 m mullions, centred 0.1 m inside the plate
// edge, so 0.2 m deep; fins and plinths stay inside it) and the air outside every surface.
// Sampled on a 5 cm grid over each part's footprint. A suite's walls and door (#507,
// garden-campus-partitions.js) are its boundary, never in a public surface by their own test.
const FACADE_LINE = FINISH.glassInset + 0.09 + 0.01;
const PARTITIONS = (({ walls, doors }) => [...walls.map(wall => [wall.levelId, wall.rect]), ...doors.flatMap(door => [door.leaf, door.headRect, ...door.jambs].map(rect => [door.levelId, rect]))])(campusPartitions());
test('nothing finished stands in a walkable surface below body clearance, except inside a published obstacle or the facade line', () => {
  const failures = [];
  for (const level of levels) {
    const plates = CAMPUS.towers.flatMap(tower => tower.levels).filter(floor => floor.z0 === level.z).map(floor => floor.rect);
    const ground = level.surfaces.find(surface => surface.polygon), rects = level.surfaces.filter(surface => surface.rect && surface.access !== 'service');
    const walkable = point => (ground && inPolygon(point, ground.polygon) && !ground.holes.some(hole => inside(hole, point, -1e-4))) || rects.some(surface => inside(surface.rect, point, -1e-4));
    const partitions = PARTITIONS.filter(([levelId]) => levelId === level.id).map(([, rect]) => rect);
    const allowed = point => level.obstacles.some(item => inside(item.rect, point, 1e-4)) || partitions.some(rect => inside(rect, point, 1e-4))
      || plates.some(([u0, v0, u1, v1]) => inside([u0, v0, u1, v1], point) && Math.min(point[0] - u0, u1 - point[0], point[1] - v0, v1 - point[1]) <= FACADE_LINE);
    for (const b of boxes) {
      if (b.z1 <= level.z + 0.05 || b.z0 >= level.z + CLEAR) continue;
      const step = Math.max(0.05, Math.max(b.u1 - b.u0, b.v1 - b.v0) / 400);
      outer: for (let u = b.u0 + 1e-3; u <= b.u1 - 1e-3 + 1e-9; u += Math.min(step, Math.max(b.u1 - b.u0 - 2e-3, 1e-3)))
        for (let v = b.v0 + 1e-3; v <= b.v1 - 1e-3 + 1e-9; v += Math.min(step, Math.max(b.v1 - b.v0 - 2e-3, 1e-3))) {
          if (walkable([u, v]) && !allowed([u, v])) { failures.push(`${b.name} at ${level.id} [${u.toFixed(2)}, ${v.toFixed(2)}] z ${b.z0.toFixed(2)}-${b.z1.toFixed(2)}`);break outer; }
        }
    }
  }
  assert.deepEqual(failures.slice(0, 12), [], `${failures.length} parts stand in a walkable surface`);
});

test('skywalk portals, terrace doors and entrances stay open through the finish', () => {
  const blocked = [];
  for (const level of levels) for (const opening of level.openings.filter(item => ['skywalk-portal', 'terrace-door', 'entrance'].includes(item.kind))) {
    const [u, v] = opening.position, half = opening.width / 2, height = opening.clearHeight ?? 2.6;
    // Portals cross a north/south facade (span in u); doors and entrances an east facade (span in v).
    const zone = opening.kind === 'skywalk-portal' ? [u - half, v - 0.3, u + half, v + 0.3] : [u - 0.3, v - half, u + 0.3, v + half];
    for (const b of boxes) if (b.z1 > level.z + 0.05 && b.z0 < level.z + height - EPS && overlaps(b, zone)) blocked.push(`${opening.id}: ${b.name}`);
  }
  assert.deepEqual(blocked, []);
});

test('each tower expresses exactly its occupied storeys, one band and one lit ceiling per floor', () => {
  const storeys = expressedStoreys(slabBands());
  for (const tower of CAMPUS.towers) {
    assert.deepEqual(storeys[tower.id], tower.levels.map(floor => floor.z1), `${tower.id} bands`);
    const coves = new Set(luminaires().filter(item => item.kind === 'cove' && item.tower === tower.id).map(item => item.level));
    assert.equal(coves.size, tower.levels.length, `${tower.id} lit floors`);
  }
  assert.deepEqual(Object.fromEntries(Object.entries(storeys).map(([id, list]) => [id, list.length])), { T1: 6, T2: 7, T3: 6 });
  // No band rises above a roof deck: the headhouse is not a storey.
  for (const band of slabBands()) assert.ok(band.z <= CAMPUS.towers.find(tower => tower.id === band.tower).roof.z + EPS);
  // Where a skywalk deck meets a facade at Floor 4, the band stops at the deck.
  for (const bridge of CAMPUS.bridges) for (const band of slabBands().filter(item => item.z === bridge.deckZ))
    assert.equal(overlaps({ u0: band.box[0], v0: band.box[1], u1: band.box[2], v1: band.box[3] }, bridge.rect), false, `${band.floor} ${band.side} band under ${bridge.id}`);
});

test('planting has real support and stays clear of the walkway it shades', () => {
  const plan = campusPlantingPlan(CAMPUS, levels), troughs = terraceTroughs(levels);
  const posts = CAMPUS.groundBuildings.flatMap(item => item.posts ?? []).map(post => post.rect), pergola = CAMPUS.groundBuildings.find(item => item.kind === 'pergola');
  const cafe = CAMPUS.groundBuildings.find(item => item.kind === 'cafe'), pits = levels[0].obstacles.filter(item => item.kind === 'tree');
  const supported = ([u, v, z], radius = [0, 0, 0]) => {
    const footprint = point => plan.planters.some(planter => inside(planter.rect, point) && z >= planter.z0 - 1.5);
    if (footprint([u - radius[0], v - radius[1]]) && footprint([u + radius[0], v + radius[1]])) return 'planter';
    if (posts.some(post => inside(post, [u - radius[0], v - radius[1]]) && inside(post, [u + radius[0], v + radius[1]]))) return 'post';
    if (inside(pergola.rect, [u, v]) && z - radius[2] >= PLANTING.pergolaMinZ - EPS) return 'pergola';
    if (inside(cafe.rect, [u, v]) && z >= cafe.height) return 'cafe roof';
    // A ground tree's crown: around its published pit, wholly above body clearance.
    if (pits.some(pit => Math.hypot(u - (pit.rect[0] + pit.rect[2]) / 2, v - (pit.rect[1] + pit.rect[3]) / 2) < 3) && z - radius[2] >= CLEAR - EPS) return 'tree';
    // Hanging outside a trough: within its outer reach, below its rim, in the air.
    if (troughs.some(trough => inside(trough.rect, [u, v], 0.25) && z <= trough.z1 + 0.3)) return 'trough';
    // A west green wall: outside the plate edge, above the ground floor.
    if (u + radius[0] <= 6 + 0.02 && u - radius[0] >= 6 - FINISH.greenWall - 0.02 && z - radius[2] >= 5) return 'green wall';
    return null;
  };
  const unsupported = [
    ...plan.clumps.filter(item => !supported(item.at, item.radius)).map(item => `clump ${item.at}`),
    ...plan.trunks.filter(item => supported(item.at) !== 'planter').map(item => `trunk ${item.at}`),
    ...plan.plants.filter(item => supported(item.at) !== 'planter').map(item => `${item.species} ${item.at}`),
    ...plan.tufts.filter(item => !['planter', 'cafe roof'].includes(supported(item.at))).map(item => `tuft ${item.at}`),
  ];
  assert.deepEqual(unsupported, []);
  // Trees and perennials stand on the soil of their own planter, not above or below it.
  for (const item of [...plan.trunks, ...plan.plants]) {
    const planter = plan.planters.find(p => inside(p.rect, item.at));
    assert.ok(Math.abs(item.at[2] - (planter.z1 - 0.03)) < EPS, `${item.species ?? 'trunk'} at ${item.at} stands on its soil`);
  }
  // Every roof bed, both skywalk edges on each bridge and every terrace part with a guard is planted.
  const planterIds = plan.planters.map(item => item.id);
  for (const tower of CAMPUS.towers) for (const bed of tower.roof.planting.beds) assert.equal(plan.planters.find(item => item.id === bed.id)?.open, 'east', `${bed.id} faces its roof`);
  for (const bridge of CAMPUS.bridges) for (const side of ['west', 'east']) assert.ok(planterIds.includes(`${bridge.id}/edge-${side}/trough`));
  assert.deepEqual([...new Set(troughs.map(item => item.terrace))].sort(), CAMPUS.towers.flatMap(tower => tower.terraces.map(item => item.id)).sort());
});

test('the finish adds no light; the time of day scales only the luminaire glow', () => {
  const group = buildGardenCampus(campus), lights = [], materials = new Set();
  group.traverse(item => { if (item.isLight) lights.push(item.name);if (item.material) materials.add(item.material); });
  assert.deepEqual(lights, []);
  const glow = group.children.find(item => item.name === 'campus:luminaire').material, before = [...materials].map(m => [m.name, m.emissiveIntensity, m.color?.getHex()]);
  assert.equal(glow.emissiveIntensity, CAMPUS_GLOW.day, 'built at the daytime level');
  group.userData.relight({ twilight: 1 });
  assert.equal(glow.emissiveIntensity, CAMPUS_GLOW.dusk);
  group.userData.relight({ twilight: 0.5 });
  assert.ok(Math.abs(glow.emissiveIntensity - (CAMPUS_GLOW.day + CAMPUS_GLOW.dusk) / 2) < EPS);
  group.userData.relight({ twilight: 0 });
  assert.deepEqual([...materials].map(m => [m.name, m.emissiveIntensity, m.color?.getHex()]), before, 'relighting returns every material to its built state');
  const after = new Set();group.traverse(item => { if (item.material) after.add(item.material); });
  assert.equal(after.size, materials.size, 'relighting creates no material');
  group.userData.dispose();
});

test('repeated builds release everything they own and reuse the shared surface maps', () => {
  const textures = new Set(), counts = [];
  for (let round = 0; round < 3; round++) {
    const group = buildGardenCampus(campus), geometries = new Set(), materials = new Set();
    group.traverse(item => { if (item.geometry) geometries.add(item.geometry);if (item.material) materials.add(item.material); });
    for (const material of materials) for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
    let disposed = 0, texturesDisposed = 0;
    for (const item of [...geometries, ...materials]) item.addEventListener('dispose', () => disposed++);
    for (const texture of textures) texture.addEventListener('dispose', () => texturesDisposed++);
    group.userData.dispose();
    assert.equal(disposed, geometries.size + materials.size, `round ${round}: every geometry and material released`);
    assert.equal(texturesDisposed, 0, 'shared stone, grass and paver maps stay with the district');
    counts.push([geometries.size, materials.size]);
  }
  assert.deepEqual(counts[1], counts[0]);assert.deepEqual(counts[2], counts[0]);
  // Shared maps are the same objects every build: three builds add no texture.
  assert.ok(textures.size <= 12, `${textures.size} distinct textures`);
});

test('the finish stays inside a bounded draw and detail budget', () => {
  let lods = 0;const triangles = { always: 0, detail: 0 }, meshes = { always: 0, detail: 0 };
  root.traverse(item => {
    if (item.isLOD) { lods++;assert.ok(item.levels.at(-1).distance <= PLANTING.detailDistance && item.levels.at(-1).object.children.length === 0, 'fine planting drops out beyond its distance'); }
    if (!item.isMesh) return;
    let detail = false;for (let parent = item.parent; parent; parent = parent.parent) if (parent.isLOD) detail = true;
    meshes[detail ? 'detail' : 'always']++;
    const per = item.geometry.index ? item.geometry.index.count / 3 : item.geometry.attributes.position.count / 3;
    triangles[detail ? 'detail' : 'always'] += per * (item.isInstancedMesh ? item.count : 1);
  });
  // Budgets from the 2026-10-18 build at layout 3.2 (furnishings included): 39 meshes and about
  // 171k triangles always drawn, 73 meshes and about 375k triangles of fine planting that only
  // submit within PLANTING.detailDistance of the camera; a little headroom on each.
  assert.ok(meshes.always <= 45, `${meshes.always} meshes always drawn`);assert.ok(meshes.detail <= 80, `${meshes.detail} detail meshes`);
  assert.ok(triangles.always <= 200000, `${triangles.always} triangles always drawn`);
  assert.ok(triangles.detail <= 420000, `${triangles.detail} detail triangles`);
  assert.ok(lods > 0);
});

// The contract's furnishings (#506 layout 3.2, proposed by #511): campusLevels() publishes them
// as obstacles, and the contract itself validates their support, clearance and reach. Here:
// they draw over their own footprint and their planting stays inside them.
test('every published furnishing draws over its whole footprint, and its planting stays inside it', () => {
  const furnishings = CAMPUS.furnishings ?? [];
  assert.ok(furnishings.length > 0, 'the contract publishes furnishings');
  const plan = campusPlantingPlan(CAMPUS, levels), parts = campusFurniture(levels);
  for (const item of furnishings) {
    const level = levels.find(l => l.id === item.levelId), r = item.rect;
    // Drawn parts that stand on this footprint, at this level, below a tree crown.
    const own = boxes.filter(b => b.u0 >= r[0] - 1e-4 && b.u1 <= r[2] + 1e-4 && b.v0 >= r[1] - 1e-4 && b.v1 <= r[3] + 1e-4 && b.z0 >= level.z - 1e-4 && b.z0 < level.z + 0.5);
    const hull = [Math.min(...own.map(b => b.u0)), Math.min(...own.map(b => b.v0)), Math.max(...own.map(b => b.u1)), Math.max(...own.map(b => b.v1))];
    assert.ok(hull.every((value, i) => Math.abs(value - r[i]) < 1e-3), `${item.id} draws over ${r}, not ${hull}`);
    assert.ok(Math.abs(Math.min(...own.map(b => b.z0)) - level.z) < 1e-3, `${item.id} stands on its level`);
    if (['seat', 'table'].includes(item.kind)) assert.ok(parts.some(part => part.box[0] === r[0] && part.box[2] === r[2] && part.box[1] === r[1] && part.box[3] === r[3]), `${item.id} has a full-footprint part`);
  }
  for (const pit of furnishings.filter(item => item.kind === 'tree')) {
    const c = [(pit.rect[0] + pit.rect[2]) / 2, (pit.rect[1] + pit.rect[3]) / 2], crown = plan.clumps.filter(clump => clump.of === 'tree' && Math.hypot(clump.at[0] - c[0], clump.at[1] - c[1]) < 3);
    assert.ok(crown.length >= 5, `${pit.id} crown`);
    for (const clump of crown) assert.ok(clump.at[2] - clump.radius[2] >= CLEAR - EPS, `${pit.id} crown at ${clump.at[2] - clump.radius[2]}`);
  }
  for (const bed of furnishings.filter(item => item.kind === 'planter'))
    for (const item of [...plan.plants, ...plan.tufts, ...plan.trunks].filter(p => inside(bed.rect, p.at, 0.3)))
      assert.ok(inside(bed.rect, item.at), `${bed.id} plant at ${item.at}`);
});
