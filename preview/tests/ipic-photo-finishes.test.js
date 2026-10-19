// The runtime-vs-photo fixes Val chose on 2026-10-15 (docs/ipic-review/photo-review.md P5, P7, P9,
// P12, P17): finishes and the reception view, checked against the built meshes (no textures) and
// the pure layout and palette data the textures are painted from.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { createWalkingEnvironment } from '../src/walking.js';
import { AVATAR_ENVELOPE } from '../src/workplace-room.js';
import { buildIpicInterior } from '../src/ipic-interior.js';
import { IPIC_AUDITORIUM_RISERS, IPIC_AUDITORIUM_ROWS, IPIC_AUDITORIUM_SEAT_D, IPIC_CAMERAS, IPIC_SCREEN, IPIC_WING, RISER_RAMP, ipicFloor } from '../src/ipic-plan.js';
import { IPIC_LOUNGE_CARPET, districtSignLayout } from '../src/ipic-materials.js';

const world = JSON.parse(readFileSync(new URL('../public/data/district.json', import.meta.url)));
const environment = createWalkingEnvironment(world);
const room = environment.rooms.find(r => r.interior === 'ipic-photo-v1');
const group = buildIpicInterior(room, { textures: false, local: true });
group.updateMatrixWorld(true);
const meshes = []; group.traverse(item => { if (item.isMesh && !item.isInstancedMesh) meshes.push(item); });
// The first surface met looking straight down from 1.5 m above the floor at [a, d].
const below = (a, d) => {
  const ray = new THREE.Raycaster(new THREE.Vector3(a, ipicFloor(d, a) + 1.5, -d), new THREE.Vector3(0, -1, 0));
  return ray.intersectObjects(meshes, false)[0]?.object.name ?? null;
};

test('P9: the lounge coffee table has a radial sunburst timber top', () => {
  const table = room.fixtures.find(f => f.kind === 'ipic-coffee-table');
  assert.equal(below(table.a, table.d), 'Upper lounge: ipic-sunburst-timber');
});

test('P12: the Tuck Room stands on timber; the lounge keeps its carpet', () => {
  for (const [a, d] of [[3, 21], [3, 24.6], [5.3, 20.4]]) assert.equal(below(a, d), 'Tuck Room: ipic-bar-floor-timber', `${a},${d}`);
  for (const [a, d] of [[-1, 21.5], [-4.9, 25.4], [1.8, 22]]) assert.equal(below(a, d), 'Upper lounge: ipic-red-swirl-carpet', `${a},${d}`);
});

// Reversed 2026-10-18: #469 darkened this carpet after IMG_9758 alone, which is underexposed. IMG_9753,
// IMG_9754 and IMG_9755 show a bold red ground with a dark swirl; the palette follows them now.
test('P12: the lounge carpet is a bold red with a dark swirl, as in IMG_9753-9755', () => {
  const sat = ([r, g, b]) => (Math.max(r, g, b) - Math.min(r, g, b)) / Math.max(r, g, b);
  const { base, pattern } = IPIC_LOUNGE_CARPET;
  assert.ok(sat(base) > .6 && base[0] > 2 * base[1] && base[0] > 120, `red ground ${base}`);
  assert.ok(Math.max(...pattern) < base[0] * .6, `dark swirl ${pattern} on ${base}`);
});

test('P17: the auditorium floor is a dark confetti carpet, aisles and rows alike', () => {
  // The foyer behind the back row, the west aisle, between rows and in front of the front row.
  for (const [a, d] of [[-4.85, 29.4], [-1.6, 29.4], [4.6, 32.4], [-12, 26.7], [-8.3, 29], [-15.5, 30]]) assert.equal(below(a, d), 'Auditorium: ipic-confetti-carpet', `${a},${d}`);
});

test('P5: the reception sign stacks RIVER OAKS small beside a large DISTRICT', () => {
  const runs = districtSignLayout(1024, 256), [river, oaks, district] = ['RIVER', 'OAKS', 'DISTRICT'].map(t => runs.find(r => r.text === t));
  assert.ok(river && oaks && district, JSON.stringify(runs));
  assert.ok(district.size >= 2 * river.size && river.size === oaks.size, 'DISTRICT is at least twice the stacked words');
  assert.ok(river.y < oaks.y && Math.abs(river.x - oaks.x) < 1 && district.x > river.x, 'RIVER over OAKS, left of DISTRICT');
});

test('P7: the reception review camera faces the desk from its front, as IMG_9738 does', () => {
  const camera = IPIC_CAMERAS.find(c => c.name === 'reception');
  const desk = { a: 3.4, d: 3.5 }, [ea, , ed] = camera.eye, [ta, , td] = camera.target;
  assert.ok(ed < desk.d - 1.5, `eye ${camera.eye} is in front of the desk`);
  // The view direction passes within half a metre of the desk centre.
  const da = ta - ea, dd = td - ed, t = ((desk.a - ea) * da + (desk.d - ed) * dd) / (da * da + dd * dd);
  assert.ok(t > 0 && Math.hypot(ea + t * da - desk.a, ed + t * dd - desk.d) < .5, `view ${camera.eye} -> ${camera.target}`);
});

// Reception against IMG_9738 (photo review P3, P4, P6; Val chose these on 2026-10-18).
const hitFrom = (from, direction) => new THREE.Raycaster(new THREE.Vector3(...from), new THREE.Vector3(...direction).normalize()).intersectObjects(meshes, false)[0] ?? null;
const at = (a, h, d) => [a, h, -d];

test('P3: the reception desk steps down to a lower counter at its west end, within its footprint', () => {
  const top = (a, d) => hitFrom(at(a, 2, d), [0, -1, 0]);
  const east = top(4.6, 3.5), west = top(2.1, 3.5);
  assert.equal(east?.object.name, 'Reception: ipic-veined-marble');
  assert.equal(west?.object.name, 'Reception: ipic-veined-marble');
  assert.ok(east.point.y > 1 && west.point.y < .85 && west.point.y > .65, `east ${east.point.y.toFixed(2)}, west ${west.point.y.toFixed(2)}`);
});

test('P4: close light-oak flutes back the desk, lit by a cove, and stop short of the right escalator lane', () => {
  assert.equal(hitFrom(at(3.4, 2.9, 4.5), [0, 0, -1])?.object.name, 'Reception: ipic-light-oak');
  const oak = meshes.filter(m => m.name === 'Reception: ipic-light-oak');
  const box = new THREE.Box3(); for (const m of oak) box.expandByObject(m);
  assert.ok(box.min.x >= 2.35, `flutes start at a = ${box.min.x.toFixed(2)}; the right lane runs to 2.255`);
  assert.ok(hitFrom(at(3.4, 3.2, 5), [0, 1, 0])?.object.name === 'Reception: ipic-warm-lamp' || meshes.some(m => m.name === 'Reception: ipic-warm-lamp'), 'a lit cove or pendant');
});

test('P6: the reception floor is warm stone with quiet joints, under a coffered ceiling and a low linear pendant', () => {
  assert.equal(below(-.5, 1), 'Reception: ipic-reception-stone');
  const centre = hitFrom(at(-.5, 2, 3), [0, 1, 0]), edge = hitFrom(at(room.aMin + .3, 2, 3), [0, 1, 0]);
  assert.ok(centre && edge && centre.point.y - edge.point.y > .15, `ceiling centre ${centre?.point.y.toFixed(2)}, edge ${edge?.point.y.toFixed(2)}`);
  const lamp = hitFrom(at(3.4, 1.4, 3.5), [0, 1, 0]);
  assert.equal(lamp?.object.name, 'Reception: ipic-warm-lamp');
  assert.ok(lamp.point.y < 3.05, `pendant at ${lamp.point.y.toFixed(2)} m`);
});

// Lounge against IMG_9752-9758 (photo review P8, P10, P11; Val, 2026-10-18).
test('P11: the sofa backs onto the west guardrail over the escalators and faces into the lounge', () => {
  const sofa = room.ipicSeats.filter(s => s.key === 'lounge-sofa');
  assert.equal(sofa.length, 2);
  for (const seat of sofa) assert.ok(seat.d < 21.5 && seat.a < -2.8 && Math.abs(seat.yaw) < 1e-9, `${seat.slot}: ${seat.a}, ${seat.d}, yaw ${seat.yaw}`);
  const table = room.fixtures.find(f => f.kind === 'ipic-coffee-table'), chairs = room.fixtures.filter(f => f.kind === 'ipic-tub-chair');
  assert.ok(table.d > sofa[0].d + 1 && chairs.length === 2 && chairs.every(c => c.d > table.d), 'table in front of the sofa, chairs across it');
  // From the guardrail side the sofa's back is what you meet.
  assert.equal(hitFrom(at(-4.5, 6.6, 20.1), [0, 0, -1])?.object.name, 'Upper lounge: ipic-olive-brown-sofa');
});

test('P10: the tub chairs are round leather barrels', () => {
  for (const chair of room.fixtures.filter(f => f.kind === 'ipic-tub-chair')) {
    let hits = 0;
    for (let k = 0; k < 12; k++) { const t = k * Math.PI / 6; if (hitFrom(at(chair.a, 6.7, chair.d), [Math.cos(t), 0, Math.sin(t)])?.object.name === 'Upper lounge: ipic-cognac-leather') hits++; }
    assert.ok(hits >= 8, `${chair.a},${chair.d}: the shell wraps ${hits} of 12 directions`);
    // It opens towards the sofa: looking from the cushion at the sofa meets no shell.
    const sofa = room.ipicSeats.find(t => t.key === 'lounge-sofa'), toSofa = hitFrom(at(chair.a, 6.7, chair.d), [sofa.a - chair.a + .425, 0, -(sofa.d - chair.d)]);
    assert.notEqual(toSofa && toSofa.distance < .5 ? toSofa.object.name : null, 'Upper lounge: ipic-cognac-leather', `${chair.a},${chair.d} faces away from the sofa`);
    const seat = hitFrom(at(chair.a, 7.5, chair.d), [0, -1, 0]);
    assert.ok(seat?.object.name === 'Upper lounge: ipic-cognac-leather' && seat.point.y > 6.35 && seat.point.y < 6.65, `seat ${seat?.point.y}`);
  }
});

test('P8: the lounge pendants are closed woven cocoons', () => {
  for (const [a, d, y] of [[-4.5, 21.9, 8.8], [-1.4, 24, 8.85]]) {
    let hits = 0, rays = 0;
    for (const dy of [-.25, 0, .25]) for (let k = 0; k < 8; k++) { const t = k * Math.PI / 4; rays++; const hit = hitFrom(at(a, y + dy, d), [Math.cos(t), 0, Math.sin(t)]); if (hit && hit.distance < .5 && hit.object.name === 'Upper lounge: ipic-woven-rattan') hits++; }
    assert.ok(hits / rays >= .75, `${a},${d}: the weave closes ${hits} of ${rays} sight lines`);
  }
});

// Tuck Room against IMG_9756 and IMG_9757 (photo review P13, P14; Val, 2026-10-18).
const fixture = kind => room.fixtures.find(f => f.kind === kind);
const over = (f, a, d, margin = 0) => Math.abs(a - f.a) <= f.w / 2 + margin && Math.abs(d - f.d) <= f.l / 2 + margin;

test('P13: the bar is an island, ringed by its counter, with room to walk behind it', () => {
  const bar = fixture('ipic-bar'), back = fixture('ipic-bar-shelves');
  const behind = bar.a + bar.w / 2, wall = back.a - back.w / 2;
  assert.ok(wall - behind >= .75, `the aisle behind the island is ${(wall - behind).toFixed(2)} m`);
  // From that aisle the island's back is counter, not wall.
  assert.match(hitFrom(at((behind + wall) / 2, 6.6, bar.d), [-1, 0, 0])?.object.name ?? '', /^Tuck Room: ipic-(weathered-timber|veined-marble)$/);
  // The counter top rings a lower service well.
  const well = hitFrom(at(bar.a, 7.3, bar.d), [0, -1, 0]), rim = hitFrom(at(bar.a - bar.w / 2 + .15, 7.3, bar.d), [0, -1, 0]);
  assert.equal(rim?.object.name, 'Tuck Room: ipic-veined-marble');
  assert.ok(well && well.point.y < rim.point.y - .1, `well ${well?.point.y} under rim ${rim?.point.y}`);
});

test('P13: a black steel rack hangs over the island, glassware below it and plants on it', () => {
  const bar = fixture('ipic-bar'), seen = new Map();
  for (let a = bar.a - bar.w / 2 + .05; a < bar.a + bar.w / 2; a += .05) for (let d = bar.d - bar.l / 2 + .05; d < bar.d + bar.l / 2; d += .05) {
    const hit = hitFrom(at(a, 7.3, d), [0, 1, 0]);
    if (hit) seen.set(hit.object.name, Math.min(seen.get(hit.object.name) ?? Infinity, hit.point.y));
  }
  for (const name of ['Tuck Room: ipic-stemware', 'Tuck Room: ipic-black-steel']) assert.ok(seen.get(name) < 9.2, `${name}: ${seen.get(name)} (${[...seen.keys()]})`);
  // Plants sit on the rack: looking down onto it from under the beams meets greenery.
  let planted = 0;
  for (let d = bar.d - bar.l / 2 + .2; d < bar.d + bar.l / 2; d += .2) if (/Tuck Room: ipic-(pothos|hanging-greenery)/.test(hitFrom(at(bar.a, 9.5, d), [0, -1, 0])?.object.name ?? '')) planted++;
  assert.ok(planted >= 6, `${planted} plants seen on the rack`);
});

test('P14: dense pothos trails from timber beams, all of it above the tallest accepted body', () => {
  const bar = fixture('ipic-bar');
  let leafy = 0, rays = 0;
  for (let a = 2.9; a <= 6.1; a += .2) for (let d = 20.3; d <= 25.3; d += .25) {
    if (over(bar, a, d, .3)) continue;
    rays++;
    if (hitFrom(at(a, 8.2, d), [0, 1, 0])?.object.name === 'Tuck Room: ipic-pothos') leafy++;
  }
  assert.ok(leafy / rays >= .4, `pothos covers ${leafy} of ${rays} upward views`);
  const pothos = meshes.find(item => item.name === 'Tuck Room: ipic-pothos'), v = new THREE.Vector3();
  const position = pothos.geometry.attributes.position;
  let lowest = Infinity;
  for (let i = 0; i < position.count; i++) {
    v.fromBufferAttribute(position, i).applyMatrix4(pothos.matrixWorld);
    if (!over(bar, v.x, -v.z)) lowest = Math.min(lowest, v.y);
  }
  assert.ok(lowest >= 6 + AVATAR_ENVELOPE.height, `the lowest leaf over walkable floor is at ${lowest.toFixed(2)}`);
});

// The auditorium wing (Val, 2026-10-19), which replaced the photographed house (IMG_9767, P15, P16): it runs
// along the building and faces the screen on its north wall, sized from viewing guidance (ipic-plan.js).
const recliner = key => room.ipicSeats.find(s => s.key === key);
const free = (a, d) => { const [x, n] = room.toWorld(a, d); return environment.isFree(x, -n); };

test('the rows step down toward the screen on the computed rake, with no jump underfoot in the aisles', () => {
  // The back row is level with the doorway; every recliner's cushion is drawn on its own row's floor.
  assert.equal(IPIC_AUDITORIUM_ROWS[0].floor, 0);
  assert.equal(ipicFloor(26.5, -4.7), 6, 'the doorway meets the back row\'s level');
  const cushion = s => hitFrom(at(s.a, 9, s.d), [0, -1, 0]);
  IPIC_AUDITORIUM_ROWS.forEach((row, r) => {
    const seat = recliner(`recliner-${r}-1`);
    assert.equal(cushion(seat)?.object.name, 'Auditorium: ipic-cognac-leather');
    assert.ok(Math.abs(cushion(seat).point.y - cushion(recliner('recliner-0-1')).point.y - row.floor) < .02, `row ${r}: ${cushion(seat).point.y}`);
  });
  // The aisles ramp across each riser: never more than 6 mm in a centimetre.
  for (const d of [26.7, 33.2]) for (let a = IPIC_WING.aMin + .2; a < IPIC_WING.aMax - .2; a += .01)
    assert.ok(Math.abs(ipicFloor(d, a + .01) - ipicFloor(d, a)) <= .006, `the aisle at d ${d} jumps at a ${a.toFixed(2)}`);
});

test('both aisles step down with lit nosings, open past every riser; across the seats a riser wall closes the drop', () => {
  for (const d of [26.7, 33.2]) for (const riser of IPIC_AUDITORIUM_RISERS) {
    let lit = 0;
    for (let a = riser.a - RISER_RAMP; a < riser.a + RISER_RAMP; a += .01) if (hitFrom(at(a, 9, d), [0, -1, 0])?.object.name === 'Auditorium: ipic-warm-lamp') lit++;
    assert.ok(lit >= 2, `${lit} lit nosing samples on the riser at ${riser.a} in the aisle at d ${d}`);
    assert.ok(free(riser.a, d), `the aisle at d ${d} is open over the riser at ${riser.a}`);
  }
  // Nowhere across the seats, recliners or the gaps between them, can a body step off a riser.
  for (const riser of IPIC_AUDITORIUM_RISERS) for (let d = IPIC_AUDITORIUM_SEAT_D[0] - .5; d <= IPIC_AUDITORIUM_SEAT_D.at(-1) + .5; d += .25)
    assert.equal(free(riser.a, d), false, `a body can step off the riser at ${riser.a},${d}`);
});

test('the screen fills the north wall within its masking, below the ceiling and clear of the front floor', () => {
  const inner = IPIC_WING.d1 - IPIC_WING.d0 - .36, left = IPIC_SCREEN.d - IPIC_SCREEN.width / 2, right = IPIC_SCREEN.d + IPIC_SCREEN.width / 2;
  const front = 6 + IPIC_AUDITORIUM_ROWS.at(-1).floor, bottom = 6 + IPIC_SCREEN.y - IPIC_SCREEN.height / 2, top = 6 + IPIC_SCREEN.y + IPIC_SCREEN.height / 2;
  assert.ok(IPIC_SCREEN.width >= .9 * inner, `the screen is ${IPIC_SCREEN.width} m of a ${inner.toFixed(2)} m wall`);
  assert.ok(left > IPIC_WING.d0 + .18 && right < IPIC_WING.d1 - .18, `${left}..${right} inside the walls`);
  assert.ok(top <= 10.4 - .1 && bottom - front >= 1.5, `screen ${bottom}..${top} over a front floor at ${front}`);
  // From the front row's middle seated eye every corner of it is screen.
  const seat = recliner(`recliner-${IPIC_AUDITORIUM_ROWS.length - 1}-1`), eye = at(seat.a, ipicFloor(seat.d, seat.a) + seat.height + .69, seat.d);
  for (const [d, y] of [[left + .1, bottom + .1], [right - .1, bottom + .1], [left + .1, top - .1], [right - .1, top - .1]]) {
    const target = at(IPIC_SCREEN.a, y, d), hit = hitFrom(eye, target.map((v, i) => v - eye[i]));
    assert.equal(hit?.object.name, 'Auditorium: ipic-cinema-screen', `corner ${d},${y}`);
  }
});

