import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { KIT_FINISHES, PINK_JET_AGE as P } from '../../shared/city-kit/catalog.js';
import { RETRO } from '../src/retro-palette.js';
import { DISTRICT_KIT_FINISHES, districtKitFinishName } from '../src/district-kit-finish.js';

// A canvas stand-in: enough 2D context for the signs and procedural surfaces the District draws.
const context = () => new Proxy({}, {
  get: (store, key) => {
    if (key === 'measureText') return () => ({ width: 10 });
    if (key === 'createLinearGradient' || key === 'createRadialGradient' || key === 'createPattern') return () => ({ addColorStop() {} });
    if (key === 'getImageData') return (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) });
    if (key === 'createImageData') return (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) });
    if (typeof key !== 'string') return undefined;
    return key in store ? store[key] : () => {};
  },
  set: (store, key, value) => { store[key] = value; styles.push(`${String(key)}=${value}`); return true; },
});
const styles = [];
globalThis.document = {
  createElement: () => ({ width: 0, height: 0, style: {}, getContext: () => context() }),
  createElementNS: () => ({ style: {}, addEventListener() {}, removeEventListener() {}, setAttribute() {} }),
  dispatchEvent() {},
};
globalThis.CustomEvent ??= class { constructor(type, init) { this.type = type; this.detail = init?.detail; } };
const { buildDistrictBuildings, buildDistrictDetail } = await import('../src/district.js');
const { buildStreetFurniture } = await import('../src/street-furniture.js');

// The original District (#740 under #738): the generic facade kit takes the city-kit finish by
// opt-in only, render-only; reference-photographed frontages keep their real look.
const world = JSON.parse(readFileSync(new URL('../public/data/district.json', import.meta.url)));
const PINK = 'pink-jet-age', hex = value => new THREE.Color(value).getHexString();
const meshesOf = group => { const out = []; group.updateMatrixWorld(true); group.traverse(item => { if (item.isMesh) out.push(item); }); return out; };
const userData = mesh => JSON.stringify(mesh.userData, (key, value) => (value?.isObject3D || value?.isVector3 || value?.isTexture || value?.metadata?.type === 'Texture' || typeof value === 'function' ? undefined : value));
// Geometry, placement and gameplay flags of every mesh.
const shape = group => meshesOf(group).map(mesh => [mesh.name, mesh.geometry.attributes.position.count, mesh.geometry.index?.count ?? 0, mesh.count ?? 1,
  mesh.instanceMatrix ? [...mesh.instanceMatrix.array] : mesh.matrixWorld.toArray(), mesh.castShadow, mesh.receiveShadow, userData(mesh)]);
// Shading of every mesh: material, colours, finish parameters, program key and instance colours.
const looks = group => meshesOf(group).map(mesh => { const m = mesh.material; return [mesh.name, m.name, m.type, m.color?.getHexString(), m.emissive?.getHexString(),
  m.roughness, m.metalness, m.opacity, m.transparent, m.depthWrite, m.customProgramCacheKey?.(), mesh.instanceColor ? [...mesh.instanceColor.array] : null]; });
// Every drawn part, keyed by its geometry and exact placement, with the colour it is drawn in.
function parts(group) {
  const out = new Map(), matrix = new THREE.Matrix4(), colour = new THREE.Color();
  for (const mesh of meshesOf(group)) {
    const count = mesh.isInstancedMesh ? mesh.count : 1;
    for (let i = 0; i < count; i++) {
      if (mesh.isInstancedMesh) { mesh.getMatrixAt(i, matrix); if (mesh.instanceColor) mesh.getColorAt(i, colour); else colour.copy(mesh.material.color ?? new THREE.Color(1, 1, 1)); }
      else { matrix.copy(mesh.matrixWorld); colour.copy(mesh.material.color ?? new THREE.Color(1, 1, 1)); }
      const key = `${mesh.geometry.attributes.position.count}|${matrix.toArray().map(v => v.toFixed(4)).join()}`;
      if (!out.has(key)) out.set(key, []);
      out.get(key).push(colour.getHexString());
    }
  }
  for (const list of out.values()) list.sort();
  return out;
}
const counted = (map, colour) => [...map.values()].reduce((n, list) => n + list.filter(item => item === hex(colour)).length, 0);
const built = [];
const build = options => { const group = buildDistrictBuildings(world, options); built.push(group); return group; };
test.after(() => built.forEach(group => group.userData.dispose()));
const classic = build(), pink = build({ kitFinish: PINK });

test('the District finish table covers exactly the catalog finishes; classic replaces nothing; names are validated', () => {
  assert.deepEqual(Object.keys(DISTRICT_KIT_FINISHES), Object.keys(KIT_FINISHES));
  const spec = DISTRICT_KIT_FINISHES.classic;
  for (const key of ['stone', 'accents', 'sign']) assert.equal(spec[key], null, key);
  for (const table of ['facade', 'street', 'detail']) assert.deepEqual(spec[table], {}, table);
  assert.deepEqual(spec.keep, []);
  for (const value of [undefined, null, '', 'neon', 'PINK-JET-AGE', 'constructor', '__proto__', 'hasOwnProperty', { toString: () => PINK }, 42])
    assert.equal(districtKitFinishName(value), 'classic', String(value));
  assert.equal(districtKitFinishName(PINK), PINK);
  // Pink is never a field: no facade, street or bench surface maps to it, only the named accents.
  const pinkSpec = DISTRICT_KIT_FINISHES[PINK];
  for (const [key, fields] of Object.entries(pinkSpec.facade)) assert.notEqual(hex(fields.color), hex(P.pink), key);
  for (const [key, fields] of Object.entries(pinkSpec.detail)) assert.notEqual(hex(fields.color), hex(P.pink), key);
  assert.deepEqual(Object.keys(pinkSpec.accents).sort(), ['kickplate', 'speedLine', 'valance']);
});

test('classic is the default: no option, classic and any unknown name draw the same District, instance for instance', () => {
  const plainShape = shape(classic), plainLooks = looks(classic);
  assert.equal(classic.userData.kitFinish, 'classic');
  for (const options of [{}, { kitFinish: 'classic' }, { kitFinish: 'neon' }, { kitFinish: { toString: () => PINK } }]) {
    const group = build(options);
    assert.equal(group.userData.kitFinish, 'classic', JSON.stringify(options));
    assert.deepEqual(shape(group), plainShape, JSON.stringify(options));
    assert.deepEqual(looks(group), plainLooks, JSON.stringify(options));
  }
  // The classic ceramic keeps its pre-finish shader key, so it compiles the program it always did.
  const stone = meshesOf(classic).find(mesh => mesh.material.name === 'facade-stone').material;
  assert.match(stone.customProgramCacheKey(), /-retro-ceramic-v1$/);
  // Classic draws no TypeSafe pink at all.
  assert.equal(counted(parts(classic), P.pink), 0);
});

test('pink moves no part and changes no door, room, glass flag or district data', () => {
  const before = JSON.stringify(world);
  const group = build({ kitFinish: PINK });
  assert.equal(JSON.stringify(world), before, 'the finish never writes to the district data (footprints, doors, routes, collision)');
  assert.equal(group.userData.kitFinish, PINK);
  const a = parts(classic), b = parts(group);
  assert.deepEqual([...b.keys()].sort(), [...a.keys()].sort(), 'the same parts in the same places');
  for (const [key, list] of a) assert.equal(b.get(key).length, list.length, key);
  const glass = g => meshesOf(g).filter(mesh => mesh.userData.breakableGlass).map(mesh => `${mesh.name}:${mesh.count ?? 1}`).sort();
  assert.deepEqual(glass(group), glass(classic), 'breakable glass is the same set of panes');
  assert.deepEqual(group.userData.rooms.map(room => room.storeId), classic.userData.rooms.map(room => room.storeId));
  assert.equal(group.userData.reflectionMaterials.length, classic.userData.reflectionMaterials.length);
  const doors = g => meshesOf(g).filter(mesh => !mesh.isInstancedMesh && mesh.userData.storeId).map(userData).sort();
  assert.deepEqual(doors(group), doors(classic));
});

test('pink applies the mapping: ivory ceramic, chrome hardware, mint upper glass, pink accents only', () => {
  const spec = DISTRICT_KIT_FINISHES[PINK], material = name => meshesOf(pink).find(mesh => mesh.material.name === name)?.material;
  assert.match(material('facade-stone').customProgramCacheKey(), new RegExp(`-retro-ceramic-v1-${hex(P.ivory)}$`), 'a new ceramic colour is a new program');
  const upper = material('facade-upperGlass'), classicUpper = meshesOf(classic).find(mesh => mesh.material.name === 'facade-upperGlass').material;
  assert.equal(upper.color.getHexString(), hex(P.mintGlass));
  // Upper glass stays opaque and reflective exactly as classic: nothing reads as open into a solid mass.
  for (const key of ['opacity', 'transparent', 'depthWrite', 'metalness', 'roughness', 'envMapIntensity', 'clearcoat']) assert.equal(upper[key], classicUpper[key], key);
  assert.equal(material('facade-bulkhead').color.getHexString(), hex(P.chrome));
  assert.equal(material('facade-kickplate').color.getHexString(), hex(spec.accents.kickplate));
  const before = parts(classic), after = parts(pink);
  for (const colour of [P.chrome, P.ivory, P.ink, P.pink]) assert.ok(counted(after, colour) > 0, `pink draws ${colour}`);
  // Every recoloured part was a generic-kit colour; a reference material's colour never changes.
  const sources = new Set([RETRO.deepTeal, RETRO.brass, RETRO.teal, RETRO.porcelain, '#1e2120', '#b9bab6', '#31543d'].map(hex));
  const changed = new Map();
  for (const [key, list] of before) {
    const next = after.get(key);
    list.forEach((colour, i) => { if (next[i] !== colour) { assert.ok(sources.has(colour), `${key}: ${colour} -> ${next[i]} is not a generic-kit colour`); changed.set(`${colour}>${next[i]}`, (changed.get(`${colour}>${next[i]}`) ?? 0) + 1); } });
  }
  assert.ok(changed.size >= 4, JSON.stringify([...changed]));
});

test('reference-photographed frontages and their doorways look the same under pink', () => {
  const reference = g => looks(g).filter(([mesh, material]) => /reference/.test(`${mesh} ${material}`) && !/-reference$/.test(material));
  assert.ok(reference(classic).length > 20);
  assert.deepEqual(reference(pink), reference(classic));
  // Every store but the code-only venue is a reference frontage, so every entrance planter and
  // hedge keeps its classic colour, and every reference threshold keeps the classic enamel.
  const a = parts(classic), b = parts(pink);
  for (const colour of [RETRO.porcelain, '#31543d']) assert.equal(counted(b, colour), counted(a, colour), colour);
  const threshold = meshesOf(pink).find(mesh => mesh.material.name === 'facade-bulkhead-reference');
  assert.equal(threshold.material.color.getHexString(), hex(RETRO.deepTeal));
  assert.ok(threshold.count >= 25, `${threshold.count} reference thresholds`);
});

test('pink stays within two draws of classic and pink is an accent by part count', () => {
  const delta = meshesOf(pink).length - meshesOf(classic).length;
  assert.equal(delta, 2, 'the physical kickplate and the reference thresholds are the only new draws');
  const b = parts(pink), total = [...b.values()].reduce((n, list) => n + list.length, 0), pinkParts = counted(b, P.pink);
  assert.ok(pinkParts > 0 && pinkParts / total < 0.05, `${pinkParts} pink parts of ${total}`);
});

test('generic tenant signs take the ink plaque and pink keyline; classic keeps teal and brass', () => {
  // Every canvas style the build assigns; the code-only venue (Axe & Darts) is the generic sign.
  const assigned = finish => { styles.length = 0; built.push(buildDistrictBuildings(world, { kitFinish: finish })); return new Set(styles); };
  const plain = assigned('classic'), pinkStyles = assigned(PINK);
  for (const style of [`fillStyle=${RETRO.deepTeal}`, `strokeStyle=${RETRO.brass}`]) { assert.ok(plain.has(style), style); assert.ok(!pinkStyles.has(style), style); }
  for (const style of [`fillStyle=${P.ink}`, `strokeStyle=${P.pink}`, `fillStyle=${P.ivory}`]) assert.ok(pinkStyles.has(style), style);
});

test('street furniture and storefront benches: classic unchanged, pink recolours only', () => {
  const free = () => true;
  // Only what these builders draw themselves: lamps, planters, bins, pits and benches. The planting
  // and landscape models they also attach load asynchronously and are not recoloured by a finish.
  const own = group => { const out = new THREE.Group(); for (const child of [...group.children]) if (child.isMesh || child.name === 'Street bin') out.add(child.clone()); out.userData = group.userData; return out; };
  const furniture = options => own(buildStreetFurniture(world, free, options)), detail = options => own(buildDistrictDetail(world, options));
  for (const make of [furniture, detail]) {
    const plain = make(), named = make({ kitFinish: 'classic' }), unknown = make({ kitFinish: 'neon' }), pinkGroup = make({ kitFinish: PINK });
    assert.deepEqual(looks(named), looks(plain)); assert.deepEqual(looks(unknown), looks(plain));
    assert.deepEqual(shape(pinkGroup), shape(plain), 'same geometry, placement and counts');
    assert.notDeepEqual(looks(pinkGroup), looks(plain));
    assert.equal(pinkGroup.userData.kitFinish, PINK); assert.equal(plain.userData.kitFinish, 'classic');
  }
  const colours = group => new Set(meshesOf(group).map(mesh => mesh.material.color?.getHexString()));
  const street = furniture({ kitFinish: PINK });
  for (const colour of [P.chrome, P.pink, P.ivory]) assert.ok(colours(street).has(hex(colour)), colour);
  assert.ok(!colours(street).has(hex(RETRO.deepTeal)) && !colours(street).has(hex(RETRO.brass)));
  assert.deepEqual(street.userData.counts, furniture().userData.counts);
  const bench = colours(detail({ kitFinish: PINK }));
  assert.ok(bench.has(hex(P.chrome)) && bench.has(hex(P.ivory)));
});
