import * as THREE from 'three';
import { physicalSurface } from './materials.js';
import { RETRO } from './retro-palette.js';
import { buildProceduralPlants } from './procedural-plants.js';
import { plantingRandom, plantRecord } from './planting-palette.js';

const MATERIALS = new Set(['stone', 'ivory', 'teal', 'brass', 'glass', 'terrazzo', 'timber', 'soil', 'leaf', 'light', 'accent']);
function createMaterial(role, palette) {
  let material;
  if (role === 'stone') material = physicalSurface('stone', { instanced: true, tileSize: 2, color: '#fff4df', textureContrast: .22, normalScale: new THREE.Vector2(.18, .18), roughness: .83 });
  else if (role === 'glass') material = new THREE.MeshPhysicalMaterial({ color: RETRO.glass, roughness: .1, metalness: .08, transparent: true, opacity: .38, depthWrite: false, side: THREE.DoubleSide });
  else {
    const colors = { ivory: RETRO.ivory, teal: RETRO.teal, brass: RETRO.brass, terrazzo: RETRO.porcelain, timber: '#88644d', soil: '#40372a', leaf: '#637d49', light: '#fff3d4', accent: palette === 'court' ? RETRO.mint : RETRO.teal };
    material = new THREE.MeshStandardMaterial({ color: colors[role], roughness: role === 'brass' ? .35 : role === 'terrazzo' ? .55 : .76, metalness: role === 'brass' ? .75 : 0 });
    if (role === 'light') { material.emissive.set('#ffe1a8'); material.emissiveIntensity = .65; }
  }
  material.name = `streetscape:${role}${role === 'accent' ? `:${palette}` : ''}`;
  return material;
}

/** Render a compiled shared plan; authority remains in its collision/support data. */
export function buildStreetscape(plan, { detail = 'high' } = {}) {
  if (!['high', 'low'].includes(detail)) throw new Error('Invalid streetscape detail');
  if (!Array.isArray(plan?.parts) || plan.parts.length < 1 || plan.parts.length > 20000) throw new Error('Invalid compiled streetscape plan');
  const ids = new Set();
  for (const part of plan.parts) {
    if (!part || typeof part.id !== 'string' || ids.has(part.id) || !['box', 'cylinder'].includes(part.shape) || !MATERIALS.has(part.material)
      || !Array.isArray(part.position) || part.position.length !== 3 || !Array.from(part.position).every(Number.isFinite)
      || !Array.isArray(part.size) || part.size.length !== 3 || !Array.from(part.size).every(value => Number.isFinite(value) && value > 0)
      || ![0, 90, 180, 270].includes(part.rotation) || !['market', 'court'].includes(part.palette)
      || part.material === 'leaf' && !['agave', 'coleus', 'pentas'].includes(part.species)) throw new Error('Invalid compiled streetscape part');
    ids.add(part.id);
  }
  const root = new THREE.Group(); root.name = `Streetscape ${plan.id}`;
  const geometries = new Map(), materials = new Map(), batches = new Map();
  for (const part of plan.parts) {
    if (detail === 'low' && part.detail && !part.collidable) continue;
    if (detail === 'high' && part.material === 'leaf') continue;
    const materialKey = part.material === 'accent' ? `accent:${part.palette}` : part.material;
    if (!materials.has(materialKey)) materials.set(materialKey, createMaterial(part.material, part.palette));
    if (!geometries.has(part.shape)) geometries.set(part.shape, part.shape === 'box' ? new THREE.BoxGeometry(1, 1, 1) : new THREE.CylinderGeometry(.5, .5, 1, detail === 'high' ? 16 : 8));
    const key = `${part.shape}:${materialKey}`;
    if (!batches.has(key)) batches.set(key, { material: materials.get(materialKey), geometry: geometries.get(part.shape), parts: [] });
    batches.get(key).parts.push(part);
  }
  const dummy = new THREE.Object3D();
  for (const [key, batch] of batches) {
    const mesh = new THREE.InstancedMesh(batch.geometry, batch.material, batch.parts.length);
    mesh.name = `streetscape:${key}`;
    mesh.userData.partIds = batch.parts.map(part => part.id);
    mesh.castShadow = !['glass', 'light'].includes(batch.parts[0].material); mesh.receiveShadow = true;
    for (const [i, part] of batch.parts.entries()) {
      dummy.position.set(part.position[0], part.position[2], -part.position[1]);
      dummy.rotation.set(0, part.rotation * Math.PI / 180, 0);
      dummy.scale.set(part.size[0], part.size[2], part.size[1]); dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true; mesh.computeBoundingBox(); mesh.computeBoundingSphere(); root.add(mesh);
  }
  const plants = detail === 'high' ? plan.parts.filter(part => part.material === 'leaf') : [];
  const planting = buildProceduralPlants(plants.map(part => {
    let seed = 2166136261;
    for (const char of part.id) seed = Math.imul(seed ^ char.charCodeAt(0), 16777619) >>> 0;
    return { plant: plantRecord(part.species, [0, 0], plantingRandom(seed), Math.min(part.size[0], part.size[1]) / 2),
      origin: [part.position[0], part.position[2] - part.size[2] / 2, -part.position[1]], yaw: part.rotation * Math.PI / 180 };
  }));
  for (const mesh of planting) { mesh.userData.streetscapePlanting = true; root.add(mesh); }
  const ownedGeometries = new Set([...geometries.values(), ...planting.map(mesh => mesh.geometry)]);
  const ownedMaterials = new Set([...materials.values(), ...planting.map(mesh => mesh.material)]);
  root.userData.plantSpecies = [...new Set(plants.map(part => part.species))].sort();
  root.userData.metrics = { parts: [...batches.values()].reduce((sum, batch) => sum + batch.parts.length, 0), plantInstances: planting.reduce((sum, mesh) => sum + mesh.count, 0), batches: root.children.length, geometries: ownedGeometries.size, materials: ownedMaterials.size, detail };
  let disposed = false;
  root.userData.dispose = () => {
    if (disposed) return; disposed = true;
    for (const mesh of root.children) mesh.dispose();
    for (const geometry of ownedGeometries) geometry.dispose();
    for (const material of ownedMaterials) material.dispose();
    root.clear();
  };
  return root;
}
