# #506 Garden campus: measured campus, floor and connection contract

## Objective and ownership

Turn #506's numeric design into one shared, versioned contract and a runnable validator for the three-tower campus that replaces the garage `osm-way-625330790` (parent #505). Renderer, collision, level authority, unit inventory and tests read the same geometry.

- Register task `garden-campus-contract-506`, owner `claude:garden-campus-506 (1e70822d)`.
- Branch `feat/garden-campus-contract-506-20261018` in `../river-oaks-garden-campus-506-20261018`, from `origin/main` `153471bc2075e0d02e764a97b0a72129d6da5207`. That is the audited baseline itself; the district blob `566d7c52` matches.
- Scope: contract, validator, published artifacts and review views. #507 (district overlay, shells, collision, migration) and #508 (traversal) belong to the #505 tracker owner `river-oaks-95` (task `garden-campus-tracker-505`). That owner agreed not to edit this task's files.

## Files owned

- `shared/garden-campus-layout.js` (new): the contract and its functions.
- `preview/tests/garden-campus-layout.test.js` (new): focused behavioural tests.
- `scripts/garden-campus-views.mjs` (new): publishes `docs/design/garden-campus/{layout-contract.json, manifest.json, views/*.svg}`; `--check` gates.
- `docs/design/garden-campus/` (new): `brief.md`, `avatar-envelope.json`, `measure-avatar-envelope.mjs`, the generated files.
- `preview/e2e/fixtures/garden-campus.{html,js}` (new): 3D review page.
- `docs/offices.md`: a short "planned" pointer only.
- `server/tests/garden-campus-support.test.js` (new, follow-up 1): the authority fixture.

## Interface versions

`GARDEN_CAMPUS_VERSIONS` = `{schema 1, layout '3.2', floors 1, support 1, units 1}` (3.0 until follow-up 1; 3.1 at `63ef1b10`). Published contract SHA-256 is in `docs/design/garden-campus/manifest.json`.

Exports:
- `GARDEN_CAMPUS_LAYOUT`
- `campusLevels`, `campusSupportAt`, `campusSurfacesAt`
- `campusRoute`, `campusGraph`
- `campusUnitInventory`
- `sourceToCampus`, `campusToSource`, `campusToScene`
- `validateGardenCampus`, `checkCampusCompatibility`
- `CAMPUS_ELEVATIONS`, `campusLevelId`, `CORE_DECISION`

Pushed for consumers as `8921ca42`; later commits add files without renaming any export or id.

## Audit (153471bc)

- **Parcel:** the garage ring transformed with the pinned basis gives the issue's polygon to float precision; area 6,838.98290517 m². The basis is orthonormal.
- **Context:**
  - IPIC is `osm-way-625330798`: 18.5 m on a base of 18.32118 m. Its east edge is the campus wall from v 82.5438 to 181.2216.
  - The office is `osm-way-625330785`: 33 m on a base of 18.28383 m, nominal roof 51.28383 m absolute.
- **Entries:** E1–E3 are garage vertices, and their lanes exist. Lane vertex altitudes minus the base are −0.0311, −0.0112 and +0.0586 m. Terrain under the plot runs 17.56–18.42 m (NAVD88), so z 0 is an authored plinth.
- **Collision:** the garage ring is `collisionPolygons[1]` exactly; the whole parcel blocks walking today.
- **Support:** `groundSurfaceHeight` returns the highest triangle at x/z, so a bridge must never be registered as ground.
- **Storeys:** the generic recipe stacks 4.2 then 3.5 m storeys; the campus is 5 then 4 m.
- **Body:**
  - `AVATAR_ENVELOPE` is 0.505 / 0.888 / 2.45 / 1.27 m. Its comment cites 22 appearances measured 2026-10-11 at `eb62862`, which predates the human-only catalog (#496).
  - Remeasured here: all 11 current looks, with the same fixture and seat path (`avatar-envelope.json`, measured at `8921ca42`): widest body 1.01 m (Jevica), tallest 2.45 m (forest aristocrat), turning 0.561 m (Lyra), seated reach 0.932 m (forest aristocrat, feminine).
  - The constants bound every look; body width and height are exact.
- **Stairs:** the office stair walks 22 risers over 3.8 m with an 8.4 m run, and its height is derived on the server. Generated interiors pair stair portals instead.

## Decisions and logged adjustments

- **Levels:** keyed by elevation campus-wide, `garden-campus/l0..l7`. Proposed by the #508 owner and accepted on both sides as `support 1`.
- **Cores:** each 5 × 6 m envelope is kept: lift 3 × 2.6 m, enclosed stair 3 × 3.4 m, lobby 2 × 6 m meeting the spur. Stairs are level-change portals; the lift is the step-free route. Not adopted, with its measured effect: a walked code-like switchback needs about 5 × 9.4 m, costing about 28.9 m² of suite per upper floor and about 549 m² across the campus (`CORE_DECISION`). #508 accepted portals.
- **Roof access:** a 3 m headhouse inside each core reaches z 28 / 32 / 28, under the 28.1 / 32.1 / 28.1 caps.
- **Spines:** every upper floor carries the 3 m spine at u 14.5–17.5 so suites stack. It stops 1 m short of facades without a portal; those 1 m ends are service residual.
- **Terrace passages:** 1.8 m wide, across the east band to each terrace door.
- **Suites:** at least a 3 m short side, a 1.7 m door, and 1.27 m seated desk clearance. The 1.5 m top-tier east strips are service residual. Result: 43 suites, 3,279.7 m² net; commercial terms unset (#509).
- **Seams:** follow the parcel vertices, so the E1 bend is exact. The first four-corner version missed E1 by about 0.3 mm and the validator caught it.
- **Cameras:** five named, matching the issue's proposed set; `05-office-terrace-outlook` is an approximate office roof edge.

## Evidence

- `node --test preview/tests/garden-campus-layout.test.js`: 15/15, covering:
  - provenance, the collision fact, frames;
  - 6/7/6 floors, roofs and caps against the office roof;
  - facade-to-facade spans;
  - the public F4 route through both decks with no suite;
  - support below and above each deck, never the highest surface;
  - levels, portals and reachability;
  - units;
  - the envelope receipt against the catalog;
  - versions;
  - defects;
  - the IPIC wall and seams;
  - published artifacts up to date.
- Defects demonstrated failing:
  - a shifted B12 endpoint (`endpoint`, `span`);
  - a B23 deck at 12.5 m (`elevation`);
  - a T3 tier off the parcel (`offsite`);
  - a suite into the gallery (`overlap`);
  - a planter on the T2 south landing (`blocked`, `route`);
  - a kiosk on B23 (`route`);
  - a roof bed beyond its deck (`support`);
  - a headhouse above its cap (`silhouette`);
  - a missing T3 headhouse (`reach`);
  - P5 opened onto the IPIC wall (`ipic`);
  - a broken seam (`seam`);
  - a floors-2 requirement (`version`);
  - a deck injected on the ground level (the support model keeps the ground).
- `node scripts/garden-campus-views.mjs --check`: ok, no findings, nothing stale.
- Views inspected after rendering (site plan, Floor 4, long section at u 16). Clipped labels were fixed after inspection.
- Review page: served from this worktree's Vite on port 5196 (`/e2e/fixtures/garden-campus.html`). Checked headlessly under the browser lock with no page errors: massing and the l3 bridge walk, validator ok. Opened for Val.

Gates and PR: see the Delivery section below.

## Delivery

- **PR:** #519 (draft, then ready for review). Signed commits:
  - `8921ca42`: contract and tests;
  - `c8df81e4`: published artifacts, envelope, brief, review page;
  - `0e46ec36`: pergola posts;
  - `f859310e`: brief view links, after the desktop fix;
  - `82028fc8`: landing-meets-portal check and the private-bypass test;
  - this ledger commit.
- **Hosted CI at `82028fc8`:** 19/19 succeeded, covering:
  - aggregate `preview`, `preview checks` (agent tooling, preview, server with Redis, desktop, build, browser regressions) and the five shared/experience shards;
  - `verify (3.11/3.13)`;
  - `desktop` on macOS, Ubuntu and Windows;
  - CodeQL and dependency review.
- **Desktop failure and fix:** the first run at `0e46ec36` failed `desktop` on all three platforms. The Studio skill pack follows Markdown links from linked guides, and `docs/offices.md` now reaches the brief, whose `views/` directory link failed its safe-path rule ("Unsafe pack path"). `f859310e` links each view. Local `pnpm run test:desktop`: 76/76.
- **Local core gate:** one run at `82028fc8`, under the browser lock, after waiting 45 minutes for load below 30. It started at load 85, which reached 268 during the run. It stopped in agent tooling at 120/121: `project-prune.test.js` "missing or expired deletion permits fail closed" (99 s, missed its expected exception). That file passes alone, 14/14, at load 201. This branch adds no tooling or test change outside its own files. Not rerun at this load; the hosted run is the single-run gate here, as Val accepted for #493.
- **Coordination:**
  - The #505 tracker owner river-oaks-95 consumes the contract: #507 at `302b3e0f`, #509 at draft PR #522.
  - #508 is handed to this session's next goal (register task `garden-campus-traversal-508`).

### Release decision to prepare

Merging #519 needs Val's go-ahead (`pnpm run land 519`). Merging changes no runtime behaviour, because nothing imports the module outside tests, the views script and the review page. #507 and #509 are stacked on this branch, so landing #519 first shortens their diffs. Activation of the campus is #507/#512's content revision, with the garage as default.

## Follow-up 1: resume (2026-10-18)

**Refresh.** `origin/main` `1d8740ad`; branch `97843044` = main merged, 0 behind; district blob `566d7c52` unchanged, so the contract inputs did not move. Consumers at their latest heads: #507 `0eb42839` and #509 `485d4e11`, both merging `97843044`; neither edits a contract file.

**Recomputed against the accepted table (no drift):**
- Facade endpoints at Floor 4: B12 from T1's north facade v 70 to T2's south facade v 93 (23 m); B23 from T2's north v 116 to T3's south v 131 (15 m).
- Common datum: decks at 31.259392 m absolute, underside z 12.65.
- Parapets: 44.259392 / 48.259392 / 44.259392 m absolute.
- Caps: 46.359392 / 50.359392 / 46.359392 m, which is 4.924436 / 0.924436 / 4.924436 m below the office roof (51.28383 m).

**Consumer audit.** #507 reads the layout, `campusLevels` (guards, obstacles, openings), the frames and the validator. It draws shafts from their rects and uses only `headhouse.door[1]`. #509 reads versions, `checkCampusCompatibility`, `campusSupportAt`, `campusUnitInventory` and `campusLevelId`. Neither reads level-portal positions, `campusGraph` or `campusRoute`, and neither pins a layout literal or the manifest digest.

**Measured conflicts, resolved here** (the #508 consumer is this session):
1. **Level portals sat on the shaft and headhouse faces.** `world.js` lands a level change on the paired portal and refuses `level_landing_blocked` unless that point is free for the walking body. At the 3.0 positions, a 0.505 m body at every one of the 76 level portals overlapped its lift, stair or headhouse.
   - Each portal is now the standing point 0.6 m in front of its door: `CAMPUS_DOOR_SETBACK`, the same setback suite doors already used for `inside`. Example: T1 lift (11.6, 56.3).
   - Roof arrivals land outside the headhouse door (`headhouse.landing`, T1 (13.6, 58)). The faces stay published as `door`.
   - Layout becomes 3.1 (minor and compatible: positions only, no id changes).
2. *(Superseded in 3.2; see below.)* **The graph had a direct `B12 ↔ T2-terrace-4` walk edge** that the published support does not have. As the issue specifies, B12's guarded rect runs to T2's facade at v 93. A support flood fill from the deck reaches only the 3 m lane strip of terrace part 1, never part 0 with the door. Removed; the terrace is reached through its door, which is how `campusRoute('E1', 'T2-terrace-4')` now ends.
3. **Doors could slide along their walls and still validate.** T2's terrace door moved 2 m north opened from suite `T2-F4-E-N`; a suite door moved past its suite also passed. The new `opening` rule requires every entrance, suite door, terrace door and skywalk portal (56 in all) to sit on the boundary it joins, with its full width inside the shared edge. A second `portal` rule keeps a body at each level portal on public support and clear of obstacles.
4. **A point query slips along a facade line where a guard ends.** At (14.2, 93), the centre alone finds terrace support between B12's west guard and T2's facade. Recorded as an interface note: an authority checks the body against obstacles. The fixture shows that a 0.35 m body is refused there.

Facade crossings measured: every public part-to-part edge on the upper levels is covered by a declared opening. The exception is 0.05 m of jamb either side of each 1.7 m terrace door on its 1.8 m passage, which no body centre can reach.

**The authority fixture** (`server/tests/garden-campus-support.test.js`), on the district the server loads (`loadDistrictData`, gallery plan attached):
- The contract validates against the district.
- The street environment still blocks the parcel; under B12 its ground is terrain (17.93 m), not the deck.
- A fixture authority keeps `world.js`'s walking rules: assigned level, a pose within 0.2 m of its ground, 0.15 m sub-steps for a 0.35 m body, 3.4 m per move, and a 1.3 m-reach paired landing.
- A visitor walks from P9 through T1's door, lifts F1→F4 and crosses both skywalks to T3's gallery. Meanwhile a walker crosses P2 beneath; at (16, 76) they are 13 m apart, with standing headroom below the deck.
- Refused:
  - a forged level (`invalid_level`);
  - a forged or dropped height (`invalid_ground`);
  - a guard (`blocked`);
  - a teleport (`movement_too_fast`);
  - the facade-line slip (`blocked`);
  - a suite (`private_suite`);
  - a portal on another level or out of reach;
  - a 3.0-style face portal (`level_landing_blocked`).
- The T1 roof lands outside the headhouse.
- A checkpoint restores under the same versions and under a minor layout revision; a support/floors/layout major mismatch or an unsupported position relocates to the street.

**Support lookup cost.** `campusSupportAt` rebuilt every level on each call (2.2 ms). The published, frozen layout now keeps one private copy (0.02 ms per call); clones are still rebuilt, and `campusLevels()` still returns a fresh copy.

**Evidence (follow-up 1):**
- `node --test preview/tests/garden-campus-layout.test.js server/tests/garden-campus-support.test.js`: 19/19.
- `node scripts/garden-campus-views.mjs --check`: ok, 0 findings, nothing stale.
- The regenerated views change only the portal markers (0.6 m into each lobby) and the version label.

**Gates at `63ef1b10` (3.1):**
- Hosted CI: 19/19 succeeded.
- Local `pnpm run verify`: passed on a clean tree, all 11 steps, 17:07–17:15Z (receipt `.runtime/agent/core.json`, revision `63ef1b10`).
  - The run waited about 11 minutes for the browser lock, behind other sessions' runs.

## Follow-up 1b: #511 finishes and the B12 guard correction (layout 3.2)

**Request.** The #511 owner, via river-oaks-95, proposed 67 obstacle rects against layout 3.0: 26 planters, 21 seats, 9 tables and 11 ground tree pits. Source: `river-oaks-garden-campus-511-20261018/docs/design/garden-campus/finish/proposed-obstacles.json`, sha256 `b2a96309c710ed5e1f212d6308bbed661b494070194ba414d7a920697bf0e09b`. They asked for validation against 3.1 and publication under a new minor version. Seats are collision until #510 makes them usable.

**Measured conflict.** Flooding T2-terrace-4 from its door with the 3.1 guards (B12's edge zones running on to T2's facade at v 93), a body never reached west of u 18.6 on the v 90–93 strip.
- With no finishes: 13.11 m² where a body can stand is cut off from the door, plus the 3.61 m² lane strip.
- With #511's finishes: the bench `T2-terrace-4/seat-south-7.3` cannot be reached.
- #511's own flood missed this because it keeps only obstacles whose centres lie within 3 m of a part, and B12's 23 m guards' centres are 8.5 m away.
- The issue asks to "interrupt the terrace guard at v 90 over u 14–18". Read with an all-public terrace, that means B12's guards stop where the terrace starts. 3.2 publishes `bridge.guardSpan` (B12 70–90, B23 unchanged) and restores the graph's `B12 ↔ T2-terrace-4` walk, which support now confirms. This reverses follow-up 1's item 2, which read the guards as running to the facade.

**Adopted.** All 67 finishes, unchanged, as `layout.furnishings` `{id, kind, levelId, rect}` (the file's `level` renamed to `levelId`). `campusLevels` places them as obstacles on their levels; new kinds are `seat`, `table` and `tree`.

**New validator rules** (`checkFurnishings`):
- `furnish`: unknown level or kind, an empty rect, or a repeated id.
- `support`: a finish not inside one public terrace or roof surface, or on open ground off the tower and solid-building holes.
- `overlap`: a finish overlapping any obstacle on its level, reported once per pair.
- `blocked`: a finish in a keep-clear zone, a deck rect, a door approach (1.8 m deep, 0.3 m beyond each jamb of every terrace and headhouse door), a path or a seam.
- `reach`: 0.1 m floods for a 0.505 m body and a 1.8 m route from each terrace and roof door. They must reach every part, and every seat or table within 0.25 m. No cut-off area of 0.5 m² or more where a body can stand is allowed.

**Results.**
- `validateGardenCampus()`: ok, 0 findings with all 67 placed; about 355 ms per run (floods included).
- Defects shown failing:
  - 3.1-style guards: `reach` for the west wing and lane strip, and the west-wing bench.
  - A seat in the T2 roof door approach: `blocked`, and the roof portals lose their standing point.
  - A table across T1-terrace-3's east strip: `reach` for part 1 and all four south benches.
  - A tree on P1: `blocked`.
  - A planter over the terrace edge: `support`, `overlap`.
  - A repeated id: `furnish`.
- Server fixture: the visitor steps off the B12 lane onto T2's west wing, and a bench refuses a step (`blocked`). The facade-line slip at (14.2, 93) is ordinary terrace now; the point-versus-body case moved to the seam between T1's lift and stair shafts, where (10.2, 57.6) has hall support and a body is refused.
- Views: B12's guard band ends at v 90 in the section; Floor 4 draws T2's terrace finishes; the site plan draws the tree pits. All inspected after rendering.
- `node --test preview/tests/garden-campus-layout.test.js server/tests/garden-campus-support.test.js`: 19/19.
- `node scripts/garden-campus-views.mjs --check`: ok.

**Delivery (3.2).**
- Signed commits:
  - `f44adbbb`: finishes, guard span, rules, tests, views, docs;
  - `8428c8dd`: signed merge of `origin/main` `97304fb7`, which auto-merged #486's `docs/offices.md` edit; the campus pointer is intact;
  - this ledger commit.
- Hosted CI at `8428c8dd`: 19/19 succeeded (same set as at `63ef1b10`). `pnpm run test:desktop` at `8428c8dd`: 76/76.
- **Local core at `8428c8dd`: not yet run.**
  - The 17:23Z attempt waited 25 minutes for the browser lock, then failed at 17:48Z before any step: `ENOSPC` creating the lock. The machine disk had 121 MB free, with swap at 23 of 24 GB from other workloads (another session stopped an Ollama runner with Val's approval), and load reached 539.
  - A retry is queued (`nice -n 19`, under the browser lock), set to start once the 1-minute load falls below 40 and more than 10 GB is free.
  - Since the passing `63ef1b10` run, the changes are the contract module, its two test files, the views script, the review page and docs. The focused checks above cover them.
- Consumer confirmation: #507 merged 3.2 at `40aec12a`. Its ground collision is now 27 rects including the 11 tree pits, B12's guards render to v 90 from the published obstacles, and 38/38 campus tests pass (plus 1 Redis-only skip), including this branch's fixture and layout test. #509 reads none of the changed fields.
- The PR #519 body was updated, and the #506 comment posted (`issuecomment-6253185330`).
- **Review page:** serves from this worktree (200). It was not re-rendered headlessly at 3.2 because of the load.

**Next action.**
1. When load allows, the queued local core run and a headless review-page render at the head. Record both in the PR.
2. Merging needs Val (`pnpm run land 519`); #507 and #509 stack on this branch.
3. Then #508 in this session, which waits on Val starting that goal. river-oaks-95 asked for its first SHA and offered to take the two-player journey slice; no split is agreed yet.

## Open and next

- **#507 (tracker owner):** `attachGardenCampus`, removal of `collisionPolygons[1]`, shells, street rooms, collision and the content revision.
- **#508 (this session's next goal):** server-side levels and portals on `campusLevels` in `world.js`. The walks and refusals in `server/tests/garden-campus-support.test.js` must pass against the real levels.
- **#509:** leases keyed on unit id plus `units`/`layout` versions.
- **Not claimed here:** in-world rendering, GPU cost, two-player traversal, device evidence, production. Merging and activation are separate release actions.
