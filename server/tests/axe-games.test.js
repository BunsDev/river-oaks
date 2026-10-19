// Shared axe throwing at a lane (the unbranded axe-and-darts room): the module on its
// own, with players placed directly at or away from a lane.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createAxeGames, AXE_HOUSE, AXE_SCATTER } from '../axe-games.js';
import { AXE_THROW, THROWS, axeLandingOf, axeSpeedFor, replay } from '../../preview/src/axe-rules.js';

function fixture({ random, distance = AXE_THROW.ideal } = {}) {
  const players = new Map(), at = new Map();
  const games = createAxeGames({ players, laneIds: ['lane-1', 'lane-2'], atLane: player => at.get(player.id) ?? null, distanceTo: () => distance, ...(random ? { random } : {}) });
  const join = (id, lane = 'lane-1') => { players.set(id, { id }); at.set(id, lane); };
  const send = (id, message, laneId = 'lane-1') => games.command(players.get(id), { type: 'axes', laneId, ...message });
  const lane = (laneId = 'lane-1') => games.snapshot().find(item => item.id === laneId) ?? null;
  return { games, at, join, send, lane };
}
// A server random fixed at the middle: no scatter, and every axe sticks.
const still = () => .5;
// The release that flies an axe onto a point [across, height] from the ideal distance.
const rel = ([x, y]) => [x, axeSpeedFor(y, AXE_THROW.ideal)];

test('alone at a lane, a player throws against the house, who throws on the server', () => {
  const f = fixture({ random: still });
  f.join('alice');
  assert.equal(f.send('alice', { action: 'practice' }).ok, true);
  const reply = f.send('alice', { action: 'throw', release: rel([0, 0]) });
  assert.equal(reply.ok, true);
  const view = f.lane();
  assert.deepEqual(view.players, ['alice', AXE_HOUSE]);
  assert.equal(view.throws.length, 2, 'the house answered at once');
  // The reply names the thrower's own axe, ahead of the house's answer in the same reply.
  assert.deepEqual([reply.thrown, reply.axes.throws.length], [0, 2]);
  assert.equal(f.send('alice', { action: 'throw', release: rel([0, 0]) }).thrown, 2);
  assert.equal(view.scores[0], 6);
  assert.equal(view.turn, 0);
  assert.deepEqual(view.scores, replay(view.throws).state.scores);
});

test('two players at a lane alternate ten throws each and the higher total wins', () => {
  const f = fixture({ random: still });
  f.join('alice'); f.join('bob');
  assert.equal(f.send('alice', { action: 'invite', peerId: 'bob' }).ok, true);
  assert.equal(f.send('bob', { action: 'accept' }).ok, true);
  assert.equal(f.send('bob', { action: 'throw', release: rel([0, 0]) }).error, 'not_your_turn');
  for (let i = 0; i < THROWS; i++) {
    assert.equal(f.send('alice', { action: 'throw', release: rel([0, 0]) }).ok, true);
    assert.equal(f.send('bob', { action: 'throw', release: rel([0, 150]) }).ok, true);
  }
  assert.deepEqual(f.lane().scores, [60, 30]);
  assert.deepEqual(f.lane().result, { winner: 0, reason: 'final' });
  assert.equal(f.send('alice', { action: 'throw', release: rel([0, 0]) }).error, 'match_over');
});

test('the server decides where the blade lands and whether it sticks', () => {
  // Draws after the house seed: across, speed, twist (unit-variance), then the grain (uniform).
  const draws = [.5, .95, .05, .5, .99];
  let n = 0;
  const f = fixture({ random: () => draws[Math.min(n++, draws.length - 1)] });
  f.join('alice'); f.send('alice', { action: 'practice' });
  const reply = f.send('alice', { action: 'throw', release: rel([0, 0]) });
  const [first] = f.lane().throws;
  assert.ok(Math.hypot(...first.point) > 0 && Math.hypot(...first.point) < AXE_SCATTER * 8, 'the hand moved the axe');
  assert.equal(first.stuck, false, 'a bad grain roll bounces off');
  assert.equal(reply.rotation, 'clean', 'it turned cleanly from the ideal distance');
  for (const message of [{ release: [0, AXE_THROW.speed[1] + 0.1] }, { release: [0, AXE_THROW.speed[0] - 0.1] }, { release: [AXE_THROW.across + 1, 8] }, { release: [NaN, 8] },
    { release: [0, 8, 1] }, { release: rel([0, 0]), stuck: true }, { release: rel([0, 0]), point: [0, 0] }, { aim: [0, 0] }]) {
    assert.equal(f.send('alice', { action: 'throw', ...message }).error, 'invalid_axes', JSON.stringify(message));
  }
});

test('the release flies the axe, and the thrower\'s distance decides its rotation', () => {
  // Steady hands: the throw lands where its release carries it from where the thrower stands.
  for (const distance of [3.9, AXE_THROW.ideal, 4.4]) {
    const f = fixture({ random: still, distance });
    f.join('alice'); f.send('alice', { action: 'practice' });
    const reply = f.send('alice', { action: 'throw', release: [-60, 8.4] });
    assert.deepEqual(f.lane().throws[0].point, axeLandingOf([-60, 8.4], distance).map(v => Math.round(v * 10) / 10), `from ${distance} m`);
    assert.deepEqual([f.lane().throws[0].stuck, reply.rotation], [true, 'clean'], `${distance} m turns once`);
  }
  // Too close the handle hits first, too far the top: no score, and the reply says which way to step.
  for (const [distance, rotation] of [[3.66, 'under'], [5.0, 'over']]) {
    const draws = [.5, .5, .5, rotation === 'under' ? .2 : .5, .5];
    let n = 0;
    const f = fixture({ random: () => draws[Math.min(n++, draws.length - 1)], distance });
    f.join('alice'); f.send('alice', { action: 'practice' });
    const reply = f.send('alice', { action: 'throw', release: rel([0, 0]) });
    assert.deepEqual([f.lane().throws[0].stuck, reply.rotation], [false, rotation], `${distance} m`);
    assert.equal(f.lane().scores[0], 0);
  }
  // Stepping back drops the same throw lower.
  assert.ok(axeLandingOf([0, 8], 4.6)[1] < axeLandingOf([0, 8], 4.0)[1] - 100);
});

test('each lane holds its own match, and only players at that lane play it', () => {
  const f = fixture({ random: still });
  f.join('alice'); f.join('bob', 'lane-2'); f.join('carol', null);
  assert.equal(f.send('alice', { action: 'practice' }).ok, true);
  assert.equal(f.send('bob', { action: 'practice' }, 'lane-2').ok, true);
  assert.equal(f.send('bob', { action: 'throw', release: rel([0, 0]) }).error, 'not_playing', 'bob is not in lane 1');
  assert.equal(f.send('carol', { action: 'practice' }).error, 'not_at_lane');
  assert.equal(f.send('alice', { action: 'invite', peerId: 'bob' }).error, 'peer_not_at_lane');
  assert.equal(f.games.snapshot().length, 2);
});

test('walking off ends the match; the lane clears when nobody from it remains', () => {
  const f = fixture({ random: still });
  f.join('alice'); f.join('bob');
  f.send('alice', { action: 'invite', peerId: 'bob' }); f.send('bob', { action: 'accept' });
  f.send('alice', { action: 'throw', release: rel([0, 0]) });
  f.at.set('alice', null); f.games.prune();
  assert.deepEqual(f.lane().result, { winner: 1, reason: 'left the lane' });
  f.at.set('bob', null); f.games.prune();
  assert.equal(f.lane(), null);
});

test('a match replays from its checkpoint, and a tampered checkpoint is refused', () => {
  const f = fixture({ random: still });
  f.join('alice'); f.join('bob');
  f.send('alice', { action: 'invite', peerId: 'bob' }); f.send('bob', { action: 'accept' });
  f.send('alice', { action: 'throw', release: rel([0, 0]) }); f.send('bob', { action: 'throw', release: rel([235, 235]) });
  const saved = JSON.parse(JSON.stringify(f.games.checkpoint()));
  const g = fixture();
  g.games.load(g.games.validate(saved));
  assert.deepEqual(g.games.snapshot(), f.games.snapshot());
  for (const bad of [
    [{ ...saved[0], id: 'lane-9' }],
    [{ ...saved[0], throws: [{ point: [0, 0] }] }],
    [{ ...saved[0], throws: [{ point: [0, 0], stuck: 'yes' }] }],
    [{ ...saved[0], result: { winner: 0, reason: 'final' } }],
    [{ ...saved[0], players: ['alice', 'alice'] }],
    [saved[0], saved[0]],
  ]) assert.throws(() => g.games.validate(bad), JSON.stringify(bad).slice(0, 90));
});
