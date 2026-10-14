# Shared dominoes at the café table — design (2026-10-14)

Two residents seated across the plaza's round café table play dominoes against
each other: the town deals and holds the hands, checks every move, and everyone
in the plaza sees the table. Approved in conversation with Val on 2026-10-14:
two players first (four-player block game and hearts follow on the same
foundation), and approach A for hidden information.

## Goals

- A shared round is authoritative: the server holds the real state, validates
  moves with `dominoes-rules.js`, and no client can learn another's hand.
- The snapshot carries only what the plaza may see; a player's own hand comes
  back in a command reply, the only per-connection channel the transports
  have.
- Reuse the shared-chess machinery (`tableGame` commands, invitations, prune on
  leaving, checkpoint validation, the sheet's shared view and invite bar).

## Non-goals

Four-player block dominoes, hearts and the other café games, spectator hands,
match history, any new transport frame type.

## 1. Server: `server/cafe-games.js`

`createCafeGames({players, changed, now, random})` holds one entry for the café
round table (`tableId: 'round'`, chairs 0–3 from `cafeSeat`):

```
{ id:'round', kind:'dominoes', seats:[chairA, chairB], players:[idA, idB],
  invite:{from,to,chair,kind,at}|null, round:State|null, moves:string[],
  scores:[a,b], version:n, result:{winner, reason, left?}|null, startedAt }
```

`round` is the state `startRound(seed, 2)` returns (seed, hands, boneyard, line,
turn, lead, passes, over). The seed comes from `random()` (default
`crypto.randomInt(2**31)`) and exists only in `round` and the checkpoint.
`moves` is the rules' notation (`L:3-5`, `R:3-5`, `draw`, `pass`) applied to the
round so far; it is private too, because a `draw` entry plus the seed would
reveal the drawn tile.

Commands keep the `{type:'tableGame', action, …}` family. `world.js` routes a
sender seated at a café chair (`cafeSeat(player.sitting.buildId)`) to the café
module and a sender at a chess table to `table-games.js`; anyone else gets
`not_at_table`. Every action uses `only()` to refuse extra fields.

| Action | Rule | Effect |
| --- | --- | --- |
| `invite {kind:'dominoes'}` | the chair across (chair + 2 mod 4) holds a player; no round in progress (`game_in_progress`); no invite open | `invite` set; `changed()` |
| `accept` | sender is `invite.to` | `round = startRound(seed, 2)`, players `[from, to]` with the inviter as player 0, `moves=[]`, `scores=[0,0]` on a new match, `version=1`, `result=null` |
| `decline` | sender is `invite.from` or `invite.to` | invite cleared |
| `hand` | sender is a player of the live round | reply `{ok, hand, legal, version}`; `hand` is the sender's tiles, `legal` the rules' `legalMoves` keys when it is their turn, else `[]` |
| `move {move}` | sender is the player whose turn it is; `move` is a string ≤ 12 chars; `findMove(round, move)` is in `legalMoves(round)` | `round = makeMove(round, found)`; `moves.push(move)`; `version++`; when `round.over` is set, `scores[winner] += points`, and `result` becomes `{winner, reason}`; a match ends at `MATCH_POINTS` (100) with `result.match = true` |
| `resign` | sender is a player of a live round | `result = {winner: other, reason:'resigned'}`; the match ends |
| `next` | a round is over, the match is not, sender is a player | a fresh `startRound`, moves cleared, `version++` |

Refusals: `not_at_table`, `no_opponent`, `game_in_progress`, `invite_pending`,
`not_invited`, `not_your_turn`, `illegal_move` (with the rules' message),
`no_round`, `match_over`, `invalid_table_game` (bad fields).

**Snapshot** (`world.snapshot().tables.round`, public to everyone):
```
{ id:'round', kind:'dominoes', players, sides:[chairA, chairB], invite?,
  turn, line, lead, leadIndex, sizes:[nA, nB], boneyard:n, passes,
  lastMove:{player, kind:'play'|'draw'|'pass', tile?, end?}|null,
  result, scores, version }
```
Exactly `publicView` without a hand. `lastMove.tile` is set only for plays.

**Prune** runs on every command and every `world.step`, as chess does: an
invite lapses when either player leaves their chair; a live round whose player
left their chair ends `{winner: other, reason:'left the table', left}`; an
ended round stays until both players have left their chairs or a new invite
starts. "Leaving a chair" is `player.sitting` no longer naming that café seat,
which standing, travel, leaving town (after the transport's departure grace)
and reset all cause.

**Checkpoint and restore:** `checkpoint()` returns the full entry (seed, hands,
moves, scores). `validate()` on restore requires the chairs to be café chairs,
both players present, `moves` to match the rules' notation, and
`replay(seed, 2, moves)` to reproduce `round` field for field; otherwise the
checkpoint is refused with a fixed reason (`'Invalid cafe game'` added to
`recovery-diagnostics.js`). `reset()` clears the entry. `CHECKPOINT_VERSION` is
not bumped; older checkpoints load with no café game.

## 2. Client: `plaza-dominoes.js`, `plaza-salon.js`, `main.js`

- **Town access:** `getTown()` as in `plaza-table-games.js` (`selfId`,
  `snapshot`, `command`), wired in `main.js`.
- **Shared view:** `sharedRound()` reads `snapshot.tables.round` when its
  `players` include `selfId`. The sheet switches to it when a new round of
  yours starts (version 1, no result) and when you open the sheet during an
  unfinished round of yours. In shared mode the status, line, open ends,
  boneyard, opponent's count, scores and result come from the public view; the
  hand and legal moves come from `hand`, fetched whenever `version` changes
  (one in-flight request; a refusal clears the hand).
- **Controls in shared mode:** hand tiles and the end choice send `move`;
  Draw and Pass send `draw`/`pass`; Next round sends `next`; Resign is shown;
  New match and the 2/4-player switch are hidden; the regulars' loop never
  runs. Refusals show the town's message in the status line.
- **Invitations and modes:** the chess sheet's bar and labels, with
  "Dominoes": "Play ⟨name⟩" when someone sits across (invites or shows the
  shared round), "⟨name⟩ invites you to Dominoes" with Accept/Decline,
  "Waiting for ⟨name⟩…" with Cancel; X reads "⟨name⟩ invites you to Dominoes".
  Choosing a practice option shows the practice match while the shared round
  carries on.
- **Text:** eyebrow "Dominoes · with ⟨name⟩"; note "Everyone at the plaza sees
  this game; only you see your hand."
- **Mirror:** every client calls `plazaSalon.userData.dominoes.show` from the
  snapshot whenever the shared round's signature (`version|result`) changes,
  with `facing` = the leader's chair so all viewers see one line, and both
  hands as `{chair, count}`. The viewer's practice game draws only while no
  shared round is on the table (chess's precedence). `switchCafe` leaves a
  shared round's tiles alone.
- **Seats:** the shared round uses server chairs: player 0 is the inviter's
  chair, player 1 the chair across. The practice match keeps "you are player
  0".
- **Debug:** `__riverPlazaDominoes()` gains `shared` (the public view), `hand`,
  `legal`, `invite`, `mode`.

## 3. Leaving, abandonment, limits

Covered by the prune rules above and the transport's departure grace. The
`tableGame` token bucket (12 tokens, one per 500 ms) and the 2 KB frame limit
already bound command abuse; `hand` replies are under 200 bytes.

## 4. Testing

**Server** (`server/tests/cafe-games.test.js`, real `sit` commands on the
district data):
- invite needs the chair across; accept deals seven tiles each that never
  appear in `snapshot().tables.round`; `hand` answers only its owner and
  refuses a spectator; `version` ticks per move.
- the lead is forced; a play joins an end; a draw keeps the turn and shows
  `lastMove.kind:'draw'` with no tile; passes block the round and score the
  lighter hand; playing the last tile ends the round with the pips; scores
  accumulate and `MATCH_POINTS` ends the match; `next` deals again; `resign`.
- standing, travel, leaving town and reset end or clear the round; an ended
  round stays until both stand.
- checkpoint restores a mid-round entry (hands equal, moves equal); a tampered
  hand or move is refused with `invalid_cafe_game`.
- a chess-table sender still reaches `table-games.js`; a café sender cannot
  send chess actions.

**Client** (`preview/tests/`): the public-view adapter (line, counts, turn and
lead index for the mirror), `facing` selection, and that shared mode hides the
practice-only controls.

**Journey** `plaza-shared-dominoes` (two fixture accounts at round chairs 0 and
2): invite and accept; each sees seven tiles of their own and the other's
count; the town's snapshot shows no hand; the leader's forced opening is
played through the real controls, a draw hides the tile from the other side,
the mirror counts match; resign; rematch invites again. Joins the experience
suite.

## 5. Delivery

Two PRs, one task per branch:
1. `shared-dominoes-server` (`feat/shared-dominoes-20261014`): the module,
   world wiring, diagnostics reason, tests, `docs/multiplayer.md`.
2. `shared-dominoes-sheet` (branched after 1 lands): sheet, mirror, journey.

Ledger: `docs/superpowers/plans/2026-10-14-shared-dominoes.md`.

## Open risks

- `switchCafe` in `main.js` clears the other café game's pieces when a sheet
  opens; the shared mirror must re-draw after it.
- The hearts sheet maps seats anticlockwise and dominoes clockwise; the shared
  round sidesteps this by using server chairs, but the four-player follow-up
  must pick one convention.
