import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { BUDGET_HEADROOM, CONTRACT_PATH, FINISHES, HOURS, VENUE_IDS, VENUE_VIEWS, assertCompact, cameraOptions, classifyPinkHit, districtPath, drawCallBudget,
  fiveRoomsCameras, hsv, spawnCamera, imageVerdict, isPinkLit, judgeBudget, normalizeContract, pinkClusters, readContract, ribbonTraversal, scenePose, validateBudgetPin, validateCameraReport, validateCameras, viewName } from '../e2e/five-rooms-plan.mjs';

// A synthetic contract in the #838 v1 draft's shape: a 100 m spine north along x = 0, five rooms
// on the east side, each with a 7 m link segment from the spine to a west-facing door at x = 9.
// The last room is a threshold (no interior envelope), as the Studios + Overlook is at the Gardens.
const ROOM_Y = { 'venue:counter': 10, 'venue:atelier': 30, 'venue:starlight-screen': 50, 'venue:shade-garden': 70, 'venue:studios-overlook': 90 };
const synthetic = () => ({
  id: 'five-rooms', version: 'five-rooms-v1',
  venues: Object.entries(ROOM_Y).map(([id, y], i) => ({
    id, label: id.replace('venue:', ''), kind: i === 4 ? 'threshold' : 'bay', host: { buildingId: `osm-way-${i}` }, retire: { status: 'proposed', tenants: [] },
    footprint: [[9, y - 6], [21, y - 6], [21, y + 6], [9, y + 6]], floor: { height: 18.2, source: 'groundSurfaceHeight', at: [15, y] },
    entrances: [{ id: `entrance:${i}`, centre: [9, y], width: 2.4, side: 'west', outward: [-1, 0], link: `link:${i}` }],
    interior: i === 4 ? null : { floor: [[9.3, y - 5], [20, y - 5], [20, y + 5], [9.3, y + 5]], clearHeight: 3.2 },
    attachments: [{ id: `attach:${i}-seat`, role: 'seat-cluster', position: [14, y + 2, 18.2], yaw: 0 }, { id: `attach:${i}-sign`, role: 'sign', position: [9, y + 2, 21], yaw: 0 }],
    cameraCorridors: [],
  })),
  ribbon: {
    segments: [
      { id: 'spine', points: [[0, 0], [0, 100]], width: 2, clearHeight: 3.6, style: 'canopy', maxSpan: 6, status: 'clear' },
      ...Object.values(ROOM_Y).map((y, i) => ({ id: `link-${i}`, points: [[1, y], [8, y]], width: 1.8, clearHeight: 3.2, style: 'canopy', status: i === 2 ? 'blocked' : 'clear' })),
    ],
  },
  links: Object.keys(ROOM_Y).map((venue, i) => ({ id: `link:${i}`, venue, entrance: `entrance:${i}`, segment: `link-${i}`, side: 'right' })),
});
const world = { walkSpawn: [-5, -8, 18.18], walkLookAt: [-5, 27, 18.1], stores: [{ name: 'IPIC Theaters', facade: [9, 60, 18.3] }] };
const ground = (east, north) => 18 + north / 1000;

test('the contract reader accepts the #838 draft shape and orders the five rooms', () => {
  const contract = normalizeContract(synthetic());
  assert.deepEqual(contract.venues.map(venue => venue.id), [...VENUE_IDS]);
  assert.equal(contract.segments.length, 6);
  assert.deepEqual(contract.venues[0].entrances[0], { id: 'entrance:0', door: [9, 10], outward: [-1, 0], width: 2.4, link: 'link:0', segment: 'link-0' });
  assert.deepEqual(contract.venues[0].seats, [[14, 12]], 'only seat attachments become seats');
  assert.equal(contract.venues[4].interior, null, 'a threshold has no envelope');
});

test('the contract reader names the first missing or malformed element', () => {
  const cases = [
    [raw => raw.venues.pop(), /venue:studios-overlook is missing/],
    [raw => { raw.venues[1].entrances[0].link = 'link:nowhere'; }, /entrance entrance:1 link "link:nowhere" names no link back to it/],
    [raw => { raw.links[1].segment = 'gone'; }, /link link:1 segment "gone" names no segment/],
    [raw => { raw.ribbon.segments[0].id = 'main'; }, /segment spine is required/],
    [raw => { raw.venues[2].entrances[0].width = 0.5; }, /entrance entrance:2 is narrower than 0.8 m/],
    [raw => { raw.venues[2].entrances[0].outward = [2, 0]; }, /entrance entrance:2 needs a centre and a unit outward/],
    [raw => { raw.venues[3].interior.clearHeight = 2; }, /venue venue:shade-garden interior floor polygon and clearHeight/],
    [raw => { raw.venues[3].interior = null; }, /venue venue:shade-garden interior is required for a bay/],
    [raw => { raw.venues[4].footprint = [[0, 0], [1, 1]]; }, /venue venue:studios-overlook footprint needs three or more/],
    [raw => { delete raw.venues[0].host; }, /venue venue:counter host.buildingId/],
    [raw => { delete raw.links; }, /links is required/],
    [raw => { delete raw.version; }, /version is required/],
  ];
  for (const [mutate, expected] of cases) { const raw = synthetic(); mutate(raw); assert.throws(() => normalizeContract(raw), expected); }
});

test('readContract reports a head without the contract instead of guessing, and reads a valid one', async () => {
  const empty = await mkdtemp(join(tmpdir(), 'five-rooms-empty-'));
  const missing = await readContract(pathToFileURL(`${empty}/`));
  assert.equal(missing.contract, null);
  assert.match(missing.reason, /does not exist on this head \(#838/);
  const filled = await mkdtemp(join(tmpdir(), 'five-rooms-filled-'));
  await mkdir(join(filled, 'config/ribbon'), { recursive: true });
  await writeFile(join(filled, CONTRACT_PATH), JSON.stringify(synthetic()));
  const read = await readContract(pathToFileURL(`${filled}/`));
  assert.equal(read.reason, null);
  assert.equal(read.contract.venues.length, 5);
  await writeFile(join(filled, CONTRACT_PATH), JSON.stringify({ version: 'five-rooms-v1', venues: [], ribbon: { segments: [] }, links: [] }));
  assert.match((await readContract(pathToFileURL(`${filled}/`))).reason, /ribbon.segments is required/);
});

test('the traversal walks the spine end to end, then each link segment to a stop 1.2 m outside its door, facing in', () => {
  const { spine, stops } = ribbonTraversal(normalizeContract(synthetic()));
  assert.deepEqual(spine, [[0, 0], [0, 100]]);
  assert.equal(stops.length, 5);
  for (const [i, stop] of stops.entries()) {
    const y = ROOM_Y[stop.venue];
    assert.equal(stop.venue, VENUE_IDS[i]);
    assert.deepEqual(stop.approach[0], [1, y], `${stop.venue} approaches from the Ribbon end of its link`);
    assert.deepEqual(stop.approach.at(-1).map(v => +v.toFixed(3)), [7.8, y], `${stop.venue} stands 1.2 m outside the door`);
    assert.deepEqual(stop.face.map(v => +v.toFixed(3)), [11, y]);
    assert.deepEqual(stop.inward, [1, -0]);
  }
  assert.equal(stops[2].status, 'blocked', 'a blocked link is still walked, and its status reported');
  // A link drawn from the door toward the spine is walked the same way.
  const reversed = synthetic(); reversed.ribbon.segments[1].points.reverse();
  assert.deepEqual(ribbonTraversal(normalizeContract(reversed)).stops[0].approach[0], [1, 10]);
  // An entrance on the spine itself needs no link walk.
  const onSpine = synthetic(); onSpine.links[0].segment = 'spine';
  assert.deepEqual(ribbonTraversal(normalizeContract(onSpine)).stops[0].approach.map(p => p.map(v => +v.toFixed(3))), [[7.8, 10]]);
  const seatless = synthetic(); seatless.venues[1].attachments = [];
  assert.deepEqual(fiveRoomsCameras(normalizeContract(seatless), { ground }).find(item => item.id === 'v09-atelier-seated').source.position.slice(0, 2), [13, 30], 'without a seat the seated view is 4 m inside the door');
  const street = fiveRoomsCameras(normalizeContract(onSpine), { ground }).find(item => item.id === 'v01-counter-street');
  assert.deepEqual(street.source.position.slice(0, 2).map(v => +v.toFixed(3)), [3, 10], 'a spine entrance\'s street view stands 6 m out from the door');
});

test('every venue gets the five matched views and the route gets five, at eye, seated or aerial height over the ground given', () => {
  const cameras = fiveRoomsCameras(normalizeContract(synthetic()), { ground, world });
  assert.equal(cameras.length, 30);
  assert.deepEqual(cameras.map(item => item.id), [...cameras.map(item => item.id)].sort());
  for (const venue of VENUE_IDS) assert.deepEqual(cameras.filter(item => item.venue === venue).map(item => item.stop), [...VENUE_VIEWS], venue);
  const entrance = cameras.find(item => item.id === 'v02-counter-entrance'), [east, north, altitude] = entrance.source.position;
  assert.deepEqual([east, north].map(v => +v.toFixed(3)), [7.8, 10]);
  assert.equal(+(altitude - ground(east, north)).toFixed(3), 1.68);
  const seated = cameras.find(item => item.id === 'v04-counter-seated');
  assert.deepEqual(seated.source.position.slice(0, 2), [14, 12], 'the seated view uses the seat attachment');
  const thresholdIndoor = cameras.find(item => item.id === 'v23-studios-overlook-indoor');
  assert.deepEqual(thresholdIndoor.source.position.slice(0, 2), [12, 90], 'a threshold\'s indoor view stands 3 m in from its opening');
  assert.equal(+(seated.source.position[2] - ground(14, 12)).toFixed(3), 1.2);
  assert.ok(cameras.find(item => item.id === 'v05-counter-aerial').source.position[2] - ground(15, 10) >= 25);
  const arrival = cameras.find(item => item.id === 'r01-arrival');
  assert.deepEqual(arrival.source.position.slice(0, 2), [-5, -8], 'the arrival view stands at walkSpawn');
  assert.deepEqual(arrival.source.target.slice(0, 2), [-5, 27], 'and looks toward walkLookAt');
  assert.deepEqual(spawnCamera(world, ground), arrival, 'the spawn frame needs no contract (the main baseline)');
  const ipic = cameras.find(item => item.id === 'r03-spine-ipic');
  assert.deepEqual(ipic.source.position.slice(0, 2).map(v => +v.toFixed(3)), [0, 54], 'the IPIC view stands on the spine 6 m before the facade station');
  assert.equal(fiveRoomsCameras(normalizeContract(synthetic())).find(item => item.id === 'r03-spine-ipic').subject.includes('midpoint'), true, 'without a world the IPIC view falls back to the spine midpoint');
});

test('scene poses map source metres into Three.js [east, up, -north], and the table rejects malformed entries', () => {
  const cameras = fiveRoomsCameras(normalizeContract(synthetic()), { ground });
  const pose = scenePose(cameras[0]), [east, north, up] = cameras[0].source.position;
  assert.deepEqual(pose.position, [east, up, -north]);
  assert.equal(pose.fov, cameras[0].fov);
  const good = cameras.find(item => item.group === 'venue');
  for (const bad of [{ ...good, id: 'x01-bad' }, { ...good, group: 'route' }, { ...good, stop: 'roof' }, { ...good, venue: 'venue:bar' }, { ...good, fov: 120 }, { ...good, subject: '' },
    { ...good, source: { position: [1, 2, NaN], target: [5, 5, 5] } }, { ...good, source: { position: [1, 1, 1], target: [1, 1, 2] } }])
    assert.throws(() => validateCameras([bad]), Error, JSON.stringify(bad));
  assert.throws(() => validateCameras([good, good]), /duplicate/);
  assert.equal(viewName(good, 'night', 'pink-jet-age'), `${good.id}-night-pink-jet-age`);
});

test('the draw-call budget is the headroom over a measured classic baseline, and a pin must say what it measured', () => {
  assert.equal(drawCallBudget(1000), 1150);
  assert.equal(drawCallBudget(1325, 0.1), 1458);
  assert.throws(() => drawCallBudget(0), /measured baseline/);
  const pin = { measuredAt: '2026-11-01T00:00:00Z', head: 'abc', camera: 'r01-arrival', graphics: 'sharp', viewport: [1280, 800], headroom: BUDGET_HEADROOM, baseline: { classicCalls: 1200, pinkCalls: 1230 }, budgetCalls: 1380 };
  assert.equal(validateBudgetPin(pin), pin);
  assert.throws(() => validateBudgetPin({ ...pin, budgetCalls: 1400 }), /must equal the headroom/);
  assert.throws(() => validateBudgetPin({ ...pin, baseline: { classicCalls: 1200 } }), /pinkCalls/);
  assert.throws(() => validateBudgetPin({ ...pin, viewport: null }), /viewport/);
  assert.deepEqual(judgeBudget(pin, 1300), { within: true, delta: 100, budgetCalls: 1380, measuredCalls: 1300 });
  assert.equal(judgeBudget(pin, 1381).within, false);
});

test('lit pink is a pink hue well above the night ambient; the picked object decides the rule', () => {
  assert.equal(Math.round(hsv([255, 0, 0]).h), 0);
  assert.equal(Math.round(hsv([255, 64, 200]).h), 317);
  assert.equal(isPinkLit([255, 64, 200]), true, 'saturated lit pink');
  assert.equal(isPinkLit([60, 20, 50]), false, 'pink hue in the dark is not pink light');
  assert.equal(isPinkLit([240, 240, 240]), false, 'white');
  assert.equal(isPinkLit([255, 40, 40]), false, 'red');
  assert.equal(isPinkLit([255, 180, 220]), false, 'pale pink below the saturation floor');
  assert.equal(classifyPinkHit({ object: 'Ribbon seat 3', path: 'Ribbon < District', material: 'ribbon-seat' }).verdict, 'usable');
  assert.equal(classifyPinkHit({ object: 'Marquee', path: 'IPIC Theaters < Buildings', material: 'marquee-neon' }).verdict, 'landmark');
  assert.equal(classifyPinkHit({ object: 'Lantern', path: 'Overlook < Studios', material: 'glass' }).verdict, 'landmark');
  assert.equal(classifyPinkHit({ object: 'Lantern', path: 'Bayou Lantern tower < Commons', material: 'glass' }).verdict, 'violation', 'only the Overlook lantern is a landmark');
  assert.equal(classifyPinkHit({ object: 'Mesh', path: 'Counter fascia', material: 'fascia-pink' }).verdict, 'violation');
  assert.equal(classifyPinkHit(null).verdict, 'unresolved');
});

test('pink clusters are connected lit-pink pixels of at least the minimum size, largest first', () => {
  const width = 10, height = 8, pixels = new Uint8ClampedArray(width * height * 4);
  const paint = (x, y, rgb) => pixels.set([...rgb, 255], (y * width + x) * 4);
  for (let y = 1; y <= 3; y++) for (let x = 2; x <= 4; x++) paint(x, y, [255, 64, 200]);
  for (let x = 6; x <= 7; x++) for (let y = 5; y <= 7; y++) paint(x, y, [250, 80, 190]);
  paint(9, 0, [255, 64, 200]);
  const clusters = pinkClusters(pixels, width, height);
  assert.deepEqual(clusters.map(cluster => cluster.pixels), [9, 6]);
  assert.deepEqual(clusters[0].bbox, [2, 1, 4, 3]);
  assert.deepEqual(clusters[0].centroid, [3, 2]);
  assert.equal(pinkClusters(pixels, width, height, { minPixels: 1 }).length, 3);
});

test('options pin finishes, hours and graphics, refuse unknown values and never default to output/playwright', () => {
  const defaults = cameraOptions([], new Date('2026-11-01T12:00:00Z'));
  assert.deepEqual(defaults.finishes, [...FINISHES]);
  assert.deepEqual(defaults.hours, Object.keys(HOURS));
  assert.equal(defaults.graphics, 'sharp');
  assert.equal(defaults.out, '.runtime/five-rooms/2026-11-01T12-00-00-000Z');
  const chosen = cameraOptions(['--finishes=classic', '--hours=night', '--cameras=r01-arrival,v02-counter-entrance', '--graphics=smooth', '--revision=east-garden-commons-market-1', '--out=.runtime/x', '--pin=baseline']);
  assert.deepEqual(chosen, { finishes: ['classic'], hours: ['night'], cameras: ['r01-arrival', 'v02-counter-entrance'], graphics: 'smooth', revision: 'east-garden-commons-market-1', out: '.runtime/x', pin: 'baseline' });
  for (const bad of [['--finishes=neon'], ['--hours=dusk'], ['--graphics=ultra'], ['--pin=yes'], ['--out=a', '--out=b'], ['--nope=1']]) assert.throws(() => cameraOptions(bad), Error, bad.join(' '));
  assert.equal(districtPath('classic'), '/?render-audit=1&finish=classic');
  assert.equal(districtPath('pink-jet-age', { hour: 19 }), '/?render-audit=1&finish=pink-jet-age&time=19');
  assert.throws(() => districtPath('neon'), /Unknown finish/);
});

test('a camera report holds one measured, non-blank view per camera, hour and finish, with a pink review at night', () => {
  const cameras = fiveRoomsCameras(normalizeContract(synthetic()), { ground }).slice(0, 2), hours = { noon: 12, night: 19 }, finishes = ['classic', 'pink-jet-age'];
  const views = [];
  for (const item of cameras) for (const [label, hour] of Object.entries(hours)) for (const finish of finishes)
    views.push({ name: viewName(item, label, finish), camera: item.id, hour, finish, calls: 1200, triangles: 3e6, frameP50: 16.7, frameP95: 20, png: `${viewName(item, label, finish)}.png`, image: { mean: 80, spread: 40, verdict: 'ok' }, ...(label === 'night' ? { pink: { clusters: [] } } : {}) });
  const report = { status: 'passed', head: 'abc', graphics: 'sharp', contractVersion: 1, cameras, hours, finishes, views };
  assert.equal(validateCameraReport(report), report);
  assert.throws(() => validateCameraReport({ ...report, views: views.slice(1) }), /missing view/);
  assert.throws(() => validateCameraReport({ ...report, views: views.map(view => ({ ...view, image: { mean: 2, spread: 1, verdict: imageVerdict({ mean: 2, spread: 1 }) } })) }), /image blank/);
  assert.throws(() => validateCameraReport({ ...report, views: views.map(view => (view.hour === 19 ? { ...view, pink: undefined } : view)) }), /pink review/);
  assert.throws(() => validateCameraReport({ ...report, views: [...views, views[0]] }), /exactly cameras x hours x finishes/);
  assert.throws(() => validateCameraReport({ ...report, contractVersion: null }), /contractVersion/);
});

test('receipts stay compact: a 16-hex plan hash passes, a raw sha256 or a per-file digest map does not', () => {
  const receipt = { finish: { ribbon: { hash: 'feba870d6c9cebe7', stats: { modules: 34 } } }, venues: [{ venue: 'venue:counter', stand: [-2750.1, -1240.2] }] };
  assert.equal(assertCompact(receipt), receipt);
  assert.throws(() => assertCompact({ sourceSha256: { 'preview/src/main.js': 'a'.repeat(64) } }), /raw digest/);
  const map = Object.fromEntries(Array.from({ length: 70 }, (_, i) => [`preview/src/file-${i}.js`, `h${i}`]));
  assert.throws(() => assertCompact({ map }), /per-file map/);
});
