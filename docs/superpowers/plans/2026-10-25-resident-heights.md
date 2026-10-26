# Residents walk into Bayou Heights

## Objective

Support piece B of the next-district lane (#586, #649). Residents already walk from the District into Bayou Market Commons (#655). Bayou Heights (#649) is 308 × 291 = 89,628 one-metre cells, over the 80,000-cell route-grid cap, so #655 gives it no resident grid and residents stop at the Commons. The goal's finish line asks that "the collision contract and the resident planner are reconciled at every seam". river-oaks-91's ledger names this as the remaining resident gap.

## Ownership and landing order

Task `next-district-586-support-20261024`, owner `claude:river-oaks-3e (4e851f0b)`. Worktree `river-oaks-resident-heights`, branch `feat/resident-heights-20261025`, stacked on #655 (`bd9df00c`; since 2026-10-25 10:27Z its merge of main `0b9a97c4`, `03381365`).

Agreed with river-oaks-91 (2026-10-25): this branch lands **after #649**. Once #649 is on main, it also brings the Heights rollback's resident handling:
- `server/district-heights-checkpoint-migration.js` calls `relocateResidents` with the Heights bounds before moving players, and adds `moved` to its log.
- `server/tests/heights-activation-rehearsal.test.js` gains a resident standing in Heights at rollback.

Until then, nothing here changes behaviour on main: Heights code paths run only when `world.eastGardenCommons.heights` exists.

## Files owned

- `preview/src/navigation.js`: locations over the cap are split into strips; reverse search for location legs.
- `preview/src/resident-life.js`: Heights resident stops.
- `server/district-commons-checkpoint-migration.js`: exported `relocateResidents`.
- `preview/tests/resident-locations.test.js`, `server/tests/resident-locations-rollback.test.js`, this ledger.

## Design

- **Strips, not a bigger grid.** A composed location larger than the cap is cut into the fewest equal east/west strips that fit, each its own grid. Heights becomes `bayou-heights#1` and `bayou-heights#2`, each 154 × 291 = 44,814 cells. Strip edges are seams like the District/Commons edge, found by the same open-ground scan with keep-right lanes. A test splits the Commons with a small cap: every walking answer is unchanged, and routes still cross.
- **Found seams on Heights.** One footbridge crossing from the Commons into Heights at north −1335, and four crossings between the two strips (north −1406, −1335, −1252 and −1225.5).
- **Reverse search for location legs.** A grid search stops after 15,000 cells. From the bandstand on Heights Green, every way out faces away from the footbridge, so the search toward the footbridge ran out while the search from the footbridge found the bandstand at once: residents could walk to the green and not plan a way back. A location leg that fails is now searched from the other end and reversed, since every leg is walkable both ways. District legs keep the District grid's own answers, so police, carriages, audits and District routes are unchanged.
- **Heights stops.** The footbridge landing, the bandstand, the icehouse patio and Heights Hall, taken from #649's layout fields (`footbridge.landing`, `bandstand.rect`, `icehouse.at`, `hall.rect`). Each is the clear spot beside the landmark nearest the landing from which a resident can walk to and from the landing. Proving that takes about 1.3 s of route searches on Heights, so a world's stops are placed once per world object, and each resident life gets its own copy.
- **`relocateResidents({ fromData, toData, checkpoint, inside, toward })`** returns `{ checkpoint, moved }`, or null when someone has nowhere to go. It is extracted from the Commons → Gardens rollback, which now calls it.
  - It clones the envelope.
  - It moves residents on dropped land, or in a source seam corridor the target cannot reach, to clear ground the target's planner reaches.
  - It clears their routes, seats and destinations and requeues their errands.
  - Residents land 0.9 m from players and 0.7 m from each other.
  - When nothing within 40 m is clear, as deep in Heights north of the Commons band, it searches again from `toward`.

## Checks

| Check | Result |
| --- | --- |
| New tests on #655's source (red) | 2/2 failed: strip split, `relocateResidents` |
| Focused and related suites, isolated Redis | 95/95 passed: resident locations, rollback and life; navigation, community, companion, creator and auto-navigation; Commons server and migration; Commons activation rehearsal; police world |
| `nice -n 19 pnpm run verify` (core), Python 3.12 | **Passed** on the final source tree (04:55–04:59Z): agent 274/274; preview 4,096 passed, 1 skipped; server 892 passed, 225 Redis-only skips; desktop 115 passed, 3 skipped; build; Python lint, format and 170 tests; demo; secrets. The first attempt (04:52Z) failed only the known load-sensitive `land-pr` queued-lander timing test, which passed 29/29 alone; that log is kept. |
| Scratch merge with #649 head `0cc09391` (not pushed): Heights probe and server-world simulation | See Results |
| Main `0b9a97c4` merged in through #655 (`03381365`); signed merge `ff46d99e`, clean | Related suites on an isolated Redis: 195/195, 0 skipped (the 95 above plus Gardens, District and world migrations, police and crime, Commons games and transport, and the Redis room). `nice -n 10 pnpm run verify` (core), Python 3.12: **passed** on the third attempt (10:41–10:46Z, load 7.8): agent 274/274; preview 4,163 passed, 1 skipped; server 918 passed, 225 Redis-only skips; desktop 120 passed, 3 skipped; build; Python lint, format and 170 tests; demo; secrets. Attempts 1 and 2 (10:36Z and 10:38Z, load 7.1–7.8) each failed only the `land-pr` queued-lander timing test (30 s timeout), which passed 29/29 alone; `scripts/` is identical to main and both logs are kept. Hosted checks at `ff46d99e`: 15/15 green. |
| #655's review fixes (#674) merged in through `2ac33123`; signed merge `84190512` | Related suites on an isolated Redis (6461): 200/200, 0 skipped (the 195 above, #674's 3 tests and 1 new). The new test fails with the corridor filter removed. Core verify: **passed** on the first attempt (08:36–08:41Z, load 8.4–13.6), `dirty: false`: agent 274/274; preview 4,165 passed, 1 skipped; server 921 passed, 225 Redis-only skips; desktop 120 passed, 3 skipped; build; Python lint, format and 170 tests; demo; secrets. Receipt `core.json` sha256 `fc901b154bf58ea8…`. |

## Results

- **Heights probe** on #655 + this branch over #649's product head, revision `bayou-heights-1`. The client resident simulation has 24 locals.
  - The composite builds in about 170 ms.
  - All four Heights stops are on free ground.
  - Routes between three District stops and each Heights stop, both ways: 24/24 found and walkable.
  - Over 60 simulated minutes: 8 residents went east of the District edge and 3 entered Heights, and all 3 walked back out. Every position sample was on free ground; the farthest east was 212 m past the edge.
  - Resident step time p50 / p95 / p99 / max: 0.30 / 0.68 / 2.85 / 114 ms.
  - Before the reverse search, the bandstand → District route failed. With the stop search but no reverse search, the bandstand got no stop at all: no clear spot within 13 m of the stage could plan back to the landing.
- **Reachable ground, reproduced independently** with `node preview/audit/world-expansion-footprint.js --reachable`:

  | Revision | 1 m, `3cd60702` | 0.5 m, `3cd60702` | 1 m, `0cc09391` | 0.5 m, `0cc09391` |
  | --- | ---: | ---: | ---: | ---: |
  | Gardens | 46,549 | 46,477.75 | 46,549 | 46,477.75 |
  | Commons | 52,130 | 52,030.75 | 52,130 | 52,030.75 |
  | Bayou Heights | 93,904 (2.0173×) | 93,508 (2.0119×) | 93,904 (2.0173×) | 93,508 (2.0119×) |

  Composed-world sha256 on `0cc09391`: Gardens `df44715b…`, Commons `b78b24dd…`, Heights `19161d41…`. #649's ledger now carries these figures. Its earlier 93,906 and 93,509.75 m² did not reproduce at any committed head, `b1ded7ab` included.

- **Server-world simulation** (`server/world.js` shared world, `bayou-heights-1`, 98 residents, stepped as the server does: 0.25 s calls of 5 × 0.05 s resident steps, 30 simulated minutes):

  | | #649 `0cc09391` alone | with #655 and this branch |
  | --- | ---: | ---: |
  | Residents who went east of the District edge | 0 | 4 (all 4 came back) |
  | Residents who entered Heights | 0 | 2 (both came back) |
  | 20 m cells visited | 51 | 100 |
  | Median farthest distance from start | 45 m | 150 m |
  | Step call p50 / p95 / p99 / max | 1.5 / 3.0 / 5.4 / 134 ms | 1.8 / 5.0 / 15.4 / 313 ms |
  | Calls over 50 ms | 2, both in the first 10 minutes | 11, all in the first 10 minutes |
  | After warm-up: p99, max | 3.8–5.1 ms, 8.8 ms | 12.7–13.7 ms, 41 ms |

  The first 10 minutes carry route-cache warm-up in both columns. For comparison, #655 alone on the Commons revision had 1–6 calls over 50 ms per 10 minutes after warm-up (host load was then 17–28; here it was about 7).

## Finding: Heights activation slowed by stop placement (fixed in `59617b59`)

A scratch merge of #649's head `4c3fddc3` with this branch (not pushed) failed #649's Heights activation rehearsal. The test timed out at "alice snapshot on bayou-heights-1@2", its 8 s wait for the first snapshot after activation.

- **Cause.** Placing the Heights stops runs route searches: the bandstand's forward search to the landing ran out at 609 ms before the reverse search succeeded, and the hall's took 474 + 126 ms. Every server world build repeated them, and a checkpoint migration builds the world several times. `createSharedWorld` on `bayou-heights-1` took about 60 ms on #649 alone and 1.35–1.44 s with this branch; resident life alone went from 11 ms to 1,286 ms.
- **Where.** The rehearsal at load about 5:

  | Tree | Rehearsal |
  | --- | --- |
  | #649 alone (`0cc09391`) | passed, 12.2 s |
  | #649 + #655 (`03381365`) | passed, 12.4 s |
  | #649 + this branch before the fix | failed at the Heights@2 snapshot, with or without the rollback wiring |
  | #649 + this branch with the fix and the rollback wiring | passed, 31/31 checks, 17.1 s |

- **Fix (`59617b59`).** A world's stops are placed once per world object, in a `WeakMap`, and copied for each resident life. Repeat builds took 69–77 ms; the first still pays the placement, about 1.3 s, once per world object. A new test checks that two lives on one world get equal, independent stops, and that a cloned world gets the same stops. That test also passes without the cache: only the rehearsal with #649 shows the regression, which is why that is the red and green evidence here.
- **After the fix:** related suites on an isolated Redis 196/196, 0 skipped. Core verify (`nice -n 10`, Python 3.12) passed on the first attempt: agent 274/274; preview 4,164 passed, 1 skipped; server 918 passed, 225 Redis-only skips; desktop 120 passed, 3 skipped; build; Python; demo; secrets.

## #655's review fixes carried into `relocateResidents` (merge `84190512`)

An independent review of #655 found that a Commons → Gardens rollback froze residents who were still on District ground but walking into the Commons. It also found a placed object could block a seam lane, and a lantern home stop survived the rollback. river-oaks-71 fixed these in #674, which is merged into #655 as `f3f8085c`. This branch had moved that rollback into `relocateResidents`, so the merge carries the fixes there:
- `relocateResidents` takes `gone(stopId)` from its caller and returns `rerouted` next to `moved`. The Commons rollback names its lanterns; the Heights rollback names its own stops (`bayou-heights/…`).
- Residents still on kept ground re-plan where they stand when their route enters dropped land or they are heading for a dropped stop. Their errands are requeued, and a dropped stop held as a home stop gives way to the resident's home stop.
- Corridors are found without builds, as the live planner finds them. Only the corridors the target lacks count as dropped land. So a rollback to a target that keeps the District–Commons corridor (Heights → Commons) leaves walks through it alone; without this, every resident on the way into the Commons would have re-planned.
- Route legs keep this branch's reverse search and cross with #674's `lane()`, which steps past a blocked keep-right lane.
- New test: "relocateResidents re-plans walks into dropped land or to a dropped stop, not across corridors the target keeps". It fails with the corridor filter removed.

## Heights rollback wiring, prepared for after #649 (not on this branch)

Rehearsed on the same scratch merge, kept as a patch in the session scratchpad:

- `server/district-heights-checkpoint-migration.js`, Heights → Commons:
  - Players are placed first, so residents keep 0.9 m from the players' new spots, the same order as the Commons → Gardens rollback.
  - Then `relocateResidents` runs with `inside` = the Heights bounds and `toward` = the Commons-side end of the footbridge deck (east −2551.34, north −1335).
  - The result gains `movedResidents`. The forward path returns an empty list, and the chained rollback to Gardens merges both lists.
- After the #674 merge, the patch also does three things: it passes `gone` for Heights stops (ids starting `bayou-heights/`), returns `reroutedResidents`, and merges both lists in the chained rollback.
- **Rehearsed again** on scratch `ae7d3150` (#649 `ba942859` + this branch `760d8eda` + the patch, never pushed), with an isolated Redis: 12/12.
  - That covers the Heights activation rehearsal, the 5 Heights rollback tests and the 6 Commons rollback tests.
  - The added Heights case re-plans a walk from Commons ground to the bandstand. It leaves a walk through the District–Commons corridor alone, restores a Heights Hall home stop, and chained to Gardens re-plans both walks.
  - Without `gone` in the Heights rollback it fails: the hall home stop survives.
- `server/redis-room.js`: the `district_heights_checkpoint_migrated` log line gains a `movedResidents` count.
- `server/tests/resident-heights-rollback.test.js` (new), 4/4 passing:
  - Heights → Commons moves a resident on Heights Green and one at the footbridge landing to Commons ground the planner reaches.
  - A chained rollback to Gardens brings both residents back to the District.
  - Activation moves no residents.
  - A resident on Heights Green plans a walk back to the footbridge and the District.
- Red checks:
  - Without the wiring, the Heights → Commons and activation tests failed.
  - The chained test still passed, because the Commons → Gardens rollback already catches residents east of the District.
  - Without the reverse search, all four failed.
- `server/tests/heights-activation-rehearsal.test.js` gains a check that the rollback log counts residents. The receipt's logs:
  - `{"event":"district_heights_checkpoint_migrated","from":"heights","to":"commons","moved":3,"movedResidents":0}`
  - `{"event":"district_heights_checkpoint_migrated","from":"heights","to":"gardens","moved":3,"movedResidents":0}`

  No resident stood in Heights during that run, so 0 is expected there.
- **Order, agreed with river-oaks-91 (2026-10-25):** after the players are placed. The first agreement said before, but run first, `relocateResidents` would keep 0.9 m from the players' old Heights positions, and players placed afterwards could land beside a resident it had just moved.

## Gaps

- The reverse-search regression can only be shown on Heights: the Commons band (9,396 cells) never reaches the search limit. The test lands with the Heights rehearsal once #649 is on main.
- The Heights rollback's resident handling is not wired yet; it waits for #649 (see Landing order).
- No browser journey; Val's visual review of residents in Heights is open.
- The first Heights world build in a process still pays about 1.3 s for stop placement, and a resident's first plan from the bandstand pays the forward search, about 0.6 s. The server simulation's warm-up maximum of 313 ms is consistent with that cost; I didn't attribute it call by call. A cheaper failing search in the shared grid planner would remove it, but would change District routes for police and carriages too, so it is out of scope here.

## Next step

After #649 lands:
1. Merge main into the branch (a rebase would need a force-push).
2. Apply the prepared Heights rollback wiring and its tests (see above). Add a Heights case for re-planning: a resident on Commons ground walking to the bandstand, and one anchored at a Heights stop. Then rerun the Heights rehearsal.
3. Run `verify full` with an isolated Redis.
4. Mark the PR ready.
