import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createInvasion, stepInvasion, castSpell, releaseResidents, landingSites, canCast, MAGIC_FORMS, SPELL_RANGE, RESIDENTS_LOST_LIMIT, LANDING_SECONDS, BEAM_SECONDS, BANISH_SECONDS } from '../src/invasion.js';

const world = { bounds_m: [-60, -40, 60, 40], walkSpawn: [0, 0, 0] };
const open = { isFree: () => true, groundAt: () => 0 };
const run = (state, seconds, context) => { for (let t = 0; t < seconds; t += 0.05) stepInvasion(state, 0.05, context); return state; };

test('only the magical forms can cast', () => {
  assert.deepEqual(MAGIC_FORMS, ['jevica']);
  for(const retired of ['witch','alien']) assert.equal(canCast(retired),false);
  for (const form of ['jevica']) assert.ok(canCast(form));
  for (const form of ['dorothy', 'scarecrow', 'tinman', 'lion', 'visitor', undefined]) assert.ok(!canCast(form), String(form));
});

test('saucers land on free ground around the edge of the district', () => {
  const free = (e, n) => Math.abs(e) >= 50 && Math.abs(n) <= 30; // only a strip near the east and west edges is free
  const sites = landingSites(world, 5, free);
  assert.equal(sites.length, 5);
  for (const [e, n] of sites) assert.ok(Math.abs(e) >= 50 || Math.hypot(e, n) <= 12.01, `site ${e},${n} is free ground or the near fallback`);
  const state = createInvasion(world, { count: 4, ...open });
  assert.equal(state.aliens.length, 4);
  assert.ok(state.aliens.every(alien => alien.status === 'landing' && Math.hypot(...alien.position.slice(0, 2)) > 20));
});

test('the crew land, hunt the nearest neighbor and beam them aboard', () => {
  const state = createInvasion(world, { count: 1, ...open });
  const alien = state.aliens[0];
  const residents = [{ id: 'far', name: 'Far', position: [alien.position[0] + 40, alien.position[1], 0] }, { id: 'near', name: 'Near', position: [alien.position[0] + 6, alien.position[1], 0] }, { id: 'inside', indoor: true, position: [alien.position[0] + 1, alien.position[1], 0] }];
  run(state, LANDING_SECONDS + 0.1, { ...open, residents });
  assert.equal(alien.status, 'roaming');
  assert.equal(alien.targetId, 'near', 'ignores indoor people and picks the nearest outdoor neighbor');
  const before = Math.hypot(alien.position[0] - residents[1].position[0], alien.position[1] - residents[1].position[1]);
  run(state, 2, { ...open, residents });
  const after = Math.hypot(alien.position[0] - residents[1].position[0], alien.position[1] - residents[1].position[1]);
  assert.ok(after < before, 'walks toward the target');
  run(state, 4 + BEAM_SECONDS, { ...open, residents });
  assert.ok(residents[1].abducted, 'the neighbor is beamed aboard after the beam completes');
  assert.deepEqual(state.abducted, ['near']);
  assert.equal(alien.targetId, 'far', 'moves on to the next neighbor');
  releaseResidents(state, residents);
  assert.ok(!residents[1].abducted && state.abducted.length === 0, 'everyone comes home afterwards');
});

test('a spell from a magical visitor banishes the nearest alien in range and in sight; others cannot cast', () => {
  const state = createInvasion(world, { count: 2, ...open });
  run(state, LANDING_SECONDS + 0.1, open);
  const [near, far] = state.aliens;
  const player = { form: 'jevica', position: [near.position[0] + 5, near.position[1], 0] };
  assert.equal(castSpell(state, { ...player, form: 'lion' }), null, 'the Lion has no magic');
  assert.equal(castSpell(state, { ...player, position: [near.position[0] + SPELL_RANGE + 1, near.position[1], 0] }), null, 'out of range');
  assert.equal(castSpell(state, player, { canSee: () => false }), null, 'no line of sight');
  assert.equal(castSpell(state, player), near.id);
  assert.equal(castSpell(state, player), null, 'cooldown');
  run(state, 1, open);
  assert.equal(near.status, 'banished'); assert.equal(state.banished, 1); assert.equal(state.spells.length, 0);
  assert.ok(['roaming', 'landing'].includes(far.status));
});

test('the crew turn on a magical visitor within 20 m, stand off at 4 m, and ignore ordinary visitors', () => {
  const state = createInvasion(world, { count: 1, ...open });
  const alien = state.aliens[0];
  const residents = [{ id: 'r', position: [alien.position[0] + 15, alien.position[1], 0] }];
  const jevica = { form: 'jevica', position: [alien.position[0] - 8, alien.position[1], 0] };
  run(state, LANDING_SECONDS + 6, { ...open, residents, player: jevica });
  assert.equal(alien.status, 'menacing'); assert.equal(alien.targetId, 'player');
  assert.ok(Math.abs(Math.hypot(alien.position[0] - jevica.position[0], alien.position[1] - jevica.position[1]) - 4) < 1.4, 'stands off at about four metres');
  assert.equal(castSpell(state, { ...jevica }), alien.id, 'a menacing alien can be banished');
  const ignore = createInvasion(world, { count: 1, ...open }), other = ignore.aliens[0];
  run(ignore, LANDING_SECONDS + 3, { ...open, residents: [{ id: 'r', position: [other.position[0] + 15, other.position[1], 0] }], player: { form: 'lion', position: [other.position[0] - 5, other.position[1], 0] } });
  assert.equal(other.targetId, 'r', 'the Lion is not a threat, so the crew keep hunting neighbors');
});

test('the district is saved when every alien is banished, and falls after too many abductions', () => {
  const win = createInvasion(world, { count: 2, ...open });
  run(win, LANDING_SECONDS + 0.1, open);
  for (const alien of win.aliens) { castSpell(win, { form: 'jevica', position: [alien.position[0] + 3, alien.position[1], 0] }); run(win, 1, open); }
  // The last crew member is still rising into the saucer: the win waits for it.
  assert.equal(win.phase, 'active');assert.ok(win.aliens.every(alien => ['banished', 'gone'].includes(alien.status)));
  run(win, BANISH_SECONDS, open);
  assert.equal(win.phase, 'won');
  const lose = createInvasion(world, { count: 1, ...open });
  const alien = lose.aliens[0];
  const residents = Array.from({ length: RESIDENTS_LOST_LIMIT }, (_, i) => ({ id: `r${i}`, position: [alien.position[0] + 0.5, alien.position[1] + 0.5, 0] }));
  run(lose, LANDING_SECONDS + RESIDENTS_LOST_LIMIT * (BEAM_SECONDS + 0.3), { ...open, residents });
  assert.equal(lose.phase, 'lost');
  assert.ok(residents.every(local => local.abducted));
  releaseResidents(lose, residents);
  assert.ok(residents.every(local => !local.abducted));
});

test('the bundled district offers five free landing sites', () => {
  const district = JSON.parse(readFileSync(new URL('../public/data/district.json', import.meta.url)));
  return import('../src/walking.js').then(({ createWalkingEnvironment }) => {
    const environment = createWalkingEnvironment(district);
    const state = createInvasion(district, { count: 5, isFree: (e, n) => environment.isFree(e, -n), groundAt: (e, n) => environment.groundAt(e, -n) });
    assert.equal(state.aliens.length, 5);
    for (const alien of state.aliens) assert.ok(environment.isFree(alien.position[0], -alien.position[1]), `${alien.id} lands on free ground`);
  });
});

test('an invasion works in a world without a walk spawn', () => {
  const invasion = createInvasion({ bounds_m: [-100, -100, 100, 100] }, { count: 3, ...open });
  assert.ok(invasion.aliens.every(alien => Number.isFinite(alien.heading)), 'crew face the district centre');
});

test('two crew beaming the same neighbour abduct them once', () => {
  const invasion = createInvasion(world, { count: 2, ...open });
  run(invasion, LANDING_SECONDS + 0.1, open);
  const [a, b] = invasion.aliens, resident = { id: 'r1', position: [(a.position[0] + b.position[0]) / 2, (a.position[1] + b.position[1]) / 2, 0] };
  a.position = [resident.position[0] + .5, resident.position[1], 0]; b.position = [resident.position[0] - .5, resident.position[1], 0];
  run(invasion, BEAM_SECONDS + 1, { ...open, residents: [resident] });
  assert.deepEqual(invasion.abducted, ['r1']);
});

test('a banished crew member is drawn up into their saucer', async () => {
  const { liftHeights } = await import('../src/invaders.js');
  const start = liftHeights('banished', 0), end = liftHeights('banished', 1);
  assert.equal(start.crew, 0);
  assert.ok(Math.abs(end.crew - end.saucer) < 1e-9, `crew ${end.crew} m meets the saucer at ${end.saucer} m`);
  for (let p = 0; p <= 1; p += .1) assert.ok(liftHeights('banished', p).crew <= liftHeights('banished', p).saucer + 1e-9, 'never above the saucer');
});

test('losing a beamed neighbour to another crew member restarts the beam', () => {
  const invasion = createInvasion(world, { count: 2, ...open });
  run(invasion, LANDING_SECONDS + 0.1, open);
  const [a, b] = invasion.aliens, first = { id: 'r1', position: [0, 0, 0] }, second = { id: 'r2', position: [0.3, 0, 0] };
  a.position = [0.5, 0, 0]; b.position = [-0.5, 0, 0];
  for (const alien of [a, b]) Object.assign(alien, { status: 'abducting', targetId: 'r1', progress: 0.99 });
  stepInvasion(invasion, 0.1, { ...open, residents: [first, second] });
  assert.deepEqual(invasion.abducted, ['r1'], 'the second crew member does not abduct a new neighbour in the same instant');
});
