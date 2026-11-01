import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { loadDistrictData } from '../../server/district-data.js';
import { assembleNeighborhood } from '../../shared/city-kit/assemble.js';
import { attachGardenCampus } from '../src/garden-campus-district.js';
import { buildGardenCampus } from '../src/garden-campus.js';
import { buildCityKit } from '../src/city-kit/render.js';
import { findDepthFights } from '../src/depth-layer-audit.js';

// The Pink Jet-Age finish adds surfaces (campus forms, kit capsule plates) that classic never
// draws. Each meeting of a new surface with a classic one is placed so the two never share a
// plane within sight (#836): the depth journey (preview/e2e/depth-layers.js) once found ten such
// pairs under pink that classic lacks. Same audit and model as the journey, on the same builders.
const PINK = 'pink-jet-age';
const scan = object => { const root = new THREE.Group(); root.add(object); root.updateMatrixWorld(true); return findDepthFights(root); };
// The journey's grouping key: the two surfaces and their gap.
const key = fight => `${fight.a} ~ ${fight.b} ~ ${fight.gap.toFixed(4)}`;
const named = fight => `${fight.a} × ${fight.b} ${Math.round(fight.gap * 1000)} mm facing [${fight.normal}] at ${fight.at.map(v => v.toFixed(1))}`;
const between = (fights, first, second) => fights.filter(fight => [fight.a, fight.b].every(side => side.includes(first) || side.includes(second)) && `${fight.a} ${fight.b}`.includes(first) && `${fight.a} ${fight.b}`.includes(second));

test('the campus jet-age forms meet slab, stone, timber and guard glass off their planes, and pink adds no pair classic lacks', async () => {
  const campus = attachGardenCampus(await loadDistrictData());
  const classic = buildGardenCampus(campus), pink = buildGardenCampus(campus, { kitFinish: PINK });
  const before = scan(classic), after = scan(pink);
  // One meeting per fixed pair, so a regression names the part that moved back.
  const meetings = [
    ['campus:core', 'campus:slab', 'the lift and stair shafts stop at the roof slab soffit under the rounded headhouse'],
    ['campus:jet-age:ivory', 'campus:slab', 'each bullnose stops inside the slab above it'],
    ['campus:jet-age:ivory', 'campus:stone', 'each bullnose stops inside the stone band below it'],
    ['campus:guard-glass', 'campus:jet-age:ivory', 'a terrace guard never rests on a bullnose cap'],
    ['campus:jet-age:chrome', 'campus:timber', 'each pilotis capital is buried in the pergola edge beam'],
    ['campus:jet-age:pink', 'campus:timber', 'the headhouse band is buried in the timber door head across the door bay'],
  ];
  for (const [first, second, why] of meetings) assert.deepEqual(between(after, first, second).map(named), [], why);
  assert.deepEqual(after.filter(fight => /jet-age/.test(`${fight.a} ${fight.b}`)).map(named), [], 'no jet-age surface fights for depth');
  const known = new Set(before.map(key));
  assert.deepEqual(after.filter(fight => !known.has(key(fight))).map(named), [], 'pink adds no pair that classic lacks');
  classic.userData.dispose(); pink.userData.dispose();
});

test('the kit capsule sign plates hold their depth in front of the fascia, and pink adds no pair classic lacks', () => {
  const recipe = JSON.parse(readFileSync(new URL('../../config/destinations/bayou-market-commons.json', import.meta.url)));
  const plan = assembleNeighborhood(recipe), build = finish => buildCityKit(plan, { groundAt: () => 0, ground: 0, finish });
  const classic = build('classic'), pink = build(PINK), before = scan(classic), after = scan(pink);
  // The plate (and its round ends) stand 2 cm in front of the fascia strip or wall band of the
  // sign band and share that strip's underside: pulled one layer forward, behind the lettering.
  for (const [first, second] of [['bronze-satin', 'trim-ivory'], ['limestone', 'trim-ivory']]) assert.deepEqual(between(after, first, second).map(named), [], `${first} / ${second}`);
  const plate = []; pink.traverse(item => { if (item.isMesh && item.material.name === 'city-kit/trim-ivory:plate') plate.push(item); });
  assert.ok(plate.length > 0, 'the capsule plates draw under pink');
  const signs = []; pink.traverse(item => { if (item.isMesh && item.material.name === 'city-kit/signs') signs.push(item.material); });
  for (const mesh of plate) {
    assert.ok(mesh.material.polygonOffset && mesh.material.polygonOffsetUnits < 0, `${mesh.name} is pulled forward`);
    for (const sign of signs) assert.ok(sign.polygonOffsetUnits < mesh.material.polygonOffsetUnits && sign.polygonOffsetFactor < mesh.material.polygonOffsetFactor, 'lettering stays ahead of its plate');
  }
  const classicPlates = []; classic.traverse(item => { if (item.isMesh && /trim-ivory:plate/.test(item.material.name)) classicPlates.push(item.name); });
  assert.deepEqual(classicPlates, [], 'classic draws no capsule plate');
  const known = new Set(before.map(key));
  assert.deepEqual(after.filter(fight => !known.has(key(fight))).map(named), [], 'pink adds no pair that classic lacks');
  classic.userData.dispose?.(); pink.userData.dispose?.();
});
