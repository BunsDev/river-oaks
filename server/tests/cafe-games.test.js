import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createSharedWorld } from '../world.js';
import { createWalkingEnvironment } from '../../preview/src/walking.js';
import { benchSeats, resolveBenchSeat } from '../../preview/src/world-interactions.js';
import { MATCH_POINTS, findMove, legalMoves, notation, startRound } from '../../preview/src/dominoes-rules.js';

// Shared dominoes at the café round table: the town deals and holds the hands,
// checks every move, shows the plaza only the public view, and hands each
// player their own tiles through a command reply that nobody else receives.
const data = JSON.parse(await readFile(new URL('../../preview/public/data/district.json', import.meta.url)));
const environment = createWalkingEnvironment(data), benches = benchSeats(data);
const ground = (x, north) => environment.groundAt(x, -north);
const identity = userId => ({ userId, name: userId[0].toUpperCase() + userId.slice(1), sessionId: `${userId}-s`, expiresAt: Date.now() + 3_600_000 });
const resign = value => { const { checksum, ...envelope } = value; return { ...envelope, checksum: createHash('sha256').update(JSON.stringify(envelope)).digest('hex') }; };

function setup({ seats = { alice: 0, bob: 2 }, seed = 7 } = {}) {
  let time = 1_000_000;
  const world = createSharedWorld(data, { now: () => time, random: () => seed });
  for (const id of ['alice', 'bob', 'carol', 'dave']) assert.equal(world.join(identity(id)).ok, true);
  const sit = (id, buildId) => {
    const seat = resolveBenchSeat(benches, buildId, 0, ground);
    for (const radius of [0.6, 0.9, 1.2]) for (let step = 0; step < 8; step++) {
      const x = seat.position[0] + Math.sin(step * Math.PI / 4) * radius, north = seat.position[1] + Math.cos(step * Math.PI / 4) * radius;
      if (!environment.isFree(x, -north)) continue;
      Object.assign(world.players.get(id), { position: [x, north, ground(x, north)], moveBudget: 1, liftBudget: 1 });
      if (world.command(id, { type: 'sit', buildId, slot: 0 }).ok) { time += 600; return; }
    }
    throw new Error(`${id} could not sit at ${buildId}`);
  };
  for (const [id, chair] of Object.entries(seats)) sit(id, `bench:plaza-salon-round-${chair}`);
  const act = (id, message) => { time += 600; return world.command(id, { type: 'tableGame', ...message }); };
  const round = () => world.snapshot().tables.find(item => item.id === 'round') ?? null;
  const hand = id => act(id, { action: 'hand' });
  // Play the live round to its end from the town's own replies: always the first legal move.
  const playOut = (limit = 200) => {
    for (let i = 0; i < limit; i++) {
      const view = round(); if (!view || view.result) return view;
      const id = view.players[view.turn], reply = hand(id);
      assert.equal(reply.ok, true, `hand for ${id}`);
      assert.equal(act(id, { action: 'move', move: reply.legal[0] }).ok, true, `move ${reply.legal[0]} by ${id}`);
    }
    throw new Error('the round did not end');
  };
  return { world, sit, act, round, hand, playOut, tick: () => { time += 100; world.step(0.1); } };
}

test('the resident across is invited, the town deals seven tiles each, and nobody but the owner sees a hand', () => {
  const { act, round, hand, world } = setup();
  assert.equal(act('alice', { action: 'invite', kind: 'dominoes' }).error, undefined);
  assert.deepEqual(round().invite, { from: 'alice', to: 'bob', chair: 0, kind: 'dominoes', at: round().invite.at });
  assert.equal(act('carol', { action: 'accept' }).error, 'not_at_table', 'a bystander is not at the table');
  assert.equal(act('bob', { action: 'accept' }).ok, true);
  const view = round();
  assert.deepEqual([view.kind, view.players, view.sides, view.sizes, view.boneyard, view.version, view.invite], ['dominoes', ['alice', 'bob'], [0, 2], [7, 7], 14, 1, null]);
  assert.equal(view.line.length, 0); assert.equal(view.lead, null, 'the lead tile stays private until it is played');
  assert.ok(!('hands' in view) && !('hand' in view) && !('seed' in view) && !('moves' in view), 'the snapshot carries no hand, seed or moves');
  assert.equal(JSON.stringify(world.snapshot()).includes('"hands"'), false);
  const alice = hand('alice'), bob = hand('bob');
  assert.equal(alice.hand.length, 7); assert.equal(bob.hand.length, 7);
  assert.equal(new Set([...alice.hand, ...bob.hand]).size, 14, 'the two hands are disjoint');
  assert.deepEqual(alice.hand, startRound(7, 2).hands[0], 'the inviter is player 0 of the seeded deal');
  const leader = view.players[view.turn];
  assert.deepEqual(hand(leader).legal, [notation(legalMoves(startRound(7, 2))[0])], 'the leader must open with the lead tile');
  assert.deepEqual(hand(view.players[1 - view.turn]).legal, [], 'the other player has no move yet');
  assert.equal(hand('carol').error, 'not_at_table');
  assert.equal(act('alice', { action: 'invite', kind: 'dominoes' }).error, 'game_in_progress');
  assert.equal(act('alice', { action: 'hand', extra: 1 }).error, 'invalid_table_game');
  assert.equal(act('alice', { action: 'resign', extra: 1 }).error, 'invalid_table_game');
});

test('a seated spectator gets no hand, a third resident does not disturb the round, and an invitation can be declined', () => {
  const f = setup({ seats: { alice: 1, bob: 3 } });
  assert.equal(f.act('alice', { action: 'invite', kind: 'dominoes' }).ok, true, 'chair 1 invites chair 3');
  assert.equal(f.act('alice', { action: 'decline' }).ok, true, 'the inviter can cancel');
  assert.equal(f.round(), null);
  f.act('alice', { action: 'invite', kind: 'dominoes' }); f.act('bob', { action: 'accept' });
  f.sit('carol', 'bench:plaza-salon-round-0');
  assert.equal(f.hand('carol').error, 'no_round', 'a seated spectator has no hand');
  assert.equal(f.act('carol', { action: 'move', move: 'pass' }).error, 'no_round');
  assert.equal(f.act('carol', { action: 'invite', kind: 'dominoes' }).error, 'no_opponent', 'nobody sits across from chair 0');
  f.tick();
  assert.deepEqual([f.round().players, f.round().sides, f.round().result], [['alice', 'bob'], [1, 3], null], 'the round is untouched');
  // No tile of either hand reaches the plaza, only the line.
  const hidden = [...f.hand('alice').hand, ...f.hand('bob').hand].filter(tile => !f.round().line.some(item => item.tile === tile));
  const frame = JSON.stringify(f.world.snapshot());
  assert.ok(hidden.length === 14 && hidden.every(tile => !frame.includes(`"${tile}"`)), 'no hand tile is in the snapshot');
  f.world.reset(); assert.equal(f.round(), null, 'a reset clears the table');
});

test('plays join the line, a draw keeps the turn and hides the tile, and the version ticks', () => {
  const { act, round, hand } = setup();
  act('alice', { action: 'invite', kind: 'dominoes' }); act('bob', { action: 'accept' });
  let view = round(); const leader = view.players[view.turn], other = view.players[1 - view.turn];
  assert.equal(act(other, { action: 'move', move: hand(leader).legal[0] }).error, 'not_your_turn');
  assert.equal(act(leader, { action: 'move', move: 'L:0-0' }).error, 'illegal_move');
  assert.equal(act(leader, { action: 'move', move: 'x'.repeat(13) }).error, 'invalid_table_game');
  const opening = hand(leader).legal[0];
  assert.equal(act(leader, { action: 'move', move: opening }).ok, true);
  view = round();
  assert.equal(view.version, 2); assert.equal(view.line.length, 1); assert.equal(view.lead, opening.slice(2));
  assert.deepEqual(view.lastMove, { player: view.players.indexOf(leader), kind: 'play', tile: opening.slice(2), end: 'right' });
  assert.deepEqual(view.sizes[view.players.indexOf(leader)], 6);
  // Drive until somebody has to draw, then check the draw's public face.
  let draws = 0;
  for (let i = 0; i < 60 && !draws; i++) {
    view = round(); if (view.result) break;
    const id = view.players[view.turn], reply = hand(id);
    if (reply.legal[0] === 'draw') {
      const before = hand(id).hand.length, boneyard = view.boneyard;
      assert.equal(act(id, { action: 'move', move: 'draw' }).ok, true);
      view = round(); draws++;
      assert.deepEqual(view.lastMove, { player: view.players.indexOf(id), kind: 'draw' }, 'the drawn tile is not public');
      assert.equal(view.boneyard, boneyard - 1); assert.equal(hand(id).hand.length, before + 1);
      assert.equal(view.players[view.turn], id, 'a draw keeps the turn');
    } else assert.equal(act(id, { action: 'move', move: reply.legal[0] }).ok, true);
  }
  assert.ok(draws > 0, 'this seed makes somebody draw');
});

test('a round ends by domino or by a block, scores accumulate, next deals again, and the match ends at the limit', () => {
  const { act, round, playOut } = setup();
  act('alice', { action: 'invite', kind: 'dominoes' }); act('bob', { action: 'accept' });
  let view = playOut();
  assert.ok(['domino', 'blocked'].includes(view.result.reason), view.result.reason);
  assert.ok(view.result.points >= 0);
  const winner = view.result.winner;
  if (winner !== null) assert.equal(view.scores[winner], view.result.points);
  assert.equal(act('alice', { action: 'move', move: 'pass' }).error, 'no_round');
  assert.equal(act('bob', { action: 'next' }).ok, true);
  view = round();
  assert.equal(view.result, null); assert.equal(view.line.length, 0); assert.deepEqual(view.sizes, [7, 7]);
  let rounds = 1;
  while (!round().result?.match && rounds < 40) { playOut(); if (!round().result.match) { assert.equal(act('alice', { action: 'next' }).ok, true); } rounds++; }
  view = round();
  assert.equal(view.result.match, true, 'the match ends');
  assert.ok(Math.max(...view.scores) >= MATCH_POINTS);
  assert.equal(act('alice', { action: 'next' }).error, 'match_over');
});

test('resigning ends the match for the other player, and an ended round stays until both stand', () => {
  const { act, round, world, tick } = setup();
  act('alice', { action: 'invite', kind: 'dominoes' }); act('bob', { action: 'accept' });
  assert.equal(act('bob', { action: 'resign' }).ok, true);
  assert.deepEqual(round().result, { winner: 0, reason: 'resigned', resigned: 'bob', match: true });
  assert.equal(world.command('alice', { type: 'stand' }).ok, true); tick();
  assert.equal(round().result.reason, 'resigned', 'the result stays while Bob still sits');
  assert.equal(world.command('bob', { type: 'stand' }).ok, true); tick();
  assert.equal(round(), null, 'both stood: the table is clear');
});

test('leaving the chair mid-round loses it, an invitation lapses when either leaves, and leaving town counts', () => {
  const f = setup();
  f.act('alice', { action: 'invite', kind: 'dominoes' });
  assert.equal(f.world.command('bob', { type: 'stand' }).ok, true); f.tick();
  assert.equal(f.round(), null, 'the invitation lapsed');
  f.sit('bob', 'bench:plaza-salon-round-2');
  f.act('alice', { action: 'invite', kind: 'dominoes' }); f.act('bob', { action: 'accept' });
  assert.equal(f.world.leave('bob'), true); f.tick();
  assert.deepEqual(f.round().result, { winner: 0, reason: 'left the table', left: 'bob', match: true });
  assert.equal(f.act('alice', { action: 'next' }).error, 'match_over', 'no new round against an empty chair');
  assert.deepEqual(f.hand('alice').hand.length, 7, 'the winner can still look at the hand');
});

test('a checkpoint restores the hidden round exactly, and a tampered hand is refused', () => {
  const f = setup();
  f.act('alice', { action: 'invite', kind: 'dominoes' }); f.act('bob', { action: 'accept' });
  const leader = f.round().players[f.round().turn];
  f.act(leader, { action: 'move', move: f.hand(leader).legal[0] });
  const saved = f.world.checkpoint();
  assert.ok(!JSON.stringify(f.world.snapshot()).includes('"seed"') && !JSON.stringify(f.world.snapshot()).includes('"moves"'), 'the snapshot carries no seed or move list');
  const restored = createSharedWorld(data, { now: () => 2_000_000 });
  assert.deepEqual(restored.restore(saved), { ok: true });
  const view = restored.snapshot().tables.find(item => item.id === 'round');
  assert.deepEqual([view.version, view.line.length, view.sizes], [f.round().version, 1, f.round().sizes]);
  assert.deepEqual(restored.command('alice', { type: 'tableGame', action: 'hand' }).hand, f.hand('alice').hand);
  const refuse = (mutate, label) => {
    const tampered = JSON.parse(JSON.stringify(saved)); mutate(tampered.payload.cafeGames[0]);
    let reason = null;
    assert.equal(createSharedWorld(data, { now: () => 2_000_000 }).restore(resign(tampered), { onFailure: r => { reason = r; } }).ok, false, label);
    assert.equal(reason, 'invalid_cafe_game', label);
  };
  refuse(item => { item.round.hands[0][0] = '6-6'; }, 'a tampered hand');
  refuse(item => { item.round.seed += 1; }, 'a seed that does not replay');
  refuse(item => { item.seats = [0, 1]; }, 'seats that are not across');
  refuse(item => { item.scores = [-1, 0]; }, 'a negative score');
  refuse(item => { item.version = 1e10; }, 'an oversize version');
  refuse(item => { item.last = { player: 0, kind: 'draw' }; }, 'a last move that does not match the moves');
  refuse(item => { item.result = { winner: 0, reason: 'domino', points: 9 }; }, 'a result the round did not reach');
});

test('a chess-table sender still reaches the chess module, and the café refuses chess actions', () => {
  const f = setup({ seats: { alice: 0, bob: 2 } });
  f.sit('carol', 'bench:plaza-salon-chess-west-0'); f.sit('dave', 'bench:plaza-salon-chess-west-1');
  assert.equal(f.act('carol', { action: 'invite', kind: 'chess' }).ok, true);
  assert.equal(f.act('alice', { action: 'invite', kind: 'chess' }).error, 'invalid_table_game');
  assert.equal(f.act('alice', { action: 'invite', kind: 'dominoes', side: 'w' }).error, 'invalid_table_game');
  assert.equal(f.world.snapshot().tables.length, 1);
  f.act('alice', { action: 'invite', kind: 'dominoes' }); f.act('bob', { action: 'accept' });
  assert.deepEqual(f.world.snapshot().tables.map(t => t.id).sort(), ['chess-west', 'round']);
});

test('a block ends an open dominoes invitation between the two', () => {
  const { act, round, world } = setup();
  assert.equal(act('alice', { action: 'invite', kind: 'dominoes' }).error, undefined);
  assert.equal(world.separate('alice', 'nobody-here'), false);
  assert.ok(round().invite);
  assert.equal(world.separate('bob', 'alice'), true);
  assert.equal(round(), null);
});
