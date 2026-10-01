import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createWalkingEnvironment } from '../src/walking.js';
import { BIRD_FLIGHT, chooseInterest, clearAltitude, createBird, forwardOf, stepBird } from '../src/bird-cams.js';

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
