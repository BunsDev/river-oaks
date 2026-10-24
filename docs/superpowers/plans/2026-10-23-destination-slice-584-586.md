# Destination slice: city kit, assembly and Bayou Market Commons (#584, #585, #586)

Register task `destination-slice-584-586`, branch `feat/destination-slice-584-586-20261023`, worktree `river-oaks-destination-slice`, base `cfa90654`.

## Objective

Ship the first playable expansion beyond the District. Players walk from the District into a polished, original Houston-inspired destination, explore it together, use a shared activity and walk back without a reload. Build it from a reusable kit, assembled deterministically with preserved manual overrides, and show that the same kit produces a second, distinct neighborhood.

## Coordination

Two Codex sessions hold related, uncommitted work: `neighborhood-584-586` (kit, idle since 21:22 CDT on 2026-10-22) and `neighborhood-authoring` (Studio-integrated generator, live). This branch adopts none of their files and avoids their paths (`shared/streetscape-kit.js`, `shared/neighborhood*`, `config/neighborhoods/`, `scripts/neighborhood*.mjs`). Reconciling the overlap is a maintainer decision: keep both, or fold one pipeline into the other.

## Files owned

- Kit and assembly: `shared/city-kit/catalog.js`, `shared/city-kit/assemble.js`, `scripts/destination.mjs` (`pnpm run destination`), `config/destinations/*.json` with their locks.
- Destination: `shared/commons-destination.js`, the revision bump in `shared/east-garden-commons-layout.js` and the manifest, composition in `preview/src/east-garden-commons-world.js`, rendering in `preview/src/east-garden-commons.js` and `preview/src/city-kit/render.js`, the `buildMatureTrees` placements parameter, and the main-loop hooks in `preview/src/main.js`.
- Activity: `server/lantern-walk.js`, the `server/world.js` wiring, the rollback in `server/district-commons-checkpoint-migration.js`, `preview/src/lantern-walk.js` and `.css`.
- Tests and e2e: `preview/tests/city-kit.test.js`, `preview/tests/bayou-market-commons.test.js`, `server/tests/lantern-walk.test.js`, `preview/e2e/city-kit-review.js`, `preview/e2e/fixtures/city-kit.*`, and the Lantern Walk phase in `preview/e2e/east-garden-commons.js`.
- Docs: `docs/city-kit.md`, `docs/level-design/expansion/bayou-market-commons.md`, and updates to world expansion, blockout, garden-campus and architecture.

## Results

- [x] Kit catalog: 29 pieces in 7 families, 3 styles, 25 material slots, plus conventions for scale, naming, collision, LOD, licensing and budgets.
- [x] Assembler: per-ID seeded streams, overrides and additions by stable ID, orphan reporting, canonical hash, provenance, a solid-in-walkable guard, north/south streets, east/west fronts, intersections, unsigned overflow shops.
- [x] Bayou Market Commons: 112 pieces, 19 shells, 53 solids, 53 meshes before trees (49 before the storefront polish), 100% connectivity on the plan and on the real walking environment.
- [x] Second neighborhood `nineteenth-and-yale`: 181 pieces, 43 shells, 62 meshes (54 before the storefront polish), a crossroads with crosswalks and an east-facing court, 100% connectivity.
- [x] Lantern Walk: server authority, snapshot, checkpoint and validation, and rollback removal. Client: Z interaction, status chip, scene lighting.
- [x] Focused tests: `node --test preview/tests/city-kit.test.js preview/tests/bayou-market-commons.test.js server/tests/lantern-walk.test.js` gave 21 passed, 0 failed, 0 skipped.
- [x] Existing suites, run unsharded: preview had 3,850 passed, 2 failed, 1 skipped before the stale literal fix. The 2 failures came from the old revision literal in `baseline-580-route.test.js`, which now passes 2/2. Server had 763 passed, 0 failed, 215 skipped (Redis-backed tests without `REDIS_URL`).
- [x] `pnpm run verify` (core) at `41eff316`: agent 204, preview 3,852 (1 skip), server 763 (215 Redis skips), desktop 115 (3 skips), build, Python 149, secrets all passed.
- [x] Redis-backed server suite at `41eff316`: `REDIS_URL=<disposable local redis-server, no persistence> pnpm run test:server` gave 1,020 passed, 0 failed, 0 skipped.
- [x] First screenshot review at `41eff316` (`.runtime/city-kit/review-2026-10-23T11-12-45-914Z/`) found defects, now fixed: draped paving and lawns were wound downward and culled, so every street view showed the stretched site plinth; box faces carried unit UVs, stretching one brick or stone tile across a wall; shell roofs showed wall material; storefront glazing read as flat pale panels. Fixes in `preview/src/city-kit/render.js` (upward winding, metric world-projected box UVs, roof membrane, dim warm shop interior) with a regression in `preview/tests/city-kit.test.js` that fails on the old renderer (lane-brick facing −1.00).
- [x] Core gate at `95cbedd7` (the ground/UV fixes): agent 204, preview 3,853 passed (1 skip), server 763 (215 Redis skips), desktop 115 (3 skips), build, Python 149, secrets all passed.
- Invalid runs, not evidence: the first two-player journey and the first three perf runs (11:13–11:16Z) overlapped renderer edits in this worktree. Vite reloaded the owner page mid-journey (`window.__riverMultiplayer is not a function`) and the Gardens perf run lost its timing samples. All were rerun on the commit with the worktree untouched.
- [x] Screenshot review at `95cbedd7` (`.runtime/city-kit/review-2026-10-23T13-49-11-693Z/`): brick lanes, paver sidewalks, crosswalks, court, lawns, bayou and tower render as authored in both recipes and both seeds. Remaining defects: storefront glazing still read as flat panels, and garden-court blade signs were blank plates.
- [x] Two-player journey at `95cbedd7` (`pnpm run test:experience east-garden-commons`, 14:01–14:04Z, 203 s): passed, 0 page errors. Both clients walked by keyboard from their District arrivals down Market Street into the Commons, finished the shared chess game through the board UI, and reconnected with identity and position (1,162 ms). They split the Lantern Walk (owner: tower, rain garden, gateway; alice: terrace, court); the round waited at four of five and completed in 41.9 s, credited to both on both clients, and the status announced the lit Bayou Lantern. Both walked home to the District without a reload. Screenshots: `output/playwright/bayou-parity-*.png`, `east-garden-commons-*.png`. The runner's `data/reports/experience.json` rewrite (this journey only) was not committed, to keep other journeys' recorded evidence.
- [x] Perf at `95cbedd7` (`preview/audit/world-expansion-baseline.js`, desktop 1440×1000, three matched runs 14:04–14:07Z, host load average 6.3–7.8 from other sessions). All passed, 0 errors.

  | Run | Players | Frame p50 / p95 ms | CPU p95 ms | Draw calls | Triangles |
  | --- | --- | --- | --- | --- | --- |
  | Gardens default, spawn | 1 | 16.7 / 16.8 | 9.8 | 1,647 | 5.50 M |
  | Gardens default, spawn | 2 | 33.3 / 33.4 | 11.4 | 1,707 | 5.85 M |
  | Commons market, spawn | 1 | 16.7 / 16.7 | 10.8 | 1,643 | 5.61 M |
  | Commons market, spawn | 2 | 16.8 / 50.0 | 11.7 | 1,721 | 5.96 M |
  | Commons market, Market Street | 1 | 16.7 / 16.8 | 7.9 | 883 | 5.47 M |
  | Commons market, Market Street | 2 | 16.7 / 33.4 | 8.9 | 883 | 5.47 M |

  One player holds 60 fps in every run. Two-player frames slow in the default town as well; both full clients render on one shared GPU, so this is host contention, not a destination regression. Join ready 3.4 s (default) vs 3.6–3.7 s; reconnect 0.7–0.9 s.
- [x] Storefront and blade polish after that review: a dark warm shop interior with brass display shelves and pendant lights behind the glass, and garden-court blade signs lettered on both faces from the shared sign atlas. Review views include a new `blades` view along the garden-court frontage.
- [x] Screenshot review of the storefront/blade polish (`.runtime/city-kit/review-2026-10-23T14-44-39-890Z/`): the first pass showed the blade lettering facing into its plate (hidden); after flipping it, both faces read top to bottom, and storefronts read as dark glazed interiors with shelves and pendant lights.
- [x] Core gate on the polish: agent 204, preview 3,853 passed (1 skip), server 763 (215 Redis skips), desktop 115 (3 skips), build, Python 149, secrets all passed.
- [ ] `pnpm run verify full` with isolated Redis.

## Session 2 (2026-10-23, `claude:river-oaks-3d-d7424aaf`)

Handoff recorded in the register at 18:50Z: the previous owner was idle since 15:15Z with no live session or process. Its `verify full` on `39fa912e` failed at the `shared` stage (SIGKILL, `ABORT_ERR`). Every other stage passed, including the Redis-backed server suite and the experience journeys.

- [x] Merged `origin/main` (`f4aa1670`, 87 commits). Conflicts: `docs/world-expansion.md` (main's Phase 1 text kept, destination section appended), `preview/audit/world-expansion-baseline.js` (main's lock, warm-up and three samples kept, revision/view/profile selection reapplied), `preview/src/main.js` (both imports), `server/world.js` (the Lantern Walk snapshot, prune and checkpoint added next to main's world policy and crime state).
- [x] Merged-tree focused suites (destination, city kit, Commons, manifest, Lantern Walk): 85 passed, 2 skipped (Redis), 0 failed.
- [x] Destination polish, from an in-game review: kit lawns used the untinted grass maps, which read as bare gravel. They now use a turf tint at low texture contrast, as the green roofs do. The kit gains `furniture/market-stall`, and the Bayou Green gains the four-stall Bayou Market, a planted south lawn with a row of shade trees, and planters. Crossing the promenade now names Bayou Market Commons in the walking notice, and crossing back names River Oaks District. Plan: 125 pieces, 62 solids, 15 materials, 95,736 triangles, 57 meshes, connectivity 1.0, locks regenerated (`916c9e6d9525166b`).
- [x] Regressions: `preview/tests/lantern-walk-client.test.js` (arrival and return notices; fails on the previous client) and a stall/turf test in `preview/tests/bayou-market-commons.test.js` (solid stalls, reachable fronts, distinct names, green lawn tint).
- [x] Core gate on the merged and polished tree: agent 204, preview 3,896 passed (1 skip), server 829 (218 Redis skips), desktop 115 (3 skips), build, Python and secrets all passed.
- [x] In-game pedestrian captures (local review aid, `.runtime/tmp/cap-*`): the lawns read as turf, the four stalls read with lettered boards, and the shopfronts read as dark glazed interiors with shelves and pendant lights. The first interior tint (emissive 0.38) read as flat terracotta and was dimmed (`c2598c65`).
- Invalid run, not evidence: the 20:5xZ journey failed after three lanterns (`window.__riverMultiplayer is not a function`), because a `render.js` edit made mid-run triggered a Vite reload. It was rerun on the untouched commit.
- [x] Two-player journey `east-garden-commons` on `c2598c65` (clean): passed, with no page errors. It covers the keyboard walk from both District arrivals, shared chess, reconnect, a Lantern Walk split 3/2 that waits at four of five and completes credited to both, the announced Bayou Lantern, and both players walking home without a reload.
- [ ] `pnpm run verify full` with isolated Redis on `c2598c65`. It stops at `dependency-audit` on the upstream zod advisory GHSA-mrhx-c7xc-m3w5, which has the same lockfile as main and is fixed by PR #618 (another session). The remaining full stages were run individually with the same commands, on a disposable Redis under the browser lock: server Redis suite 1,089/1,089 passed, secret history, security browser, reflections, all 17 experience journeys and IPIC screening passed. `shared` passed 26 of 27; `character-studio-worlds` failed once ("Blocked movement compares an initialized controller position"). That journey runs on the default revision and does not touch the Commons. A solo rerun was pending at this commit.

## Gaps and next step

Human visual approval, physical-device performance and hosted multiplayer are outside automated evidence. The reachable-area target (3–5×) is unchanged by this slice. PR #611. Val authorized landing on 2026-10-23. Next step: once #618 is on main, `pnpm run land 611` (update from main, hosted Verify, merge guard).
