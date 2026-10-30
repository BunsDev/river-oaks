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
  // A depth-only material clone must retain the authored metric UV and cladding patches.
  const massMaterials = new Set();
  group.traverse(object => { if (object.userData.districtBuilding) massMaterials.add(object.material); });
  for (const material of massMaterials) if (material.userData.depthAuditMetricUv) {
    const shader = { vertexShader: '#include <uv_vertex>', fragmentShader: 'void main() { #include <map_fragment> }' };
    material.onBeforeCompile(shader);
    assert.ok(shader.vertexShader.includes('vec2 roUv'), `${material.name}: metric UV patch survives the depth clone`);
    assert.ok(material.customProgramCacheKey().includes('river-oaks-metric-uv'), `${material.name}: authored program identity survives`);
    if (material.customProgramCacheKey().includes('reference-cladding')) assert.ok(shader.fragmentShader.includes('roCell'), `${material.name}: authored joints and colour survive`);
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
  assert.deepEqual(alcoves.filter(fight => fight.a !== fight.b).map(named), []);
  // The former audit skipped same-material faces. The appearance-aware audit also sees these
  // two pre-existing underside classes: unchanged 3d666a29 geometry measured <=219.062 m²
  // total overlap and <=2.763 m² per triangle pair. The spatial baseline bounds each location.
  const shared = alcoves.filter(fight => fight.a === fight.b);
  assert.deepEqual(shared.map(fight => `${fight.a} / ${fight.normal.join(',')}`).sort(), [
    'facade:facade-floor|facade-floor / 0,-1,0',
    'facade:facade-interior|facade-interior / 0,-1,0',
  ]);
  for (const fight of shared) assert.ok(fight.largest <= 2.763 && fight.overlap <= 219.062 && fight.gap < .0002, named(fight));
  // Nor does an alcove close itself with a side wall 4 cm in front of a boutique room's wall, or
  // end on the room's wall face; and fluted millwork 4 mm off a room's back wall stays in front.
  const rooms = fights.filter(fight => /^Mesh\|interior-.* facade:facade-(interior|floor)\||interior-fluted/.test(`${fight.a} ${fight.b}`));
  assert.deepEqual(rooms.map(named), []);
  // A feature panel's artwork lies 5 mm in front of its brass surround and still shows from afar.
  assert.deepEqual(fights.filter(fight => /retail-artwork/.test(`${fight.a} ${fight.b}`) && /interior-brass/.test(`${fight.a} ${fight.b}`)).map(named), []);
});
