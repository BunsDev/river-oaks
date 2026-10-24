import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import * as THREE from 'three';

// #637: the walking payload handed to foot placement, for the local player and
// for peers. Peers use the actual interpolation in remote-players.js; only the
// avatar asset is replaced, so every frame's locomotion input can be inspected.
function load(url, context, nextLoad) {
  if (url.endsWith('/avatars.js')) return { format: 'module', shortCircuit: true, source: `
    import * as THREE from 'three';
    export const AVATAR_PROFILES=['sable-human','man-casual','woman-tailored','man-tailored','lyra-human','man-workwear'];
    export async function loadResidentAvatar() {
      const object = new THREE.Group(); object.userData.frames = [];
      return { object, rig:{hipHeight:.9,source:{height:1.7},model:new THREE.Group()}, update(_now, action, _speaking, motion) { object.userData.frames.push({...motion,platform:motion.platform&&[...motion.platform],action}); }, suspend() {}, dispose() {} };
    }` };
  if (url.endsWith('/player-costume.js')) return { format: 'module', shortCircuit: true, source: 'export function createPlayerCostume() { return { update() {}, dispose() {} }; }' };
  if (url.endsWith('/flight-vehicles.js')) return { format: 'module', shortCircuit: true, source: "import * as THREE from 'three'; export function createFlightVehicle() { return { object: new THREE.Group(), dispose() {} }; }" };
  return nextLoad(url, context);
}
register(new URL(`data:text/javascript,${encodeURIComponent(`export ${load.toString()}`)}`));
const { createRemotePlayers } = await import('../src/remote-players.js');
const { JEVICA_OWNER_USER_IDS } = await import('../src/shared-appearances.js');
const { WALK_SPEED } = await import('../src/walking.js');
const JEVICA = JEVICA_OWNER_USER_IDS[0];

class Element {
  style = {}; dataset = {}; clientWidth = 800; clientHeight = 600;
  getBoundingClientRect() { return { width: 110, height: 26 }; }
  setAttribute() {} append() {} remove() {}
}
const withDocument = async run => {
  const previous = globalThis.document; globalThis.document = { createElement: () => new Element() };
  try { return await run(); } finally { globalThis.document = previous; }
};
// Deterministic jitter for the sender and broadcast clocks.
const random = seed => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const wrap = angle => Math.atan2(Math.sin(angle), Math.cos(angle));

// One peer seen by this client. `path(t)` is the peer's true pose in town
// coordinates ([x, north, elevation]); the peer reports it on its own 200 ms
// clock quantized to its frame rate (multiplayer-client.js), and the town
// broadcasts the latest accepted pose on a 50 ms loop at most every 200 ms
// (server/app.js). `cadence: 'frame'` syncs every rendered frame instead.
async function observe({ id = 'peer', hz, seconds, path, cadence = 'snapshot', seed = 7, network = PROFILES.rtt0 }) {
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera();
  const players = createRemotePlayers(scene, new Element());
  const pose = t => ({ id, name: 'Peer', position: path(t).slice(0, 3), altitude: 0, yaw: 0, appearance: 'sable-human' });
  players.sync([pose(0)], 'self'); await new Promise(resolve => setImmediate(resolve));
  const frames = scene.children[0].children[0].userData.frames, holders = [];
  const jitter = random(seed);
  let reported = pose(0), received = pose(0), sentAt = 0, broadcastAt = 0, tick = 0, deliveredAt = 0;
  const inFlight = [];
  for (let frame = 0; frame <= seconds * hz; frame++) {
    const t = frame / hz;
    if (cadence === 'frame') players.sync([received = pose(t)], 'self');
    else {
      if (t * 1000 - sentAt >= 200) { sentAt = t * 1000; reported = pose(t); }
      while (tick + 50 <= t * 1000) {
        tick += 50 + jitter() * 6;
        if (tick - broadcastAt >= 200) {
          broadcastAt = tick;
          // The socket keeps order: a stalled frame holds back the frames behind it.
          const stall = jitter() < network.stall ? network.stallMs : 0;
          deliveredAt = Math.max(deliveredAt, tick + network.rtt / 2 + (jitter() * 2 - 1) * network.jitter + stall);
          inFlight.push({ at: deliveredAt, pose: reported });
        }
      }
      while (inFlight.length && inFlight[0].at <= t * 1000) players.sync([received = inFlight.shift().pose], 'self');
    }
    players.update(t * 1000, camera);
    holders.push({ t, position: players.stats()[0].position });
  }
  players.dispose();
  return { frames, holders, received: received.position };
}
// Proposed test profiles for #637/#640 (round trip, one-way jitter, chance and
// length of a TCP head-of-line stall per broadcast). Not approved latency budgets.
const PROFILES = {
  rtt0: { rtt: 0, jitter: 0, stall: 0, stallMs: 0 },
  rtt100: { rtt: 100, jitter: 15, stall: .01, stallMs: 250 },
  rtt200: { rtt: 200, jitter: 40, stall: .03, stallMs: 400 },
};
const steady = (samples, from, to, hz) => samples.slice(Math.round(from * hz) + 1, Math.round(to * hz) + 1);
const straight = (speed, angle, climb = 0) => t => [Math.cos(angle) * speed * t, Math.sin(angle) * speed * t, climb * t];
// Town [x, north] travel shows as scene (x, -north); foot placement's heading is atan2(x, z).
const sceneHeading = angle => Math.atan2(Math.cos(angle), -Math.sin(angle));

test('a peer walks at its legitimate horizontal speed and faces its travel at 30, 60 and 120 Hz', async () => withDocument(async () => {
  for (const hz of [30, 60, 120]) for (const [id, speed] of [['peer', WALK_SPEED.normal], ['peer', WALK_SPEED.fast], [JEVICA, WALK_SPEED.jevicaFast]]) for (const angle of [0, 2.1, -1]) {
    const { frames } = await observe({ id, hz, seconds: 2, path: straight(speed, angle), cadence: 'frame' });
    for (const frame of steady(frames, 1, 2, hz)) {
      assert.ok(Math.abs(frame.speed - speed) < .02 * speed, `${hz} Hz ${speed} m/s: animates at ${frame.speed}`);
      assert.ok(Number.isFinite(frame.heading), `${hz} Hz ${speed} m/s: travel heading is handed to foot placement`);
      assert.ok(Math.abs(wrap(frame.heading - sceneHeading(angle))) < .01, `${hz} Hz: heading ${frame.heading} follows travel ${sceneHeading(angle)}`);
    }
  }
}));

test('a peer cannot animate faster than the town accepts for that account', async () => withDocument(async () => {
  // Interpolation catches up after a correction; the walk stays within the
  // account's accepted pose speed (server/world.js: fastWalkFor(id) + 0.2).
  for (const [id, limit] of [['peer', WALK_SPEED.fast + .2], [JEVICA, WALK_SPEED.jevicaFast + .2]]) {
    const { frames } = await observe({ id, hz: 60, seconds: 1, path: t => [t < .5 ? 0 : 6, 0, 0], cadence: 'frame' });
    assert.ok(frames.every(frame => frame.speed <= limit + 1e-9), `${id}: ${Math.max(...frames.map(frame => frame.speed))} > ${limit}`);
  }
}));

test('at the real 5 Hz snapshot cadence a steady peer walks steadily instead of surging each snapshot', async () => withDocument(async () => {
  for (const hz of [30, 60, 120]) for (const [id, speed] of [['peer', WALK_SPEED.normal], ['peer', WALK_SPEED.fast], [JEVICA, WALK_SPEED.jevicaFast]]) {
    const { frames, holders, received } = await observe({ id, hz, seconds: 4, path: straight(speed, .4) });
    const window = steady(frames, 1.5, 3.5, hz), moved = steady(holders, 1.5, 3.5, hz);
    const animation = window.map(frame => frame.speed);
    const body = moved.slice(1).map((sample, i) => Math.hypot(sample.position[0] - moved[i].position[0], sample.position[2] - moved[i].position[2]) * hz);
    const report = `${hz} Hz ${speed} m/s: animation ${Math.min(...animation).toFixed(2)}-${Math.max(...animation).toFixed(2)}, body ${Math.min(...body).toFixed(2)}-${Math.max(...body).toFixed(2)}`;
    assert.ok(Math.min(...animation) > .75 * speed && Math.max(...animation) < 1.25 * speed, report);
    assert.ok(Math.min(...body) > .75 * speed && Math.max(...body) < 1.25 * speed, report);
    assert.ok(window.every(frame => Math.abs(wrap(frame.heading - sceneHeading(.4))) < .05), `${report}: heading holds`);
    // Display delay added by this client, behind the newest pose it received: the
    // 0.3 s pacing buffer, the follow spring (2/24 s) and at most one 200 ms pose of
    // catch-up after a repeated broadcast. The lerp it replaced added about 0.08 s.
    const last = holders.at(-1).position, behind = Math.hypot(last[0] - received[0], last[2] + received[1]) / speed;
    assert.ok(behind < .6, `${report}: ${behind.toFixed(2)} s behind the newest pose`);
  }
}));

test('a peer that stops settles in place without walking past and back', async () => withDocument(async () => {
  for (const hz of [30, 60, 120]) for (const [id, speed] of [['peer', WALK_SPEED.fast], [JEVICA, WALK_SPEED.jevicaFast]]) {
    const stopAt = 2, path = t => [speed * Math.min(t, stopAt), 0, 0];
    const { frames, holders } = await observe({ id, hz, seconds: 4, path });
    const x = holders.map(sample => sample.position[0]);
    assert.ok(Math.max(...x) <= speed * stopAt + 1e-6, `${hz} Hz ${speed}: overshoots to ${Math.max(...x)}`);
    for (let i = 1; i < x.length; i++) assert.ok(x[i] >= x[i - 1] - 1e-9, `${hz} Hz ${speed}: steps backwards at ${holders[i].t}`);
    assert.ok(Math.abs(x.at(-1) - speed * stopAt) < .01, `${hz} Hz ${speed}: settles at the reported stop`);
    assert.ok(frames.slice(-Math.round(hz / 2)).every(frame => frame.speed < .03), `${hz} Hz ${speed}: stands still after stopping`);
  }
}));

test('a reversing peer turns its travel heading within the interpolation delay', async () => withDocument(async () => {
  for (const hz of [30, 60, 120]) {
    const path = t => [t < 1.5 ? 1.65 * t : 1.65 * (3 - t), 0, 0];
    const { frames } = await observe({ hz, seconds: 3, path });
    const moving = frames.map((frame, i) => ({ ...frame, t: i / hz })).filter(frame => Number.isFinite(frame.heading));
    assert.ok(moving.some(frame => frame.t < 1.4 && Math.abs(wrap(frame.heading - Math.PI / 2)) < .05), `${hz} Hz: walks east first`);
    assert.ok(moving.some(frame => frame.t > 2 && Math.abs(wrap(frame.heading + Math.PI / 2)) < .05), `${hz} Hz: walks west after reversing`);
    assert.ok(moving.filter(frame => frame.t > 2.2).every(frame => Math.abs(wrap(frame.heading + Math.PI / 2)) < .05), `${hz} Hz: no stale heading after the reversal`);
  }
}));

test('a peer riding a lift or changing level does not walk: its feet ride the floor, a level change snaps', async () => withDocument(async () => {
  for (const hz of [30, 60, 120]) for (const cadence of ['frame', 'snapshot']) {
    // A lift at 1 m/s for four metres, then a 3.6 m level change in one pose (a portal).
    const path = t => [5, 5, t < 4 ? Math.min(4, t) : t < 5 ? 4 : 7.6];
    const { frames, holders } = await observe({ hz, seconds: 6, path, cadence });
    const start = frames[1].distance;
    assert.ok(frames.every(frame => Math.abs(frame.distance - start) < 1e-6), `${hz} Hz ${cadence}: vertical travel advanced the stride by ${frames.at(-1).distance - start} m`);
    assert.ok(frames.every(frame => frame.speed < .03), `${hz} Hz ${cadence}: vertical travel animated a walk at ${Math.max(...frames.map(frame => frame.speed))} m/s`);
    assert.ok(frames.every(frame => frame.heading === undefined), `${hz} Hz ${cadence}: standing keeps the body's own heading`);
    const floor = frames.map(frame => frame.platform?.[1]);
    assert.ok(floor.every(Number.isFinite), `${hz} Hz ${cadence}: the moving floor is handed to foot placement`);
    const lift = floor[Math.round(4.9 * hz)] - floor[1];
    assert.ok(lift > 3.9, `${hz} Hz ${cadence}: the lift carried the planted feet up ${lift} m`);
    assert.ok(Math.abs(floor.at(-1) - floor[Math.round(4.9 * hz)]) < 1e-3, `${hz} Hz ${cadence}: a level change is a relocation, not a ride (${floor.at(-1) - floor[Math.round(4.9 * hz)]} m)`);
    assert.ok(Math.abs(holders.at(-1).position[1] - 7.6) < 1e-6, `${hz} Hz ${cadence}: the figure reached the new level`);
  }
}));

test('a peer on a slope strides by horizontal travel, and the floor does not carry walking feet', async () => withDocument(async () => {
  for (const hz of [30, 60, 120]) {
    const { frames, holders } = await observe({ hz, seconds: 3, path: straight(1.65, 0, .5), cadence: 'frame' });
    const travelled = frames.at(-1).distance - frames[1].distance;
    const horizontal = Math.hypot(holders.at(-1).position[0] - holders[1].position[0], holders.at(-1).position[2] - holders[1].position[2]);
    assert.ok(Math.abs(travelled - horizontal) < 1e-6, `${hz} Hz: stride ${travelled} vs horizontal ${horizontal}`);
    for (const frame of steady(frames, 1, 3, hz)) assert.ok(Math.abs(frame.speed - 1.65) < .04, `${hz} Hz: slope speed ${frame.speed}`);
    const floor = steady(frames, 1, 3, hz).map(frame => frame.platform?.[1]);
    assert.ok(floor.every(value => value === floor[0]), `${hz} Hz: walking uphill must not carry planted feet with the body`);
  }
}));

test('a snapped or reconnected peer does not count the jump as stride', async () => withDocument(async () => {
  for (const hz of [30, 60, 120]) {
    const path = t => t < 1 ? [1.65 * t, 0, 0] : [40 + 1.65 * (t - 1), 0, 0];
    const { frames } = await observe({ hz, seconds: 2, path, cadence: 'frame' });
    const steps = frames.slice(1).map((frame, i) => frame.distance - frames[i].distance);
    assert.ok(Math.max(...steps) < .2, `${hz} Hz: one frame advanced the stride ${Math.max(...steps)} m`);
    assert.ok(frames.every(frame => frame.speed <= WALK_SPEED.fast + .2), `${hz} Hz: snap speed ${Math.max(...frames.map(frame => frame.speed))}`);
  }
  // A reconnect is a departure and a new entry: its stride and floor start fresh.
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(), players = createRemotePlayers(scene, new Element());
  const peer = { id: 'peer', name: 'Peer', position: [0, 0, 0], altitude: 0, yaw: 0, appearance: 'sable-human' };
  players.sync([peer], 'self'); await new Promise(resolve => setImmediate(resolve));
  for (let i = 0; i <= 60; i++) { players.sync([{ ...peer, position: [i * 1.65 / 60, 0, 0] }], 'self'); players.update(i * 1000 / 60, camera); }
  players.sync([], 'self'); players.sync([{ ...peer, position: [30, 0, 0] }], 'self'); await new Promise(resolve => setImmediate(resolve));
  players.update(1100, camera); players.update(1117, camera);
  const frames = scene.children[0].children[0].userData.frames;
  assert.ok(frames.every(frame => frame.distance < 1e-9 && frame.speed === 0), 'a returning peer starts standing with a fresh stride');
  players.dispose();
}));

test('under the proposed 0, 100 and 200 ms network profiles a walking peer keeps moving forward at a steady pace', async () => withDocument(async () => {
  for (const [name, network] of Object.entries(PROFILES)) for (const hz of [30, 60, 120]) for (const [id, speed] of [['peer', WALK_SPEED.normal], [JEVICA, WALK_SPEED.jevicaFast]]) for (const seed of [3, 11, 29]) {
    const { frames, holders } = await observe({ id, hz, seconds: 8, path: straight(speed, -.7), network, seed });
    const window = steady(frames, 2, 7.5, hz), moved = steady(holders, 2, 7.5, hz), along = [Math.cos(-.7), -Math.sin(-.7)];
    const progress = moved.map(sample => sample.position[0] * along[0] + sample.position[2] * along[1]);
    const speeds = progress.slice(1).map((value, i) => (value - progress[i]) * hz);
    const report = `${name} ${hz} Hz ${speed} m/s seed ${seed}: pace ${Math.min(...speeds).toFixed(2)}-${Math.max(...speeds).toFixed(2)}`;
    globalThis.PRINT_PROFILES && console.log(report);
    assert.ok(speeds.every(value => value > 0), `${report}: the figure stops or steps back while the peer walks on`);
    // Measured on the candidate: 0.90-1.20x at every profile. A 400 ms stall (rtt200)
    // outlasts the 0.3 s buffer, so the figure slows almost to a stop, never reverses.
    assert.ok(Math.max(...speeds) < 1.3 * speed, `${report}: surges past 1.3x`);
    if (name !== 'rtt200') assert.ok(Math.min(...speeds) > .75 * speed, `${report}: drops below 0.75x`);
    assert.ok(window.every(frame => Math.abs(wrap(frame.heading - sceneHeading(-.7))) < .05), `${report}: heading holds`);
  }
}));

test('a peer walking a curve at the 5 Hz cadence turns smoothly with a steady stride', async () => withDocument(async () => {
  for (const hz of [30, 60, 120]) {
    // A 6 m radius circle at 1.65 m/s.
    const radius = 6, rate = 1.65 / radius, path = t => [radius * Math.sin(rate * t), radius - radius * Math.cos(rate * t), 0];
    const { frames } = await observe({ hz, seconds: 6, path });
    const window = steady(frames, 1.5, 5.5, hz);
    const turns = window.slice(1).map((frame, i) => Math.abs(wrap(frame.heading - window[i].heading)) * hz);
    assert.ok(window.every(frame => Math.abs(frame.speed - 1.65) < .25 * 1.65), `${hz} Hz: curve pace ${Math.min(...window.map(f => f.speed))}-${Math.max(...window.map(f => f.speed))}`);
    // The peer turns at 0.275 rad/s; corners between poses must not snap the travel heading.
    assert.ok(Math.max(...turns) < 1.5, `${hz} Hz: heading turns at up to ${Math.max(...turns).toFixed(2)} rad/s`);
  }
}));


test('fast flight keeps following every snapshot without stalls or relocation jumps', async () => withDocument(async () => {
  for (const hz of [30, 60, 120]) {
    const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(), players = createRemotePlayers(scene, new Element());
    // At 21 m/s the flyer outruns the walking buffer; flight keeps the original follow.
    const peer = t => ({ id: JEVICA, name: 'Jevica', position: [21 * t, 0, 0], altitude: 6, yaw: 0, appearance: 'sable-human' });
    players.sync([peer(0)], 'self'); await new Promise(resolve => setImmediate(resolve));
    const xs = [];
    for (let frame = 0; frame <= 4 * hz; frame++) {
      const t = frame / hz;
      if (frame % Math.round(hz / 5) === 0) players.sync([peer(t)], 'self');
      players.update(t * 1000, { position: new THREE.Vector3(21 * t, 6, 0), projectionMatrix: camera.projectionMatrix, matrixWorldInverse: camera.matrixWorldInverse, updateMatrixWorld() {} });
      xs.push(players.stats()[0].position[0]);
    }
    players.dispose();
    const steps = xs.slice(hz + 1).map((x, i) => x - xs[hz + i]);
    assert.ok(steps.filter(step => step < 1e-6).length <= .05 * steps.length, `${hz} Hz: flight stalls on ${steps.filter(step => step < 1e-6).length} of ${steps.length} frames`);
    assert.ok(steps.every(step => step < 8), `${hz} Hz: flight relocates by ${Math.max(...steps)} m in one frame`);
  }
}));

test('a riding peer keeps facing its travel through turns', async () => withDocument(async () => {
  for (const hz of [30, 60, 120]) {
    const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(), players = createRemotePlayers(scene, new Element());
    // A car at 7 m/s on an 8 m circle; a ride's heading is the peer's own yaw.
    const radius = 8, rate = 7 / radius, at = t => [radius * Math.sin(rate * t), radius - radius * Math.cos(rate * t)];
    const peer = t => ({ id: JEVICA, name: 'Jevica', position: [...at(t), 0], altitude: 0, yaw: sceneHeading(rate * t), vehicle: 'rolls', appearance: 'sable-human' });
    players.sync([peer(0)], 'self'); await new Promise(resolve => setImmediate(resolve));
    const samples = [];
    for (let frame = 0; frame <= 5 * hz; frame++) {
      const t = frame / hz;
      if (frame % Math.round(hz / 5) === 0) players.sync([peer(t)], 'self');
      players.update(t * 1000, camera);
      const { position, heading } = players.stats()[0]; samples.push({ position, heading });
    }
    players.dispose();
    const errors = samples.slice(hz + 1).map((sample, i) => {
      const before = samples[hz + i].position, travel = Math.atan2(sample.position[0] - before[0], sample.position[2] - before[2]);
      return Math.abs(wrap(sample.heading - travel));
    }).sort((a, b) => a - b);
    const median = errors[errors.length >> 1];
    assert.ok(median < .1, `${hz} Hz: a ride points ${(median * 180 / Math.PI).toFixed(1)} degrees off its travel (median)`);
  }
}));

test('a peer that relocates and walks on is steady again within a second', async () => withDocument(async () => {
  for (const hz of [30, 60, 120]) {
    const path = t => [t < 2 ? 1.65 * t : 30 + 1.65 * t, 0, 0];
    const { holders } = await observe({ hz, seconds: 5, path });
    const window = steady(holders, 3.2, 4.8, hz);
    const pace = window.slice(1).map((sample, i) => (sample.position[0] - window[i].position[0]) * hz);
    assert.ok(Math.min(...pace) > .75 * 1.65 && Math.max(...pace) < 1.25 * 1.65, `${hz} Hz: pace ${Math.min(...pace).toFixed(2)}-${Math.max(...pace).toFixed(2)} after the relocation`);
  }
}));

test('a figure posed every rendered frame is followed closely, at low frame rates and from standing', async () => withDocument(async () => {
  for (const hz of [15, 20, 30, 60, 120]) {
    // Standing for half a second, then walking at 1.65 m/s, posed every frame.
    const path = t => [1.65 * Math.max(0, t - .5), 0, 0];
    const { holders } = await observe({ hz, seconds: 3, path, cadence: 'frame' });
    const lag = holders.map(sample => 1.65 * Math.max(0, sample.t - .5) - sample.position[0]);
    assert.ok(Math.max(...lag) < .15, `${hz} Hz: trails its pose by up to ${Math.max(...lag).toFixed(3)} m`);
    const moved = holders.slice(1).map((sample, i) => (sample.position[0] - holders[i].position[0]) * hz);
    assert.ok(Math.max(...moved) < 1.3 * 1.65, `${hz} Hz: surges to ${Math.max(...moved).toFixed(2)} m/s`);
    assert.ok(moved.slice(Math.ceil(.6 * hz)).every(value => value > .2), `${hz} Hz: stalls after starting`);
  }
}));

test('a newly seen peer that starts walking does not stall and surge as pacing takes over', async () => withDocument(async () => {
  for (const hz of [30, 60, 120]) for (const speed of [WALK_SPEED.normal, WALK_SPEED.fast]) {
    // Standing since it joined, then walking from t = 1 s.
    const path = t => [speed * Math.max(0, t - 1), 0, 0];
    const { holders } = await observe({ hz, seconds: 4, path });
    const window = steady(holders, 1.8, 3.8, hz);
    const pace = window.slice(1).map((sample, i) => (sample.position[0] - window[i].position[0]) * hz);
    globalThis.PRINT_FIRST_WALK && console.log(`FIRST ${hz} Hz ${speed}: ${Math.min(...pace).toFixed(2)}-${Math.max(...pace).toFixed(2)}`);
    assert.ok(Math.min(...pace) > .6 * speed && Math.max(...pace) < 1.3 * speed, `${hz} Hz ${speed} m/s: first walk pace ${Math.min(...pace).toFixed(2)}-${Math.max(...pace).toFixed(2)}`);
  }
}));
