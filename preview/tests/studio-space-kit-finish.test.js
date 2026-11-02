import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { PINK_JET_AGE } from '../../shared/city-kit/pink-jet-age.js';
import { createStudioScene, disposeStudioScene } from '../src/studio/scene.js';
import { createSpaceScene as buildSpace, buildSpaceWorld, SPACE_LIGHT } from '../src/studio/space-scene.js';
import { createSpace, spaceTemplates } from '../src/studio/space-templates.js';
import { applySpaceKitFinish, SPACE_CLASSIC_FINISHES, SPACE_KIT_FINISHES, spaceKitFinish, spaceKitFinishName } from '../src/studio/space-kit-finish.js';
import { readFileSync } from 'node:fs';
import { APPROVED_SPACES } from '../src/approved-spaces.js';

// The editor's path: build the space as space-scene.js always does, then apply the finish.
const createSpaceScene = (space, theme = 'light', { finish } = {}) => { const scene = buildSpace(space, theme); applySpaceKitFinish(scene.group, finish); return scene; };

// The World Studio kit finish (#744 under #738) is render-only and document-free: every stock
// template draws the same parts in the same places under every finish, documents are never
// changed, and only the listed catalog names look different.
const PINK = 'pink-jet-age';
const sha = array => createHash('sha256').update(Buffer.from(array.buffer, array.byteOffset, array.byteLength)).digest('hex').slice(0, 16);
const round = values => Array.from(values, v => Math.round(v * 1e4) / 1e4);
const hex = color => color?.getHexString?.() ?? null;
const fields = material => ({
  type: material.type, color: hex(material.color), roughness: material.roughness, metalness: material.metalness, sheen: material.sheen ?? null,
  sheenColor: hex(material.sheenColor), opacity: material.opacity, transparent: material.transparent, map: Boolean(material.map), mirror: Boolean(material.userData?.mirror),
});
const path = node => { const names = []; for (let n = node; n; n = n.parent) names.unshift(n.userData?.studioId ?? n.name); return names.join('/'); };
const art = group => {
  group.updateMatrixWorld(true);
  const out = [];
  group.traverse(node => {
    if (node.isMesh || node.isLineSegments) out.push({ path: path(node), world: round(node.matrixWorld.elements), casts: node.castShadow, receives: node.receiveShadow,
      geometry: `${node.geometry.type}:${node.geometry.attributes.position.count}:${sha(node.geometry.attributes.position.array)}` });
    else if (node.isLight) out.push({ path: path(node), light: node.type, color: hex(node.color), intensity: node.intensity });
  });
  return out;
};
const materials = group => { const out = []; group.traverse(node => { if (node.isMesh || node.isLineSegments) out.push({ path: path(node), ...fields(node.material) }); }); return out; };
const CLASSIC = Object.fromEntries(Object.entries(SPACE_CLASSIC_FINISHES).map(([k, [c]]) => [k, new THREE.Color(c).getHexString()]));
const swatch = name => new THREE.Color(spaceKitFinish(PINK).finishes[name][0]).getHexString();

test('the space finish table covers exactly the catalog finishes, and classic replaces nothing', () => {
  assert.deepEqual(Object.keys(SPACE_KIT_FINISHES), ['classic', PINK]);
  assert.deepEqual(SPACE_KIT_FINISHES.classic, { label: 'Classic', finishes: {} });
  for (const value of [undefined, null, '', 'classic', 'PINK', 'toString', '__proto__', 42]) assert.equal(spaceKitFinishName(value), 'classic', String(value));
  assert.equal(spaceKitFinishName(PINK), PINK);
  assert.deepEqual(Object.keys(SPACE_KIT_FINISHES[PINK].finishes).sort(), ['brass', 'fabric', 'plaster']);
});

for (const { id, name } of spaceTemplates) {
  test(`${name}: classic is the default and draws exactly the pre-finish template`, () => {
    const document = createSpace(id), frozen = JSON.stringify(document);
    const base = createSpaceScene(document), reference = { art: art(base.group), materials: materials(base.group), items: [...base.items.keys()], world: base.world };
    assert.equal(base.group.userData.kitFinish, 'classic');
    for (const finish of ['classic', undefined, null, 'unknown-finish', '__proto__']) {
      const scene = createSpaceScene(document, 'light', { finish });
      assert.equal(scene.group.userData.kitFinish, 'classic', String(finish));
      assert.deepEqual(art(scene.group), reference.art, `art under ${String(finish)}`);
      assert.deepEqual(materials(scene.group), reference.materials, `materials under ${String(finish)}`);
      assert.deepEqual([...scene.items.keys()], reference.items);
      assert.deepEqual(scene.world, reference.world);
      disposeStudioScene(scene.group);
    }
    disposeStudioScene(base.group);
    assert.equal(JSON.stringify(document), frozen, 'the document is never written');
  });

  test(`${name}: pink repaints only plaster, brass and fabric; parts, placement, routes and the document are identical`, () => {
    const document = createSpace(id), frozen = JSON.stringify(document);
    const classic = createSpaceScene(document, 'light', { finish: 'classic' }), pink = createSpaceScene(document, 'light', { finish: PINK });
    assert.equal(pink.group.userData.kitFinish, PINK);
    assert.deepEqual(art(pink.group), art(classic.group));
    assert.deepEqual([...pink.items.keys()], [...classic.items.keys()]);
    assert.deepEqual(pink.world, classic.world, 'walkable world and collision are the same');
    assert.deepEqual(buildSpaceWorld(document), classic.world);
    const before = materials(classic.group), after = materials(pink.group), repainted = new Set();
    assert.equal(after.length, before.length);
    before.forEach((was, i) => {
      const now = after[i];
      assert.equal(now.path, was.path);
      const diff = Object.keys(was).filter(key => JSON.stringify(was[key]) !== JSON.stringify(now[key]));
      if (!diff.length) return;
      const entry = Object.entries(CLASSIC).find(([, color]) => color === was.color);
      assert.ok(entry, `${was.path} changed (${diff.join(', ')}) but was ${was.color}, not a listed finish`);
      const [finishName] = entry, [color, roughness, metalness] = spaceKitFinish(PINK).finishes[finishName];
      repainted.add(finishName);
      assert.equal(now.color, new THREE.Color(color).getHexString(), `${was.path} colour`);
      if (was.sheen) {
        // A textile keeps its weave: sheen and roughness as before, its highlight following the new colour.
        assert.deepEqual(diff.sort(), ['color', 'sheenColor'], `${was.path} textile changed ${diff.join(', ')}`);
      } else {
        assert.ok(diff.every(key => ['color', 'roughness', 'metalness'].includes(key)), `${was.path} changed ${diff.join(', ')}`);
        assert.equal(now.roughness, roughness); assert.equal(now.metalness, metalness);
      }
    });
    assert.ok(repainted.has('plaster') && repainted.has('brass'), `${name} draws plaster and brass (${[...repainted].join(', ')})`);
    disposeStudioScene(classic.group); disposeStudioScene(pink.group);
    assert.equal(JSON.stringify(document), frozen, 'the document is never written');
  });
}

test('under pink the Garden Office keeps its one TypeSafe-pink wall art, terracotta pots and dark frames; chrome replaces brass', () => {
  const scene = createSpaceScene(createSpace('office'), 'light', { finish: PINK });
  try {
    assert.equal(scene.items.get('reception-art').getObjectByName('Abstract circle').material.color.getHexString(), 'f486a1');
    assert.equal(scene.items.get('meeting-plant').getObjectByName('Planter').material.color.getHexString(), 'b76e50');
    const colours = materials(scene.group);
    assert.ok(colours.some(entry => entry.color === new THREE.Color(PINK_JET_AGE.chrome).getHexString() && entry.metalness === 0.5), 'satin chrome hardware');
    assert.ok(!colours.some(entry => entry.color === CLASSIC.brass), 'no brass remains');
    assert.ok(colours.some(entry => entry.color === '333833'), 'charcoal frames stay dark');
    assert.ok(colours.some(entry => entry.color === swatch('fabric') && entry.sheen === 1), 'the chairs are the pale rose textile');
  } finally { disposeStudioScene(scene.group); }
});

test('the studio scene takes the designer preference, classic outside a page, and lighting presets are not a finish', () => {
  const region = createSpace('cafe');
  const scene = createStudioScene(region), pink = createStudioScene(region, 'light', null, { finish: PINK });
  try {
    assert.equal(scene.group.userData.kitFinish, 'classic');
    assert.equal(pink.group.userData.kitFinish, PINK);
    assert.deepEqual(Object.keys(SPACE_LIGHT), ['daylight', 'warm', 'evening']);
  } finally { disposeStudioScene(scene.group); disposeStudioScene(pink.group); }
});

test('the classic entries the finish matches are the ones space-scene.js draws, and the approved-space renderer is untouched', () => {
  const source = readFileSync(new URL('../src/studio/space-scene.js', import.meta.url), 'utf8');
  // space-scene.js FINISHES, read from its source: `name: ['#hex', roughness, metalness]`.
  const drawn = Object.fromEntries([...source.matchAll(/(\w+): \['(#[0-9a-f]{6})', *([\d.]+), *([\d.]+)\]/g)].map(([, name, color, r, m]) => [name, [color, Number(r), Number(m)]]));
  for (const [name, entry] of Object.entries(SPACE_CLASSIC_FINISHES)) assert.deepEqual([...entry], drawn[name], `${name} matches space-scene.js FINISHES`);
  const sha = buffer => createHash('sha256').update(buffer).digest('hex');
  for (const record of APPROVED_SPACES) for (const file of record.assets.files)
    assert.equal(sha(readFileSync(new URL(`../../${file.path}`, import.meta.url))), file.sha256, `${file.path} is as ${record.id}@${record.revision} was approved`);
});

test('every listed classic entry is drawn somewhere in the four templates, and only those materials change', () => {
  const drawn = new Set();
  for (const { id } of spaceTemplates) {
    const scene = buildSpace(createSpace(id));
    for (const entry of materials(scene.group)) for (const [name, hex] of Object.entries(CLASSIC)) if (entry.color === hex) drawn.add(name);
    disposeStudioScene(scene.group);
  }
  assert.deepEqual([...drawn].sort(), Object.keys(SPACE_CLASSIC_FINISHES).sort());
});
