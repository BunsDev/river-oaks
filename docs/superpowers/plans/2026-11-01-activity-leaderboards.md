# Leaderboards: own-row highlight fix and new boards

**Task:** `activity-leaderboards-20261101`. **Branch:** `feat/activity-leaderboards-20261101`
from `origin/main` at `df8d65aa`. **Worktree:** `../river-oaks-activity-leaderboards`.
**Owner:** `claude:river-oaks-c2 (f075bf)`.

## Objective

Val, 2026-11-01: patch the public bike-miles leaderboard and add more boards (miles walked,
hours played, motorcycle miles, car and other vehicle miles). Val's answers: the symptom is the
viewer's row losing its highlight; boards stay signed-in only (no auth or privacy-scope change);
add walking, hours played, motorcycle and the other vehicle kinds.

## Files owned

- `preview/src/leaderboard-boards.js` (new): the board list both sides read; one board per
  vehicle kind other than the bicycle, derived from `vehicle-config.js`.
- `server/cycling-miles.js`: one store for every board (`add/top/rank` take a board, default
  `cycling`; `eraseUser` clears every board). Cycling keeps its Redis keys
  (`cycling-miles:v1`, `cycling-riders:v1`); other boards use `leaderboard:<board>:v1` and share
  the name hash.
- `server/world.js`: credits walking (accepted ground poses on foot), each vehicle kind (accepted
  poses in it), and seconds played (connected time up to `PLAY_IDLE_MS`, 10 min, after the last
  move, turn or chat). Drained entries are `{userId, name, board, amount}`.
- `server/ride-flush.js`: pending keyed by board and account.
- `server/cycling-api.js`, `server/app.js`, `server/distributed-app.js`: `GET
  /api/leaderboards/<board>`; both routes mark the caller's row `you: true`.
- `preview/src/cycling-leaderboard.js`, `.css`, `preview/src/main.js`: board picker, highlight
  from `you` (the old `setName` name match is gone), `boardView` pure view.
- Tests: `server/tests/leaderboards.test.js` (new), additions to `cycling-flush.test.js`,
  `cycling-miles.test.js`, `preview/tests/cycling-leaderboard.test.js`; field renames in the
  existing cycling, flush and erasure tests.
- Docs: `docs/multiplayer.md`, `docs/privacy-data-inventory.md`.

## The highlight bug

`load()` replaced the board object with the server reply, dropping the `meName` that `setName`
had stored, so the row lost its highlight until the next snapshot called `setName` again (each
snapshot re-rendered the sheet). Matching by name also highlighted a namesake. Fixed by having the
server mark the caller's own row.

## Checks

| Check | Result |
|---|---|
| focused server suites with Redis (`REDIS_URL` own server, port 6491): cycling, ride-flush, cycling-miles, cycling-api, cycling-flush, account-erasure ×3, leaderboards | 67/67 pass, 0 skipped |
| `node --test preview/tests/cycling-leaderboard.test.js` | 3/3 pass |
| `pnpm run verify` (core) | VERIFY_RESULT |
| browser `cycling-leaderboard` journey | not run locally |
| hosted `preview` aggregate | pending |

## Gaps

- Hours played are not counted for time an Office visitor spends moving inside the office
  (office movement is a separate command); chat still counts there.
- Totals start from deployment: nothing before it was measured, so walking, vehicle and hours
  boards begin empty. Cycling totals carry over unchanged.
- No browser run or screenshot of the picker yet; the hosted shared journeys cover the sheet.

## Next step

Core verify, signed commit, draft PR; hosted checks; Val's merge authorization.
