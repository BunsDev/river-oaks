# Residents walk into Bayou Heights

## Objective

Support piece B of the next-district lane (#586, #649). Residents already walk from the District into Bayou Market Commons (#655). Bayou Heights (#649) is 308 × 291 = 89,628 one-metre cells, over the 80,000-cell route-grid cap, so #655 gives it no resident grid and residents stop at the Commons. The goal's finish line asks that "the collision contract and the resident planner are reconciled at every seam". river-oaks-91's ledger names this as the remaining resident gap.

## Ownership and landing order

Task `next-district-586-support-20261024`, owner `claude:river-oaks-3e (4e851f0b)`. Worktree `river-oaks-resident-heights`, branch `feat/resident-heights-20261025`, stacked on #655 (`bd9df00c`).

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
- **Heights stops.** The footbridge landing, the bandstand, the icehouse patio and Heights Hall, taken from #649's layout fields (`footbridge.landing`, `bandstand.rect`, `icehouse.at`, `hall.rect`). Each is the clear spot beside the landmark nearest the landing from which a resident can walk to and from the landing.
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

## Gaps

- The reverse-search regression can only be shown on Heights: the Commons band (9,396 cells) never reaches the search limit. The test lands with the Heights rehearsal once #649 is on main.
- The Heights rollback's resident handling is not wired yet; it waits for #649 (see Landing order).
- No browser journey; Val's visual review of residents in Heights is open.

## Next step

After #649 lands:
1. Merge main into the branch (a rebase would need a force-push).
2. Wire `relocateResidents` into the Heights rollback, and extend the Heights rehearsal.
3. Run `verify full` with an isolated Redis.
4. Mark the PR ready.
