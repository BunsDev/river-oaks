# Storefront pillar test — Image #1

## Objective and review status

Verify that this boutique reads as an enterable shop, can be traversed with the
actual player controller, and remains coherent visually and in shared play.
“Pillars” here means acceptance categories; the physical facade posts/mullions
also receive explicit geometry, collision and camera tests.

Status: **review incomplete**. Image review is complete; the location-specific
runtime tests below are a test specification, not executed results. No scene or
gameplay changes are authorized by this review alone or made here.

Reference REF-01: user-supplied Image #1, 1418 × 922, received 2026-10-08.
Original local file: `/var/folders/sz/mtdd9q6j3z5_8jq7xsm876600000gn/T/codex-clipboard-6vMEYW.png`.
This temporary attachment is not a durable repository asset. It may be used for
this requested review; redistribution rights have not been established.
Store identity, capture runtime/revision, lens, player location, quality preset
and lighting settings are unknown. Do not identify it as Cartier or another
store based on prior tests. Dimensions cannot be measured in meters from this image.

Source baseline reviewed: `2020849`, `main`, canonical River Oaks worktree.
Unrelated desktop/Unreal changes and prior walkability evidence are preserved.
Owned file: this review/test ledger. No assets copied or regenerated.

## Image review

| ID | Priority | Observation | Consequence / next check |
| --- | --- | --- | --- |
| F-01 | Major | The visible frontage reads as a continuous glazed display. No unambiguous open door, door handle or entrance sign is apparent in this crop. | A visitor cannot confidently choose an entrance from this view. Confirm whether the actual entrance is elsewhere before changing the facade. P1 and P2. |
| F-02 | Major candidate | A vertical element near the center and the dark framing subdivide the apparent central approach. Its depth and collision role are unknown. | Determine whether it is a door stile, mullion, interior fixture or overlapping geometry. It could obstruct the intended route; the screenshot does not prove that. P2 and P3. |
| F-03 | Major candidate | Two tall display plinths and mannequins occupy the foreground; the frame and displays obscure the route into the room. | Measure the route between and around them with the actual controller and occupied layout. Do not infer clearance from pixel gaps. P3 and P4. |
| F-04 | Minor / visual judgment | The clothing, bags and shelving exhibit conspicuous repetition across the rear wall. | Close inspection may reveal a repeated image or shallow display; test side views and parallax before diagnosing asset construction. P5. |
| F-05 | Minor / visual judgment | The mannequins have much simpler silhouettes and surfaces than the detailed clothing backdrop. | Check style consistency at normal viewing distance. Mannequins need not resemble animated residents, but should look intentional. P5. |
| F-06 | Minor / visual judgment | Bright ceiling strips dominate a relatively dim display, while the dark frame has limited visible surface detail. | Check exposure, roughness, highlights and doorway readability independently; do not globally brighten the scene from one image. P6. |
| F-07 | Not a defect finding | The floor edge and pavement transition are visible, but their height and collision cannot be established. | Measure the threshold and attempt entry/exit in both directions. P2. |

Strengths to retain: restrained neutral palette, recessed facade depth, a clear
display hierarchy, warm interior lighting and a distinct dark framing system.
The required priority is entrance and route clarity; material polish comes later.

## Reproducible setup

Before executing, resolve REF-01 to a store ID, world/map and target runtime.
Record build SHA, dirty diff, server version, test account roles, occupancy,
quality settings, viewport/device, frame-time sample and network conditions.
Use approved fixture identities for local tests; keep hosted acceptance separate.

Capture stations, with actual transforms recorded in the receipt:

- CAM-01: reference-like front view, entire storefront and threshold visible.
- CAM-02/03: left/right oblique approaches at ordinary player eye height.
- CAM-04: doorway center looking inward; CAM-05: same route looking outward.
- CAM-06: third-person player beside each post, display and interior corner.
- CAM-07: diagnostic overhead view, after the on-foot walkthrough.

Record camera projection, FOV axis/angle, aspect, exposure, time/weather and
occupancy. Unknown REF-01 settings allow qualitative comparison only. A matched
before/after comparison requires identical recorded settings except the variable
being tested. Do not claim reference-matched dimensions from an estimated camera.

Browser contract, read from `preview/src/walking.js` at the baseline: east/up/south
meters, 0.35 m horizontal radius, 1.68 m eye offset, upright speed 1.65 m/s or
3.2 m/s fast; axis-separated collision at 120 Hz substeps, frame duration capped
at 0.08 s. Height change must be strictly below 0.4 m per collision query.
This is not a capsule sweep or an Unreal CharacterMovement step/slope contract.
Explicit slope-angle limits are unsupported. `store-rooms.js` defines nominal
door half-width 0.85 m; this is not proof of this image's rendered door width.
Native tests must read and record their own controller settings.

## Acceptance pillars

Every row starts **NOT TESTED for REF-01** unless marked as an image finding.
Proposed usability tolerances below are test targets, not existing engine limits
or building-code/accessibility certification.

| Pillar | Tests and adverse cases | Acceptance / evidence |
| --- | --- | --- |
| P1 — Entrance readability | Approach from front, left and right with HUD both visible and hidden, in day/night conditions. Ask three unfamiliar reviewers to point to the entrance before prompting them. Check the inside-facing exit view too. | Proposed target: each identifies the correct entrance within 5 seconds. Record responses and view. Door treatment, opening and interaction prompt agree. A display bay must not masquerade as the only entrance. Current image finding: F-01. |
| P2 — Threshold and doorway | Walk through the center and near both jambs, forward/backward and diagonally, then reverse each route. Test ordinary and fast walking. Repeat at 30/60/120 Hz and with a bounded slow-frame case. Separately exercise F and the on-screen doorway action, including cooldown feedback. | Continuous walking crosses the intended aperture in both directions without teleport or relocation assistance, penetration, oscillation or a persistent snag. Action-based entry is recorded separately. Glass beside the door remains solid. Record ground heights, collision results and actual progress. |
| P3 — Posts, mullions and glass | Identify every facade vertical by object/component ID. Compare visual mesh and actual collision. Approach each face and corner; slide left/right while holding diagonal input. Probe gap edges around controller-radius clearance; back away and re-approach. Test interiors of adjacent display bays as negative cases. | Route collision matches visible solids and openings. No invisible bar spans the opening; no actual post can be walked through. Tangential sliding counts as progress. If posts are represented by a combined storefront collider, record that fact rather than inventing per-post hits. |
| P4 — Circulation and occupancy | Follow entry → left display → rear activity area → right display → exit. Repeat in reverse. Test each room corner, plinth edge, staff station and narrow passage, empty and with the actual planned staff/visitor positions. Include two players approaching from opposite directions. | All intended activities are reachable without crossing displays or wall geometry. Record minimum usable clearance and turn space in meters; specify occupancy. If players/residents are nonblocking by design, label that behavior rather than claiming physical passing clearance. No emergency relocation needed. |
| P5 — Depth, scale and construction | Inspect front/oblique/side views, then move laterally near clothes, bags, shelves and mannequins. Compare fixture sizes with measured player stature, separate from eye height/collider. Inspect base contacts and repeat patterns. | Surfaces intended as three-dimensional retain appropriate silhouettes, parallax and occlusion. No floating bags, clipping garments or unintended duplicated faces at ordinary player views. If a backdrop is intentionally flat, it remains outside traversable space and credible at accessible angles. Record visual judgment separately from measured scale. |
| P6 — Lighting and materials | Keep camera/quality fixed; inspect day/night and inside/outside views. Compare one exposure, light or material variable at a time. Inspect glazing at oblique angles, floor highlights, black frame detail, shelf contacts and ceiling strips. | Entrance and displays remain legible. No unintended transparency sorting, depth flicker, obvious light leaks or disappearing panes. Emissive strips should not erase neighboring detail at accepted exposure. Record captures/settings; one screenshot cannot establish physically correct material values. |
| P7 — Camera and input | Test first/third-person near every jamb and post, backing into corners, orbiting by displays, opening/closing dialogs, switching camera, keyboard focus restoration and touch press/release/cancel. Check small portrait and landscape layouts. | Camera avoids persistent view obstruction or wall penetration; movement resumes after overlays close; no stuck held input. The route remains operable by supported keyboard and touch controls. Human keyboard/assistive-technology review remains a separate gate. |
| P8 — Authority and recovery | Run two clients through ROUTE-01–05 below. Compare local positions with server snapshots and peer positions. Disconnect during approach and indoors, reconnect, then repeat exit. Check account-specific room state and denial/cooldown responses. | Server accepts legal movement and rejects wall crossing; the peer observes the same room/route within documented transport tolerance. Reconnect restores a legal position and working input without bypassing auth. Record snapshot sequence/time and positions, not screenshots alone. |
| P9 — Rendering stability and cost | Repeat a fixed approach/entry/exit workload after warm-up on a named target device at fixed settings. Capture frame-time p50/p95/p99, long frames, draw calls/triangles and supported memory metrics. Repeat room changes and compare resource counts. | No uncaught runtime errors or reproducible resource growth. Meet the agreed product budget; if none exists, report measurements and leave performance acceptance open. If 60 fps is the target, 16.67 ms is the frame budget, not proof of attainment. |

## Route execution matrix

Use normal controller input along every segment. Initial placement may establish
a documented start, but no teleport, F entry action or navigation shortcut may
replace the physical threshold segment in a walking test.

| Route | Start → destination | Variants | Initial result |
| --- | --- | --- | --- |
| ROUTE-01 | Sidewalk in front → doorway → clear interior floor → sidewalk | Forward/backward; walk/fast; both directions | NOT TESTED |
| ROUTE-02 | Left sidewalk approach → near left jamb → interior | Diagonal approach, slide along jamb, reverse | NOT TESTED |
| ROUTE-03 | Right sidewalk approach → near right jamb → interior | Mirror ROUTE-02 | NOT TESTED |
| ROUTE-04 | Inside → around both plinths → rear reachable activity → exit | Clockwise/counterclockwise, planned occupancy | NOT TESTED |
| ROUTE-05 | Inside facing away from door → turn → exit | First/third-person; keyboard/touch | NOT TESTED |
| ROUTE-06 | Sidewalk → glass beside door / each facade post | Negative test: forward pressure, then tangent slide and retreat | NOT TESTED |
| ROUTE-07 | Approach/inside position → disconnect → reconnect → exit | Two clients; compare authority and peer observations | NOT TESTED |
| ROUTE-08 | At doorway → F/button enter → F/button exit | Separate interaction test; cooldown and focus recovery | NOT TESTED |

For threshold boundary probes, use a synthetic fixture for height deltas
0.39/0.40/0.41 m and record numerical tolerance and coordinate direction.
These probe the implemented strict height predicate, not stair-climbing ability.
Probe doorway/post gaps around the actual 0.70 m controller diameter with a
documented ±0.01 m geometry tolerance; measure effective collision clearance
rather than treating nominal mesh width as a guarantee of passage.

## Failure receipt and release gate

Each failed attempt needs: test/route ID, build/store ID, start/end transforms,
units, mode, camera, input timeline, speed, occupancy, frame conditions, expected
behavior, actual trajectory, ground samples, blocker ID/query result if exposed,
capture/log path, confidence in cause, smallest proposed fix and rerun result.
Instrument the owning movement query if it cannot expose the blocking cause;
an approximate box or debug ray is not sweep/collision proof.

Suggested stuck detector: held directional input with an intended open route,
less than 0.05 m displacement over 1 second, no intentional blocking object and
no active connection/dialog gate. Confirm manually; this heuristic must not call
released input, a legitimate wall stop or tangential sliding a failure.

Required: resolve F-01 and identify F-02's geometry; pass P1–P4, P7 and P8 for
this exact location, including negative wall/post cases. P5/P6 require recorded
visual signoff; P9 requires a named performance budget. Missing evidence leaves
the corresponding pillar open. Do not average critical failures into a score.

Readiness outcomes: **needs blockout changes** if a critical route is blocked or
the actual entrance remains misleading; **review incomplete** while mapping or
runtime evidence is missing; **ready for art** only after critical routes and
activities pass. Visual polish does not waive traversal failures.

## Existing coverage and next execution

The preceding walkability task recorded passing local connection recovery,
desktop/touch first-visit interactions, two-client movement and the core gate at
`2020849`. See `2026-10-08-typesafe-walkability.md` and its report paths.
Those results do not identify REF-01 or prove this storefront's physical entry.
In particular, action-based shop entry is not the same as walking through glass.

Reuse these commands after the location is identified; they cover different
parts of the matrix and do not by themselves complete it:

```sh
node --test preview/tests/walking.test.js preview/tests/store-rooms.test.js preview/tests/auto-navigation.test.js
RIVER_OAKS_E2E_REPORT=storefront-pillar-experience.json npm run test:experience -- connection-required contextual-first-visit
RIVER_OAKS_SHARED_REPORT=storefront-pillar-shared.json RIVER_OAKS_SHARED_JOURNEY=multiplayer npm run test:shared -- required
npm run verify
```

Add a focused route regression only after resolving this store and reproducing
its failure; verify failure before applying a fix. Use normal browser controls
and actual server observations for the integration regression. Do not weaken
collision, shrink the player, relax authentication or enable teleport fallback
to make the route pass. Native/hosted/full Redis acceptance remain separate.

Next step: obtain the store ID or exact scene location for REF-01, reproduce
ROUTE-01 and ROUTE-06, and inspect F-02 with the existing collision diagnostics.
This test specification is delivered; location-specific acceptance remains open.
Keep the uncommitted review and prior evidence; do not archive/remove the worktree.

## Execution continuation

Val authorized proceeding without the exact store identity. The image strongly
matches the fashion atlas and shallow window-display generator. All 30 mapped
doorways were tested instead of guessing the pictured store. This exposed room
bounds clipping the nominal door apertures at Vince and Steak 48. A small
door-containment correction and regression tests are verified in isolated branch
`test/storefront-traversal-20261008`, worktree
`/Users/buns/Documents/GitHub/BunsDev/river-oaks-storefront-test-20261008`.
Its `docs/superpowers/plans/2026-10-08-storefront-traversal-execution.md` records
the red/green tests, passing core gate, and passing two-client physical entry/exit
journey including the affected left-edge routes. This does not close the other
pillars' visual/human/production evidence gaps. No commit or deployment occurred.
