// The coworking studio's kit finishes (#221 under #738/#744) are render-only: classic is the
// original office byte for byte, and Pink Jet-Age repaints the same meshes without moving,
// adding or removing anything. The room is painted from the plan and the finish alone, so no
// finish can carry an owner's private work onto a screen or hologram.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { planWorkplaceRoom } from '../src/workplace-room.js';
import { buildWorkplaceOffice } from '../src/workplace-office.js';
import { WORKPLACE_KIT_FINISHES, workplaceKitFinish, workplaceKitFinishName } from '../src/workplace-kit-finish.js';
import { PINK_JET_AGE } from '../../shared/city-kit/pink-jet-age.js';

const COLORS = ['color', 'emissive', 'sheenColor'];
const SCALARS = ['roughness', 'metalness', 'opacity', 'transparent', 'clearcoat', 'clearcoatRoughness', 'emissiveIntensity', 'envMapIntensity', 'sheen', 'wireframe', 'blending', 'side', 'depthWrite'];
const MAPS = ['map', 'emissiveMap', 'normalMap'];
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const round = value => Math.round(value * 1e6) / 1e6;
const describe = m => ({ type: m.type,
  ...Object.fromEntries(COLORS.filter(f => m[f]?.isColor).map(f => [f, `#${m[f].getHexString()}`])),
  ...Object.fromEntries(SCALARS.filter(f => m[f] !== undefined).map(f => [f, m[f]])),
  ...Object.fromEntries(MAPS.filter(f => m[f]).map(f => [f, `${m[f].image.width}x${m[f].image.height}:${digest(m[f].image.data)}`])) });

// Everything a finish may not change, and everything it may, from a built office.
function snapshot(office) {
  office.object.updateMatrixWorld(true);
  const meshes = [], lights = [], materials = {};
  office.object.traverse(node => {
    if (node.isLight) lights.push({ type: node.type, color: `#${node.color.getHexString()}`, intensity: node.intensity, distance: node.distance, decay: node.decay, position: node.position.toArray() });
    if (!node.isMesh) return;
    meshes.push({ name: node.name, zone: node.userData.zone, material: node.material.name, geometry: `${node.geometry.type}:${node.geometry.attributes.position.count}:${digest(Buffer.from(node.geometry.attributes.position.array.buffer))}`,
      position: node.position.toArray().map(round), rotation: node.rotation.toArray().slice(0, 3).map(round), scale: node.scale.toArray().map(round), castShadow: node.castShadow, receiveShadow: node.receiveShadow });
    materials[node.material.name] = describe(node.material);
  });
  return { finish: office.object.userData.finish, meshes, lights, materials };
}
const build = options => { const office = buildWorkplaceOffice(THREE, planWorkplaceRoom(), options); const shot = snapshot(office); office.dispose(); return shot; };

test('classic and an unknown finish build the original office exactly, as the office scenes do', () => {
  const original = build(undefined);
  assert.equal(original.finish, 'classic');
  assert.ok(original.meshes.length > 80);
  assert.deepEqual(build({ finish: 'classic' }), original);
  assert.deepEqual(build({ finish: 'not-a-finish' }), { ...original, finish: 'classic' });
  assert.deepEqual(build({}), original);
  assert.equal(workplaceKitFinishName('pink-jet-age'), 'pink-jet-age');
  for (const name of ['classic', undefined, null, 42, 'PINK-JET-AGE', '__proto__', 'constructor']) assert.equal(workplaceKitFinishName(name), 'classic');
  assert.equal(workplaceKitFinish('__proto__'), WORKPLACE_KIT_FINISHES.classic);
});

test('Pink Jet-Age keeps every mesh, zone, geometry, placement, shadow flag and light, and repaints only the listed fields', () => {
  const classic = build(undefined), pink = build({ finish: 'pink-jet-age' }), spec = WORKPLACE_KIT_FINISHES['pink-jet-age'];
  assert.equal(pink.finish, 'pink-jet-age');
  assert.deepEqual(pink.meshes, classic.meshes, 'the same meshes, in the same places, with the same materials by name');
  assert.deepEqual(pink.lights, classic.lights, 'the same lights');
  assert.deepEqual(Object.keys(pink.materials).sort(), Object.keys(classic.materials).sort());
  // The surfaces a finish repaints: the floor map, the feature wall's map and emissive map,
  // the skyline and the desk screens' interface. The flute normal maps never change.
  const repainted = { 'office-floor': ['map'], 'office-onyxWall': ['map', 'emissiveMap'], 'office-sky': ['emissiveMap'], 'office-holo': ['map'] };
  for (const [name, before] of Object.entries(classic.materials)) {
    const after = pink.materials[name], changed = Object.keys({ ...before, ...after }).filter(field => before[field] !== after[field]).sort();
    const allowed = [...Object.keys(spec.materials[name.slice(7)] ?? {}), ...(repainted[name] ?? [])].sort();
    assert.deepEqual(changed, changed.filter(field => allowed.includes(field)), `${name} changes only its listed fields (changed: ${changed.join(', ') || 'none'})`);
    for (const field of Object.keys(spec.materials[name.slice(7)] ?? {})) assert.notEqual(before[field], after[field], `${name}.${field} is actually repainted`);
    assert.equal(after.type, before.type, `${name} keeps its material type`);
  }
  for (const name of Object.keys(repainted)) assert.notEqual(pink.materials[name][repainted[name][0]], classic.materials[name][repainted[name][0]], `${name} is repainted`);
  // The approved roles land where #744 asks: pink upholstery, chrome trim, ivory work surfaces and walls.
  assert.equal(pink.materials['office-leather'].color, PINK_JET_AGE.pink.toLowerCase());
  assert.equal(pink.materials['office-gold'].color, PINK_JET_AGE.chrome.toLowerCase());
  for (const name of ['office-pearl', 'office-ivory', 'office-graphiteFlute']) assert.equal(pink.materials[name].color, PINK_JET_AGE.ivory.toLowerCase());
  assert.equal(pink.materials['office-foliage'].color, PINK_JET_AGE.garden.toLowerCase());
  assert.deepEqual([pink.materials['office-gold'].metalness, pink.materials['office-gold'].roughness], [0.5, 0.3], 'the trim is satin chrome, not a mirror and not paint');
});

test('the room is painted from the plan and the finish alone: builds are byte-identical and no owner state is an input', () => {
  // Signature: THREE, room and an options bag holding only the finish. There is no state,
  // companion, task or draft parameter, so screens, holograms and monitors cannot carry one.
  assert.equal(buildWorkplaceOffice.length, 2);
  for (const finish of Object.keys(WORKPLACE_KIT_FINISHES)) {
    const first = build({ finish }), second = build({ finish });
    assert.deepEqual(second, first, `${finish} builds the same bytes twice`);
    // The desk screens and the review hologram are the only "displays"; their maps are small
    // placeholder patterns, far below anything that could render a line of text.
    assert.match(first.materials['office-holo'].map, /^256x128:/);
    assert.equal(first.materials['office-holoLine'].map, undefined);
  }
});
