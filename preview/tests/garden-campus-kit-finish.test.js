import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { loadDistrictData } from '../../server/district-data.js';
import { KIT_FINISHES, PINK_JET_AGE } from '../../shared/city-kit/catalog.js';
import { GARDEN_CAMPUS_LAYOUT as CAMPUS, campusLevels } from '../../shared/garden-campus-layout.js';
import { attachGardenCampus } from '../src/garden-campus-district.js';
import { CAMPUS_GLOW, buildGardenCampus } from '../src/garden-campus.js';
import { buildGardenCampusFitout } from '../src/garden-campus-fitout-render.js';
import { buildCampusCeilings } from '../src/garden-campus-ceilings.js';
import { CAMPUS_KIT_FINISHES, campusKitFinishName } from '../src/garden-campus-kit-finish.js';
import { entranceCanopies } from '../src/garden-campus-finish.js';

// The Gardens campus takes the city-kit finish only by opt-in (#741 under #738): render-only.
const campus = attachGardenCampus(await loadDistrictData());
const levels = campusLevels(CAMPUS);
const PINK = 'pink-jet-age', hex = value => new THREE.Color(value).getHexString();
const meshesOf = group => { const out = [];group.traverse(item => { if (item.isMesh) out.push(item); });return out; };
const byName = (group, name) => meshesOf(group).find(mesh => mesh.name === name);
// Every mesh's name, geometry size, instance count and exact instance matrices.
const shape = group => meshesOf(group).map(mesh => [mesh.name, mesh.geometry.attributes.position.count, mesh.geometry.index?.count ?? 0, mesh.count ?? 1, mesh.instanceMatrix ? [...mesh.instanceMatrix.array] : null]);
const looks = group => meshesOf(group).map(mesh => [mesh.name, mesh.material.name, mesh.material.color?.getHexString(), mesh.material.emissive?.getHexString(), mesh.material.roughness, mesh.material.metalness, mesh.material.opacity, mesh.instanceColor ? [...mesh.instanceColor.array] : null]);

// The classic campus table before #741, read from the built materials at c1f937fb: colour,
// emissive, emissive intensity, roughness, metalness and opacity. Classic must stay exactly this.
const CLASSIC = {
  'campus:slab': ['d9d2c3', '000000', 1, 0.78, 0, 1], 'campus:stone': ['fff5df', '000000', 1, 0.85, 0, 1], 'campus:core': ['b9ab94', '000000', 1, 0.7, 0, 1],
  'campus:bronze': ['8a6a45', '000000', 1, 0.34, 0.75, 1], 'campus:timber': ['8c7660', '000000', 1, 0.78, 0, 1], 'campus:glass': ['fbe4eb', '000000', 1, 0.04, 0.1, 0.28],
  'campus:guard': ['fdf1f5', '000000', 1, 0.05, 0, 0.16], 'campus:planting': ['4f6b3c', '000000', 1, 0.9, 0, 1], 'campus:water': ['45606a', '000000', 1, 0.08, 0.2, 1],
  'campus:interior': ['e6dfd2', '000000', 1, 0.55, 0, 1], 'campus:soil': ['3d3a2e', '000000', 1, 1, 0, 1], 'campus:luminaire': ['fff3df', 'ffd6a0', CAMPUS_GLOW.day, 0.4, 0, 1],
  'campus:accent': ['f486a1', '000000', 1, 0.5, 0, 1], 'campus:partition': ['ece6da', '000000', 1, 0.82, 0, 1], 'campus:door': ['9a7350', '000000', 1, 0.72, 0, 1],
  'campus:platform': ['a9bb8c', '000000', 1, 1, 0, 1], 'campus:paths': ['ffffff', '000000', 1, 1, 0, 1], 'campus:trunks': ['6b5a48', '000000', 1, 0.9, 0, 1],
};
const CLASSIC_FITOUT = { walnut: '6b4a32', oak: '8c7660', frame: '8a6a45', fabric: '5d6b5a', stone: 'fff5df', screen: '111416' };

test('the campus finish table covers exactly the catalog finishes, and classic replaces nothing', () => {
  assert.deepEqual(Object.keys(CAMPUS_KIT_FINISHES), Object.keys(KIT_FINISHES));
  const classic = CAMPUS_KIT_FINISHES.classic;
  for (const table of ['campus', 'emerald', 'fitout', 'ceiling']) assert.deepEqual(classic[table], {}, table);
  assert.equal(classic.trim, null);
  for (const value of [undefined, null, '', 'neon', 'PINK-JET-AGE', 'constructor', '__proto__', { toString: () => PINK }, 42]) assert.equal(campusKitFinishName(value), 'classic', String(value));
  assert.equal(campusKitFinishName(PINK), PINK);
  // Every key the pink finish names is a material each builder makes.
  const group = buildGardenCampus(campus), names = new Set(meshesOf(group).map(mesh => mesh.material.name));
  for (const key of Object.keys(CAMPUS_KIT_FINISHES[PINK].campus)) assert.ok(names.has(`campus:${key}`) || names.has(`campus:${{ guard: 'guard-glass', interior: 'floor', door: 'suite-door' }[key]}`), key);
  group.userData.dispose();
});

test('classic is the default and draws exactly the pre-finish campus, fit-out and ceilings', () => {
  for (const options of [undefined, {}, { kitFinish: 'classic' }, { kitFinish: 'brutalist' }, { kitFinish: { toString: () => PINK } }]) {
    const group = buildGardenCampus(campus, options);
    assert.equal(group.userData.kitFinish, 'classic');
    const seen = Object.fromEntries(meshesOf(group).filter(mesh => mesh.name in CLASSIC).map(mesh => { const m = mesh.material;
      return [mesh.name, [m.color.getHexString(), m.emissive.getHexString(), m.emissiveIntensity, m.roughness, m.metalness, m.opacity]]; }));
    assert.deepEqual(seen, CLASSIC, JSON.stringify(options));
    assert.equal(byName(group, 'campus:bronze').instanceColor, null, 'classic draws its hardware in one colour');
    group.userData.dispose();
    const fitout = buildGardenCampusFitout(campus, options);
    assert.deepEqual(Object.fromEntries(meshesOf(fitout).map(mesh => [mesh.name.split(':')[1], mesh.material.color.getHexString()])), CLASSIC_FITOUT);
    fitout.userData.dispose();
    const ceiling = buildCampusCeilings(undefined, options).children[0].material;
    assert.deepEqual([ceiling.color.getHexString(), ceiling.emissive.getHexString(), ceiling.emissiveIntensity], ['f2eee6', 'f2eee6', 0.22]);
  }
  // An unknown name is classic in every respect, instance for instance.
  const plain = buildGardenCampus(campus), unknown = buildGardenCampus(campus, { kitFinish: 'neon' });
  assert.deepEqual(looks(unknown), looks(plain));assert.deepEqual(shape(unknown), shape(plain));
});

// The colour layer on its own (jetAgeForms: false); garden-campus-jet-age.test.js covers the shapes.
const COLOUR_ONLY = { kitFinish: PINK, jetAgeForms: false };
test('pink applies the mapping: ivory shells, mint glass, chrome hardware with pink trims, pink doors', () => {
  const group = buildGardenCampus(campus, COLOUR_ONLY), spec = CAMPUS_KIT_FINISHES[PINK], P = PINK_JET_AGE;
  assert.equal(group.userData.kitFinish, PINK);
  const colour = name => byName(group, name).material.color.getHexString();
  assert.equal(colour('campus:slab'), hex(P.ivory));assert.equal(colour('campus:stone'), hex(P.ivory));assert.equal(colour('campus:partition'), hex(P.ivory));
  assert.equal(colour('campus:door'), hex(P.pink));assert.equal(colour('campus:planting'), hex(P.garden));
  assert.equal(colour('campus:glass'), hex(spec.campus.glass.color));
  // Glass keeps its classic opacity and transparency: nothing new reads as open or as solid.
  for (const name of ['campus:glass', 'campus:guard']) {
    const m = byName(group, name).material;
    assert.equal(m.opacity, CLASSIC[name][5]);assert.equal(m.transparent, true);assert.equal(m.depthWrite, false);
  }
  // Untouched by the finish: the ground, water, soil, the luminaires and the canopy inlay.
  for (const name of ['campus:platform', 'campus:paths', 'campus:water', 'campus:soil', 'campus:luminaire', 'campus:accent'])
    assert.equal(colour(name), CLASSIC[name][0], name);
  // Hardware: white material, chrome or pink per instance; the trims are rails, copings,
  // canopy edges and the café fascia, never a mullion or a fin.
  const hardware = byName(group, 'campus:bronze'), tint = new THREE.Color();
  assert.equal(hardware.material.color.getHexString(), 'ffffff');
  const tints = Array.from({ length: hardware.count }, (_, i) => { hardware.getColorAt(i, tint);return tint.getHexString(); });
  const pinkParts = tints.filter(value => value === hex(P.pink)).length;
  assert.ok(tints.every(value => value === hex(P.pink) || value === hex(P.chrome)));
  const rails = levels.flatMap(level => level.obstacles.filter(item => item.kind === 'guard' && !item.id.includes('/parapet-'))).length;
  const copings = levels.flatMap(level => level.obstacles.filter(item => item.kind === 'guard' && item.id.includes('/parapet-'))).length;
  const canopies = entranceCanopies(CAMPUS).length, fascia = 4 * CAMPUS.groundBuildings.filter(item => item.kind === 'cafe').length;
  assert.equal(pinkParts, rails + copings + fascia + canopies, `${pinkParts} pink trims`);
  assert.ok(pinkParts < hardware.count / 2, 'chrome leads the hardware; pink trims it');
  // The emerald panes' colours are uniforms: chrome collet, ivory lip, pink facets.
  const glass = byName(group, 'campus:glass').material, shader = compile(glass);
  assert.deepEqual(['emeraldBronze', 'emeraldChampagne', 'emeraldBlush'].map(name => shader.uniforms[name].value.getHexString()), [hex(P.chrome), hex(P.ivory), hex(P.pink)]);
  // Fit-out and ceilings follow the same table.
  const fitout = buildGardenCampusFitout(campus, { kitFinish: PINK });
  assert.equal(fitout.userData.kitFinish, PINK);
  for (const [key, fields] of Object.entries(spec.fitout)) assert.equal(byName(fitout, `campus-fitout:${key}`).material.color.getHexString(), hex(fields.color), key);
  assert.equal(byName(fitout, 'campus-fitout:screen').material.color.getHexString(), CLASSIC_FITOUT.screen, 'screens stay one dark neutral');
  const ceiling = buildCampusCeilings(undefined, { kitFinish: PINK }).children[0].material;
  assert.equal(ceiling.color.getHexString(), hex(P.ivory));assert.equal(ceiling.emissiveIntensity, 0.22);
  group.userData.dispose();fitout.userData.dispose();
});
test('TypeSafe pink stays an accent: under a twentieth of the drawn opaque surface', () => {
  const group = buildGardenCampus(campus, { kitFinish: PINK }), pink = hex(PINK_JET_AGE.pink), m = new THREE.Matrix4(), s = new THREE.Vector3(), q = new THREE.Quaternion(), p = new THREE.Vector3(), tint = new THREE.Color();
  let total = 0, rose = 0;
  for (const mesh of meshesOf(group).filter(item => item.isInstancedMesh && !item.material.transparent && item.geometry.type === 'BoxGeometry')) {
    for (let i = 0; i < mesh.count; i++) {
      mesh.getMatrixAt(i, m);m.decompose(p, q, s);
      const area = 2 * (s.x * s.y + s.y * s.z + s.x * s.z);total += area;
      const colour = mesh.instanceColor ? (mesh.getColorAt(i, tint), tint.getHexString()) : mesh.material.color.getHexString();
      if (colour === pink) rose += area;
    }
  }
  assert.ok(rose > 0 && rose / total < 0.05, `pink ${(100 * rose / total).toFixed(2)}% of opaque box surface`);
  group.userData.dispose();
});

test('the colour layer draws the same parts in the same places, and no finish touches the world', () => {
  const before = structuredClone(campus.gardenCampus);
  const classic = buildGardenCampus(campus), pink = buildGardenCampus(campus, COLOUR_ONLY), shaped = buildGardenCampus(campus, { kitFinish: PINK });
  assert.deepEqual(shape(pink), shape(classic));
  assert.deepEqual(pink.userData.counts, classic.userData.counts);
  assert.deepEqual(meshesOf(pink).map(mesh => [mesh.castShadow, mesh.receiveShadow, mesh.userData.aoExclude ?? null]), meshesOf(classic).map(mesh => [mesh.castShadow, mesh.receiveShadow, mesh.userData.aoExclude ?? null]));
  // Suite walls and doors stay opaque at any camera distance under every finish.
  for (const name of ['campus:partition', 'campus:door']) assert.equal(byName(pink, name).material.userData.nearCameraSolid, true, name);
  for (const build of [buildGardenCampusFitout, (world, options) => buildCampusCeilings(undefined, options)]) {
    const a = build(campus), b = build(campus, { kitFinish: PINK });
    assert.deepEqual(shape(b), shape(a));a.userData.dispose();b.userData.dispose();
  }
  assert.deepEqual(campus.gardenCampus, before, 'rendering never writes the campus layout, levels or collision');
  assert.deepEqual(campusLevels(CAMPUS), levels);
  classic.userData.dispose();pink.userData.dispose();shaped.userData.dispose();
});

test('under pink the time of day still scales only the glow, and relighting returns every material', () => {
  const group = buildGardenCampus(campus, { kitFinish: PINK }), materials = new Set();
  group.traverse(item => { if (item.material) materials.add(item.material); });
  const state = () => [...materials].map(m => [m.name, m.emissiveIntensity, m.color?.getHex()]), before = state();
  const glow = byName(group, 'campus:luminaire').material;
  group.userData.relight({ twilight: 1 });assert.equal(glow.emissiveIntensity, CAMPUS_GLOW.dusk);
  group.userData.relight({ twilight: 0 });assert.deepEqual(state(), before);
  group.userData.dispose();
});

// Run the glass material's onBeforeCompile against three's own physical shader.
function compile(material) {
  const lib = THREE.ShaderLib.physical, shader = { uniforms: THREE.UniformsUtils.clone(lib.uniforms), vertexShader: lib.vertexShader, fragmentShader: lib.fragmentShader };
  material.onBeforeCompile(shader);
  return shader;
}

test('the emerald cut compiles to the same program under every finish, so one cache key is honest', () => {
  const programs = Object.keys(KIT_FINISHES).map(kitFinish => {
    const group = buildGardenCampus(campus, { kitFinish }), glass = byName(group, 'campus:glass').material, shader = compile(glass);
    group.userData.dispose();
    return { key: glass.customProgramCacheKey(), vertex: shader.vertexShader, fragment: shader.fragmentShader, blush: shader.uniforms.emeraldBlush.value.getHexString() };
  });
  for (const program of programs.slice(1)) {
    assert.equal(program.key, programs[0].key);
    assert.equal(program.vertex, programs[0].vertex);assert.equal(program.fragment, programs[0].fragment);
  }
  assert.match(programs[0].key, /^campus-emerald-cut-v3$/, 'the classic program name is unchanged');
  assert.notEqual(programs[1].blush, programs[0].blush, 'the colours differ only through uniforms');
});

test('a pink build releases everything it owns, as classic does', () => {
  for (const kitFinish of ['classic', PINK]) {
    const group = buildGardenCampus(campus, { kitFinish }), owned = new Set();
    group.traverse(item => { if (item.geometry) owned.add(item.geometry);if (item.material) owned.add(item.material); });
    let disposed = 0;for (const item of owned) item.addEventListener('dispose', () => disposed++);
    group.userData.dispose();
    assert.equal(disposed, owned.size, kitFinish);
  }
});
