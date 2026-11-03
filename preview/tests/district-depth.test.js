import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { findDepthFights } from '../src/depth-layer-audit.js';

const world = JSON.parse(readFileSync(new URL('../public/data/district.json', import.meta.url)));

test('district facades keep glass off the building mass, and display alcoves out of the next edge\'s wall and the boutiques beside them', async () => {
  // Node has no DOM: a 2D context that accepts any call and hands back blank pixels.
  const pixels = (...args) => { const [w, h] = args.length > 2 ? args.slice(2) : typeof args[0] === 'object' ? [args[0].width, args[0].height] : args; return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }; };
  const sink = new Proxy(() => sink, { get: (_, key) => key === 'measureText' ? () => ({ width: 0 }) : key === 'getImageData' || key === 'createImageData' ? pixels : sink, apply: () => sink, set: () => true });
  // Texture loads finish after the test, so the stub stays for this file's own process.
  const element = () => ({ style: {}, classList: { add() {}, remove() {}, toggle() {} }, dataset: {}, append() {}, setAttribute() {}, remove() {}, appendChild() {}, addEventListener() {}, removeEventListener() {}, getContext: () => sink, width: 0, height: 0 });
  globalThis.document = { createElement: element, createElementNS: element };
  const [{ buildDistrictBuildings }, THREE] = await Promise.all([import('../src/district.js'), import('three')]);
  const built = buildDistrictBuildings(world), group = new THREE.Group();
  group.add(built, built.userData.interiors);
  group.updateMatrixWorld(true);
  // The building masses are depth-biased clones (district.js, reference-facades.js), and Material.clone
  // drops shader callbacks: every opaque mass kept its colour but lost its metric UVs and cladding
  // joints (2026-10-30). Each must still compile its authored patch.
  const masses = new Set();
  group.traverse(object => { if (object.userData.districtBuilding && object.material?.polygonOffset) masses.add(object.material); });
  const opaque = [...masses].filter(material => !/glass/.test(material.name));
  assert.ok(opaque.length >= 8, `${opaque.length} depth-biased mass materials`);
  for (const material of opaque) {
    const shader = { vertexShader: '#include <uv_vertex>', fragmentShader: 'void main() { #include <map_fragment> }', uniforms: {} };
    material.onBeforeCompile(shader, {});
    assert.ok(shader.vertexShader.includes('roUv'), `${material.name}: metric UV patch survives the depth clone`);
    assert.match(material.customProgramCacheKey(), /river-oaks-metric-uv/, `${material.name}: authored program identity survives`);
  }
  const fights = findDepthFights(group);
  const named = fight => `${fight.a} × ${fight.b} at ${fight.at.map(value => value.toFixed(1))}`;
  // Every facade part stands on the mapped wall or in front of it, so the mass behind them all
  // (glass in loggias, storefronts and bays a few centimetres off it) never shares their depth.
  // The Hermès pavilion's mass, flush with the block's own on the west wall, is pushed back one
  // step less and wins. One meeting of neighbours remains: an upper window of the next building
  // buried a centimetre inside a parking garage's wall.
  const mass = fights.filter(fight => fight.faces.some(face => face.object.userData.districtBuilding));
  assert.deepEqual([...new Set(mass.map(fight => `${fight.a} × ${fight.b}`))], ['Mesh|facade-roof × facade:facade-upperGlass|facade-upperGlass'], mass.map(named).join('\n'));
  // A ground-floor display alcove at a building corner once ran into the next edge's wall or
  // glass, its floor, ceiling and side wall a centimetre behind them across the whole bay.
  const alcoves = fights.filter(fight => /facade-(interior|floor)\|/.test(`${fight.a} ${fight.b}`) && fight.largest > 0.5);
  assert.deepEqual(alcoves.map(named), []);
  // Nor does an alcove close itself with a side wall 4 cm in front of a boutique room's wall, or
  // end on the room's wall face; and fluted millwork 4 mm off a room's back wall stays in front.
  const rooms = fights.filter(fight => /^Mesh\|interior-.* facade:facade-(interior|floor)\||interior-fluted/.test(`${fight.a} ${fight.b}`));
  assert.deepEqual(rooms.map(named), []);
  // A feature panel's artwork lies 5 mm in front of its brass surround and still shows from afar.
  assert.deepEqual(fights.filter(fight => /retail-artwork/.test(`${fight.a} ${fight.b}`) && /interior-brass/.test(`${fight.a} ${fight.b}`)).map(named), []);
});
