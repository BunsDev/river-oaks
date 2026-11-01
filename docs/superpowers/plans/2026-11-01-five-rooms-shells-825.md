# #839 (#825 M1) Five Rooms shells and the finished Ribbon: ledger

- Task: `five-rooms-shells-825-20261101`, owner `claude:river-oaks-33 (0fedea)`.
- Branch `feat/five-rooms-shells-825-20261101`, worktree `../river-oaks-five-rooms-shells-825`.
- Base: #849 head `4b22428b` (contract `five-rooms-v2`, plan hash `66797e9bb6160aa5`) merged with
  #828 head `69d12a49` (graybox and its main merge) at `3f13ed66`. One conflict
  (`preview/tests/ribbon-route-district.test.js`): kept both side-lane tests; 5/5 pass.
- Stacked on by #841 (`feat/five-rooms-integration-825-20261101`).

## Objective

Five distinct blank venue shells and the finished Ribbon canopy under `pink-jet-age`, built
from the contract only, classic untouched (issue #839).

## Files owned (changed)

- `preview/src/five-rooms/` (new): `index.js`, `shells.js`, `counter.js`, `atelier.js`,
  `starlight-screen.js`, `shade-garden.js`, `studios-overlook.js`.
- `preview/src/ribbon-finish.js` (new; `ribbon-graybox.js` untouched, the graybox stays).
- `preview/tests/five-rooms-shells.test.js`, `preview/tests/ribbon-finish.test.js` (new).
- `docs/design/five-rooms/shells.md` (new), this ledger.

## Acceptance against #839

| Item | Evidence | State |
|---|---|---|
| Built from `five-rooms.json` only; a point move moves the shell | test "every shell is built from its contract record" (every vertex of every venue follows a 5 m / 0.5 m move) | done |
| Each venue a different building; one family | test "each room reads as a different building" (roof, entrance, glazing all distinct; geometry signatures distinct; palette) | done in unit; matched noon/night captures need #841 wiring |
| Bounded draw calls | 8 meshes for all five shells (one per material), 5 instanced for the Ribbon, ~16k shell triangles | unit; `render-budget.js` on the District spawn frame runs on #841, where the scene draws them |
| Night pink only on usable things and landmarks | test "by day nothing glows" (doors, display frame; marquee and lanterns only) | done in unit |
| Classic builds nothing | test "classic builds nothing" (empty group, no userData); main.js unchanged | done |
| Depth under pink: 0 new pairs | `findDepthFights` 0 pairs for shells, Ribbon, and both together | unit; live depth journey runs on #841 |
| Core verify, hosted green | core passed (Checks); hosted preview pending on the draft | core done, hosted pending |

## Checks

| When | Command | Result |
|---|---|---|
| 2026-11-01 | `node --test preview/tests/five-rooms-shells.test.js preview/tests/ribbon-finish.test.js` | 13/13 pass |
| 2026-11-01 | `node --test preview/tests/ribbon-route-district.test.js` (after merge) | 5/5 pass |
| 2026-11-01 | `ddf3f6a4` Shade Garden hoop widened to door + 1.5 m (legs cleared the Hermès door, found by #841): `node --test` shells + ribbon-finish 13/13, depth audit 0 pairs; core verify for this head ran on #862's tree (22:04-22:09Z, passed) | pass |
| 2026-11-01 20:29-20:35Z | `pnpm run verify` (core, on `3f13ed66` plus these files, load 8-14) | passed: node 307/307, preview 5147 pass of 5178 (31 skipped), server 1111 of 1396 (285 skipped: Redis/browser/live), 127 of 132; build ok; python 215 passed; 0 failures |

## Gaps

- Live captures, render budget and the depth journey need the shells in the scene: #841.
- Clock face: no contract anchor in v2 (request via #838).
- Studios hoops leave 5.6 m of the 6 m P2 opening between legs (#841 decides collision).

## Next step

Draft #860 is up (head `ddf3f6a4`), and #862 (#841) stacks on it. Next: wait for the hosted preview aggregate. Landing waits for Val.
