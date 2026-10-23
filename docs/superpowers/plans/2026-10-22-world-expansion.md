# World expansion execution ledger

## Objective and scope

Expand the existing District into a continuous, realistic multiplayer world while preserving the District, Gardens, gallery, interiors, authoring stack and server authority. Issues #580–587 define the MVP dependency chain; #588 is post-MVP research. This ledger remains open until the requested playable expansion and its acceptance evidence exist.

## Ownership and baseline

Task: `world-expansion-580-581`. Owner: `claude:world-expansion-20261022-1950` (taken over from `codex:world-expansion-20261022`; see the handoff section). Worktree: `/Users/buns/Documents/GitHub/BunsDev/river-oaks-world-expansion`. Branch: `feat/world-expansion-580-581-20261022`. Starting revision: `6ff47ba13762de25180b8e4b073b01662d7f9505`. The primary checkout and all pre-existing worktrees are preserved. Live ownership inventory found no expansion task; unrelated missing archives and orphan task records remain outside this task.

Owned files: `preview/src/world-manifest.js`, `preview/src/district-interior-contract.js`, `preview/tests/world-manifest.test.js`, `preview/public/data/world-manifest.json`, `docs/world-expansion.md`, and this ledger. No delivery authorization is inferred from local checks.

## Requirements and evidence map

| Requirement | Evidence required | Current state |
| --- | --- | --- |
| #580 baseline, destination, journeys and budgets | Reproducible footprint/performance report, matched views, target desktop/mobile measurements, approved destination | Source inventory, local Gardens baseline and approved destination exist; physical devices, reachable area and full visual baseline pending |
| #581 manifest and compatibility | Validated IDs/frame/bounds/entries/adjacency/revisions, runtime loading, malformed-input tests, unchanged District visual evidence | Validator and registration fixture implemented; 26 focused tests pass; shared loader validates the frame; visual evidence pending |
| #582 continuous travel | Two-player boundary crossing, server collision/validation, reconnect and return | Pending |
| #583 chunk lifecycle | Bounded loading, unloading, resource disposal and recovery evidence | Pending |
| #584 reusable kit | Realistic modular assets with provenance and collision | Pending |
| #585 deterministic assembly | Seed reproduction and retained manual overrides | Pending |
| #586 playable destination | Landmark, social plaza, accessible streets, seating and shared activity; two-player return loop | Pending |
| #587 quality gate | Performance, visual, accessibility, multiplayer/recovery evidence | Pending |
| #588 optional tools | Demonstrated need before external tooling evaluation | Deferred post-MVP |

## Implementation and checks

The initial manifest records the existing GIS frame and an empty east-side reservation. Reservation is a candidate coordinate envelope, not destination approval, survey evidence, walkable geometry or a server movement permission. Legacy District objects are returned unchanged by the compatibility validator. The shared gallery attachment now validates the manifest before applying its approved plan; both browser and server District loaders use that seam.

`node --test preview/tests/world-manifest.test.js`: 19 passed, zero failed/skipped. Tests cover non-mutating compatibility, second-location removal, translated coordinates, malformed versions/frames/bounds/entries/revisions, overlap, adjacency and legacy identity rejection.

Measured directly from `district.json`: bounds area 73,753.12497580437 m²; proposed reservation bounds area 147,506.24995160874 m². This is a 3× combined bounding area, not 3× playable area. At the initial checkpoint no rendering measurement had been taken; the later baseline results below supersede that measurement status without establishing hosted or physical-device acceptance.

## Next action

Corrected integrated core session `9968` passed. Poll browser journey session `40423` before starting duplicates. The journey remains queued behind another live browser owner. Authored Commons registration passed all 32 focused checks. Poll post-registration core session `32079` (`/tmp/river-oaks-expansion-core-registered.log`), then implement bounded cross-location routing and chunk lifecycle. The user approved East Garden Commons; the full expansion objective remains active.

The combined focused command `node --test preview/tests/world-manifest.test.js server/tests/district-building-interiors.test.js server/tests/district-gallery-levels.test.js server/tests/district-gallery-transition.test.js` passed 26/26 with zero skips. It includes occupied gallery migration and two-player upper-level behavior. This does not prove visual preservation.

## Continuation: baseline instrumentation

Added `preview/audit/world-expansion-footprint.js` and `preview/audit/world-expansion-baseline.js`. The footprint command passed and wrote `.runtime/world-expansion/footprint.json`: 73,914 resident grid cells of 80,000 allowed; site polygon 57494.336102785775 m²; three eastern footway endpoints fail the current resident `free` query. These are source/navigation observations, not measured connected playable area.

Browser baseline session `15772` is queued behind another live browser holder. Its log is `/tmp/river-oaks-expansion-browser.log`; poll this session before launching any duplicate. The core session `23667` remains live and is advancing through preview tests. No browser measurements have been claimed.

## Verified checkpoint: core and browser baseline

`PATH=/opt/homebrew/opt/python@3.12/libexec/bin:$PATH pnpm run verify`: passed all 11 phases; retained console evidence `.runtime/world-expansion/core-foundation.log` (the shared `.runtime/agent/core.json` path is now being replaced by the later blockout run). Console totals: tooling 201 passed; preview 3774 passed, 1 skipped; server 734 passed, 213 skipped; desktop 115 passed, 3 skipped; build and Python/offline/secret phases passed. Core excludes Redis, full browser journeys, native, hosted and target-device acceptance. Original log: `/tmp/river-oaks-expansion-core.log`.

`node preview/audit/world-expansion-baseline.js`: initial attempt exited 1 because the second viewport inherited retained fixture players; its report remains at `.runtime/world-expansion/baseline/report.json`. Corrected harness creates a fresh town for each viewport. Session 1868 exited 0 with report `.runtime/world-expansion/baseline-2026-10-22T23-58-40.583Z/report.json`. Desktop/phone-sized one-player p95 was 16.7 ms; two simultaneous renderers measured 50.0/33.4 ms. Reconnect 1354.94/1105.78 ms with zero stationary position drift. All four samples had zero asset failures and page errors. The M5 Max host was under load; phone-sized viewport is not physical mobile evidence. Inspected the original desktop arrival and corrected two-player phone-sized screenshots; the scene renders the established District. No matched unmodified-revision comparison or Gardens/gallery interior visual acceptance has yet been performed.

The source footprint audit now reports both player and resident clearance: all three eastern endpoints are player-clear but unavailable to resident routing. It records the actual Gardens revision via `districtRevisionOf`. The 80,000-cell routing cap and site boundary remain integration requirements, not invitations to weaken validation.

Added `docs/level-design/expansion/destination-proposal.md` and its SVG map as a concrete reviewable East Garden Commons proposal. Requested the user's decision through native async input; `accepted:true` only acknowledges presentation of the question and is not approval. Detailed destination authoring remains pending that answer. Independent manifest, route and chunk engineering can proceed. No issue is claimed complete, and no commit, push, PR, merge or deployment has occurred.

## Approved destination and first source blockout

The user answered “Approve East Garden Commons”; approval is no longer pending. Added the shared layout, Three.js blockout builder, walking/ground hooks, bounded District navigation selection, and preview/server tests listed in `docs/level-design/expansion/blockout-builder.md`. The default application loaders still do not attach the new blockout. The first six blockout tests passed, then nine including authority/checkpoint tests, then all 28 focused walking/flight/blockout tests passed. No failures were suppressed. The core result above predates these movement changes; re-verification is running under session 1609 (`/tmp/river-oaks-expansion-core-blockout.log`).

The new source contract has 10 meshes and 1,248 submitted triangles, a continuous six-metre route, bounded walkable footprint, sampled edge elevation and idempotent owned-resource disposal. Current tests prove a gateway-to-plaza controller/server-model loop; original-arrival browser travel, real seat/game use, chunk lifecycle, content-revision synchronization and visual review remain incomplete. The full mission is not achieved and no issue is closed or marked delivered.

## Integrated loading, recovery and shared chess

The source blockout is now available through the existing revision selector as `east-garden-commons-blockout-1`, attached after Gardens in both the server and client. HTTP data, WebSocket revision synchronization and exact checkpoint composition share that revision. Existing defaults remain unchanged. Added reversible Commons/Gardens checkpoint migration and existing epoch fencing to Redis recovery. Eleven focused Redis migration cases passed with zero skips against owned disposable Redis on `127.0.0.1:16389`; log `/tmp/river-oaks-expansion-redis-migration.log`. The earlier blockout core completed all eleven phases and was retained as `.runtime/world-expansion/core-blockout.json` and `.log`.

Reused `plaza-salon-plan.js` chair/table generation and existing authoritative chess commands for `chess-commons`. The regression completes a two-player game, preserves it across checkpoint restore and safely rolls back to Gardens using normal table departure rules. New Redis migration/activity checks passed again after this rollback behavior was added; log `/tmp/river-oaks-expansion-redis-activity.log`. A subsequent focused assertion passed: an unrelated simultaneous District chess game and its seated players survive Commons rollback unchanged.

The integrated core run with isolated Redis is session `22261`, log `/tmp/river-oaks-expansion-core-integrated.log`. The original-arrival, two-client walking/chess/reconnect/return journey is session `40423`, log `/tmp/river-oaks-expansion-traversal.log`, queued behind a live Campus browser owner. It has not supplied acceptance evidence yet. Ownership now includes all new Commons layout, rendering, composition, revision, migration, tests and journey files listed in the live register. Manifest registration, cross-location resident routing, bounded chunk streaming, twenty-loop stability and remaining world-quality requirements remain open. No commit, push, PR, merge or deployment has occurred.

## Corrected collision assertion and real transport evidence

Integrated core session `22261` failed one blockout assertion that expected empty floor at the newly occupied table centre. Preview totals were 3,779 passed, one failed and one skipped; remaining core phases were not run. Preserved the failure in `.runtime/world-expansion/core-integrated-first.json` and `.log`. Updated the assertion to require collision at the table and clear circulation beside it. `node --test preview/tests/east-garden-commons.test.js server/tests/east-garden-commons-games.test.js` passed seven tests with zero skips, including retention of the simultaneous District game. Corrected core session `9968` is running with isolated Redis; log `/tmp/river-oaks-expansion-core-integrated-corrected.log`.

`REDIS_URL=redis://127.0.0.1:16389/0 node --test server/tests/east-garden-commons-transport.test.js` passed two tests with zero skips (memory and Redis). Real HTTP tickets and WebSockets confirm Commons revision agreement, two-peer seam crossing, reserved-land rejection, position/appearance retention after reconnect, and return across the seam. The fixture uses ordinary validated travel to reach the seam, then paced poses; it is not the full keyboard browser journey. Evidence: `/tmp/river-oaks-expansion-transport.log`. Browser session `40423` remains queued behind live holder `40178`; no duplicate or bypass was started.

## Passed integrated core and authored registration

Corrected core session `9968` passed all 11 phases with isolated Redis. Console totals: tooling 201 passed; preview 3,780 passed and one skipped; server 999 passed and zero skipped; desktop 115 passed and three skipped; build, Python, demo and secret checks passed. Receipts are retained in `.runtime/world-expansion/core-integrated-corrected.json` and `.log`. This remains local evidence, excluding full browser, physical-device, human accessibility, hosted and production acceptance.

Subsequently registered `east-garden-commons` as authored and partitioned the surrounding original reservation into three empty rectangles without overlap or total-area growth. Commons composition now validates its revision, exact bounds, identity transform and gateway elevation against that registration. The first focused registration run passed 30 tests with one Redis skip; the subsequent mismatch regression and Redis-enabled focused rerun passed all 32 tests with zero skips. Log: `/tmp/river-oaks-expansion-registration-redis.log`. This manifest change follows the integrated core receipt above; the receipt is not relabelled as a later source gate.

Added the optional `--reachable` ground-level flood estimate to the owned footprint audit. At 1 m/0.5 m grid spacing, Gardens samples cover 46,549/46,477.75 m²; Commons samples cover 51,969/51,962 m², additions of 5,420/5,484.25 m² (about 12%). These estimates exclude upper levels and carry finite-resolution/source-versus-renderer limits documented in `docs/world-expansion.md`. The 3–5× target remains open. Comparison before/after registration confirms both complete composed-world fingerprints and both area estimates unchanged. Evidence is `.runtime/world-expansion/footprint.json`, with the previous registration measurement retained separately.

The post-registration core run is live as session `32079`, log `/tmp/river-oaks-expansion-core-registered.log`. The only other outstanding acceptance process is queued browser session `40423`; owned disposable Redis remains session `47280`, PID `78005`, port `16389`. Preserve these handles and poll before starting duplicates. The previous core pass is retained independently. No full/browser/hosted/device/visual acceptance is claimed, and the goal remains active.

## Handoff to Claude and target-area check

At 19:47 CDT the Codex sessions in this repository had exited and the worktree had been quiet for ten minutes. With the user's authorization, ownership moved to `claude:world-expansion-20261022-1950` and was recorded in the live register. All Codex edits were kept in place. Codex's post-registration core (session `32079`) had passed at 19:37 CDT. Browser session `40423` exited without running while it waited on the lock held by the Campus 507 run (pid `40178`).

Reproduced checks:
- The focused manifest, Commons, game and gallery suites passed 38/38 with zero skips.
- `--reachable` reproduced the Gardens/Commons samples exactly.
- The audit now also samples the default garage revision: 40,083 m² at 0.5 m, against an independent flood fill of 40,133 m².
- The audit writes `expansionCapacity`. At the District's measured 63% walkable density, the current reservations project to 2.99× the Gardens baseline. That is just under the 3× floor, and 5× needs about 286,000 m² of reserved bounds. `docs/world-expansion.md` records the target, the layout and the decision this needs for Phase 2.

Queued behind the shared browser lock: the `east-garden-commons` journey, then a fresh baseline. Running alongside them: core with isolated Redis on `16389`. Results are recorded below as they arrive.

Core gate: after the handoff, `REDIS_URL=redis://127.0.0.1:16389/0 pnpm run verify` passed all phases. Counts: preview 3,782 passed and 1 skipped; server 999 passed and 0 skipped; desktop 115 passed and 3 skipped; Python 149 passed; build, demo and secret checks passed. Receipts are in `.runtime/world-expansion/core-claude.{log,json}`.

Journey failure, 19:53 CDT: another session ran the `east-garden-commons` journey in this checkout with `RIVER_OAKS_E2E_REPORT=world-expansion-traversal.json`. That report is kept and was not committed. It failed at "Existing pedestrian routes connect both arrivals to the eastern gateway". Node reproduction showed this is not an expansion regression. The walk spawn is classified as road, so the pedestrian-only resident planner (`allowRoads:false`) returns no route on garage, Gardens and Commons alike. With roads allowed, Gardens and Commons give identical 5-point routes. Players may walk on roads, so the journey now plans player routes with `allowRoads:true`. Resident routing is unchanged.

Parallel sessions now own downstream tasks in the live register: `baseline-followup-580`, `world-manifest-581` (a separate Codex #581 implementation that must reconcile with this branch), `continuous-walk-582`, `world-streaming-582-583`, `neighborhood-584-586` and `world-expansion-gate-587`. This checkout remains the Phase 1 integration source.

Baseline reproduction: `node preview/audit/world-expansion-baseline.js` passed, writing `.runtime/world-expansion/baseline-2026-10-23T00-56-13.468Z/`. It ran on the same M5 Max, Sharp quality, with host load averages between 17 and 42.

| Profile | 1-player frame p95 | 2-player frame p95 | CPU p95 (1p/2p) | Reconnect | Transfer |
| --- | --- | --- | --- | --- | --- |
| Desktop 1440×1000 | 16.7 ms | 33.4 ms | 10.3 / 12.9 ms | 1.05 s | 73.67 MB, 494 resources |
| Phone-sized 390×844 | 16.7 ms | 33.4 ms | 9.1 / 11.0 ms | 0.84 s | 73.67 MB, 492 resources |

Frame p95 for one player matches the first run. Two-player desktop improved from 50.0 ms to 33.4 ms, and CPU and reconnect times were lower. The spread is within loaded-host noise, which is why the budgets need medians of three 30-second samples. Renderer counts are 530/163 geometries/textures on desktop with one player. The desktop screenshot was inspected and shows the established District arrival, HUD intact.

An earlier Commons journey run at 19:56:13 used the harness from before the fix (edited at 19:56:36), so it is not evidence. The tracked `data/reports/experience.json` it overwrote was restored. The rerun writes `data/reports/world-expansion-journey-claude.json`.

Browser journey passed. `RIVER_OAKS_E2E_REPORT=world-expansion-journey-claude.json pnpm run test:experience east-garden-commons` finished at 2026-10-23T02:26:54Z in 200.14 s (report: `data/reports/world-expansion-journey-claude.json`). Covered, with no page errors:
- two real clients walked by keyboard from the District arrival to the gateway and out to the Commons;
- both completed the shared Commons chess game through the normal board UI;
- a reconnect kept identity and Commons position;
- both walked home, and the round trip kept both documents without a reload.

Owner/alice walk times: approach 27.7/44.1 s, out to the Commons 20.0/35.6 s, return 18.1/39.3 s, home 20.8/41.0 s. Screenshots are in `output/playwright/east-garden-commons-{arrival,game}.png`; the arrival shot was inspected and shows both players on the blockout plaza. This is local Chromium evidence with a loaded host. It is not visual-quality, physical-device, hosted or human-accessibility acceptance.

## Phase 1 status

- #580 is complete for this scope: audit, measured baseline (garage 40,083 m² and Gardens 46,477.75 m² reachable), target 139,433–232,389 m², layout capacity check, reproducible footprint and browser baseline tools, provisional budgets, the approved destination, and passing one- and two-player journeys.
- #581 is complete for this scope: a versioned manifest with stable IDs, bounds, translation transforms, entries, content revisions and reciprocal edge adjacency; malformed and overlap tests; unchanged District loading; and a registered second location (`east-garden-commons`) behind an opt-in revision.
- Open for Phase 2: cross-location resident routing (#582), chunk lifecycle (#583), the layout decision to reach 3× or more, medians of three 30-second samples, physical devices, and hosted acceptance.
