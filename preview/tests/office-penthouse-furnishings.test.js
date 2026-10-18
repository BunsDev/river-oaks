import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { OFFICE_LAYOUT_PENTHOUSE, officeLayout, officeSeats } from '../src/office-layouts.js';
import { buildPenthouseOffice } from '../src/office-penthouse-graybox.js';
import {
  PENTHOUSE_ASSETS, PENTHOUSE_FINISHES, SCREEN_DYNAMIC, TYPESAFE_PINK, buildPenthouseAssetModel, buildPenthouseFurnishings,
  createPenthouseFinishes, metricBoxUVs, penthouseAssetParts, penthousePlacements,
} from '../src/office-penthouse-furnishings.js';

const layout = officeLayout(OFFICE_LAYOUT_PENTHOUSE);
const [l0, l1] = layout.levels;
const meshes = object => { const out = []; object.updateMatrixWorld(true); object.traverse(node => { if (node.isMesh) out.push(node); }); return out; };
const triangles = parts => parts.reduce((sum, part) => sum + part.geometry.attributes.position.count / 3, 0);
// Assets framed on a wall face (d from 0 into the room) rather than centred on a footprint.
const ON_WALL = new Set(PENTHOUSE_ASSETS.filter(asset => asset.mount === 'wall').map(asset => asset.id));

test('every desk and furniture footprint in the plan has its art, and every placement stands on the plan', () => {
  const placements = penthousePlacements(layout);
  for (const level of layout.levels) for (const o of level.obstacles.filter(item => item.kind === 'desk' || item.kind === 'furniture'))
    assert.ok(placements.some(item => item.zone === `obstacle:${o.id}` && item.levelId === level.id && item.asset !== 'display'), `${o.id} is furnished`);
  for (const chair of l0.chairs) assert.ok(placements.some(item => item.zone === `chair:${chair.id}`), `${chair.id} is furnished`);
  for (const item of placements.filter(p => p.zone.startsWith('obstacle:'))) {
    const level = layout.levels.find(l => l.id === item.levelId), o = level.obstacles.find(ob => `obstacle:${ob.id}` === item.zone);
    assert.ok(o, `${item.id} names a footprint on its own level`);
    assert.ok(item.position[0] >= o.x0 && item.position[0] <= o.x1 && item.position[2] >= o.d0 && item.position[2] <= o.d1, `${item.id} stands on ${o.id}`);
  }
});

test('each asset stays inside its own footprint at both levels of detail, its pivot at floor contact', () => {
  for (const asset of PENTHOUSE_ASSETS) {
    const [w, l] = asset.size;
    for (const detail of [0, 1]) for (const part of penthouseAssetParts(asset.id, detail)) {
      const box = part.geometry.boundingBox, d0 = -box.max.z, d1 = -box.min.z;
      if (part.zone === 'canopy' || asset.id === 'pendant') continue; // overhead art has its own rule (graybox test)
      assert.ok(box.min.x >= -w / 2 - 1e-3 && box.max.x <= w / 2 + 1e-3, `${asset.id} LOD${detail} ${part.finish} x ${box.min.x.toFixed(3)}..${box.max.x.toFixed(3)} within ${w}`);
      const [lo, hi] = ON_WALL.has(asset.id) ? [0, l] : [-l / 2, l / 2];
      assert.ok(d0 >= lo - 1e-3 && d1 <= hi + 1e-3, `${asset.id} LOD${detail} ${part.finish} d ${d0.toFixed(3)}..${d1.toFixed(3)} within ${lo}..${hi}`);
      assert.ok(box.min.y >= -1e-3, `${asset.id} LOD${detail} ${part.finish} stands on its floor`);
      part.geometry.dispose();
    }
    const lowest = Math.min(...penthouseAssetParts(asset.id, 0).map(part => part.geometry.boundingBox.min.y));
    // A pendant's pivot is its drum's centre; a wall piece's is the wall face at floor level.
    if (asset.id !== 'pendant' && !ON_WALL.has(asset.id)) assert.ok(Math.abs(lowest) < 2e-3, `${asset.id} pivot at floor contact (${lowest})`);
    const [high, low] = [triangles(penthouseAssetParts(asset.id, 0)), triangles(penthouseAssetParts(asset.id, 1))];
    assert.ok(low <= high, `${asset.id} LOD1 ${low} <= LOD0 ${high}`);
    // The kit's largest LOD0 target (docs/design/office-ipic/asset-manifest.json) caps any one asset.
    assert.ok(high <= 12000, `${asset.id} LOD0 ${high} triangles`);
  }
});

test('a seated visitor sits on the art: each plan seat\'s cushion top is the plan seat height', () => {
  const built = buildPenthouseOffice(THREE, layout), ray = new THREE.Raycaster(), all = meshes(built.object);
  for (const seat of officeSeats(layout)) {
    const floor = layout.levels.find(level => level.id === seat.levelId).floorElevation;
    ray.set(new THREE.Vector3(seat.position[0], floor + 1.6, -seat.position[1]), new THREE.Vector3(0, -1, 0));
    const hit = ray.intersectObjects(all, false).find(item => item.object.material.name === 'upholstery');
    assert.ok(hit, `${seat.id} has a cushion under its seat`);
    assert.ok(Math.abs(hit.point.y - (floor + seat.height)) < 0.03, `${seat.id} cushion at ${(hit.point.y - floor).toFixed(3)} m, plan ${seat.height}`);
  }
  built.dispose();
  // Lounge seating is not a plan seat yet; its anchors still sit on its own cushions.
  for (const id of ['lounge-sofa', 'lounge-chair']) {
    const model = buildPenthouseAssetModel(id, createPenthouseFinishes({ textures: false })), lod = model.object.getObjectByName('LOD0');
    model.object.updateMatrixWorld(true);
    for (const anchor of model.object.children.filter(node => node.name.startsWith('SEAT'))) {
      ray.set(new THREE.Vector3(anchor.position.x, 1.5, anchor.position.z), new THREE.Vector3(0, -1, 0));
      const hit = ray.intersectObjects(lod.children, false)[0];
      assert.ok(hit && Math.abs(hit.point.y - anchor.position.y) < 0.03, `${id} ${anchor.name} at ${hit?.point.y.toFixed(3)} vs ${anchor.position.y}`);
    }
    model.dispose();
  }
});

test('eleven displays: each a SCREEN_DYNAMIC surface on its own desk, facing its station, idle and neutral', () => {
  const placements = penthousePlacements(layout).filter(item => item.asset === 'display');
  assert.equal(placements.length, layout.anchors.reduce((sum, anchor) => sum + (anchor.monitors ?? 0), 0));
  assert.equal(placements.length, 11);
  const built = buildPenthouseFurnishings(layout), screens = meshes(built.object).filter(mesh => mesh.material.name === SCREEN_DYNAMIC);
  assert.equal(screens.length, 1, 'one instanced draw of screens');
  const [screen] = screens, matrix = new THREE.Matrix4(), position = new THREE.Vector3(), turn = new THREE.Quaternion(), scale = new THREE.Vector3();
  assert.equal(screen.count, 11);
  assert.equal(PENTHOUSE_FINISHES[SCREEN_DYNAMIC].surface, undefined, 'no content: an idle surface, never a picture of a desktop');
  assert.ok(screen.material.emissiveIntensity <= 0.5 && screen.material.color.getHSL({}).l < 0.1, 'dark and neutral when idle');
  screen.userData.ids.forEach((id, i) => {
    const station = layout.anchors.find(anchor => anchor.id === placements.find(item => item.id === id).station);
    screen.getMatrixAt(i, matrix); matrix.decompose(position, turn, scale);
    const facing = new THREE.Vector3(0, 0, 1).applyQuaternion(turn), toSeat = new THREE.Vector3(station.seat[0] - position.x, 0, -station.seat[1] - position.z).normalize();
    assert.ok(facing.dot(toSeat) > Math.cos(Math.PI / 6), `${id} faces ${station.id}'s seat`);
  });
  built.dispose();
});

test('the palette: travertine, rose stone, champagne bronze, walnut, blush and planting, with TypeSafe pink as an accent only', () => {
  for (const name of ['travertine', 'rose-stone', 'bronze', 'wood', 'upholstery', 'foliage', SCREEN_DYNAMIC]) assert.ok(PENTHOUSE_FINISHES[name], name);
  assert.ok(PENTHOUSE_FINISHES.bronze.metalness === 1 && new THREE.Color(PENTHOUSE_FINISHES.bronze.color).getHSL({}).s > 0.2, 'bronze is a warm metal');
  const pink = new THREE.Color(TYPESAFE_PINK), built = buildPenthouseFurnishings(layout);
  let accent = 0, total = 0;
  for (const mesh of meshes(built.object)) {
    assert.notEqual(mesh.material.color.getHexString(), pink.getHexString(), `${mesh.name} is not a pink finish`);
    const colour = mesh.geometry.attributes.color, copies = mesh.isInstancedMesh ? mesh.count : 1;
    for (let i = 0; i < colour.count; i++) {
      total += copies;
      if (Math.abs(colour.getX(i) - pink.r) + Math.abs(colour.getY(i) - pink.g) + Math.abs(colour.getZ(i) - pink.b) < 0.01) accent += copies;
    }
  }
  assert.ok(accent > 0 && accent / total < 0.03, `pink on ${(accent / total * 100).toFixed(2)}% of vertices`);
  built.dispose();
});

test('the art is reproducible: two builds of the plan give identical geometry', () => {
  const digest = () => {
    const hash = createHash('sha256');
    for (const asset of PENTHOUSE_ASSETS) for (const detail of [0, 1]) for (const part of penthouseAssetParts(asset.id, detail)) {
      hash.update(`${asset.id}|${detail}|${part.finish}|${part.zone}`);
      for (const name of ['position', 'normal', 'uv', 'color']) hash.update(Buffer.from(part.geometry.attributes[name].array.buffer));
      part.geometry.dispose();
    }
    return hash.digest('hex');
  };
  assert.equal(digest(), digest());
});

test('visibility groups: the main floor, the terrace and the mezzanine each hold only their own pieces', () => {
  const built = buildPenthouseFurnishings(layout), terrace = l0.rooms.find(room => room.kind === 'terrace');
  assert.deepEqual(built.object.children.map(group => group.name), ['furnishings:main-floor', 'furnishings:terrace', 'furnishings:mezzanine']);
  for (const item of built.placements) {
    const expected = item.levelId === l1.id ? 'mezzanine' : item.position[0] < terrace.x1 ? 'terrace' : 'main-floor';
    assert.equal(item.group, expected, item.id);
  }
  assert.ok(built.placements.filter(item => item.group === 'terrace').length >= 7);
  built.dispose();
});

test('the export names every placement, its anchors and the server\'s collision proxies', () => {
  const finishes = createPenthouseFinishes({ textures: false }), built = buildPenthouseFurnishings(layout, { finishes, instancing: false });
  for (const item of built.placements) assert.ok(built.object.getObjectByName(item.id), item.id);
  for (const level of layout.levels) for (const o of level.obstacles.filter(item => item.kind === 'desk' || item.kind === 'furniture')) {
    const proxy = built.object.getObjectByName(`COL_${o.id}`);
    assert.ok(proxy && !proxy.visible, `COL_${o.id}`);
    proxy.geometry.computeBoundingBox();
    const size = proxy.geometry.boundingBox.getSize(new THREE.Vector3());
    assert.deepEqual([size.x, size.y, size.z].map(n => Number(n.toFixed(6))), [o.x1 - o.x0, o.height, o.d1 - o.d0].map(n => Number(n.toFixed(6))), `COL_${o.id} is the plan footprint`);
  }
  for (const chair of l0.chairs) assert.ok(built.object.getObjectByName(`COL_${chair.id}`), `COL_${chair.id}`);
  for (const item of built.placements.filter(p => p.asset === 'display')) assert.ok(built.object.getObjectByName(`SCREEN:${item.id}`), `SCREEN:${item.id}`);
  assert.ok(built.object.getObjectByName('SEAT_1:lounge-sofa') && built.object.getObjectByName('SEAT_2:lounge-sofa'));
  // Every mesh and material is named by placement and finish, so a reimport can be checked by name.
  for (const mesh of meshes(built.object).filter(m => !m.name.startsWith('COL_'))) assert.match(mesh.name, /^[a-z0-9-]+:[A-Za-z_-]+$/, mesh.name);
  built.dispose(); finishes.dispose();
});

test('each asset model carries LOD0, LOD1, its COL proxy on the footprint and its anchors', () => {
  const finishes = createPenthouseFinishes({ textures: false });
  for (const asset of PENTHOUSE_ASSETS) {
    const model = buildPenthouseAssetModel(asset.id, finishes);
    for (const name of ['LOD0', 'LOD1', `COL_${asset.id}`, ...asset.anchors]) assert.ok(model.object.getObjectByName(name), `${asset.id} ${name}`);
    assert.equal(model.object.getObjectByName('LOD1').visible, false);
    model.dispose();
  }
  finishes.dispose();
});

test('budgets: the furnished office is measured, instanced and batched', () => {
  const built = buildPenthouseFurnishings(layout), stats = built.stats();
  // Measured at this revision: repeated pieces instanced, one-off pieces one static draw per finish
  // and visibility group. The office's provisional budget is 150 draws and 250k triangles.
  assert.ok(stats.draws <= 48, `furnishing draws ${stats.draws}`);
  assert.ok(stats.triangles <= 100000, `furnishing triangles ${stats.triangles}`);
  built.dispose();
});

test('pendant drums hang only at lamps high enough to clear the tallest body, under their own ceiling', () => {
  const lamp = (x, y, d) => ({ position: { x, y, z: -d } });
  const placed = penthousePlacements(layout, { lights: [lamp(-3, 4.5, 8), lamp(-6, l1.floorElevation + 1.7, 17.4), lamp(0, l1.floorElevation + 3, 17), lamp(5, 2.9, 17)] }).filter(item => item.asset === 'pendant');
  assert.deepEqual(placed.map(item => item.id), ['pendant-1', 'pendant-3'], 'the reading lamp and a lamp under the mezzanine get no drum');
  for (const item of placed) {
    const level = layout.levels.find(l => l.id === item.levelId);
    assert.equal(item.position[1], item.id === 'pendant-1' ? 4.5 : l1.floorElevation + 3, 'the drum is centred on its lamp');
    assert.ok(Math.abs(item.position[1] + 0.2 + item.rod - (level.floorElevation + level.clearHeight)) < 1e-9, 'its rod reaches the ceiling');
  }
});

test('asset collision proxies are the pieces\' own footprints: chair cylinders, wall pieces from the wall, drums on their pivot', () => {
  const finishes = createPenthouseFinishes({ textures: false });
  for (const asset of PENTHOUSE_ASSETS) {
    const model = buildPenthouseAssetModel(asset.id, finishes), proxy = model.object.getObjectByName(`COL_${asset.id}`);
    proxy.geometry.computeBoundingBox();
    const box = proxy.geometry.boundingBox, [w, l, h] = asset.size;
    if (['task-chair', 'executive-chair'].includes(asset.id)) assert.deepEqual([box.max.x, box.min.y, box.max.y].map(n => Number(n.toFixed(4))), [0.4, 0, asset.seatHeight], asset.id);
    else if (asset.mount === 'wall') assert.deepEqual([-box.max.z, -box.min.z].map(n => Number(n.toFixed(4)) || 0), [0, l], asset.id);
    else if (asset.mount === 'ceiling') assert.ok(Math.abs(box.min.y + h / 2) < 1e-6 && Math.abs(box.max.y - h / 2) < 1e-6, asset.id);
    else assert.deepEqual([box.min.y, box.max.y, box.max.x, -box.min.z].map(n => Number(n.toFixed(4)) || 0), [0, h, w / 2, l / 2], asset.id);
    model.dispose();
  }
  finishes.dispose();
});

test('surfaces are drawn in short idle slices, never one long block, and swap in when complete', async () => {
  // A fresh module instance with a stub canvas: rows of noise land in slices of a few ms each.
  const saved = { document: globalThis.document, setTimeout: globalThis.setTimeout };
  const puts = [];
  const context = { createImageData: (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }), putImageData: image => puts.push(image), fillRect() {}, set fillStyle(v) {} };
  globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => context }) };
  const slices = [];
  globalThis.setTimeout = (callback, ms) => saved.setTimeout(() => { const start = performance.now(); callback(); slices.push(performance.now() - start); }, ms);
  try {
    const fresh = await import(`../src/office-penthouse-furnishings.js?slices=${Date.now()}`);
    const finishes = fresh.createPenthouseFinishes();
    const maps = finishes.materials.filter(material => material.map).map(material => material.map);
    assert.equal(maps.length, 3);
    assert.ok(maps.every(map => map.image.width === 1), 'swatches until drawn');
    for (let i = 0; i < 2000 && maps.some(map => map.image.width !== 512); i++) await new Promise(done => saved.setTimeout(done, 1));
    assert.ok(maps.every(map => map.image.width === 512), 'every surface swaps in');
    assert.equal(puts.length, 3, 'each surface is put once, complete');
    assert.ok(slices.length > 6, `drawn over ${slices.length} slices`);
    assert.ok(Math.max(...slices) < 40, `the longest slice took ${Math.max(...slices).toFixed(1)} ms`);
    finishes.dispose();
  } finally { globalThis.document = saved.document; globalThis.setTimeout = saved.setTimeout; }
});

test('graybox stone takes metric UVs: a 2.4 m slab repeats a 1.2 m stone twice', () => {
  const geometry = metricBoxUVs(new THREE.BoxGeometry(2.4, 0.1, 3.6), 1.2), uv = geometry.attributes.uv, normal = geometry.attributes.normal;
  const top = Array.from({ length: uv.count }, (_, i) => i).filter(i => normal.getY(i) > 0.5);
  const span = axis => Math.max(...top.map(i => axis ? uv.getY(i) : uv.getX(i))) - Math.min(...top.map(i => axis ? uv.getY(i) : uv.getX(i)));
  assert.deepEqual([span(0), span(1)].map(n => Number(n.toFixed(6))), [2, 3]);
  geometry.dispose();
});

test('owned finishes are released with the furnishings; shared ones stay with their owner', () => {
  const own = buildPenthouseFurnishings(layout), released = new Set();
  for (const material of own.materials) material.addEventListener('dispose', () => released.add(material));
  own.dispose();
  assert.equal(released.size, own.materials.length);
  const finishes = createPenthouseFinishes({ textures: false }), shared = buildPenthouseFurnishings(layout, { finishes }), kept = new Set();
  for (const material of finishes.materials) material.addEventListener('dispose', () => kept.add(material));
  shared.dispose();
  assert.equal(kept.size, 0);
  finishes.dispose();
});
