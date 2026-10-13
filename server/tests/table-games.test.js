import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createSharedWorld } from '../world.js';
import { createTableGames } from '../table-games.js';
import { createWalkingEnvironment } from '../../preview/src/walking.js';
import { benchSeats, resolveBenchSeat } from '../../preview/src/world-interactions.js';

// Shared games at the plaza chess tables: two residents seated at one table play each
// other, the town checks every move with the sheet's own adapters, and everyone sees
// the game. Standing up or leaving ends it.
const data = JSON.parse(await readFile(new URL('../../preview/public/data/district.json', import.meta.url)));
const environment = createWalkingEnvironment(data), benches = benchSeats(data);
const ground = (x, north) => environment.groundAt(x, -north);
const identity = userId => ({ userId, name: userId[0].toUpperCase() + userId.slice(1), sessionId: `${userId}-s`, expiresAt: Date.now() + 3_600_000 });

function setup({ seated = ['alice', 'bob'] } = {}) {
  let time = 1_000_000;
  const world = createSharedWorld(data, { now: () => time });
  for (const id of ['alice', 'bob', 'carol']) assert.equal(world.join(identity(id)).ok, true);
  // Walk up beside a chess chair and sit, through the town's own seat rules.
  const sit = (id, table, chair) => {
    const buildId = `bench:plaza-salon-${table}-${chair}`, seat = resolveBenchSeat(benches, buildId, 0, ground);
    for (const radius of [0.6, 0.9]) for (let step = 0; step < 8; step++) {
      const x = seat.position[0] + Math.sin(step * Math.PI / 4) * radius, north = seat.position[1] + Math.cos(step * Math.PI / 4) * radius;
      if (!environment.isFree(x, -north)) continue;
      Object.assign(world.players.get(id), { position: [x, north, ground(x, north)], moveBudget: 1, liftBudget: 1 });
      if (world.command(id, { type: 'sit', buildId, slot: 0 }).ok) { time += 600; return; }
    }
    throw new Error(`${id} could not sit at ${buildId}`);
  };
  seated.forEach((id, chair) => sit(id, 'chess-west', chair));
  const act = (id, message) => { time += 600; return world.command(id, { type: 'tableGame', ...message }); };
  const table = () => world.snapshot().tables.find(item => item.id === 'chess-west') ?? null;
  return { world, sit, act, table, tick: () => { time += 100; world.step(0.1); } };
}

test('two seated residents agree to a game, and the town plays it move by move for everyone to see', () => {
  const { act, table, world } = setup();
  assert.equal(act('alice', { action: 'invite', kind: 'chess' }).ok, true);
  assert.deepEqual(table().invite, { from: 'alice', to: 'bob', chair: 0, kind: 'chess', side: 'w', at: table().invite.at });
  assert.equal(act('bob', { action: 'accept' }).ok, true);
  assert.deepEqual([table().kind, table().players, table().sides, table().invite], ['chess', ['alice', 'bob'], ['w', 'b'], null]);
  assert.equal(act('alice', { action: 'move', move: 'e2e4' }).ok, true);
  assert.equal(act('bob', { action: 'move', move: 'e7e5' }).ok, true);
  // Carol, standing in the plaza, sees the same game.
  assert.deepEqual(world.snapshot().tables, [{ id: 'chess-west', kind: 'chess', moves: ['e2e4', 'e7e5'], players: ['alice', 'bob'], sides: ['w', 'b'], result: null, invite: null }]);
});

test('the town refuses moves out of turn, illegal moves, and anyone not playing', () => {
  const { act } = setup();
  act('alice', { action: 'invite', kind: 'chess' }); act('bob', { action: 'accept' });
  assert.equal(act('bob', { action: 'move', move: 'e7e5' }).error, 'not_your_turn');
  assert.equal(act('alice', { action: 'move', move: 'e2e5' }).error, 'illegal_move');
  assert.equal(act('carol', { action: 'move', move: 'e2e4' }).error, 'not_at_table');
  assert.equal(act('alice', { action: 'move', move: 'E2E4; drop' }).error, 'invalid_table_game');
  assert.equal(act('alice', { action: 'move', move: 'e2e4', position: 'k7/8/8/8/8/8/8/K7 w - - 0 1' }).error, 'invalid_table_game', 'a client never sets a position');
  assert.equal(act('alice', { action: 'invite', kind: 'checkers' }).error, 'game_in_progress');
  assert.equal(act('alice', { action: 'flip' }).error, 'invalid_table_game');
});

test('invitations need someone across the table, a real game and side, and the right person to answer', () => {
  const lone = setup({ seated: ['alice'] });
  assert.equal(lone.act('alice', { action: 'invite', kind: 'chess' }).error, 'no_opponent');
  assert.equal(lone.act('carol', { action: 'invite', kind: 'chess' }).error, 'not_at_table');
  const { act, table } = setup();
  assert.equal(act('alice', { action: 'invite', kind: 'go' }).error, 'invalid_table_game');
  assert.equal(act('alice', { action: 'invite', kind: 'chess', side: 'r' }).error, 'invalid_table_game');
  assert.equal(act('alice', { action: 'accept' }).error, 'no_invitation');
  act('alice', { action: 'invite', kind: 'reversi', side: 'l' });
  assert.equal(act('alice', { action: 'accept' }).error, 'no_invitation', 'the inviter cannot accept their own invitation');
  assert.equal(act('bob', { action: 'decline' }).ok, true);
  assert.equal(table(), null);
  // Alice chose white at Reversi, so Bob, as black, moves first.
  act('alice', { action: 'invite', kind: 'reversi', side: 'l' }); act('bob', { action: 'accept' });
  assert.deepEqual(table().sides, ['l', 'd']);
  assert.equal(act('alice', { action: 'move', move: 'd3' }).error, 'not_your_turn');
  assert.equal(act('bob', { action: 'move', move: 'd3' }).ok, true);
});

test('every chess-table game is played on its own rules', () => {
  for (const [kind, first, second] of [['checkers', 'c3-d4', 'f6-e5'], ['connectFour', 'd', 'd'], ['reversi', 'd3', 'c3'], ['morris', 'd1', 'd7']]) {
    const { act, table } = setup();
    act('alice', { action: 'invite', kind }); act('bob', { action: 'accept' });
    assert.equal(act('alice', { action: 'move', move: first }).ok, true, `${kind}: ${first}`);
    assert.equal(act('bob', { action: 'move', move: second }).ok, true, `${kind}: ${second}`);
    assert.deepEqual(table().moves, [first, second], kind);
  }
});

test('a game ends at checkmate or a resignation, and then takes no more moves', () => {
  const { act, table } = setup();
  act('alice', { action: 'invite', kind: 'chess' }); act('bob', { action: 'accept' });
  for (const [who, move] of [['alice', 'f2f3'], ['bob', 'e7e5'], ['alice', 'g2g4'], ['bob', 'd8h4']]) assert.equal(act(who, { action: 'move', move }).ok, true, move);
  assert.deepEqual(table().result, { winner: 'b', reason: 'checkmate' });
  assert.equal(act('alice', { action: 'move', move: 'a2a3' }).error, 'no_game');
  // A new game may start once one has ended.
  act('bob', { action: 'invite', kind: 'connectFour' }); act('alice', { action: 'accept' });
  assert.deepEqual([table().kind, table().sides, table().result], ['connectFour', ['y', 'r'], null], 'Bob invited from chair 1 and plays red');
  assert.equal(act('alice', { action: 'resign' }).ok, true);
  assert.deepEqual(table().result, { winner: 'r', reason: 'resigned', resigned: 'alice' });
});

test('standing up or leaving town ends the game; the table clears once both have gone', () => {
  const { act, table, world, tick } = setup();
  act('alice', { action: 'invite', kind: 'chess' }); act('bob', { action: 'accept' });
  act('alice', { action: 'move', move: 'e2e4' });
  assert.equal(world.command('bob', { type: 'stand' }).ok, true);
  tick();
  assert.deepEqual(table().result, { winner: 'w', reason: 'left the table', left: 'bob' });
  assert.equal(act('bob', { action: 'move', move: 'e7e5' }).error, 'not_at_table');
  world.leave('alice'); tick();
  assert.equal(table(), null, 'nobody is left at the table');
  // An invitation lapses when the invited resident stands.
  const second = setup();
  second.act('alice', { action: 'invite', kind: 'morris' });
  second.world.command('bob', { type: 'stand' }); second.tick();
  assert.equal(second.table(), null);
});

test('a checkpoint keeps a game in progress, and a game that does not replay is refused', () => {
  const { act, world } = setup();
  act('alice', { action: 'invite', kind: 'morris' }); act('bob', { action: 'accept' });
  act('alice', { action: 'move', move: 'd1' }); act('bob', { action: 'move', move: 'd7' });
  const saved = world.checkpoint();
  const restored = createSharedWorld(data, { now: () => 2_000_000 });
  assert.equal(restored.restore(saved).ok, true);
  assert.deepEqual(restored.snapshot().tables.map(item => [item.kind, item.moves, item.players]), [['morris', ['d1', 'd7'], ['alice', 'bob']]]);
  assert.equal(restored.command('alice', { type: 'tableGame', action: 'move', move: 'g1' }).ok, true, 'the game carries on');
  // Saved games are checked on their own too: a game that does not replay, a stranger
  // to the table or a side that is not the game's never loads.
  const games = createTableGames({ players: new Map(), tableIds: ['chess-west', 'chess-east'] }), entry = saved.payload.tableGames[0];
  assert.equal(games.validate([entry]).length, 1);
  for (const broken of [{ ...entry, moves: ['d1', 'd1'] }, { ...entry, id: 'chess-north' }, { ...entry, sides: ['w', 'w'] }, { ...entry, kind: 'go' }, { ...entry, extra: true }, { ...entry, moves: ['d1x<script>'] }]) {
    assert.throws(() => games.validate([broken]), JSON.stringify(broken).slice(0, 80));
  }
  assert.throws(() => games.validate([entry, entry]), 'one game a table');
  assert.deepEqual(games.validate(undefined), [], 'an older checkpoint has no table games');
  world.reset();
  assert.deepEqual(world.snapshot().tables, [], 'a reset clears the tables');
});
