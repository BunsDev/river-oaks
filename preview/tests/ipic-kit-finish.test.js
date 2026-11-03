// Pink Jet-Age R6 slice 1 (#744 under #738): the IPIC interior's opt-in, render-only finish.
// Built without textures, as ipic-photo-finishes.test.js does, so every mesh's geometry,
// placement and material can be compared across finishes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createWalkingEnvironment } from '../src/walking.js';
import { buildIpicInterior } from '../src/ipic-interior.js';
import { IPIC_KIT_FINISHES, ipicKitFinish, ipicKitFinishName } from '../src/ipic-kit-finish.js';
import { KIT_FINISHES } from '../../shared/city-kit/catalog.js';
import { PINK_JET_AGE } from '../../shared/city-kit/pink-jet-age.js';

const world = JSON.parse(readFileSync(new URL('../public/data/district.json', import.meta.url)));
const room = createWalkingEnvironment(world).rooms.find(r => r.interior === 'ipic-photo-v1');

const MATERIAL_FIELDS = ['color', 'emissive', 'emissiveIntensity', 'roughness', 'metalness', 'opacity', 'transparent', 'side', 'depthWrite'];
const materialOf = m => Object.fromEntries(MATERIAL_FIELDS.map(k => [k, m[k]?.getHexString?.() ?? m[k]]).concat([['name', m.name]]));
const digest = value => createHash('sha256').update(value).digest('hex').slice(0, 16);

// Per mesh: zone and material name, the material's shading fields, and a hash of geometry and placement.
function build(options) {
  const root = buildIpicInterior(room, { textures: false, local: true, ...options });
  root.updateMatrixWorld(true);
  const meshes = [];
  root.traverse(item => {
    if (!item.isMesh) return;
    const position = item.geometry.attributes.position.array;
    meshes.push({
      name: item.name, zone: item.parent?.name, material: materialOf(item.material),
      shape: digest(Buffer.from(position.buffer, position.byteOffset, position.byteLength)) + digest(item.matrixWorld.elements.join(',')),
      count: item.isInstancedMesh ? item.count : 1,
    });
  });
  const result = { kitFinish: root.userData.kitFinish, meshes, lights: root.userData.lightPositions.length, screenFrame: root.userData.screenFrame };
  root.userData.dispose();
  return result;
}

const base = build({});
const classic = build({ finish: 'classic' });
const pink = build({ finish: 'pink-jet-age' });

test('the finish table names only catalog finishes, and unknown input is classic', () => {
  for (const name of Object.keys(IPIC_KIT_FINISHES)) assert.ok(Object.hasOwn(KIT_FINISHES, name), name);
  for (const bad of [undefined, null, '', 'neon', '__proto__', 'constructor', 42, {}]) {
    assert.equal(ipicKitFinishName(bad), 'classic', String(bad));
    assert.equal(ipicKitFinish(bad), IPIC_KIT_FINISHES.classic);
  }
});

test('classic and an unknown finish build exactly the default interior', () => {
  assert.equal(base.kitFinish, 'classic');
  assert.deepEqual(classic, base);
  assert.deepEqual(build({ finish: 'neon' }), base);
});

test('pink-jet-age keeps every part, name, placement, light and the screen frame', () => {
  assert.equal(pink.kitFinish, 'pink-jet-age');
  assert.equal(pink.meshes.length, base.meshes.length);
  assert.deepEqual(pink.meshes.map(m => [m.name, m.zone, m.shape, m.count]), base.meshes.map(m => [m.name, m.zone, m.shape, m.count]));
  assert.equal(pink.lights, base.lights);
  assert.deepEqual(pink.screenFrame, base.screenFrame);
});

test('pink-jet-age changes colour only, and only on its listed materials', () => {
  const changed = new Set(Object.keys(IPIC_KIT_FINISHES['pink-jet-age'].colors));
  changed.add('carpet');
  const nameOf = key => ({ sofa: 'ipic-olive-brown-sofa', pillow: 'ipic-oatmeal-pillows', bronze: 'ipic-bronze', red: 'ipic-burgundy-booths', plaster: 'ipic-warm-plaster', carpet: 'ipic-red-swirl-carpet' })[key];
  const recoloured = new Set([...changed].map(nameOf));
  assert.ok(![...recoloured].includes(undefined));
  let touched = 0;
  pink.meshes.forEach((mesh, i) => {
    const before = base.meshes[i].material, after = mesh.material;
    const { color: c1, ...rest1 } = before, { color: c2, ...rest2 } = after;
    assert.deepEqual(rest2, rest1, `${mesh.name}: only colour may change`);
    if (recoloured.has(after.name)) { assert.notEqual(c2, c1, `${mesh.name} keeps its classic colour`); touched++; }
    else assert.equal(c2, c1, `${mesh.name} must not change`);
  });
  assert.ok(touched > 0);
  const sofa = pink.meshes.find(m => m.material.name === 'ipic-olive-brown-sofa');
  assert.equal(`#${sofa.material.color}`, PINK_JET_AGE.pink.toLowerCase());
});

test('the auditorium and its approach stay as photographed under pink-jet-age', () => {
  const auditorium = (r) => r.meshes.filter(m => m.zone === 'Auditorium');
  assert.ok(auditorium(base).length > 0);
  assert.deepEqual(auditorium(pink), auditorium(base));
  // Safety finishes never change.
  for (const name of ['ipic-escalator-steel', 'ipic-step-safety-edge', 'ipic-confetti-carpet', 'ipic-cinema-screen'])
    for (const [i, mesh] of pink.meshes.entries()) if (mesh.material.name === name) assert.deepEqual(mesh.material, base.meshes[i].material, name);
});
