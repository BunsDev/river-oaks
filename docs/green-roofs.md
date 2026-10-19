# Authored green roof scenery

This implementation adds authored scenery to four reviewed browser-district roofs. It does not add
roof access, entrances, elevator destinations, permissions or residential siting.

`preview/src/green-roofs.js` builds scenery synchronously with the district, before
the office's first live district frame. Roof planting is authored interpretation;
it does not alter or claim support from the observed GIS/LiDAR vegetation records.
Coordinates follow the existing east/north/up metre frame, rendered as east/up/minus
north. `visibleRoofHeight` and `referencePlan.steps` supply rendered elevations.

## Current coverage

| Building | Surface | Treatment | Pilot beds |
| --- | --- | --- | --- |
| osm-way-625330785 | 10.6 m lower wing, excluding the tower footprint | Focal garden with stone path, two seats and two layered planting pockets | 2 |
| osm-way-625330792 | 9.6 m podium, excluding the Hermès pavilion | Detailed fern/grass islands around the pavilion void | 3 |
| osm-way-625330798 | 18.5 m roof | Mixed fern/succulent islands with selective pink flowers | 4 |
| osm-way-625333009 | 10.6 m roof | Low groundcover | 1 |

These are relative roof heights; each receives its existing building base altitude
and the renderer's 2 cm roof offset. No source footprint or height changes.

Etro and Dior's raised masses need explicit supported surfaces before inclusion.
Hermès and IPIC use a small authored list of island sites; sites that fail
clearance checks retain explicit skip reasons. Low cover connects around raised
islands instead of breaking into isolated panels. The Hermès podium uses the
same pavilion footprint helper as the architecture;
its raised pavilion remains unplanted. Parking and the existing residential
buildings remain excluded pending surface review. Nothing here selects or builds Jev and Jevica's shared residence.

## Fit and budgets

A 1.5 m unplanted edge margin retains drainage and parapet clearance. Complete
bounding discs are checked against every boundary and tower void, including
concave edges. HVAC cabinets and stair bulkheads retain their existing locations
with a 1 m service allowance; the existing dome/antenna has a 4 m exclusion.
Planting stays below the existing authoritative flight exclusion. No collision
rules are relaxed and no new solid objects extend into valid flight space.

Beds use shared opaque bronze, soil and varied green materials, 32 m spatial
instance batches and existing authored procedural plants. Connected low fields
are continuous meshes with inward-rounded corners; equipment/service holes remain
open. Their source cells retain the same conservative containment checks. No new lights,
external assets, dependencies or paid services are used. The focal wing now includes a winding pale stone path and two warm wood seats.
Broad low fields use existing grass PBR maps; seeded short ornamental grass tufts reuse the existing leaf geometry;
fine leaves and grass switch off beyond 55 m
from the viewing camera while low fields remain. The final native-browser captures were inspected; user visual acceptance remains open.

## Live office outlook

On a phone or tablet (a coarse pointer), or at a reduced render scale, the
terrace office keeps the bounded one-time snapshot instead, at the 512-face
size (`officeOutlookFor` in `office-skyline.js`; Val, 2026-10-15). Elsewhere,
the default terrace office now renders the real district using its existing
scene/camera/pipeline. Walking and bounded views have positional parallax; world
time and lighting remain current. No cubemap is allocated and no six-face capture
runs in the product live path. The original snapshot diagnostic utility remains
separately tested. The development off switch and software-only functional
fixtures intentionally omit exterior rendering.

A sixth **Roof gardens** view uses the existing selector or V cycle; the five
original views remain. Its eye stays inside the front terrace corner and looks
over the parapet toward the real Hermès podium. It moves only the camera; Escape
restores walking. The target is based on the actual terrace eye, not the old
snapshot center. Existing placement, movement, membership and source geometry
remain authoritative and unchanged by the live presentation.

Host filtering classifies only fixed building architecture once per visit. It
masks the tower skin around each ordinary pipeline draw and restores matrices
and visibility in `finally`; moving actors never enter that cache. Street lights
stay under current world control and are not reset to entry snapshots. The office
retains its authored local lights, adding five point lights to the eight-light
world pool; this cost is included in actual live scene measurements.

## Evidence and limits

Current integrated product head is `a7b2a996a2e4b77714ca589bcc568bdef75534d7` (signed feature45e064d3 plus current main). Earlier checkpoints in the task ledger refer to older revisions.
The preserved pre-main-update town and static-office runs are historical evidence,
not the current live-office performance baseline.

- Initial live-focused suite: 90 passed, no skips/failures. Independent re-review of skyline/presentation/views: 31 passed; both reported live-light and dynamic-mask defects have regressions and fixes.
- Full verification is running with an owned disposable loopback Redis service. Its completed tooling, preview, Redis-server, desktop, build, Python, dependency and secret checks are recorded in `.runtime/agent/full.json`; browser gates are pending at this checkpoint.
- Frozen-source actual office v7 passed two indoor/terrace/outlook visits, in-visit daylight/dusk changes, live draws with zero cubemap bytes, filtering, view reset and departure cleanup. No page errors or reloads. Artifacts: `output/playwright/green-roofs-office-v7-live/`.
- Frozen-source office v9 passed both actual routes and the fixed outlook in afternoon/daylight and dusk, with current sky/lighting, view reset and departure cleanup. `output/playwright/green-roofs-office-v9-live-cost/result.json` records all ten product source hashes and verifies no source drift.
- Current-main matched town comparisons passed: 12 images and `result.json` in `output/playwright/green-roofs-town-live-delivery/`. The fixed live-outlook results are below.

Local fixture identities do not establish production authentication. Short CPU
submission/frame samples are not GPU timings or stable target-device certification.
Renderer allocation counters are not total memory bytes. Screenshot inspection
is not user visual approval, human accessibility or native Unreal acceptance.

The task ledger records revision-scoped commands, artifacts, failed iterations,
remaining gates and delivery evidence in
`docs/superpowers/plans/2026-10-15-green-roofs.md`.

## Current-main town measurements

Apple M3 Max / ANGLE Metal, 800×600, DPR 1, Smoothest settings, normal scene
lighting/shadows/postprocessing. Each pair holds camera/time/settings fixed and
changes only authored roof visibility. Hours 15 and 18.5; 15 frame intervals and
16 renderer submissions per mode. Median frame intervals were 16.7 ms throughout.
Actors continue simulating and the host is shared; this is a short diagnostic
comparison, not stable GPU certification. Submission counts include render passes.

| View/time | Median CPU ms before → after | Draws before → after | Triangles before → after |
| --- | --- | --- | --- |
| street / daylight | 14.1 → 15.9 | 1291 → 1333 | 4274478 → 4426578 |
| provisional-elevated / daylight | 14.6 → 14.9 | 1199 → 1248 | 3814887 → 3964471 |
| roof-outlook-provisional-eye / daylight | 13.2 → 13.3 | 1011 → 1052 | 3501260 → 3665100 |
| street / dusk | 15.5 → 15.8 | 1332 → 1374 | 4400331 → 4552431 |
| provisional-elevated / dusk | 13.0 → 13.5 | 1214 → 1256 | 3846681 → 3998781 |
| roof-outlook-provisional-eye / dusk | 12.8 → 13.4 | 1017 → 1060 | 3531540 → 3699410 |

The direct roof inventory is 723,916 typed-array bytes: 461,000 geometry and
262,916 instance buffers, 12 unique geometries/materials and 3,479 instances.
`.runtime/roof-resource-inventory-live-delivery.json` includes the current district
hash and five source hashes. This is CPU storage/equivalent upload payload,
excluding texture, shader, driver and process-heap overhead. Renderer memory
counts persist across visibility toggles, so they are not independent clean
memory baselines. Live-office measurements include the retained office lights
and are reported separately from this roof-only town comparison.

## Live office cost and lifecycle

The current Metal run uses the same 800×600/DPR1/Smoothest preset. Each fixed
outlook sample has 15 frame intervals and 16 submissions. The current-main v10 run explicitly sets hour15 for both visits, then changes
to18.5 while inside the office, without leaving or capturing a backdrop. It
includes main’s imported desk footprints/geometry and records15 product source hashes. The screenshot pairs show the real planted podium and
current lighting. All15 recorded product source hashes match the integrated product tree.

| Visit/time | Median whole-frame CPU ms | Median interval ms | Median draws | Median triangles |
| --- | --- | --- | --- | --- |
| First /15 | 13.3 | 16.7 | 1393 | 4366408 |
| First /18.5 | 12.4 | 16.7 | 1420 | 4418205 |
| Repeat /15 | 13.6 | 16.7 | 1384 | 4364894 |
| Repeat /18.5 | 12.8 | 16.7 | 1403 | 4415200 |

The live presentation allocates zero cubemap bytes/peak bytes and masks177 host
instances/3 host meshes per ordinary draw. Renderer allocations observed across
these samples were578 geometries and155–156 textures; they are persistent
allocation counts, not total GPU memory. The five office point lights are included
in this workload. These short samples do not establish sustained or mobile GPU
performance, nor are they a matched speed comparison with the old static backdrop.
Both visits complete through the normal terrace portal, keep authoritative visitor
position unchanged while selecting the view, restore walking on Escape and dispose
on departure. Page errors/reloads: zero. Current-light ownership, moving-actor
exclusion from static filtering and restoration on render errors have focused
regressions and independent review.

### Throttled laptop A/B (2026-10-15)

Two review risks were fixed after this run: the first entry linked every lit program on the frame the
doors opened, and the host mask re-uploaded whole instance buffers every frame. With the CPU throttled
4x, 1440×900, Smoothest and vsync off, the first entry's longest frame went from 658 to 265 ms (quiet
run) and 927 to 398 ms (busy run), no program links when the doors open, and per-frame buffer uploads
fell from 212 KiB in 12 calls to 124 KiB in 2. Draw counts are unchanged. Method, all four runs and the
open Roof gardens finding: `docs/superpowers/plans/2026-10-15-office-outlook-cost.md`.

## Delivery verification

The full local profile passed all 18 components on integration9a4404da with the
final startup harness: dependency audit, tooling112, preview3308 passed with one
skip/one TODO, Redis-server788 (no skips), desktop69, build, Ruff, Python141
(66 warnings), demo/expected verifier, secret/history, security-browser,
reflections, all13 experience journeys, all21 shared scenarios and IPIC screening.
Receipt: `.runtime/green-roofs-full-final-passed.json`; browser reports:
`.runtime/green-roofs-full-final-{experience,shared}.json`. The owned disposable
loopback Redis process terminated after the run.

The first two full runs failed only the second browser's spatial startup; their
receipts/reports/images remain under `.runtime/green-roofs-full-{first,second}-*`.
A diagnostic cold peer completed loading at32.273s, exceeding its implicit30s
Playwright budget. The primary runner already allowed60s. Both pages now receive
that same explicit startup budget, after connection/player/render/assets readiness;
later peer convergence limits and all movement/server assertions remain unchanged.
The final full run passed all14 spatial routes, clearances and reconnect checks.
Original failure causes beyond this reproduced timeout mismatch are not claimed.

After that frozen full run, current main2d7a1ef3 was integrated cleanly, including
Safari avatar decoding and IPIC house-light/exit UX. Those incoming changes retain
the live skyline and world-owned lighting; affected focused tests and build are
verified separately. Final hosted CI on the pushed merge head remains the landing
gate. This is not deployment or human approval.

Actual office evidence is
`output/playwright/green-roofs-office-v10-current-main/`: two real portal routes,
fixed-view day/dusk images and costs, current lighting, walking reset and departure
cleanup. Errors/reloads and cubemap bytes are zero. All15 recorded product source
hashes matched9a4404da; the later main integration changes the IPIC light intensity
line in main.js, so v10 is evidence of its recorded revision. Earlier v7/v9 runs
remain historical evidence with their recorded scope. Native Unreal, live auth,
human accessibility, user visual approval and sustained/mobile GPU certification
remain outside these checks.

Final queue refresh: main ec036956 (Studio acceptance and voice continuity) was
integrated after all16 hosted checks passed on19cf13ee. The combined tree passed
`pnpm run verify` core; receipt `.runtime/green-roofs-final-main-core-passed.json`.
The earlier full/Metal evidence retains its recorded scope. Final merged-head
hosted CI and actual PR merge remain separate delivery evidence in the live task
register.
