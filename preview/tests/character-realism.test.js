import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {applyCharacterRealism, corneaTriangles, naturalIris, skinScatterChunk, REALISM_TIERS, _poreNormalPixels} from '../src/character-realism.js';

test('pore normals are seeded, periodic and point out of the surface', () => {
  const a = _poreNormalPixels(64, 4, 517), b = _poreNormalPixels(64, 4, 517), c = _poreNormalPixels(64, 4, 518);
  assert.deepEqual(a.pixels, b.pixels);
  assert.notDeepEqual(a.pixels, c.pixels);
  const at = (x, y) => [...a.pixels.subarray((y * 64 + x) * 4, (y * 64 + x) * 4 + 3)].map(value => value / 127.5 - 1);
  for (let y = 0; y < 64; y += 7) for (let x = 0; x < 64; x += 7) {
    const [nx, ny, nz] = at(x, y);
    assert.ok(nz > .3, 'normals face outward');
    assert.ok(Math.abs(Math.hypot(nx, ny, nz) - 1) < .03, 'normals are unit length');
  }
  // Periodic: the step across the seam is no larger than steps inside the tile.
  const step = (x0, x1, y) => Math.hypot(...at(x0, y).map((value, i) => value - at(x1, y)[i]));
  let seam = 0, inside = 0;
  for (let y = 0; y < 64; y++) { seam = Math.max(seam, step(63, 0, y)); inside = Math.max(inside, step(30, 31, y)); }
  assert.ok(seam <= inside * 1.5 + .05, `seam ${seam} vs inside ${inside}`);
});

test('skin scattering patches the current direct diffuse term and refuses an unknown one', () => {
  const original = THREE.ShaderChunk.lights_physical_pars_fragment, patched = skinScatterChunk();
  const target = 'reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseContribution ) * ( 1.0 - F );';
  assert.match(patched, /skinScatterWrap/);
  assert.equal(original.split(target).length - 1, 1, 'the point lights term exists exactly once');
  assert.equal(patched.includes(target), false);
  assert.equal(patched.match(/reflectedLight\.directDiffuse \+=/g).length, original.match(/reflectedLight\.directDiffuse \+=/g).length);
  assert.throws(() => skinScatterChunk('void RE_Direct_Physical() {}'), /direct diffuse term changed/);
});

test('iris correction moves saturated red-brown to natural brown and leaves sclera alone', () => {
  const hsv = ([r, g, b]) => {
    const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
    const h = d === 0 ? 0 : max === r ? 60 * (((g - b) / d + 6) % 6) : max === g ? 60 * ((b - r) / d + 2) : 60 * ((r - g) / d + 4);
    return [h, max ? d / max : 0, max / 255];
  };
  const source = [69, 12, 2]; // measured MakeHuman brown iris: hue ~9°, saturation ~0.97, value ~0.27
  const [hue, saturation, value] = hsv(naturalIris(...source));
  assert.ok(hue > 20 && hue < 32, `hue ${hue}`);
  assert.ok(saturation > .5 && saturation < .7, `saturation ${saturation}`);
  assert.ok(Math.abs(value - hsv(source)[2]) < .01, 'brightness is kept');
  for (const sclera of [[226, 214, 205], [190, 160, 150], [10, 10, 12]]) assert.deepEqual(naturalIris(...sclera), sclera);
  const [blueHue] = hsv(naturalIris(40, 90, 200));
  assert.ok(Math.abs(blueHue - hsv([40, 90, 200])[0]) < 1, 'blue and green irises keep their hue');
});

function eyeGeometry() {
  // Two triangles in the iris area, two in the cornea disc at the texture corner.
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(12 * 3), 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute([.2,.2, .3,.2, .2,.3, .3,.3, .4,.2, .3,.4, .93,.93, .95,.93, .93,.95, .95,.95, .94,.96, .96,.94], 2));
  geometry.setIndex([0,1,2, 3,4,5, 6,7,8, 9,10,11]);
  return geometry;
}
const corneaDisc = (u, v) => Math.hypot(u - .94, v - .94) < .06;

test('cornea triangles are separated by the transparency of their texture position', () => {
  const {cornea, rest} = corneaTriangles(eyeGeometry(), corneaDisc);
  assert.deepEqual(cornea, [6, 7, 8, 9, 10, 11]);
  assert.deepEqual(rest, [0, 1, 2, 3, 4, 5]);
});

function rig() {
  const model = new THREE.Group(), materials = new Map();
  const add = (meshName, material) => {
    const instance = material.clone(); materials.set(material, instance);
    const mesh = new THREE.Mesh(meshName === 'high-poly' ? eyeGeometry() : new THREE.BoxGeometry(), instance);
    mesh.name = meshName; model.add(mesh); return {mesh, original: material};
  };
  const skin = add('base', new THREE.MeshPhysicalMaterial({name: 'young_asian_female', roughness: .62}));
  const eyes = add('high-poly', new THREE.MeshPhysicalMaterial({name: 'brown', alphaTest: .4, map: new THREE.Texture()}));
  const hair = add('long01', new THREE.MeshPhysicalMaterial({name: 'long01', alphaTest: .4}));
  const brows = add('eyebrow001', new THREE.MeshPhysicalMaterial({name: 'jevica_brows', alphaTest: .4}));
  const dress = add('Mesh', new THREE.MeshPhysicalMaterial({name: 'jevica_silk'}));
  return {rig: {model, materials}, skin, eyes, hair, brows, dress};
}

test('the high tier upgrades skin, splits corneas and softens cards on instance materials only', () => {
  const {rig: avatar, skin, eyes, hair, brows, dress} = rig();
  const before = avatar.model.children.length, roughness = new THREE.DataTexture(new Uint8Array(4), 1, 1);
  const applied = applyCharacterRealism(avatar, {tier: 'high', textures: {roughness}, alphaAt: corneaDisc});
  assert.deepEqual({skin: applied.report.skin, cornea: applied.report.cornea, hair: applied.report.hair, brows: applied.report.brows}, {skin: 1, cornea: 1, hair: 1, brows: 1});
  assert.deepEqual(applied.report.unsupported, []);
  const skinMaterial = skin.mesh.material;
  assert.ok(skinMaterial.normalMap, 'pores'); assert.equal(skinMaterial.normalScale.x, REALISM_TIERS.high.pores);
  assert.equal(skinMaterial.roughnessMap, roughness); assert.equal(skinMaterial.roughness, 1, 'the map carries absolute roughness');
  assert.equal(skinMaterial.sheen, REALISM_TIERS.high.sheen);
  const shader = {uniforms: {}, fragmentShader: '#include <lights_physical_pars_fragment>\nvoid main() {}'};
  skinMaterial.onBeforeCompile(shader);
  assert.ok(shader.fragmentShader.includes(`const vec3 skinScatterWrap = vec3(${REALISM_TIERS.high.scatter.join(', ')});`));
  assert.match(shader.fragmentShader, /^const vec3 skinScatterWrap = vec3/);
  assert.equal(skin.original.normalMap, null, 'the cached template material is untouched');
  assert.equal(eyes.mesh.geometry.index.count, 6, 'iris keeps its own triangles');
  const cornea = avatar.model.getObjectByName('high-poly cornea');
  assert.equal(cornea.geometry.index.count, 6); assert.equal(cornea.material.blending, THREE.AdditiveBlending);
  assert.equal(eyes.mesh.material.alphaTest, 0);
  for (const card of [hair, brows]) { assert.equal(card.mesh.material.alphaToCoverage, true); assert.ok(card.mesh.material.alphaTest < .4); }
  assert.equal(dress.mesh.material.normalMap, null, 'clothing is not skin');
  assert.equal(avatar.model.children.length, before + 1);
  applied.dispose();
  assert.equal(avatar.model.children.length, before, 'dispose removes the cornea shells');
});

test('the off tier and unknown rigs change nothing', () => {
  const {rig: avatar, skin} = rig();
  const off = applyCharacterRealism(avatar, {tier: 'off'});
  assert.equal(off.report.tier, 'off'); assert.equal(skin.mesh.material.normalMap, null);
  const noMaps = applyCharacterRealism(avatar, {tier: 'standard', alphaAt: corneaDisc});
  assert.deepEqual(noMaps.report.unsupported, ['roughness:young_asian_female'], 'a missing roughness map is reported, not hidden');
  assert.equal(skin.mesh.material.roughness, .62);
  noMaps.dispose();
  const standard = new THREE.MeshStandardMaterial({name: 'young_caucasian_male'}), model = new THREE.Group();
  const instance = standard.clone(); model.add(new THREE.Mesh(new THREE.BoxGeometry(), instance));
  const result = applyCharacterRealism({model, materials: new Map([[standard, instance]])}, {tier: 'high'});
  assert.deepEqual(result.report.unsupported, ['skin:young_caucasian_male']);
  assert.equal(instance.normalMap, null);
});

test('recognizes the prefixed eye and lash node names produced by the shipped GLBs', () => {
  const {rig: avatar, eyes} = rig();
  eyes.mesh.name = THREE.PropertyBinding.sanitizeNodeName('Jevica.high-poly');
  const original = new THREE.MeshPhysicalMaterial({name:'eyelashes01'}), material = original.clone();
  avatar.materials.set(original,material);
  const lashes = new THREE.Mesh(new THREE.PlaneGeometry(),material);
  lashes.name=THREE.PropertyBinding.sanitizeNodeName('Jevica.eyelashes01');avatar.model.add(lashes);
  const effect = applyCharacterRealism(avatar,{tier:'high',alphaAt:corneaDisc});
  assert.equal(effect.report.cornea,1);
  assert.equal(effect.report.lashes,1);
  effect.dispose();
});


test('the low quality tier retains corrected eyes and coverage without pore or scatter shaders', () => {
  const {rig: avatar, skin, eyes} = rig();
  const effect=applyCharacterRealism(avatar,{tier:'low',alphaAt:corneaDisc});
  assert.equal(effect.report.tier,'low');assert.equal(effect.report.cornea,1);
  assert.equal(skin.mesh.material.normalMap,null);
  assert.equal(eyes.mesh.material.roughness,.42);
  effect.dispose();
});

test('compiled skin responses are isolated by tier and reusable after returning to a tier', () => {
  const {rig: avatar, skin} = rig(), programs=new Map();
  const compiled = tier => {
    const effect=applyCharacterRealism(avatar,{tier,alphaAt:corneaDisc});
    const key=skin.mesh.material.customProgramCacheKey();
    if(!programs.has(key)) {
      const shader={uniforms:{},fragmentShader:'#include <lights_physical_pars_fragment>'};
      skin.mesh.material.onBeforeCompile(shader);programs.set(key,shader);
    }
    effect.dispose();return {key,shader:programs.get(key)};
  };
  const high=compiled('high'),standard=compiled('standard');
  assert.notEqual(high.key,standard.key);
  assert.notEqual(high.shader.fragmentShader,standard.shader.fragmentShader);
  assert.equal(compiled('high').shader,high.shader);
});
