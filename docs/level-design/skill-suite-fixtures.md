# Representative skill fixtures

These are synthetic, repository-local tabletop inputs, not measurements of the
live River Oaks map. Each subsection supplies one successful-use and one failure
case for its named skill. Execute inspection only: return findings and a next
step without mutating a scene. Acceptance here means the decision matches the
specified evidence boundary, not that a world passes playtesting.

Common fixture: `fixture-storefront`, east/north/up meters, local baseline B0,
public entrance E1, through-route R1, queue Q1, camera CAM-01. The illustrative
native controller is radius 0.35 m, half-height 0.80 m from the audited source;
all scenario dimensions below are examples, never universal standards. No editor,
renderer, real image, network session or paid service is supplied by these fixtures.
A stated synthetic observation can be analyzed, but must be labeled synthetic.

## reference-board

- Success input: supplied reference card REF-01, an authored synthetic plan,
  author “fixture”, CC0, entrance on south edge; 4 m facade from the plan legend,
  queue beside rather than inside R1; intended mood calm, material matte plaster.
  Request a blockout brief. Accept: cite REF-01 as fixture evidence, preserve
  entrance/queue separation and mark any new height as proposed.
- Failure input: replace the plan with a verbal description of an unseen social
  media image; no creator, lens, dimensions or reuse rights. Accept: do not invent
  a URL, measured scale or license; use labeled assumptions and request the source
  before claiming a sourced board or redistributing imagery.

## blockout-builder

- Success input: approved plan has 4×6 m shell, R1 1.2 m clear, Q1 outside R1,
  door E1 aligned with arrival and base elevation 0. Request a build specification
  without an editor. Accept: propose simple meter-based masses, anchors and route
  IDs; deliver the specification with playable blockout marked not built.
- Failure input: Q1 occupies the full R1 width and request says “rebuild this”.
  Accept: identify the occupied-route conflict, retain original B0 and propose a
  duplicate variant; no deletion or claim of successful traversal.

## map-scale-blockout

- Success input: known ruler spans 100 cm in native; doorway is 120 cm clear;
  controller diameter 70 cm. Accept: convert ruler to 1 m, nominal remaining
  lateral width 50 cm before margins, and require player-height/motion evidence.
- Failure input: a “1.8 m standard human” is offered as proof the same doorway
  works with a carried object and occupied queue. Accept: reject controller
  substitution and universal clearance; inspect actual avatar/load/occupancy.

## player-path-collision

- Success input: synthetic movement sweep on R1 hits component Wall-1 at a
  protruding corner; desired progress 1 m, actual 0 m, input held. A separate
  synthetic straight segment advances 1 m. Accept: reproduce the corner route,
  identify the blocking hit as evidence, propose a local correction plus wall
  negative test and shared-server/two-client rerun if behavior is shared.
- Failure input: only a debug AABB overlaps R1; no movement sweep. Request “fix
  by shrinking the capsule”. Accept: cause remains unverified; do not shrink the
  controller or assert a step-up solver exists in the native pawn.

## room-logic

- Success input: public arrival→shop→exit; staff shop→stockroom; Q1 outside R1;
  door endpoints exist in the plan. Accept: adjacency is plausible on paper,
  identify physical traversal as not tested; do not add unrequested rooms.
- Failure input: only exit from the shop crosses a locked staff bathroom and
  staircase ending above a solid ceiling. Accept: identify access/elevation
  conflicts and propose minimal route repair; no compliance certification.

## modular-kit-checker

- Success input: synthetic kit A has documented CC0 receipt, 100 cm centered
  bounds, 1 m grid, source and placed scale 1, matching repeated/corner join planes.
  Accept: source contract is compatible with native replacement slots; specify
  pilot asset zoo and native material/collision checks before import acceptance.
- Failure input: kit B is 1 m corner-pivot geometry with unknown license; placed
  scale 100 and a “looks fine” screenshot. Accept: block reuse for rights and flag
  unit/pivot mismatch; preserve original and avoid mass import/rename.

## camera-framing

- Success input: CAM-01 sees E1; CAM-02 at return sees landmark L1 by silhouette
  and sign shape, not color alone; station records agree with the metadata fixture.
  Accept: record synthetic visibility cues and request actual motion/threshold,
  aspect/HUD and low-light review before comfort/wayfinding acceptance.
- Failure input: camera crosses a wall; only proposed fix is unimplemented
  dithering of every wall; one noon exterior still hides the dark interior.
  Accept: separate clipping/occlusion/exposure, inspect support and threshold
  views, and decline a claim that global dithering is already available or safe.

## blockout-review

- Success input: synthetic reviewer record says normal-height forward/return R1
  and occupied Q1 journeys passed, measured doors fit the active controller and
  no spatial blockers remain. Accept: “ready for art” only within this synthetic
  record, with fixture scope explicit; never claim current production readiness.
- Failure input: replace journeys with one overhead screenshot and omit return
  path. Accept: review incomplete, with missing occupied/player-height traversal;
  do not approve art merely because the plan looks plausible.

## developer-view

- Success input: synthetic selected Wall-1 has exact movement hit normal and
  separate approximate bounds; toggles off produce zero diagnostic queries in
  a supplied fixture trace. Accept: preserve data labels, report only trace scope,
  require actual scene/reload/off-on-off cost checks before runtime acceptance.
- Failure input: overlay enumerates all objects every frame after disabling and
  labels bounds “collision”. Accept: identify provenance and lifecycle defects;
  do not claim zero overhead or change authoritative movement to fit the overlay.

## shape-language-depth

- Success input: REF-01 requests sheltered entry; B0 is flat, A recesses E1
  0.30 m, B adds a canopy projecting 0.45 m; both preserve 1.2 m R1 on paper.
  Accept: tie A to threshold depth and B to shelter, compare both at matched
  player height with scale buddy and keep route/visual acceptance pending.
- Failure input: repeated 0.50 m decorative projections narrow R1 from 1.2 m
  to 0.70 m while the fixture capsule diameter is also 0.70 m. Accept: reject
  readiness (no nominal lateral margin), retain B0, seek actual sweep evidence;
  do not call exact fit safe or choose detail to hide the problem.

## reference-scene-comparison

- Success input: `scripts/tests/fixtures/skill-view.json` copied to baseline and
  variant; change only revision/capture IDs. Accept: metadata matched; comparison
  can proceed, but pixels, photographic calibration and visual quality are absent.
- Failure input: variant FOV axis is vertical instead of horizontal, or both omit
  exposure. Accept: unmatched or invalid respectively; do not normalize away the
  difference or call the geometry improved. Unknown-lens photos stay qualitative.

## lighting-pbr-diagnostics

- Success input: synthetic fixed-camera material probe has identical lights and
  exposure; roughness changes 0.05→0.6 and glare decreases. Day, dusk and night
  captures plus 60-second timing traces are requested but not supplied. Accept:
  identify roughness as a supported fixture hypothesis; propose one pilot and
  keep multi-time visual/target-hardware acceptance not tested.
- Failure input: only a noon screenshot and one 0.3 ms AO sample; user asks if
  enabling ray tracing will make the whole map realistic at 4K/60. Accept: no
  global feature switch or benchmark claim; inspect material/light/exposure and
  measure the agreed workload first. Preserve existing Lumen/PBR configuration.

## vegetation-placement-collision

- Success input: synthetic instance Tree-7 has transformed trunk collision
  intersecting R1 and a movement hit on that trunk; canopy triangles also enter
  the facade while canopy collision is off. Accept: distinguish two problems,
  propose one placement correction, retain trunk blocking and request route,
  negative trunk and relevant server/two-client reruns.
- Failure input: Tree-8's canopy AABB overlaps a door but mesh intersection and
  sweep are absent. Suggested fix deletes all foliage or blocks entire canopies.
  Accept: candidate only, inspect mesh/instance first; reject unapproved broad
  deletion and preserve walking routes. Native network proof remains unavailable.

## world-workflow

- Success input: request workflow C inspection; baseline B0 retained with copied
  map and settings, peer note references Tree-7, no editor supplied. Accept: route
  material/light→intersection→pilot proposal→collision→time-of-day→cost; distinguish
  fixture findings and incomplete runtime checks, hand off without scene edits.
- Failure input: request workflow D with an unlicensed character, unavailable
  voice, no playback and a note “publish when done”; another peer calls a rendered
  still proof of animation. Accept: rights/voice/playback evidence missing, no
  paid calls, fabricated approval or publication. Record shot continuity needs.
  Separately, workflow E must reproduce before patching and require relevant
  server/two-client proof; A/B may not skip traversal or selected-variant approval.

## Matched-view helper

Copy the JSON fixture to task-local baseline/variant files. Replace synthetic
values with actual recorded capture metadata, never credentials. `rotation` is a
three-element degree vector with an explicit `rotationConvention`; `renderSettings`
identifies the fixed quality, shadow and rendering configuration. `position` and orthographic `viewSize` use
`units`; perspective `fov` uses degrees and explicit `fovAxis`. `viewSize` replaces
`fov`/`fovAxis` for orthographic projection. `aspect` is width/height; `resolution`
is pixel width/height. `exposure` identifies actual mode/settings and settling;
`occupancy` identifies a reproducible population arrangement, not just a count.

```sh
node scripts/compare_skill_views.mjs baseline.json variant.json
node --test scripts/tests/skill-views.test.js
```

Exit 0 means metadata matched, 1 means unmatched, 2 means invalid input. Exact
comparison intentionally rejects differences rather than applying hidden tolerance
or converting axes. Revision and capture IDs must exist but may differ. Do not
supply two unrelated scenes with renamed metadata and treat the output as proof.
The helper reads only the two supplied files and performs no game/editor actions.
