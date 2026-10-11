import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { composePlanter, expandPlant, seedFromPosition, PLANT_SPECIES, PLANTER_HALF, PLANTER_OVERHANG, MODEL_SPECIES, ACCENTS, MIDS, LOWS } from '../src/planting-palette.js';
import { plantInstances, plantPartGeometries, buildProceduralPlants } from '../src/procedural-plants.js';
import { planterPlacements } from '../src/landscape-models.js';
import { laneFixtures } from '../src/street-fixtures.js';
import { createWalkingEnvironment } from '../src/walking.js';
import { winstonBed, winstonBedPlants, insideReferenceBed } from '../src/reference-planting.js';

const read = path => readFileSync(new URL(path, import.meta.url));
const world = JSON.parse(read('../public/data/district.json'));
const planters = laneFixtures(world, createWalkingEnvironment(world).isFree).planters;
const geometries = plantPartGeometries();
const triangles = geometry => (geometry.index ? geometry.index.count : geometry.attributes.position.count) / 3;

// Shipped GLB triangle counts for the meshes the planter builder uses
// (boxwood mesh 0, grass mesh 2), read from the assets rather than restated.
function glbTriangles(name, mesh) {
  const bytes = read(`../public/assets/landscape/${name}.glb`), gltf = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString());
  return gltf.meshes[mesh].primitives.reduce((sum, primitive) => sum + gltf.accessors[primitive.indices].count / 3, 0);
}
const HEDGE = glbTriangles('boxwood-source', 0), TUFT = glbTriangles('fountain-grass-source', 2);
// Seven tube stems (10 x 3 segments) and seven 6 x 8 sphere seed heads per grass.
const SEED_HEADS = 7 * (triangles(new THREE.TubeGeometry(new THREE.LineCurve3(new THREE.Vector3(), new THREE.Vector3(0, 1, 0)), 10, 0.0035, 3, false)) + triangles(new THREE.SphereGeometry(1, 6, 8)));
// Before mixing: three hedges, four tufts and two seed-head sets in every planter.
const UNIFORM_PLANTER = 3 * HEDGE + 4 * TUFT + 2 * SEED_HEADS;

function planterTriangles(composition) {
  let sum = 0;
  for (const plant of composition.plants) {
    if (plant.species === 'boxwood') sum += HEDGE + 320; // model plus its clipped fill volume
    else if (plant.species === 'fountain-grass') sum += 2 * TUFT + SEED_HEADS;
    else for (const part of expandPlant(plant)) sum += triangles(geometries.get(part.part));
  }
  return sum;
}

test('every planter is a layered mix of at least three species, one per layer', () => {
  assert.ok(planters.length > 10);
  for (const [x, , z] of planters) {
    const { plants } = composePlanter(seedFromPosition(x, z)), species = new Set(plants.map(plant => plant.species));
    assert.ok(species.size >= 3, `${species.size} species`);
    for (const layer of ['accent', 'mid', 'low']) assert.ok(plants.some(plant => plant.layer === layer), `missing ${layer}`);
    const height = layer => Math.max(...plants.filter(plant => plant.layer === layer).map(plant => PLANT_SPECIES[plant.species].height[1]));
    assert.ok(height('accent') > height('low'), 'the accent stands above the low colour');
  }
});

test('the district mixes every species and does not repeat one planting everywhere', () => {
  const { compositions } = planterPlacements(planters);
  const used = new Set(compositions.flatMap(c => c.plants.map(plant => plant.species)));
  assert.deepEqual([...used].sort(), Object.keys(PLANT_SPECIES).sort());
  const signatures = new Set(compositions.map(c => `${c.recipe}:${c.plants.map(plant => plant.species).join()}`));
  assert.ok(signatures.size >= planters.length * 0.6, `${signatures.size} distinct plantings across ${planters.length} planters`);
  for (const list of [ACCENTS, MIDS, LOWS]) assert.ok(list.length >= 2, 'every layer has alternatives');
});

test('composition is deterministic per position and leaves the world data untouched', () => {
  const before = JSON.stringify(world);
  for (const [x, , z] of planters.slice(0, 6)) assert.deepEqual(composePlanter(seedFromPosition(x, z)), composePlanter(seedFromPosition(x + 0.01, z - 0.01)));
  assert.notDeepEqual(composePlanter(1), composePlanter(2));
  assert.deepEqual(planterPlacements(planters), planterPlacements(planters));
  assert.deepEqual(winstonBedPlants(winstonBed(world)), winstonBedPlants(winstonBed(world)));
  assert.equal(JSON.stringify(world), before);
});

test('each instance varies in size, colour and form within its species', () => {
  const { procedural } = planterPlacements(planters);
  for (const species of Object.keys(PLANT_SPECIES).filter(id => !MODEL_SPECIES.has(id))) {
    const plants = procedural.filter(({ plant }) => plant.species === species).map(({ plant }) => plant);
    assert.ok(plants.length >= 2, species);
    assert.ok(new Set(plants.map(plant => plant.size.toFixed(3))).size > 1, `${species} sizes vary`);
    assert.ok(new Set(plants.map(plant => plant.color.map(v => v.toFixed(3)).join())).size > 1, `${species} tints vary`);
    const parts = expandPlant(plants[0]);
    assert.ok(new Set(parts.map(part => part.scale[1].toFixed(3))).size > 1, `${species} parts are not identical copies`);
  }
});

test('planting stays inside its planter rim and the photographed bed', () => {
  const local = new THREE.Vector3(), corner = new THREE.Vector3();
  const { procedural } = planterPlacements(planters);
  let checked = 0;
  for (const placement of procedural) {
    const [px, , pz, angle] = planters.find(([x, y, z]) => Math.hypot(placement.origin[0] - x, placement.origin[2] - z) < 0.9 && Math.abs(placement.origin[1] - y - 0.62) < 1e-9);
    assert.ok(Math.abs(placement.plant.at[0]) <= PLANTER_HALF[0] && Math.abs(placement.plant.at[1]) <= PLANTER_HALF[1], 'stems grow in the planter');
    for (const { part, matrix } of plantInstances([placement], geometries)) {
      const box = geometries.get(part).boundingBox;
      for (let i = 0; i < 8; i++) {
        corner.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).applyMatrix4(matrix);
        local.set(corner.x - px, 0, corner.z - pz);
        const a = local.x * Math.cos(angle) - local.z * Math.sin(angle), d = local.x * Math.sin(angle) + local.z * Math.cos(angle);
        assert.ok(Math.abs(a) <= PLANTER_HALF[0] + PLANTER_OVERHANG + 1e-6 && Math.abs(d) <= PLANTER_HALF[1] + PLANTER_OVERHANG + 1e-6, `${part} spills ${a.toFixed(2)}, ${d.toFixed(2)}`);
        checked++;
      }
    }
  }
  assert.ok(checked > 1000);
  const bed = winstonBed(world), plants = winstonBedPlants(bed);
  const species = new Set(plants.map(({ plant }) => plant.species));
  for (const id of ['foxtail-fern', 'mound-fern', 'coleus']) assert.ok(species.has(id), `photo bed has ${id}`);
  for (const { position: [x, n], plant } of plants) {
    assert.ok(insideReferenceBed(bed, x, n), 'every stem is in the bed');
    for (const { part, matrix } of plantInstances([{ plant, origin: [x, 0, -n], yaw: 0 }], geometries)) {
      const box = geometries.get(part).boundingBox;
      for (let i = 0; i < 8; i++) {
        corner.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).applyMatrix4(matrix);
        assert.ok(Math.hypot(corner.x - x, -corner.z - n) <= plant.reach + 1e-6, 'foliage spills at most 0.1 m over the edging');
      }
    }
  }
});

test('mixed planting costs no more triangles than the uniform boxwood planting it replaces', () => {
  const { compositions } = planterPlacements(planters);
  const costs = compositions.map(planterTriangles);
  assert.ok(costs.every(cost => cost <= UNIFORM_PLANTER), `largest planter ${Math.max(...costs)} vs ${UNIFORM_PLANTER}`);
  for (const [species] of Object.entries(PLANT_SPECIES)) if (!MODEL_SPECIES.has(species)) {
    const plant = { species, size: PLANT_SPECIES[species].height[1], spread: 1.12, color: [0.3, 0.5, 0.4], seed: 9, yaw: 0, reach: Infinity, at: [0, 0] };
    assert.ok(expandPlant(plant).reduce((sum, part) => sum + triangles(geometries.get(part.part)), 0) < 5000, `${species} stays a light procedural plant`);
  }
  const meshes = buildProceduralPlants(planterPlacements(planters).procedural);
  assert.ok(meshes.every(mesh => mesh.isInstancedMesh && mesh.count > 0), 'instanced, no empty draws');
  assert.ok(new Set(meshes.map(mesh => mesh.material)).size <= geometries.size, 'one material per part, shared by every batch');
});
