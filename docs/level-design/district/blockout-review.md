# District spatial review

Date: 2026-10-08. Initial inspection: `2020849`; corrected working copy:
`014ea13bb644806ba8073cf93f15cdfb9602434a`, canonical `river-oaks`, branch `main`.
Decision: **Needs blockout changes for native night play.** Browser scale, alignment
and corrected circulation are verified within the scope below. Sustained rendered
native walking remains unverified, so whole-runtime acceptance is incomplete.

## Scope and setup

Review composed the repository world-workflow, map-scale-blockout, room-logic,
player-path-collision, camera-framing, developer-view and blockout-review skills.
Lighting diagnostics were used to distinguish the native dark view from missing
geometry. The scope is the existing mapped district and public gameplay rooms,
not surveyed reconstruction or a new building program.

Browser manifest coordinates are east/north/up meters; Three.js maps them to
east/up/south. Native uses east/south/up centimeters. The district spans
253.944 × 290.431 m, with nine buildings, 39 roads and 30 shops. Browser traversal captures use a 1440 × 1000 viewport and the shipped walking
camera's configured 65° vertical FOV. The browser walker has radius 0.35 m, eye height 1.68 m, normal speed 1.65 m/s and brisk speed
3.2 m/s. Its movement queries require height change strictly below 0.4 m;
substeps run at 120 Hz with frame delta capped at 0.08 s. These are implemented
rules, not generic capsule/step defaults.

The native pawn has radius/half-height 35/80 cm and speed 165 cm/s. At capsule
center Z=88 cm, its 80 cm camera offset gives a 1.68 m eye height. Its bottom is
8 cm above the datum, versus 4 cm road tops. Native has no gravity/step/slope
solver or equivalent playable boutique interiors; browser networking does not
establish native replication. Visual stature remains separate from collision.

## Scale and alignment

| Check | Observed evidence | Outcome |
| --- | --- | --- |
| Room placement | All 30 room plans align with facade bays, remain within footprints and do not overlap. Width 3.319–13.822 m, depth 7–9 m, nominal ceiling 3.9 m. | Pass for existing plans; local trim can reduce clearance. |
| Rendered door anchors | World-transformed vertices of all 30 door leaves measure 1.700 × 3.000 m, with uniform parent scale. | Pass for leaf dimensions. Fully open net passage was not separately measured. |
| Browser facade stations | Seven detached captures, 1600 × 1000, vertical FOV 62°, aspect 1.6, hour 15; positions/quaternions recorded. | Overview, Dior and street views inspected. Fixture omits live crowd/planting. |
| Native staged data | Eight of nine building heights were stale; building `625330785` was 8 m versus browser 28 m. Horizontal bounds/centers matched. | Fixed local generated input with the existing exporter. |
| Native live scale | All nine live Style instance transforms match exported dimensions within 0.000001 m; components use the 100 cm engine Cube. | Pass for rendered mass dimensions and positions, not detailed facade equivalence. |

Measurements: [browser receipt](../../../data/reports/map-spatial-measurements-20261008.json)
and [native receipt](../../../data/reports/map-spatial-native-20261008.json).
Detached captures: `output/playwright/spatial-{overview,hermes,dior,street,equinox,bari,west}.png`.
The 3 m door leaves and 3.9 m room ceilings express the existing tall boutique
frontage. No unit or parent-scale error was found. A detached, unoccupied plaza
view does not justify shrinking the district's gathering space.

## Reproduced defects and corrections

| ID / severity | Before | Applied correction and result |
| --- | --- | --- |
| SCALE-01 / major | Eight native staged heights disagreed with the browser manifest. | `uv run python scripts/export_district.py`; all nine live instance dimensions verified. Ignored input backup retained at `.runtime/map-spatial-review/native-district-before.json`. No map binary overwritten. |
| ROUTE-01 / blocker | Zadig & Voltaire's 3.3188 m room had two 0.5194 m side gaps around its center table, below the 0.70 m player diameter. Normal W input stopped at the display. | Omit the center table when wall displays, table and two 0.8 m aisles cannot fit. Normal occupied rear/return and threshold routes now pass. |
| ROUTE-02 / blocker | de Boulle's same-width room had two 0.4694 m gaps around each center vitrine. Its wall-display attendant also came within 0.597 m of the center aisle. | Omit both center vitrines and shift the two affected display stations 0.112 m toward the walls. Occupied traversal now passes with at least 0.736 m sampled center separation. |

The shared planner in `preview/src/store-rooms.js` owns fixtures and population
for browser rendering and server collision. Both corrected rooms retain 2.2388 m
between wall-display envelopes. No player radius, speed, facade/door anchor,
room boundary or server authority changed. Retained fixtures still block movement.

The original rendered probes and measurements are retained in
[the narrow-shop baseline](../../../data/reports/map-spatial-narrow-20261008.json).
New physical rear/return tests failed before the island fix. The occupied-center
regression then failed before the station fix. All 11 focused navigation/room
tests pass after both corrections, with zero skips.

## Activities and architecture

| Connection | Intended activity | Reviewed boundary |
| --- | --- | --- |
| Street ↔ single shop door ↔ sales floor | Arrival, browsing, exit | All 30 existing physical exit regressions pass. Rendered threshold, return and diagonal checks focus on the two corrected narrow rooms. |
| Sales floor ↔ counter/consultation approach | Talk to staff from the public area | Real fixture residents and two clients are included. Conversation uses a server travel command; its relocation is recorded separately from walking. |
| Display station ↔ visitor aisle | Staff/guest browsing beside circulation | Corrected station positions leave the center aisle clear. A 0.28 m standing proxy plus the 0.35 m player is a design check, not NPC collision or accessibility certification. |
| Upper floors, services, storage, bathrooms | Outside these public gameplay pockets | Deliberately absent. No fictional service rooms or vertical connections were added. |
| Native street ↔ building masses | GIS blockout and local street play | Rectangular masses, four staged trees and local residents; no equivalent browser shop program or native multiplayer acceptance. |

De Boulle's direct diagonal from the post-conversation desk position passes too
close to a guest. The accepted return first rejoins the rear of the center aisle,
then proceeds toward the entrance. Activity space is not treated as an empty
shortcut through an occupied station.

## Browser traversal

`spatial-circulation` passes **55 checks**, 14 normal-input legs, no page errors.
Both rooms contain two visible authoritative residents during this run. Mouse
look and ordinary W input reach the rear, relevant diagonals, return, street and
threshold re-entry. The peer receives each endpoint within 0.3 m. Staff dialogue
opens and reconnect preserves identity and position in each room.

| Room | Sampled walked length across seven legs | Minimum resident center separation | Result |
| --- | --- | --- | --- |
| Zadig & Voltaire | 15.73 m | 0.870 m | Pass, including interaction/reconnect and both camera modes. |
| de Boulle | 16.51 m | 0.736 m | Pass, including interaction/reconnect and both camera modes. |

Lengths omit the normal conversation relocations (0.390 m and 0.885 m).
Detailed per-leg times include steering and diagnostic pauses, so they are not
speed benchmarks. Clearance is sampled against actual rendered resident centers,
not a continuous swept-body guarantee. First-person counter views and the
third-person de Boulle return were inspected: the center route and exit remain
readable; the actual avatar is the scale reference. The expanded Play & rides UI
occludes the right edge of these captures, limiting peripheral visual inspection.

Evidence: [final browser receipt](../../../data/reports/map-spatial-final-browser-20261008.json),
`output/playwright/spatial-circulation-*.png`. Earlier failed harness attempts are
retained in the separate circulation/street receipts and do not establish current
acceptance. Early harness issues included inspection latency extending a held
key and input cleared while the driver still considered W held. The street
harness now generates normal keyboard repeats; no gameplay rule was changed.

The wider rendered Hermès → Dior → Equinox → Hermès loop passes all **10 checks**,
with no page errors. Normal keyboard movement covers 270.55 m. Each endpoint
agrees with the authoritative server within 0.168 m. Captures
`output/playwright/spatial-street-{1,2,3}.png` were inspected: sidewalk/tree/facade
spacing remains readable at the arrival stations. Third-person camera positions
can sit outside while the player has reached a shop's entrance; the room HUD
and authoritative player positions distinguish these views.

| Rendered leg | Sampled distance | Wall-clock time including steering | Outcome |
| --- | --- | --- | --- |
| Hermès → Dior | 42.40 m | 31.625 s | Pass |
| Dior → Equinox | 135.35 m | 90.049 s | Pass |
| Equinox → Hermès | 92.79 m | 64.076 s | Pass |

The separate [fixed-step query audit](../../../data/reports/map-spatial-route-queries-20261008.json)
already passes all three legs: 41.79 m / 28.37 simulated seconds, 135.14 m / 88.68 s,
and 92.86 m / 59.48 s. Lateral queries at 5 cm intervals found minimum free cross
sections of 6.75, 5.75 and 5.80 m, including player diameter. Sampling is capped at
5 m per side and excludes runtime placed objects; these are movement-query
cross sections, not surveyed sidewalk widths or measured rendered travel times.

## Native rendered and movement evidence

UE **5.8.2**, Mac Development, Metal/Apple M3 Max loaded 39 roads, nine buildings
and four staged trees. `getall InstancedStaticMeshComponent PerInstanceSMData`
and `StaticMesh` supplied the live transform and mesh-basis evidence. Native
configured FOV is 65°; at 1280 × 800 the live horizontal FOV is 59.7° (aspect 1.6).
It is not a matched-camera comparison with the browser's vertical FOV.

Native street/day/night captures were inspected at the real 1.68 m eye camera:
`unreal/Saved/Screenshots/MacEditor/ScreenShot00002.png`, `ScreenShot00003.png`,
`ScreenShot00004.png`. The day/night cycle made the world view black while the
HUD remained visible. Temporary Hour=14 and DayLengthSeconds=1000000 restored
and held daylight. The game process was closed without saving the map.
**LIGHT-01 / major:** native nighttime wayfinding is unsuitable in this blockout.
A daytime review control is not a shipped lighting correction. Follow-up should
use lighting-pbr-diagnostics to establish a night readability target, then repeat
the same eye-level route and camera before approving night play.

A temporary compiled `RiverOaks.SpatialReview.GeneratedDistrictTraversal` probe
loaded staged geometry and the real pawn/input stack. Under NullRHI, 300 W frames
at 60 Hz moved from (-276530.440, 129507.270, 88.000) cm to
(-276530.440, 128682.270, 88.000) cm: **8.25 m**. 300 S frames returned exactly.
A real capsule sweep was blocked by a generated building component. One probe
passed, zero warnings/errors. This is fixed-step input/collision evidence,
not sustained rendered or human traversal. Source and receipt remain at
`.runtime/map-spatial-review/RiverSpatialProbe.cpp` and `native-traversal/index.json`.
The temporary source copy was removed from `unreal/Source/`; the cleanup Editor
Development rebuild succeeded. The earlier 25 native contracts also passed.

## Verification and limits

- `node --test preview/tests/auto-navigation.test.js preview/tests/store-rooms.test.js`: 11 passed, zero skips. Red/green logs: `/tmp/river-oaks-spatial-occupancy-{red,green}.log`; final repeat `/tmp/river-oaks-spatial-final-focused.log`.
- `RIVER_OAKS_E2E_REPORT=map-spatial-review-20261008.json npm run test:experience -- debug-tools contextual-first-visit`: both passed, desktop/touch; local fixture authentication only.
- `RIVER_OAKS_E2E_REPORT=map-spatial-final-browser-20261008.json npm run test:experience -- spatial-circulation spatial-streets`: both passed, 65 checks total, zero page errors; runner exited 0.
- `RIVER_OAKS_SHARED_JOURNEY=indoor-npcs RIVER_OAKS_SHARED_REPORT=map-spatial-shared-20261008.json npm run test:shared -- required`: passed all eight checks, exit 0, full Metal rendering; [receipt](../../../data/reports/map-spatial-shared-20261008.json).
- `uv run python -m pytest tests/test_district_export.py -q`: four passed.
- Editor Development build with `-NoUBA`: succeeded. An initial UBA build crashed in `libUbaHost.dylib` despite shell exit 0; that attempt is not a pass.
- Built editor `RiverOaks.Contracts`: 25 succeeded, zero failed/not-run. Receipt `.runtime/map-spatial-review/native-contracts/index.json`.
- `npm run verify` after the final planner/test edits: core passed at `014ea13`, dirty copy. Agent 17, preview 671, server 267, desktop 9 and Python 141 tests passed. Server skipped 101; Python emitted two deprecation warnings. Build/lint/format/secrets checks passed. Receipt `.runtime/agent/core.json`; log `/tmp/river-oaks-spatial-occupied-core.log`.
- The synthetic demo verifier's expected exit 2 is accepted by core; it is not production data approval. Core excludes Redis, browser, native and live acceptance.

Unverified: full Redis/audit profile, hosted auth/CI, sustained rendered native
walking, native nighttime acceptance, human accessibility and performance.
The available native UI automation sends discrete key presses, not a controlled
sustained key hold. Those brief rendered taps were not promoted to timed route
evidence; the compiled probe remains the available native movement proof.
Stairs/slopes and native replication remain unsupported in the reviewed native
controller. No whole-district art-readiness or building-code claim is made.

`git diff --check` passed after the corrections. Source changes remain uncommitted
on `main`; review/delivery is still required. Do not archive or remove this worktree.

Captures, native test artifacts and the ignored export backup are local-only;
a clone does not include them. No paid services, asset downloads, commit, push,
publishing or deployment were performed. Preserve all undelivered edits and
unrelated worktree contents.
