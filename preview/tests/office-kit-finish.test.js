import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { PINK_JET_AGE } from '../../shared/city-kit/pink-jet-age.js';
import { OFFICE_LAYOUT_LEGACY, OFFICE_LAYOUT_PENTHOUSE, officeLayout } from '../src/office-layouts.js';
import { buildOfficeGeometry, buildPenthouseOffice } from '../src/office-penthouse-graybox.js';
import { createPenthouseFinishes, SCREEN_DYNAMIC, TYPESAFE_PINK } from '../src/office-penthouse-furnishings.js';
import { OFFICE_KIT_FINISHES, officeKitFinish, officeKitFinishName } from '../src/office-kit-finish.js';

// The penthouse kit finish (#744 under #738) is render-only: the same art, zones, placements,
// instances, shadows and lights under every finish; only listed material fields change.
const layout = officeLayout(OFFICE_LAYOUT_PENTHOUSE), PINK = 'pink-jet-age';
const sha = array => createHash('sha256').update(Buffer.from(array.buffer, array.byteOffset, array.byteLength)).digest('hex').slice(0, 16);
const round = values => Array.from(values, v => Math.round(v * 1e4) / 1e4);
const hex = color => color?.getHexString?.() ?? null;
const fields = material => ({
  name: material.name, type: material.type, color: hex(material.color), roughness: material.roughness, metalness: material.metalness,
  emissive: hex(material.emissive), emissiveIntensity: material.emissiveIntensity, opacity: material.opacity, transparent: material.transparent,
  side: material.side, vertexColors: material.vertexColors, map: Boolean(material.map), program: material.customProgramCacheKey?.() ?? null,
});
// Everything but the material fields: the art and its placement.
const art = object => {
  object.updateMatrixWorld(true);
  const meshes = [], lights = [];
  object.traverse(node => {
    if (node.isMesh) {
      const g = node.geometry, matrices = [];
      if (node.isInstancedMesh) { const m = new THREE.Matrix4(); for (let i = 0; i < node.count; i++) { node.getMatrixAt(i, m); matrices.push(round(m.elements)); } }
      meshes.push({ name: node.name, zone: node.userData.zone ?? null, zones: node.userData.zones ?? null, ids: node.userData.ids ?? null, asset: node.userData.asset ?? null,
        group: node.parent?.name, instances: node.isInstancedMesh ? node.count : null, matrices, world: round(node.matrixWorld.elements),
        geometry: `${g.type}:${g.attributes.position.count}:${sha(g.attributes.position.array)}:${g.attributes.color ? sha(g.attributes.color.array) : '-'}:${g.index ? sha(g.index.array) : '-'}`,
        casts: node.castShadow, receives: node.receiveShadow, material: node.material.name });
    } else if (node.isLight) lights.push({ type: node.type, color: hex(node.color), intensity: node.intensity, distance: node.distance ?? null, position: round(node.position.toArray()) });
  });
  return { name: object.name, meshes, lights };
};
const materials = object => { const out = []; object.traverse(node => { if (node.isMesh) out.push({ mesh: node.name, group: node.parent?.name, ...fields(node.material) }); }); return out; };
const build = finish => buildPenthouseOffice(THREE, layout, finish === undefined ? undefined : { finish });

test('the office finish table covers exactly the catalog finishes, and classic replaces nothing', () => {
  assert.deepEqual(Object.keys(OFFICE_KIT_FINISHES), ['classic', PINK]);
  assert.deepEqual(OFFICE_KIT_FINISHES.classic, { label: 'Classic', materials: {}, shell: {} });
  for (const value of [undefined, null, '', 'classic', 'PINK', 'toString', '__proto__', 42]) assert.equal(officeKitFinishName(value), 'classic', String(value));
  assert.equal(officeKitFinishName(PINK), PINK);
  assert.equal(officeKitFinish('__proto__'), OFFICE_KIT_FINISHES.classic);
  assert.ok(!Object.hasOwn(OFFICE_KIT_FINISHES[PINK].materials, SCREEN_DYNAMIC), 'no finish ever touches a screen');
});

test('classic is the default and draws exactly the pre-finish penthouse', () => {
  const base = build(), reference = { art: art(base.object), materials: materials(base.object) };
  assert.equal(base.object.userData.kitFinish, 'classic');
  for (const finish of ['classic', undefined, null, 'unknown-finish', '__proto__']) {
    const office = buildPenthouseOffice(THREE, layout, { finish });
    assert.equal(office.object.userData.kitFinish, 'classic', String(finish));
    assert.deepEqual(art(office.object), reference.art, `art under ${String(finish)}`);
    assert.deepEqual(materials(office.object), reference.materials, `materials under ${String(finish)}`);
    office.dispose();
  }
  base.dispose();
});

test('pink changes only the listed material fields; art, zones, instances, shadows and lights are identical', () => {
  const classic = build('classic'), pink = build(PINK);
  assert.equal(pink.object.userData.kitFinish, PINK);
  assert.deepEqual(art(pink.object), art(classic.object));
  const before = materials(classic.object), after = materials(pink.object), table = OFFICE_KIT_FINISHES[PINK];
  assert.equal(after.length, before.length);
  const changed = new Set();
  before.forEach((was, i) => {
    const now = after[i];
    assert.equal(now.mesh, was.mesh); assert.equal(now.name, was.name);
    const diff = Object.keys(was).filter(key => JSON.stringify(was[key]) !== JSON.stringify(now[key]));
    if (!diff.length) return;
    changed.add(was.name);
    // The shell's materials are keyed by their mesh's finish name; the furnishings' by material name.
    const expected = table.materials[was.name] ?? table.shell[shellName(was)];
    assert.ok(expected, `${was.mesh} (${was.name}) changed without a table entry: ${diff.join(', ')}`);
    // A field the table sets to its classic value (bronze roughness) is no change; nothing else may change.
    assert.ok(diff.every(key => Object.hasOwn(expected, key)), `${was.mesh} (${was.name}) changed ${diff.join(', ')}; the table lists ${Object.keys(expected).join(', ')}`);
    for (const key of Object.keys(expected)) assert.equal(now[key], typeof expected[key] === 'string' ? new THREE.Color(expected[key]).getHexString() : expected[key], `${was.mesh}.${key}`);
  });
  // Every listed finish is drawn somewhere, and the screens are untouched.
  for (const name of Object.keys(table.materials)) assert.ok(changed.has(name), `${name} is drawn`);
  for (const name of ['bronze', 'glass', 'wall']) assert.ok(before.some((was, i) => shellName(was) === name && JSON.stringify(was) !== JSON.stringify(after[i])), `shell ${name} is repainted`);
  const screens = after.filter(entry => entry.name === SCREEN_DYNAMIC);
  assert.ok(screens.length > 0);
  assert.deepEqual(screens, before.filter(entry => entry.name === SCREEN_DYNAMIC));
  // Chrome, not champagne; ivory walls; nothing exactly brand pink as a material.
  const chrome = new THREE.Color(PINK_JET_AGE.chrome).getHexString(), brand = new THREE.Color(TYPESAFE_PINK).getHexString();
  assert.ok(after.some(entry => entry.name === 'bronze' && entry.color === chrome && entry.metalness === 0.5));
  assert.ok(after.some(entry => entry.mesh === 'back wall' && entry.color === new THREE.Color(PINK_JET_AGE.ivory).getHexString()));
  assert.ok(after.every(entry => entry.color !== brand), 'TypeSafe pink stays a vertex accent, never a whole material');
  classic.dispose(); pink.dispose();
});

test('the terrace set, cloned from the interior set, carries the finish; a like-set clone of classic stays classic', () => {
  const pink = build(PINK);
  const terrace = materials(pink.object).filter(entry => entry.group === 'furnishings:terrace' && entry.name === 'bronze');
  assert.ok(terrace.length > 0, 'the terrace has bronze-finish pieces');
  for (const entry of terrace) assert.equal(entry.color, new THREE.Color(PINK_JET_AGE.chrome).getHexString());
  pink.dispose();
  const interior = createPenthouseFinishes({ textures: false, finish: PINK }), clone = createPenthouseFinishes({ textures: false, like: interior });
  assert.equal(clone.get('graphite').color.getHexString(), interior.get('graphite').color.getHexString());
  assert.notEqual(clone.get('graphite'), interior.get('graphite'), 'a clone is its own material');
  const classic = createPenthouseFinishes({ textures: false });
  assert.equal(classic.get('bronze').color.getHexString(), 'c7a676');
  assert.equal(classic.get('bronze').metalness, 1);
  interior.dispose(); clone.dispose(); classic.dispose();
});

test('the visit geometry passes the finish to the penthouse and never to the legacy room', () => {
  let legacy = 0;
  const pink = buildOfficeGeometry(THREE, OFFICE_LAYOUT_PENTHOUSE, { buildLegacy: () => { legacy++; }, finish: PINK });
  assert.equal(pink.object.userData.kitFinish, PINK); assert.equal(legacy, 0);
  pink.dispose();
  const room = { object: new THREE.Group(), dispose() {} };
  assert.equal(buildOfficeGeometry(THREE, OFFICE_LAYOUT_LEGACY, { buildLegacy: () => { legacy++; return room; }, finish: PINK }), room);
  assert.equal(legacy, 1);
  assert.throws(() => buildOfficeGeometry(THREE, 'office-unknown', { buildLegacy: () => room, finish: PINK }), /Unknown office layout/);
});

test('a pink build releases everything it owns, as classic does', () => {
  for (const finish of ['classic', PINK]) {
    const office = build(finish), owned = new Set();
    office.object.traverse(node => { if (node.isMesh) { owned.add(node.geometry); for (const material of [node.material].flat()) owned.add(material); } });
    let disposed = 0;
    for (const resource of owned) resource.addEventListener('dispose', () => disposed++);
    office.dispose();
    assert.equal(disposed, owned.size, `${finish}: ${disposed} of ${owned.size} resources released`);
  }
});

// The shell's material name is the mesh's finish: floors, treads and the mezzanine are stone; frames,
// rails, platforms and the curtain wall frames are bronze; the guard and rails glass; the core walls wall.
function shellName({ mesh, name }) {
  if (name) return null;
  if (/terrace rail|guard$|curtain wall panes/.test(mesh)) return 'glass';
  if (/guard rail|curtain wall frames|lift/.test(mesh)) return 'bronze';
  if (/arrival core|entrance header|back wall/.test(mesh)) return 'wall';
  if (mesh === 'ceiling') return 'ceiling';
  return 'stone';
}
