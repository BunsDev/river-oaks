// Shared axe throwing at a lane (the unbranded axe-and-darts room): the module on its
// own, with players placed directly at or away from a lane.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createAxeGames, AXE_HOUSE, AXE_SCATTER } from '../axe-games.js';
import { THROWS, replay } from '../../preview/src/axe-rules.js';

function fixture({ random } = {}) {
  const players = new Map(), at = new Map();
  const games = createAxeGames({ players, laneIds: ['lane-1', 'lane-2'], atLane: player => at.get(player.id) ?? null, ...(random ? { random } : {}) });
  const join = (id, lane = 'lane-1') => { players.set(id, { id }); at.set(id, lane); };
  const send = (id, message, laneId = 'lane-1') => games.command(players.get(id), { type: 'axes', laneId, ...message });
  const lane = (laneId = 'lane-1') => games.snapshot().find(item => item.id === laneId) ?? null;
  return { games, at, join, send, lane };
}
// A server random fixed at the middle: no scatter, and every axe sticks.
const still = () => .5;

test('alone at a lane, a player throws against the house, who throws on the server', () => {
  const f = fixture({ random: still });
  f.join('alice');
  assert.equal(f.send('alice', { action: 'practice' }).ok, true);
  assert.equal(f.send('alice', { action: 'throw', aim: [0, 0] }).ok, true);
  const view = f.lane();
  assert.deepEqual(view.players, ['alice', AXE_HOUSE]);
  assert.equal(view.throws.length, 2, 'the house answered at once');
  assert.equal(view.scores[0], 6);
  assert.equal(view.turn, 0);
  assert.deepEqual(view.scores, replay(view.throws).state.scores);
});

test('two players at a lane alternate ten throws each and the higher total wins', () => {
  const f = fixture({ random: still });
  f.join('alice'); f.join('bob');
  assert.equal(f.send('alice', { action: 'invite', peerId: 'bob' }).ok, true);
  assert.equal(f.send('bob', { action: 'accept' }).ok, true);
  assert.equal(f.send('bob', { action: 'throw', aim: [0, 0] }).error, 'not_your_turn');
  for (let i = 0; i < THROWS; i++) {
    assert.equal(f.send('alice', { action: 'throw', aim: [0, 0] }).ok, true);
    assert.equal(f.send('bob', { action: 'throw', aim: [0, 150] }).ok, true);
  }
  assert.deepEqual(f.lane().scores, [60, 30]);
  assert.deepEqual(f.lane().result, { winner: 0, reason: 'final' });
  assert.equal(f.send('alice', { action: 'throw', aim: [0, 0] }).error, 'match_over');
});

test('the server decides where the blade lands and whether it sticks', () => {
  const draws = [.95, .05, .99];
  let n = 0;
  const f = fixture({ random: () => draws[n++ % draws.length] });
  f.join('alice'); f.send('alice', { action: 'practice' });
  f.send('alice', { action: 'throw', aim: [0, 0] });
  const [first] = f.lane().throws;
  assert.ok(Math.hypot(...first.point) > 0 && Math.hypot(...first.point) < AXE_SCATTER * 8, 'scatter moved the axe');
  assert.equal(first.stuck, false, 'a high roll bounces off');
  for (const message of [{ aim: [0, 900] }, { aim: [NaN, 0] }, { aim: [0, 0], stuck: true }, { aim: [0, 0], point: [0, 0] }]) {
    assert.equal(f.send('alice', { action: 'throw', ...message }).error, 'invalid_axes', JSON.stringify(message));
  }
});

test('each lane holds its own match, and only players at that lane play it', () => {
  const f = fixture({ random: still });
  f.join('alice'); f.join('bob', 'lane-2'); f.join('carol', null);
  assert.equal(f.send('alice', { action: 'practice' }).ok, true);
  assert.equal(f.send('bob', { action: 'practice' }, 'lane-2').ok, true);
  assert.equal(f.send('bob', { action: 'throw', aim: [0, 0] }).error, 'not_playing', 'bob is not in lane 1');
  assert.equal(f.send('carol', { action: 'practice' }).error, 'not_at_lane');
  assert.equal(f.send('alice', { action: 'invite', peerId: 'bob' }).error, 'peer_not_at_lane');
  assert.equal(f.games.snapshot().length, 2);
});

test('walking off ends the match; the lane clears when nobody from it remains', () => {
  const f = fixture({ random: still });
  f.join('alice'); f.join('bob');
  f.send('alice', { action: 'invite', peerId: 'bob' }); f.send('bob', { action: 'accept' });
  f.send('alice', { action: 'throw', aim: [0, 0] });
  f.at.set('alice', null); f.games.prune();
  assert.deepEqual(f.lane().result, { winner: 1, reason: 'left the lane' });
  f.at.set('bob', null); f.games.prune();
  assert.equal(f.lane(), null);
});

test('a match replays from its checkpoint, and a tampered checkpoint is refused', () => {
  const f = fixture({ random: still });
  f.join('alice'); f.join('bob');
  f.send('alice', { action: 'invite', peerId: 'bob' }); f.send('bob', { action: 'accept' });
  f.send('alice', { action: 'throw', aim: [0, 0] }); f.send('bob', { action: 'throw', aim: [235, 235] });
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
