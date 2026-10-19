// Shared darts at a throwing line (the IPIC Tuck Room): the module on its own,
// with players placed directly at or away from the line.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createDartsGames, DARTS_REGULAR, DARTS_SCATTER } from '../darts-games.js';
import { THROW, accelFor, landingOf, replay, START } from '../../preview/src/darts-rules.js';

function fixture({ random } = {}) {
  const players = new Map(), at = new Map();
  let changes = 0;
  const games = createDartsGames({ players, lineIds: ['ipic-tuck-room'], atLine: player => at.get(player.id) ?? null, changed: () => changes++, ...(random ? { random } : {}) });
  const join = (id, line = 'ipic-tuck-room') => { players.set(id, { id }); at.set(id, line); return players.get(id); };
  const send = (id, message) => games.command(players.get(id), { type: 'darts', lineId: 'ipic-tuck-room', ...message });
  const line = () => games.snapshot().find(item => item.id === 'ipic-tuck-room') ?? null;
  return { games, players, at, join, send, line, changes: () => changes };
}
// A server random that always returns the middle of its range: no scatter at all.
const still = () => .5;
// The release that flies a dart onto a point [across, height] (darts-rules.js accelFor).
const rel = ([x, y]) => [x, accelFor(y)];

test('a player alone at the line practises against the house regular, who throws on the server', () => {
  const f = fixture({ random: still });
  f.join('alice');
  assert.equal(f.send('alice', { action: 'practice' }).ok, true);
  assert.deepEqual(f.line().players, ['alice', DARTS_REGULAR]);
  const replies = [0, 1, 2].map(() => f.send('alice', { action: 'throw', release: rel([0, 103]) }));
  assert.ok(replies.every(reply => reply.ok), 'treble 20');
  const view = f.line();
  // Alice's three darts, then the regular's three, then back to Alice.
  assert.equal(view.points.length, 6);
  // Each reply names alice's own dart, even the third, which the regular answers at once.
  assert.deepEqual(replies.map(reply => [reply.thrown, reply.darts.points.length]), [[0, 1], [1, 2], [2, 6]]);
  assert.equal(view.scores[0], START - 180);
  assert.ok(view.scores[1] < START, 'the regular scored');
  assert.equal(view.turn, 0);
  assert.deepEqual(view.scores, replay(view.points, 2).state.scores, 'the snapshot is the rules replayed');
});

test('two players at the line invite, accept and alternate turns of three darts', () => {
  const f = fixture({ random: still });
  f.join('alice'); f.join('bob');
  assert.equal(f.send('alice', { action: 'invite', peerId: 'bob' }).ok, true);
  assert.deepEqual(f.line().invite, { from: 'alice', to: 'bob' });
  assert.equal(f.send('alice', { action: 'accept' }).error, 'no_invitation', 'only the invited player accepts');
  assert.equal(f.send('bob', { action: 'accept' }).ok, true);
  assert.deepEqual(f.line().players, ['alice', 'bob']);
  assert.equal(f.send('bob', { action: 'throw', release: rel([0, 0]) }).error, 'not_your_turn');
  for (let i = 0; i < 3; i++) assert.equal(f.send('alice', { action: 'throw', release: rel([0, 0]) }).ok, true);
  assert.equal(f.line().turn, 1);
  assert.equal(f.send('alice', { action: 'throw', release: rel([0, 0]) }).error, 'not_your_turn');
  assert.equal(f.send('bob', { action: 'throw', release: rel([0, 0]) }).ok, true);
  assert.deepEqual(f.line().scores, [START - 150, START - 50]);
});

test('the server flies the dart: the release plus the hand\'s own error, inside the board square', () => {
  const draws = [.9, .1, .3, .7];
  let n = 0;
  const f = fixture({ random: () => draws[n++ % draws.length] });
  f.join('alice'); f.send('alice', { action: 'practice' });
  f.send('alice', { action: 'throw', release: rel([0, 0]) });
  const [x, y] = f.line().points[0];
  assert.ok(Math.hypot(x, y) > 0, 'scatter moved the dart');
  assert.ok(Math.hypot(x, y) < DARTS_SCATTER * 6, 'within a hand');
  for (const release of [[0, THROW.accel[0] - 1], [0, THROW.accel[1] + 1], [THROW.across + 1, 50], [Infinity, 50], ['20', 50], [0], [0, 50, 1], null])
    assert.equal(f.send('alice', { action: 'throw', release }).error, 'invalid_darts', JSON.stringify(release));
  assert.equal(f.send('alice', { action: 'throw', release: rel([0, 0]), point: [0, 0] }).error, 'invalid_darts', 'a client cannot name the landing point');
  assert.equal(f.send('alice', { action: 'throw', aim: [0, 103] }).error, 'invalid_darts', 'nor send an aimed point instead of a release');
});

test('the dart follows its release: across from the direction, height from the hand\'s speed', () => {
  const f = fixture({ random: still });
  f.join('alice'); f.send('alice', { action: 'practice' });
  for (const release of [[0, 50], [-120, 60.512], [40, 42]]) {
    const before = f.line().points.length;
    assert.equal(f.send('alice', { action: 'throw', release }).ok, true);
    const [x, y] = f.line().points[before];
    assert.deepEqual([x, y], landingOf(release).map(n => Math.round(n * 10) / 10), JSON.stringify(release));
  }
  // The same speed error drops a slow dart further than a firm one. Draws: the regular's
  // seed, then the dart's direction error, then its speed error.
  const first = (draws, release) => { let n = 0; const g = fixture({ random: () => draws[Math.min(n++, draws.length - 1)] }); g.join('a'); g.send('a', { action: 'practice' }); g.send('a', { action: 'throw', release }); return g.line().points[0][1]; };
  const low = first([.5, .5, .2], [0, 42]) - first([.5], [0, 42]), firm = first([.5, .5, .2], [0, 70]) - first([.5], [0, 70]);
  assert.ok(low < 0 && firm < 0, 'a slow hand drops the dart');
  assert.ok(Math.abs(low) > Math.abs(firm) * 1.6, `slow ${low} mm vs firm ${firm} mm`);
});

test('only players at the line can start, join or throw', () => {
  const f = fixture({ random: still });
  f.join('alice'); f.join('carol', null);
  assert.equal(f.send('carol', { action: 'practice' }).error, 'not_at_line');
  assert.equal(f.send('alice', { action: 'invite', peerId: 'carol' }).error, 'peer_not_at_line');
  assert.equal(f.send('alice', { action: 'invite', peerId: 'alice' }).error, 'invalid_darts');
  assert.equal(f.send('alice', { action: 'practice' }).ok, true);
  f.join('carol');
  assert.equal(f.send('carol', { action: 'practice' }).error, 'line_busy', 'one match at a line');
  assert.equal(f.send('carol', { action: 'throw', release: rel([0, 0]) }).error, 'not_playing');
});

test('a checkout wins, and leaving the line or resigning ends a match for both', () => {
  const f = fixture({ random: still });
  f.join('alice'); f.join('bob');
  f.send('alice', { action: 'invite', peerId: 'bob' }); f.send('bob', { action: 'accept' });
  f.send('alice', { action: 'resign' });
  assert.deepEqual(f.line().result, { winner: 1, reason: 'resigned' });
  assert.equal(f.send('bob', { action: 'throw', release: rel([0, 0]) }).error, 'match_over');
  assert.equal(f.send('alice', { action: 'invite', peerId: 'bob' }).ok, true, 'a rematch can start after a result');
  f.send('bob', { action: 'accept' });
  f.at.set('bob', null); f.games.prune();
  assert.deepEqual(f.line().result, { winner: 0, reason: 'left the line' });
  f.at.set('alice', null); f.games.prune();
  assert.equal(f.line(), null, 'the line clears once nobody from the match is there');
});

test('a match replays from its checkpoint, and a tampered checkpoint is refused', () => {
  const f = fixture({ random: still });
  f.join('alice'); f.join('bob');
  f.send('alice', { action: 'invite', peerId: 'bob' }); f.send('bob', { action: 'accept' });
  for (let i = 0; i < 4; i++) f.send(i < 3 ? 'alice' : 'bob', { action: 'throw', release: rel([0, 103]) });
  const saved = JSON.parse(JSON.stringify(f.games.checkpoint()));
  const g = fixture();
  g.games.load(g.games.validate(saved));
  assert.deepEqual(g.games.snapshot(), f.games.snapshot());
  const bad = [
    [{ ...saved[0], id: 'elsewhere' }],
    [{ ...saved[0], points: [...saved[0].points, [0, 0]], result: { winner: 0, reason: 'checkout' } }],
    [{ ...saved[0], points: [[0, 'x']] }],
    [{ ...saved[0], players: ['alice'] }],
    [{ ...saved[0], extra: true }],
    [saved[0], saved[0]],
  ];
  for (const item of bad) assert.throws(() => g.games.validate(item), JSON.stringify(item).slice(0, 80));
  assert.deepEqual(g.games.validate([]), []);
});

test('a dart that brings the score to exactly zero on a double finishes the match', () => {
  const f = fixture({ random: still });
  f.join('alice'); f.join('bob');
  f.send('alice', { action: 'invite', peerId: 'bob' }); f.send('bob', { action: 'accept' });
  // 501 = 9 × T20 (540) is too many; use 8 × T20 = 480, leaving 21: S5 then D8.
  const turn = (id, aims) => aims.forEach(aim => assert.equal(f.send(id, { action: 'throw', release: rel(aim) }).ok, true));
  const t20 = [0, 103], miss = [0, 190];
  turn('alice', [t20, t20, t20]); turn('bob', [miss, miss, miss]);
  turn('alice', [t20, t20, t20]); turn('bob', [miss, miss, miss]);
  turn('alice', [t20, t20]);
  assert.equal(f.line().scores[0], 21);
  // Single 5 (sector 5 at 342°) leaves 16, then the double 8 (sector 8 at 252°).
  const at = (deg, r) => [Math.sin(deg * Math.PI / 180) * r, Math.cos(deg * Math.PI / 180) * r];
  turn('alice', [at(342, 130)]); turn('bob', [miss, miss, miss]);
  turn('alice', [at(252, 166)]);
  assert.deepEqual(f.line().result, { winner: 0, reason: 'checkout' });
  assert.ok(f.changes() > 0);
});
