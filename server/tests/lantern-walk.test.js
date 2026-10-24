import test from 'node:test';
import assert from 'node:assert/strict';
import { createLanternWalk, LANTERN_CELEBRATION_MS, LANTERN_IDLE_MS, LANTERN_REACH } from '../lantern-walk.js';
import { loadDistrictData } from '../district-data.js';
import { createSharedWorld } from '../world.js';
import { COMMONS_REVISION } from '../../shared/east-garden-commons-layout.js';
import { DISTRICT_REVISION_GARDENS } from '../../preview/src/garden-campus-district.js';
import { recoverDistrictCommonsCheckpoint } from '../district-commons-checkpoint-migration.js';

const LANTERNS = [{ id: 'a', at: [0, 0], name: 'A lantern' }, { id: 'b', at: [10, 0], name: 'B lantern' }, { id: 'c', at: [20, 0], name: 'C lantern' }];
const player = (id, position, extra = {}) => ({ id, name: id.toUpperCase(), position: [...position, 0], altitude: 0, sitting: null, vehicle: null, levelId: null, ...extra });

test('lighting needs a lantern within reach, on foot, once per round', () => {
  let time = 1000;
  const walk = createLanternWalk({ lanterns: LANTERNS, now: () => time });
  const ana = player('ana', [1, 0]);
  assert.equal(walk.command(ana, { type: 'lanterns', action: 'light', lanternId: 'zz' }).error, 'invalid_lantern');
  assert.equal(walk.command(ana, { type: 'lanterns', action: 'light', lanternId: 'a', extra: 1 }).error, 'invalid_lantern');
  assert.equal(walk.command(ana, { type: 'lanterns', action: 'light', lanternId: 'b' }).error, 'lantern_out_of_reach');
  assert.equal(walk.command(player('ana', [1, 0], { sitting: { buildId: 'x' } }), { type: 'lanterns', action: 'light', lanternId: 'a' }).error, 'not_on_foot');
  assert.equal(walk.command(player('ana', [1, 0], { altitude: 3 }), { type: 'lanterns', action: 'light', lanternId: 'a' }).error, 'not_on_foot');
  assert.equal(walk.command(player('ana', [LANTERN_REACH + .01, 0]), { type: 'lanterns', action: 'light', lanternId: 'a' }).error, 'lantern_out_of_reach');
  const reply = walk.command(ana, { type: 'lanterns', action: 'light', lanternId: 'a' });
  assert.equal(reply.ok, true); assert.equal(reply.completed, false);
  assert.deepEqual(reply.lanternWalk.lanterns.map(item => item.lit), [true, false, false]);
  assert.equal(reply.lanternWalk.lanterns[0].by, 'ANA');
  assert.equal(walk.command(player('ben', [0, 1]), { type: 'lanterns', action: 'light', lanternId: 'a' }).error, 'already_lit');
});

test('a shared round completes, keeps the best time and celebrates before resetting', () => {
  let time = 0;
  const walk = createLanternWalk({ lanterns: LANTERNS, now: () => time });
  const light = (who, id, x) => { time += 5000; return walk.command(player(who, [x, .5]), { type: 'lanterns', action: 'light', lanternId: id }); };
  light('ana', 'a', 0); light('ben', 'b', 10);
  const done = light('ana', 'c', 20);
  assert.equal(done.completed, true);
  assert.equal(done.lanternWalk.round.seconds, 10);
  assert.deepEqual(done.lanternWalk.round.lamplighters, ['ANA', 'BEN']);
  assert.deepEqual(done.lanternWalk.best, { seconds: 10, lamplighters: ['ANA', 'BEN'], at: time });
  assert.equal(light('cy', 'a', 0).error, 'round_complete');
  time += LANTERN_CELEBRATION_MS; walk.prune(time);
  assert.equal(walk.snapshot().round, null);
  assert.equal(walk.snapshot().rounds, 1);
  // A slower round keeps the earlier record.
  for (const [id, x] of [['a', 0], ['b', 10]]) light('cy', id, x);
  time += 60000; light('cy', 'c', 20);
  assert.equal(walk.snapshot().best.seconds, 10); assert.equal(walk.snapshot().rounds, 2);
});

test('an unfinished round goes dark after a quiet spell', () => {
  let time = 0;
  const walk = createLanternWalk({ lanterns: LANTERNS, now: () => time });
  walk.command(player('ana', [0, 1]), { type: 'lanterns', action: 'light', lanternId: 'a' });
  time += LANTERN_IDLE_MS - 1; walk.prune(time); assert.ok(walk.snapshot().round);
  time += 1; walk.prune(time); assert.equal(walk.snapshot().round, null);
});

test('checkpoints round-trip and malformed saves are refused', () => {
  let time = 0;
  const walk = createLanternWalk({ lanterns: LANTERNS, now: () => time });
  for (const [id, x] of [['a', 0], ['b', 10], ['c', 20]]) { time += 1000; walk.command(player('ana', [x, 1]), { type: 'lanterns', action: 'light', lanternId: id }); }
  time += 1000; walk.command(player('ana', [0, 1]), { type: 'lanterns', action: 'light', lanternId: 'a' });
  const saved = JSON.parse(JSON.stringify(walk.checkpoint())), copy = createLanternWalk({ lanterns: LANTERNS, now: () => time });
  copy.load(copy.validate(saved));
  assert.deepEqual(copy.snapshot(), walk.snapshot());
  assert.deepEqual(copy.validate(undefined), { round: null, best: null, rounds: 0 });
  const broken = [
    s => { s.round.lit[0].id = 'nowhere'; }, s => { s.round.lit.push({ ...s.round.lit[0] }); }, s => { s.round.completedAt = 5; },
    s => { s.best = null; }, s => { s.rounds = -1; }, s => { s.extra = true; }, s => { s.round.lit[0].at = -1; },
  ];
  for (const mutate of broken) { const changed = structuredClone(saved); mutate(changed); assert.throws(() => copy.validate(changed)); }
  assert.throws(() => createLanternWalk({ lanterns: [] }).validate(saved), /no lanterns/);
});

test('two players complete the Lantern Walk in the authoritative Commons world, across a restore', async () => {
  const data = await loadDistrictData({ districtRevision: COMMONS_REVISION }), lanterns = data.eastGardenCommons.destination.lanterns;
  assert.equal(lanterns.length, 5);
  let time = 1000;
  const world = createSharedWorld(data, { now: () => time }), command = (id, message) => { time += 2500; return world.command(id, message); };
  for (const id of ['alice', 'bob']) world.join({ userId: id, name: id });
  // Remote lighting is refused: the server checks the player's own position.
  assert.equal(command('alice', { type: 'lanterns', action: 'light', lanternId: lanterns[0].id }).error, 'lantern_out_of_reach');
  const near = lantern => [[-1.2, 0], [1.2, 0], [0, 1.2], [0, -1.2]].map(([dx, dy]) => [lantern.at[0] + dx, lantern.at[1] + dy]);
  const goTo = (id, lantern) => { for (const position of near(lantern)) if (command(id, { type: 'travel', position }).ok) return; assert.fail(`${id} could not reach ${lantern.id}`); };
  for (const [i, lantern] of lanterns.slice(0, 3).entries()) { const who = i % 2 ? 'bob' : 'alice'; goTo(who, lantern); assert.equal(command(who, { type: 'lanterns', action: 'light', lanternId: lantern.id }).ok, true, lantern.id); }
  // A restart in the middle of a round keeps the lit lanterns.
  const restored = createSharedWorld(data, { now: () => time });
  assert.equal(restored.restore(world.checkpoint()).ok, true);
  assert.deepEqual(restored.snapshot().lanternWalk, world.snapshot().lanternWalk);
  const resumed = (id, message) => { time += 2500; return restored.command(id, message); };
  for (const [i, lantern] of lanterns.slice(3).entries()) {
    const who = i % 2 ? 'alice' : 'bob';
    for (const position of near(lantern)) if (resumed(who, { type: 'travel', position }).ok) break;
    const reply = resumed(who, { type: 'lanterns', action: 'light', lanternId: lantern.id });
    assert.equal(reply.ok, true, lantern.id); assert.ok(reply.player);
  }
  const state = restored.snapshot().lanternWalk;
  assert.ok(state.round.completedAt);
  assert.deepEqual(new Set(state.round.lamplighters), new Set(['alice', 'bob']));
  assert.equal(state.best.lamplighters.length, 2); assert.equal(state.rounds, 1);
  // Rolling the town back to Gardens leaves the Commons-only activity behind.
  const gardens = await loadDistrictData({ districtRevision: DISTRICT_REVISION_GARDENS });
  const rolled = recoverDistrictCommonsCheckpoint({ worldData: gardens, checkpoint: restored.checkpoint(), now: () => time });
  assert.equal(rolled.ok, true);
  assert.equal(rolled.checkpoint.payload.lanternWalk, undefined);
  const back = createSharedWorld(gardens, { now: () => time });
  assert.equal(back.restore(rolled.checkpoint).ok, true);
  assert.equal(back.snapshot().lanternWalk, undefined);
  assert.equal(back.command('alice', { type: 'lanterns', action: 'light', lanternId: lanterns[0].id }).error, 'invalid_command');
});
