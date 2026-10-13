# Shared games at the plaza chess tables — 2026-10-13

**Objective (Val):** "proceed with implementing the aforementioned plan". The plan
was shared table games: until now every plaza table game has been a practice game
kept in one browser, and the sheet said "Others in the town see a fresh board;
shared games are coming." Now two residents seated at one chess table play each
other, the town holds and checks the game, and everyone sees the real board.

**Owner:** river-oaks-3b. river-oaks-c2 owns the game sheets and agreed to the
touch points: CHESS and CHECKERS move into a pure module;
`createWorkerThinker` stays exported; a shared game is its own mode and never
overwrites a practice game.

**Plan:** two PRs.
1. **Server authority** (`feat/shared-table-games-20261013`): `server/table-games.js`,
   wired into the world, with no change players can see yet.
2. **The sheet:** a "Play ⟨name⟩" mode, invitations, moves through the town, and
   every table's 3D mirror showing its shared game to everyone.

## PR 1: the town holds the games

- **`preview/src/table-game-adapters.js`** (new, pure): CHESS and CHECKERS move
  out of `plaza-table-games.js`. With CONNECT_FOUR, REVERSI and MORRIS they make
  `TABLE_GAMES`, which the sheet, the worker and the server all import.
  `plaza-table-games.js` re-exports `TABLE_GAMES`; its behaviour is unchanged.
- **`server/table-games.js`** (new): per chess table `{ kind, moves, players,
  sides, result, invite }`. The command is
  `{ type: 'tableGame', action, … }`, from a resident seated at a chess table.
  - **invite** `{ kind, side? }`: the resident across the table must be
    seated. The side defaults to the first mover's. It is refused while a game
    is in progress.
  - **accept / decline:** only the invited resident accepts; either decline
    clears the invitation.
  - **move** `{ move }`: only a player, on their turn, with a key the adapter
    lists for the replayed position. The key is never trusted as a position.
    The result comes from the adapter's replay (checkmate, four in a row, a
    full count, two pieces…). The move limit is 1000.
  - **resign:** the other side wins.
  - **Leaving a chair:** a game, or an invitation, lasts while its residents
    stay in their chairs. Each tick prunes it: standing, travel, leaving town
    or a reset ends a game as "left the table". An ended game stays on show
    until both players have stood up or a new game starts.
- **`server/world.js` (wiring only):** construction, the `tableGame` command
  (after the rate limit), a prune each step, `tables` in the snapshot,
  `tableGames` in the checkpoint, restore (older checkpoints load with none),
  and reset.
- **Transports and clients:** both transports pass the world snapshot through,
  and `validTownSnapshot` ignores extra fields, so existing clients are
  unaffected.

### Verification (PR 1)

- `node --test server/tests/table-games.test.js`: 7/7.
  - **Agreeing and playing:** a seated pair agrees to a game and plays it, and
    a standing resident sees the same snapshot.
  - **Refused moves:** out of turn, illegal, by a spectator, a malformed key,
    an extra `position` field, inviting during a game, and an unknown action.
  - **Invitations:** need an opponent, a real game and side, and the invited
    resident to accept. A chosen side reverses who moves first.
  - **Every game's own rules:** a move each way in checkers, Connect Four,
    Reversi and morris.
  - **Endings:** checkmate and resignation, after which no more moves are
    taken; a rematch with the inviter's chair.
  - **Leaving:** standing ends the game ("left the table") and stops that
    player moving; leaving town clears the table; an invitation lapses when
    its resident stands.
  - **Checkpoints:** a game in progress survives one and carries on. `validate`
    refuses a non-replaying game, a stranger table, a bad side, an unknown
    game, extra fields, a hostile key and two games at one table. A reset
    clears the tables.
- `REDIS_URL=… pnpm run test:server`: 657 of 658. The one failure, "distributed
  tickets and sockets are admitted only to their named world and protocol",
  timed out waiting for a message at load average 78. Run alone, it passed
  twice; it does not touch table games.
- `pnpm run verify`: `core: passed` (unit 2912 pass, 0 fail, 1 skipped; server
  476 pass, 140 skipped without Redis).
