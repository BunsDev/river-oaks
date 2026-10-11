import * as THREE from 'three';
import { expandPlant } from './planting-palette.js';
import { spatialInstanceBatches } from './spatial-instances.js';

// Authored low-poly plant parts, unit-sized, each built once per world build
// and drawn as spatially batched instances. Built at load, never per frame.

function indexed(positions, indices, colors) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  if (colors) geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices); geometry.computeVertexNormals(); geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  return geometry;
}

// Foxtail fern plume: a star-section bottlebrush along +y, fullest below the
// middle and bending slightly outward (+x), so the needle tufts catch light.
function plumeGeometry() {
  const rows = 12, sides = 10, positions = [], indices = [];
  for (let row = 0; row < rows; row++) {
    const t = row / rows, r = 0.09 * Math.pow(Math.sin(Math.PI * (0.08 + 0.92 * t)), 0.6) * (1 - 0.35 * t);
    for (let side = 0; side < sides; side++) {
      // Fixed pseudo-random needle tufts; the same geometry on every build.
      const a = side / sides * Math.PI * 2 + row * 0.4, k = (side % 2 ? 1 : 0.5) * (0.8 + 0.4 * Math.abs(Math.sin(row * 12.9898 + side * 78.233) * 43758.5453 % 1));
      positions.push(Math.cos(a) * r * k + 0.06 * t * t, t, Math.sin(a) * r * k);
    }
  }
  positions.push(0.06, 1, 0);
  const tip = rows * sides;
  for (let row = 0; row < rows - 1; row++) for (let side = 0; side < sides; side++) {
    const a = row * sides + side, b = row * sides + (side + 1) % sides;
    indices.push(a, a + sides, b, b, a + sides, b + sides);
  }
  for (let side = 0; side < sides; side++) indices.push((rows - 1) * sides + side, tip, (rows - 1) * sides + (side + 1) % sides);
  return indexed(positions, indices);
}

// Mounded fern frond: a feathery ribbon reaching along +x, arching up then down.
function frondGeometry() {
  const rows = 14, positions = [], indices = [];
  for (let row = 0; row < rows; row++) {
    const t = row / (rows - 1), y = 3.2 * t * (1 - t) + 0.2 * t, w = 0.09 * (1 - t * 0.7) * (row % 2 ? 1 : 0.45);
    positions.push(t, y, -w, t, y + 0.012, 0, t, y, w);
  }
  for (let row = 0; row < rows - 1; row++) {
    const a = row * 3;
    indices.push(a, a + 3, a + 1, a + 1, a + 3, a + 4, a + 1, a + 4, a + 2, a + 2, a + 4, a + 5);
  }
  return indexed(positions, indices);
}

// Ovate broad leaf along +y, cupped about its midrib and curling outward (+x).
// `pattern` is [edge, centre] vertex colours for variegated leaves.
function leafGeometry(pattern) {
  const rows = 7, positions = [], indices = [], colors = pattern ? [] : null;
  const [edge, centre] = pattern ? pattern.map(hex => new THREE.Color(hex)) : [];
  for (let row = 0; row < rows; row++) {
    const t = row / (rows - 1), w = 0.36 * Math.pow(Math.sin(Math.PI * Math.min(1, t * 0.96 + 0.02)), 0.8) * (1 - 0.25 * t), curl = 0.15 * t * t;
    positions.push(curl + w * 0.25, t, -w, curl, t, 0, curl + w * 0.25, t, w);
    if (colors) {
      const inner = centre.clone().lerp(edge, Math.max(0, t - 0.55) * 1.6);
      colors.push(...edge.toArray(), ...inner.toArray(), ...edge.toArray());
    }
  }
  for (let row = 0; row < rows - 1; row++) {
    const a = row * 3;
    indices.push(a, a + 3, a + 1, a + 1, a + 3, a + 4, a + 1, a + 4, a + 2, a + 2, a + 4, a + 5);
  }
  return indexed(positions, indices, colors);
}

// Thick succulent leaf: a keeled lance along +y tapering to a point.
function succulentGeometry() {
  const rows = 6, positions = [], indices = [];
  for (let row = 0; row < rows; row++) {
    const t = row / rows, w = 0.16 * Math.pow(1 - t, 0.9) + 0.02;
    positions.push(0.03 * t, t, -w, -0.035 * (1 - t), t, 0, 0.03 * t, t, w);
  }
  positions.push(0.04, 1, 0);
  const tip = rows * 3;
  for (let row = 0; row < rows - 1; row++) {
    const a = row * 3;
    indices.push(a, a + 3, a + 1, a + 1, a + 3, a + 4, a + 1, a + 4, a + 2, a + 2, a + 4, a + 5);
  }
  const last = (rows - 1) * 3;
  indices.push(last, tip, last + 1, last + 1, tip, last + 2);
  return indexed(positions, indices);
}

function bloomGeometry() {
  const geometry = new THREE.IcosahedronGeometry(1, 0); geometry.scale(1, 0.6, 1);
  geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  return geometry;
}

// Coleus: burgundy-magenta heart with a chartreuse margin. Persian shield:
// iridescent violet blade with a dark green-purple edge.
const PARTS = {
  plume: () => plumeGeometry(),
  frond: () => frondGeometry(),
  leaf: () => leafGeometry(['#8fb52a', '#6a1238']),
  'leaf-shield': () => leafGeometry(['#2f3a2a', '#8a5aa8']),
  'leaf-plain': () => leafGeometry(null),
  'succulent-leaf': () => succulentGeometry(),
  bloom: () => bloomGeometry(),
};
export const PLANT_PARTS = Object.keys(PARTS);
export function plantPartGeometries(parts = PLANT_PARTS) {
  return new Map(parts.map(part => [part, PARTS[part]()]));
}

function partMaterial(part) {
  const material = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: part === 'succulent-leaf' ? 0.55 : part === 'bloom' ? 0.7 : 0.82,
    side: part === 'bloom' || part === 'plume' ? THREE.FrontSide : THREE.DoubleSide, vertexColors: part === 'leaf' || part === 'leaf-shield', envMapIntensity: 0.55 });
  material.name = `procedural-${part}`;
  return material;
}

const yAxis = new THREE.Vector3(0, 1, 0), zAxis = new THREE.Vector3(0, 0, 1);
const partQuaternion = new THREE.Quaternion(), pitchQuaternion = new THREE.Quaternion();
const partMatrix = new THREE.Matrix4(), offset = new THREE.Vector3(), scale = new THREE.Vector3();
function localPartMatrix({ offset: [x, y, z], yaw, pitch, scale: [sx, sy, sz] }, target) {
  partQuaternion.setFromAxisAngle(yAxis, yaw).multiply(pitchQuaternion.setFromAxisAngle(zAxis, -pitch));
  return target.compose(offset.set(x, y, z), partQuaternion, scale.set(sx, sy, sz));
}

// Horizontal extent of a plant (metres from its stem) for the given part bounds.
const corner = new THREE.Vector3();
export function plantReach(parts, geometries) {
  let reach = 0;
  for (const part of parts) {
    const box = geometries.get(part.part).boundingBox; localPartMatrix(part, partMatrix);
    for (let i = 0; i < 8; i++) {
      corner.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).applyMatrix4(partMatrix);
      reach = Math.max(reach, Math.hypot(corner.x, corner.z));
    }
  }
  return reach;
}

// Every part instance of every placement: { part, matrix, color }. A plant
// wider than its `reach` is squashed horizontally to fit, never moved.
// placement: { plant, origin: [x, y, z] (scene), yaw (radians) }
export function plantInstances(placements, geometries) {
  const out = [], plantMatrix = new THREE.Matrix4(), squash = new THREE.Matrix4(), rotation = new THREE.Quaternion();
  for (const { plant, origin, yaw } of placements) {
    const parts = expandPlant(plant), natural = plantReach(parts, geometries);
    const k = Number.isFinite(plant.reach) && natural > plant.reach ? plant.reach / natural : 1;
    rotation.setFromAxisAngle(yAxis, yaw + plant.yaw);
    plantMatrix.compose(offset.fromArray(origin), rotation, scale.set(1, 1, 1)).multiply(squash.makeScale(k, 1, k));
    for (const part of parts) out.push({ part: part.part, species: plant.species, color: part.color, matrix: plantMatrix.clone().multiply(localPartMatrix(part, partMatrix)) });
  }
  return out;
}

// Small planting stays solid near the camera: the dither fade is for large occluders.
// Lane planters stand about 22 m apart, so 24 m cells hold one or two planters
// and keep the part count per cell from multiplying draw calls.
export const PLANT_BATCH_CELL = 24;
// Upright plumes, fronds and succulents throw readable shadows; the low
// broadleaf colour and blooms sit in them and skip the shadow pass.
const CASTS_SHADOW = new Set(['plume', 'frond', 'succulent-leaf']);
// Instanced, spatially batched meshes, one material per part. Geometry
// and materials belong to the returned meshes, so the world teardown that
// traverses and disposes them releases everything.
export function buildProceduralPlants(placements) {
  if (!placements.length) return [];
  const geometries = plantPartGeometries(), instances = plantInstances(placements, geometries), meshes = [], color = new THREE.Color();
  for (const [part, geometry] of geometries) {
    const own = instances.filter(instance => instance.part === part);
    if (!own.length) { geometry.dispose(); continue; }
    const source = new THREE.InstancedMesh(geometry, partMaterial(part), own.length);
    own.forEach((instance, i) => { source.setMatrixAt(i, instance.matrix); source.setColorAt(i, color.setHSL(...instance.color)); });
    source.name = `Procedural ${part}`; source.castShadow = CASTS_SHADOW.has(part); source.receiveShadow = true; source.userData.aoExclude = true;
    meshes.push(...spatialInstanceBatches(source, PLANT_BATCH_CELL)); source.dispose();
  }
  return meshes;
}
