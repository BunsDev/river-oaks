import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createWalkingEnvironment } from '../src/walking.js';
import { BIRD_FLIGHT, COMPANION, chooseInterest, clearAltitude, companionInterests, companionOf, createBird, forwardOf, lapClear, stepBird } from '../src/bird-cams.js';

const world = JSON.parse(readFileSync(new URL('../public/data/district.json', import.meta.url)));
const environment = createWalkingEnvironment(world);
const centre = [(environment.bounds[0] + environment.bounds[2]) / 2, (environment.bounds[1] + environment.bounds[3]) / 2];
const spot = world.communityLocations[4], interests = [{ id: 'spot', label: spot.name, position: [spot.position[0], spot.position[1]], weight: 3 }];
const fly = (bird, seconds, options = {}) => { const trail = []; for (let t = 0; t < seconds * 30; t++) { stepBird(bird, 1 / 30, { environment, interests, now: t * 1000 / 30, random: () => .5, ...options }); trail.push([...bird.position]); } return trail; };
// environment.bounds are scene coordinates, so centre is [x, z].
const start = () => { const ground = environment.groundAt(centre[0], centre[1]); return createBird({ id: 'dove', name: 'Dove' }, [centre[0], Math.max(ground + 15, clearAltitude(environment, centre[0], centre[1], ground, ground + environment.flightCeiling) + 4), centre[1]], 0); };

test("Jev's autopilot flies to what is happening and circles it, clear of every roof", () => {
  const bird = start(), trail = fly(bird, 60);
  assert.equal(bird.target.id, 'spot');
  const [east, north] = interests[0].position;
  const reached = trail.findIndex(([x, , z]) => Math.hypot(x - east, z + north) < BIRD_FLIGHT.orbitRadius * 1.5);
  assert.ok(reached > 0, 'the bird reaches the scene');
  const circling = trail.slice(reached + 300).map(([x, , z]) => Math.hypot(x - east, z + north));
  assert.ok(circling.every(d => d > 4 && d < BIRD_FLIGHT.orbitRadius * 2.2), `circles the scene (${Math.min(...circling).toFixed(1)}–${Math.max(...circling).toFixed(1)} m)`);
  assert.ok(trail.every(([x, y, z]) => environment.canFly(x, y, z)), 'never inside a building');
  assert.ok(trail.every(([x, y, z]) => y >= environment.groundAt(x, z) + BIRD_FLIGHT.minClearance - 1e-6), 'never below its minimum clearance');
  const steps = trail.slice(1).map((p, i) => Math.hypot(p[0] - trail[i][0], p[2] - trail[i][2]) * 30);
  assert.ok(Math.max(...steps) <= BIRD_FLIGHT.maxSpeed + 1e-6, 'flies smoothly, never jumps');
});

test('a manual takeover flies where it is told, and Jev resumes from there', () => {
  const bird = start(); bird.mode = 'manual';
  const heading = bird.heading;
  fly(bird, 2, { control: { turn: 1, climb: 0, throttle: 1 } });
  assert.ok(Math.abs(bird.heading - heading) > .5, 'A/D turns the bird');
  assert.ok(bird.speed > BIRD_FLIGHT.cruise, 'W speeds it up');
  const height = bird.position[1]; fly(bird, 2, { control: { turn: 0, climb: 1, throttle: 0 } });
  assert.ok(bird.position[1] > height + 3, 'Space climbs');
  const handed = [...bird.position]; bird.mode = 'jev'; bird.target = null;
  stepBird(bird, 1 / 30, { environment, interests, now: 0, random: () => .5 });
  assert.ok(Math.hypot(bird.position[0] - handed[0], bird.position[2] - handed[2]) < 1, 'handing back does not snap the bird anywhere');
  assert.equal(bird.target.id, 'spot', 'Jev picks up a new scene to watch');
});

test('birds stay inside the district and choose livelier, nearer scenes first', () => {
  const bird = start(); bird.mode = 'manual'; bird.heading = Math.PI / 2;
  const trail = fly(bird, 40, { control: { turn: 0, climb: 0, throttle: 1 } });
  const [west, , east] = environment.bounds;
  assert.ok(trail.every(([x]) => x >= west - 1 && x <= east + 1), 'a hand-flown bird is held at the edge by rooftops or bounds');
  const near = { id: 'near', position: [centre[0] + 20, centre[1]], weight: 2 }, far = { id: 'far', position: [centre[0] + 200, centre[1]], weight: 2 }, lively = { id: 'lively', position: [centre[0] + 60, centre[1]], weight: 7 };
  assert.equal(chooseInterest(start(), [near, far], { random: () => .5 }).id, 'near');
  assert.equal(chooseInterest(start(), [near, far, lively], { random: () => .5 }).id, 'lively');
  assert.equal(chooseInterest(start(), [near, lively], { random: () => .5, recent: ['lively'] }).id, 'near', 'just-watched scenes wait their turn');
  assert.deepEqual(forwardOf(0).map(v => Math.abs(v) < 1e-12 ? 0 : v), [0, -1], 'heading 0 looks north');
});

test('Jev flies above the rooftops on its way, not across them', () => {
  const bird = start(), trail = fly(bird, 40);
  const clearance = trail.map(([x, y, z]) => y - clearAltitude(environment, x, z, environment.groundAt(x, z), environment.groundAt(x, z) + environment.flightCeiling));
  const skimming = clearance.filter(gap => gap < 1).length / clearance.length;
  assert.ok(skimming < .05, `skims a roof for ${(skimming * 100).toFixed(1)}% of the flight`);
});


test('over open street a watching bird circles low, where a walker can see it', () => {
  // The companion's tight lap over open street (community spots sit under the arcade
  // and trees, where low circling is rightly refused): the open point nearest the
  // district's centre, found on a 4 m grid.
  let open = null;
  for (let ring = 0; ring < 60 && !open; ring++) for (let i = -ring; i <= ring && !open; i++) for (const [dx, dz] of [[i, -ring], [i, ring], [-ring, i], [ring, i]]) {
    const east = centre[0] + dx * 4, north = -(centre[1] + dz * 4);
    if (lapClear(environment, east, north, COMPANION.orbit)) { open = [east, north]; break; }
  }
  assert.ok(open, 'the district has open street for a low lap');
  const scene = [{ id: 'player', label: 'Jevica', position: [open[0], open[1]], radius: COMPANION.orbit, weight: 4 }];
  const bird = start(), trail = fly(bird, 90, { interests: scene });
  assert.equal(bird.phase, 'watch');
  const settled = trail.slice(-300), ground = environment.groundAt(open[0], -open[1]);
  const heights = settled.map(([, y]) => y - ground), radii = settled.map(([x, , z]) => Math.hypot(x - open[0], z + open[1]));
  assert.ok(heights.every(h => Math.abs(h - BIRD_FLIGHT.watchClearance) < .75), `circles ${BIRD_FLIGHT.watchClearance} m up (${Math.min(...heights).toFixed(1)}–${Math.max(...heights).toFixed(1)} m)`);
  assert.ok(radii.every(r => r > COMPANION.orbit * .5 && r < COMPANION.orbit * 1.6), `on an ${COMPANION.orbit} m lap (${Math.min(...radii).toFixed(1)}–${Math.max(...radii).toFixed(1)} m)`);
  assert.ok(trail.every(([x, y, z]) => environment.canFly(x, y, z)), 'never inside a building');
});

test('the companion is the nearest bird, keeps the role, and never one flown by hand', () => {
  const at = (id, east, north) => ({ id, mode: 'jev', position: [east, 30, -north] });
  const near = at('dove', 10, 0), far = at('jay', 60, 0), player = { position: [0, 0] };
  assert.equal(companionOf([near, far], null), null, 'no companion without a walking player');
  assert.equal(companionOf([far, near], player), near, 'the nearest bird');
  assert.equal(companionOf([near, far], player, far), far, 'the current companion keeps the role');
  far.mode = 'manual';
  assert.equal(companionOf([near, far], player, far), near, 'a bird flown by hand hands the role on');
  near.mode = 'manual';
  assert.equal(companionOf([near, far], player), null, 'no companion when every bird is flown by hand');
});

test("the companion's scene is the spot the player is looking toward, stepped back until its lap is clear", () => {
  const interests = [{ id: 'spot', position: [100, 100], weight: 2 }, { id: 'player', label: 'Jevica', position: [0, 0], weight: 4 }];
  const copy = structuredClone(interests), player = { position: [0, 0], view: [1, 0] };
  const [ahead] = companionInterests(interests, player);
  assert.deepEqual(ahead.position, [COMPANION.ahead, 0]);
  assert.equal(ahead.radius, COMPANION.orbit);
  assert.equal(ahead.id, 'player', 'still reads as watching the player');
  assert.deepEqual(interests, copy, 'the shared interest list is not changed');
  const [closer] = companionInterests(interests, player, { canPlace: east => east <= 11 });
  assert.deepEqual(closer.position, [11, 0], 'steps back toward the player');
  const [around] = companionInterests(interests, player, { canPlace: east => east === 0 });
  assert.deepEqual(around.position, [0, 0], 'falls back to a lap around the player');
  assert.equal(around.radius, COMPANION.orbit);
  const [plain] = companionInterests(interests, player, { canPlace: () => false });
  assert.equal(plain.radius, undefined, "with no clear lap, the player's own scene unchanged");
  assert.equal(companionInterests(interests, null), interests, 'no player: the list as given');
});
