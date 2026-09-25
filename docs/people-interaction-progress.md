# People interaction and movement goal

Goal: people remain interactive wherever they are, occupations fit workers and
other visitors, and character movement becomes hyper realistic end to end.

## Current implementation

- Pedestrians, shoppers and workers are human again. Original rig skin, hair, eyes
<<<<<<< Updated upstream
  and head geometry are preserved; alien anatomy is limited to the player form and invading crew.
  Jevica remains the default, with Alien and Witch as the other player forms.
  Browser inspection verified all 24 outdoor and 169 indoor people retain human
  skin materials and visible faces, all 25 mannequins have no alien anatomy, and
  the player still receives Grey anatomy. Outdoor/indoor pointer conversations,
=======
  and head geometry are preserved; alien anatomy is limited to invasion enemies.
  Jevica is the sole playable character. The Witch and Alien player costumes,
  portraits, flying broom and personal UFO have been removed.
  Browser inspection verified all 24 outdoor and 169 indoor people retain human
  skin materials and visible faces, all 25 mannequins have no alien anatomy, and
  the player uses Jevica's dedicated rig. Outdoor/indoor pointer conversations,
>>>>>>> Stashed changes
  hidden-layer rejection, reset and reload pass without uncaught browser errors.

- Outdoor residents and every non-mannequin boutique staff/guest figure share
  encounter identities, dialogue, memory, role context and directory access.
- Indoor identities use the same IDs as their skinned meshes. Keyboard encounters
  stay in the visitor's room; directory selection can enter the person's store.
- Theme-specific occupations cover retail, dining, gallery, cinema, salon,
  eyewear and wellness workers. These are fictional staff, not actual employees.
- Staff roles follow staff order rather than intervening guest/mannequin indices;
  three-person teams can include bartenders, concession attendants or salon hosts.
  Guest labels retain the venue context, including seated salon clients.
- Indoor stations are excluded from outdoor routes and volunteer recruitment;
  adding people preserves the eight original support recipients and the bounded
  24-agent background packet.
- Outdoor body turns use elapsed time and the shortest angular arc, including
  turns toward conversation partners.
- Pointer reach now uses the visitor's collision body, room and flight altitude,
  independently of the third-person camera. Visible mesh picking rejects opaque
  architecture/fixtures and hidden parents, and refreshes skinned bounds.
<<<<<<< Updated upstream
=======
  Thin storefront glass uses the same angle-dependent opacity as its shader for
  picking; clear panes no longer behave like opaque walls in front of the camera.
  Reflective grazing-angle glass, opaque fixtures and talking-reach rules still
  block selection. Instance transforms are included in the glass-angle check.
>>>>>>> Stashed changes
- Pointer selection requires a primary click. Camera drags remain drags even
  when they return to their starting point; cancellation and lost capture clear
  the pending click.
- Indoor staff have eased inspection, preparation, serving and presentation
  cycles. Conversation holds the task, blends head/torso/arm attention and resumes
  work afterward. Bodies stay at their stations instead of rotating planted feet.
<<<<<<< Updated upstream
- The 62 workers retain PR #14's rig-fitted palm support for trays, fabric,
  jewelry, eyewear, samples and tablets. The conservative reach check permits one
  docked counter station; other workers hold their load at a rig-fitted height.
  Conversation pauses work, and reduced motion now freezes the work cycle.
  Shared prop resources and the six human fashion palettes remain intact.
  The separate hand-fitting work remains in the active original checkout.
=======
- All 62 workers use supported task props: serving trays, fabric,
  jewelry, eyewear, samples or a working tablet. Arm lengths and palm orientation
  come from each actual rig. Seventeen reachable counter stations lift and return
  the prop at the existing worktop edge; other workers hold it at a safe height.
  Conversation preserves the load and pauses work. Reduced motion freezes the
  work cycle. Prop geometry/materials are shared across workers.
- Tablet users support the device with their left hand and tap two screen positions
  with their right index finger. The other fingers curl toward the palm. The
  fingertip pad is measured from the actual skinned mesh; taps include contact,
  lift and travel phases. The device sits forward of the torso, keeping the
  tapping elbow below the shoulder and hands clear of counters. Conversation
  and reduced-motion behavior use the existing task clock.
- Supporting hands face palm-up, with extended fingers fitted to the actual skin
  pads rather than the bone centres. Forearm rotation carries supination instead
  of twisting the wrist; elbow targets rise with the load and stay closer to the
  torso. Hands angle inward with the forearms to avoid an abrupt sideways wrist
  bend, and pad fitting accounts for that grip angle. Fingers support the rear
  overhang at docked counters;
  raised loads clear reception and host counters at chest height. Fitting runs
  once per worker, while the existing arm solver maintains contact each frame.
>>>>>>> Stashed changes
- Conversations use eye-level visibility independently of walking collision:
  counters allow talking, shelving and room boundaries still block it. Choosing
  an indoor person finds an unoccupied approach within their room and talking
  range, including workers at the back of a shop.
<<<<<<< Updated upstream
=======
- Standing stations reserve body clearance from walls, furniture overhangs, low
  display ledges and other people. Bartenders work at the open ends of bars that
  have no rear service aisle. Repositioned counter staff face their work surface;
  encounter identities and rendered positions share the corrected room plan.
  Furniture and building footprints retain their original coordinates. The bar
  counter's collision footprint now covers the actual rendered front edge.
>>>>>>> Stashed changes
- Seated guests retain chair-facing hips and use two-bone IK to plant both feet.
  Indoor third-person camera clearance now uses the room instead of outdoor roof
  clearance, preserving the visible player body where the camera has room.

- Outdoor starts and arrivals now accelerate/brake; conversation and safety holds
  remain immediate. Feet use world-space targets, terrain-aligned orientation,
  alternating support/swing phases, hip-width stance and two-bone leg IK. Pelvis
  adjustment maintains reach through turns and slopes; stopped feet settle.
- Crowd passing starts ahead of contact, keeps personal space and moves in the
  body's facing direction. Close encounters can turn aside or back away to clear
  a path. Sharp corners brake before turning; pivots are limited to 3.2 rad/s.
  Shared stops allow nearby spaced arrivals instead of competing for one point.
- Route costing checks road and crossing boundaries so narrow road-edge gaps
  cannot disappear between samples. Movement and redirects use pedestrian
  clearance. A person displaced toward a tree can replan to the same destination
  from their actual position; recovery shares the bounded route worker and
<<<<<<< Updated upstream
  rejects obsolete results. Pausing during recovery retains the current visit
  route for retry, while weather, reset and redirect changes still fence stale work.
=======
  rejects obsolete results. Environment and fixture placement remain unchanged.
>>>>>>> Stashed changes
- The ambient-occlusion geometry pass reuses the main pass's transforms and
  shadow maps. Scene antialiasing remains in the multisampled compositor; the
  fullscreen canvas does not repeat it. At UHD, offscreen refraction uses half
  resolution while the main image remains native resolution. Smaller foliage
  batches reduce offscreen instance submissions without changing source models,
  canopy layers, stem positions or planting density.
<<<<<<< Updated upstream

- Abducted residents cannot accept conversations or support, join volunteer visits,
  or appear as available inference neighbors. Existing visits pause if either
  participant is abducted, retaining their capacity reservation until release.
  World reload releases residents and disposes the old invasion before replacing
  the population, including when a crew model is still loading.

## Worker contact integration (September 22)

The current delivery also includes the hand-fitting and station-clearance work
previously held in the original checkout. Standing staff now clear counter
fronts and low display ledges; bartenders occupy the open service end. Fixtures
and building footprints retain their existing coordinates.

Supporting palms fit the actual skinned pads and angle inward with the forearms.
Forearm rotation distributes the twist instead of sharply bending the wrist.
Fifteen tablet users support the device in one hand and tap with the other index
finger, with curled remaining fingers, deliberate contact/lift phases and
conversation pauses. Hold distance and height adapt to shorter rigs; counter
reach checks include the full tablet touch range.

Clear storefront glass no longer blocks clicks merely because its material's
stored opacity is 1. Picking evaluates the shader's angle-dependent opacity,
including instance transforms; opaque fixtures and reflective grazing angles
still occlude people. Talking distance, room and abduction gates remain enforced.

The worker browser fixture includes furnished rooms and samples actual hand,
body and clothing vertices against nearby box furniture. These checks broaden
contact evidence; they do not establish continuous collision, rounded/sloped
fixture clearance, handovers, tool manipulation or complete hyper-realism.

Review integration also excludes abducted residents from passing, occupancy and
arrival spacing. The nearest visible people-layer mesh now owns picking, so a
mannequin cannot be clicked through; attached props inherit the resident's ID.
Indoor HUD eligibility uses the same room and unoccupied-approach validation
as opening the conversation.

The renderer review concern did not reproduce: in Three.js 0.186, GTAO restores
and clears its visibility cache, making the second restore idempotent. Existing
normal-pass and thrown-render regressions verify foliage restoration. Outdoor
sight-line precision remains at 0.15 m; HUD neighbor searches are throttled to
150 ms, rather than run every frame. Broader frame-time work remains open.

## Verification

The September 22, 2026 isolated-branch run is recorded in
[`interaction-e2e.json`](../data/reports/interaction-e2e.json), including source
SHA-256 hashes and browser results. Application source stayed unchanged throughout
the run. Two browser readiness checks were hardened after transient missing-DOM
errors; both affected scripts were rerun. The invasion check uses directory
controls for its initial approach, then real movement and Q casting, so a
straight-line pilot getting stuck on scenery does not decide the result.
Browser checks used local Chrome and the Vite development server; the production
build was checked separately. Optional inference was offline or mocked.

- `npm test`: 197 tests passed on Node 24. Tests cover crowd passing, pause during
  route recovery, stale responses, picking, rendering and invasion availability.
  Seven new invasion regressions failed before the integration fixes and passed
  afterward, including queued, traveling and assisting visits across abduction.
- `npm run build`: passed; the existing large Three.js chunk warning remains.
- Python: 87 tests passed on both CI versions, 3.11 and 3.13, and locally on 3.12.
  Ruff lint and format checks passed. The offline demo passed; verification
  returned the expected blocked exit 2 for synthetic data. Worktree, staged-content
  and full-history secret scans passed.
- `store-encounters.js`: all 30 stores responded to E with a same-room person.
  `all-people.js`: all 193 directory entries opened their own dialogue and
  produced a visible person within talking reach, including 169 indoor people.
- `moving-people.js`: actual clicks selected six walking residents across all six
  rigs. Each held position during conversation and resumed after close, without
  relocating the visitor. Directory and keyboard controls set up the approach;
  routes and clocks remained active. Read-only diagnostics projected a chest bone.
- `pointer-gestures.js`: right/middle clicks and camera drags returning to their
  origin did not open dialogue; primary clicks still worked. Both the right-click
  and returning-drag bugs were reproduced before the fix.
- `people-picking.js`: seated and standing indoor clicks, visitor position,
  worker pause/resume, 94 planted foot targets and 124 palm contacts passed.
  `interaction-lifecycle.js`: outdoor/counter clicks, hidden-layer rejection,
  restored-layer selection, scenario reset and world reload passed.
- `worker-contact.js`: 62 workers, six prop types, 52,204 contact samples and the
  single reachable docking station passed, including level trays and work holds
  during conversation. Its furnished fixture does not assert finger grip, skin
  clearance, wrist deformation or full-body collision.
- `player-forms.js`: 42 checks cover Jevica defaults, the three forms, portraits,
  vehicles, ascent/landing, camera switching and mobile keyboard controls.
- `invasion.js`: 14 checks cover the Alien form's magic restriction, Jevica and
  Witch activation, five loaded crew, casting, resident release and reload during
  an active invasion. Reload clears crew, abductions and the old scenario.
- `grounded-motion.js`: six shipped rigs over 301 frames and 2,052 planted samples
  on an inclined fixture; maximum foot-target error below 0.001 mm.
  `crowd-motion.js`: passing and turning scenarios of 1,441 frames each, all six
  rigs arriving, 25,679 planted samples, four walking-mesh clicks and four opaque
  foreground rejections. These use deterministic frames on rendered fixtures.
- `resident-life.js`: live routes, bounded reaction batches, conversation holds,
  pause/resume, sheltering, reduced motion and the native UHD buffer passed.
  `volunteer-visits.js`: physical arrival, pause, storm hold, visible supplies,
  conversation holds, resolved needs and helper release on reset passed.
- `render-budget.js`: native UHD output, AO, half-resolution refraction at UHD
  and full-resolution refraction at 1080p passed. Per-form frame timings and draw
  counts are recorded in the report. These local samples do not establish
  target-GPU performance or 60 fps.

All 14 browser scripts completed without uncaught page errors. Their screenshots
and raw receipts are in local `output/playwright/`. Representative conversation,
worker and reload screenshots were inspected; this is not a human acceptance
review of every animation or occupation. No deployment was performed.

## Latest integration verification (September 22)

[`people-motion-delivery.json`](../data/reports/people-motion-delivery.json)
records the integrated runtime hashes and seven browser receipts. The final
JavaScript suite passed all 220 tests, and the production build passed. Local
Python 3.12 passed 87 tests; Ruff lint and format, the offline demo, the expected
synthetic-data verification exit 2, and secret scans passed.

The worker fixture covered all 62 workers and six prop types, including 17
reachable counter docks, 52,204 contact samples, 1,364 skin-contact samples and
372 sampled body poses. Tablet fingertip error stayed below 0.001 mm in 165
samples. These are sampled geometric checks, not continuous collision proof.

Browser acceptance passed for worker contacts, all 193 people, player forms,
interaction lifecycle, all 30 store encounters, six moving rigs and invasion.
The last four checks were rerun after the occupancy, mannequin-picking and HUD
review corrections. The report distinguishes that sequence from the earlier
14-script acceptance above. Dev is served from the isolated integration worktree;
the original checkout's concurrent changes remain preserved.

## Resident gesture continuity (September 22)

Outdoor amazed, startled, enchanted and greeting actions previously replaced joint
angles in one frame. A rendered six-rig reproduction measured a maximum 1.695-radian
joint jump and 0.463 m wrist jump at action boundaries. Per-resident damped gesture
state now preserves angular velocity on interruption and eases back to rest.
Reduced motion suppresses these gestures; grounded locomotion keeps its existing
solver.

The expanded 903-frame browser sequence, including rapid reaction changes, now has a
maximum 0.104-radian joint step and 0.034 m wrist step at 60 Hz. Rest, transition and
settled screenshots were inspected. A two-second suspended-update test reproduced a further 9 cm wrist jump.
Resuming now preserves the last displayed gesture state before normal frame
updates continue; that regression also passes. A separate 100 ms cull reproduced
a 10 cm wrist jump. The visibility owner now explicitly suspends the avatar clock
for every hidden frame, covering short culls as well as long gaps. All 54 settled
pose checks and the live walking-person regression pass after this correction. The poses remain stylized; this fixes temporal
continuity without claiming complete expressive or biomechanical realism.
Unit checks cover consistent settling at 30, 60 and 144 Hz, interruption velocity,
independent residents and reduced motion. All 224 JavaScript tests and the
production build pass. Crowd passing and turns still complete on all six rigs,
with 25,679 planted-foot samples and four actual walking-mesh clicks passing.
The live district check also selected six walking rigs, held each conversation,
and resumed movement without relocating the visitor. Results are recorded in
[`resident-gesture-transitions.json`](../data/reports/resident-gesture-transitions.json).

## Native encounter holds (September 22)

The native world previously selected residents using horizontal distance alone
and let them keep walking during greetings. Selection now requires talking range,
compatible height and an unobstructed eye-level trace against static geometry. A
blocked nearest resident does not hide a farther visible candidate.

A greeting holds the selected resident in place for up to ten seconds, turns them
toward the visitor at a bounded rate, and preserves their route target/direction.
E closes the encounter; leaving talking reach, new occlusion, expiry and pawn
shutdown release it. Inference callbacks skip action and route writes for the
held resident. The existing route resumes after release.

The engine regression failed four behavioral assertions before the implementation:
position hold, floor separation, wall rejection and visible-neighbor selection.
The initial contract suite passed 13 tests, including those cases plus release,
route-endpoint preservation and bounded turn checks. Editor and Game Development
builds pass. Results and hashes are in
[`native-encounter-holds.json`](../data/reports/native-encounter-holds.json).
Those results cover native world/collision behavior under NullRHI. The follow-up
below adds input, pawn-destruction and sampled rendered conversation evidence.
In-flight HTTP timing remains unverified. Native dialogue is still the basic
authored greeting, and native worker-role and motion parity remain open.

### Native input and facing follow-up (September 22)

The real controller input fixture now covers E open/close, held-key behavior,
walking away, reopening, and initialized-pawn destruction. The engine suite
passed 15 tests before the stronger geometry check was added. A rendered E
open/close check also passed.

Rendered acceptance exposed a separate import defect: the resident's numeric
heading reaches the visitor, but the mesh faces sideways. The previous asset
check only measured toe bones. The new eye-geometry check fails on the current
imports: bones face +X while eye geometry faces -Y. A separate identity-yaw
import of `woman-casual` aligns both bones and eye geometry with +Y. This isolates
the mismatch to the import rotation path. Diagnostic receipts are
`/tmp/river-native-mesh-facing-tests/index.json` and
`/tmp/river-native-neutral-probe-tests/index.json`; runtime position/heading
samples are in `/tmp/river-native-facing-runtime.log`.

The correction imports with identity rotation, applies yaw -90 to the mesh
component, and uses mesh-space -X as the gait axis. Importer version 3 assets
were regenerated for all six profiles after preserving the old assets outside
the project. The stronger suite checks toe bones and eye bind geometry at three
world headings, plus forward rather than sideways foot swing. All 15 native tests
pass with regenerated assets, as do Editor and Game Development builds. The
rendered `woman-casual` encounter now visibly turns toward the visitor; E closes
it, and reopening faces the visitor again. This is a one-profile visual sample,
not a complete review of native animation. Results and source hashes are in
[`native-resident-facing.json`](../data/reports/native-resident-facing.json).

### Native resting poses and gait transitions (September 22)

Native residents now stand with their arms at their sides and a slight elbow
bend. Component-space rotations account for already adjusted parents, so
lowering a shoulder preserves the intended elbow and gait axes. Limb lengths
and the authoritative component transform stay unchanged.

Each animation proxy blends gait strength with a critically damped spring.
Starting, stopping, and interrupted transitions preserve blend velocity; stopping
retains the accepted-distance stride phase while the pose settles. Idle and
shelter no longer snap directly from a moving pose to the reference A-pose.

The regression first failed the blend contracts and six-profile asset test.
Joint probes then corrected an unrealistic fixed wrist-height target for shorter
arms: wrists must reach pelvis height within 1 cm without stretching the rig.
All 21 native tests now pass, including six blend contracts and per-profile
resting posture, forward stride, stop continuity, facing, and root authority.
The review follow-up also compares evaluated slow-walk, walk, and jog amplitudes
at equal phase and checks idle suppression despite accepted displacement.
Editor and Game Development builds pass. Rendered acceptance sampled
`woman-casual` at rest, mid-stride, and after settling; the other five profiles
have automated pose coverage. Evidence and source hashes are in
[`native-resting-poses.json`](../data/reports/native-resting-poses.json).

This improves a procedural prototype. Foot contact, weight transfer, authored
movement, native worker routines, full native dialogue, and broader rendered
motion acceptance still need work. The rendered sample suggests a possible
ground-contact gap that must be measured before claiming planted feet.

### Native support height (September 22)

An engine probe confirmed that all 24 resident roots placed their soles 5 cm
above the old collision ground. Roads had no query collision; their visible top
was 4 cm above the nominal sole height. The simulation now samples static support
before spawning residents and accepting movement. It adjusts only root Z, accepts
steps within 30 cm and surfaces up to 45 degrees, and rejects unsupported movement.
Road query collision uses the existing rendered geometry. Conversation holds keep
the accepted root even if the supporting surface changes during the greeting.

The real-district check is opt-in under `RiverOaks.NativeAssets`, because its
manifest is generated locally. Synthetic floor, curb, upper-floor, unsupported
edge, excessive-step, steep-surface, and held-root cases remain in the source-only
contract suite. Six-profile shoe checks measure standing bind geometry, with leg
bones in their reference pose. This does not establish moving-foot contact or
planted feet on slopes. Foot IK, weight transfer, and curb step animation remain
required for the full motion goal.

Verification passed 23 native tests and both Development builds. The 21 source-only
contracts also passed with the generated manifest temporarily absent. The district
probe now measures zero gap at all 24 spawn roots; all six resting shoe meshes
meet their expected ground height. A rendered `woman-casual` sample confirms road
contact and E open/close. Python passed 98 tests, and Ruff check/format passed.
See [`native-ground-contact.json`](../data/reports/native-ground-contact.json)
for measurements, source hashes, local receipts, and the one-profile visual limit.

## Still required for the full goal

- Broaden sampled hand/body clearance to continuous motion, seated contacts and
  rounded or sloped furniture. Add wrapping and pinch grips beyond flat support
  and the fitted tablet-tapping pose.
=======

## Verification

- `npm test`: 194 passing tests, including actual skinned-rig hand and wrist regressions,
  crowd passing, route recovery, rendering and interaction checks. Renderer tests cover shadow and
  transform reuse, restoration after an AO failure, and the UHD refraction budget.
- `npm run build`: passes; existing large Three.js chunk warning remains.
- `preview/e2e/store-encounters.js`: browser sweep of all 30 stores, checking
  same-room E conversations, role/location labels and encounter population.
  Passed on 2026-09-21: all 30 stores responded to E with a same-room person;
  directory contains 193 people (169 indoor plus 24 outdoor); no page errors.
  Screenshot: `output/playwright/store-encounters.png`.
- The 30-store keyboard sweep passed again after the alien and indoor movement
  changes on September 21: 193 encounters, 169 indoor, no uncaught page errors.
- `preview/e2e/all-people.js`: all 193 directory entries opened their own dialogue
  and produced a visible person within talking reach, including all 169 indoor
  encounters. Resident walks remained enabled. No uncaught browser errors.
  Repeated successfully after station relocation: all 193 encounters remained
  visible and reachable, with their original identities and roles.
- Before the tablet task, `preview/e2e/worker-contact.js` verified all 62 actual
  staff rigs, six prop types and 18 counter contacts across 421-frame
  work/conversation/resumption sequences.
  Across 52,204 palm samples, maximum contact error was 0.000000159 m; loaded
  serving trays remained level. The fixture now includes the actual furnished
  interiors. In 1,364 sampled hand meshes, the supporting skin stayed 0.43–0.58 mm
  below the load and had no sampled vertex intersections with nearby solid box
  furniture. A further 372 full-body pose samples checked 6,502,698 skinned skin
  and clothing vertices against the rendered solid box furniture without any
  intersections. Broad-phase checks use each fixture's bounds rather than its
  centre, so long counters remain covered at their ends. Maximum wrist rotation
  from rest was 0.983 radians; maximum sideways bend was 17.6 degrees.
  The wrist regressions cover the shortest and tallest instances of all six rigs,
  including torso turns. They reproduced the excessive bend before correction.
  Skin, clay and wireframe close-ups showed connected geometry; the apparent
  seam came from forced parallel hands. Inward grip angles removed the visible
  kink without changing meshes, textures or source receipts. Before/after images:
  `output/playwright/worker-wrist-closeup{,-after}.png` and
  `output/playwright/wrist-diagnostic-clay{,-after}.png`. Close-ups cover
  all six prop types in `output/playwright/worker-hand-{kind}.png`.
  The regressions first reproduced roughly 44 mm of skin penetration, inverted
  palms, excessive wrist rotation and counter intersections. These checks cover
  flat-load support; they do not establish tool use, handovers, continuous surface
  collision, seated clearance or full-body realism.
- The September 22 tablet-task pass repeated `preview/e2e/worker-contact.js` for
  all 62 workers, including 15 tablet users and 17 reachable counter contacts.
  All 421-frame work/conversation/resumption sequences passed: 52,204 contact
  samples, maximum error 0.000000164 m, 1,364 hand-mesh samples and 372 body
  samples covering 6,502,698 vertices. No sampled intersections with the tested
  box furniture. All 165 tapping-hand samples kept the fingertip pad at the
  commanded height (maximum difference 0.000000073 m), with no screen penetration
  and elbows below shoulders. Maximum wrist rotation from rest was 1.202 radians;
  maximum sideways bend, measured in each palm plane, was 17.6 degrees.
  Six actual-rig regressions cover two complete tap cycles, smooth fingertip
  travel, separate contact/lift phases, skin clearance and elbow/wrist limits.
  Close-ups: `output/playwright/tablet-touch-{contact,hover}.png`.
  This adds a specific touchscreen task; it does not prove tool manipulation,
  handovers or continuous collision coverage.
- The September 22 interaction lifecycle recheck exposed clear storefront glass
  blocking clicks after reset: its shader changed alpha, but the picker read the
  material's unchanged opacity of 1. A regression using the actual thin-glass
  material and rotated instances failed before the correction and now passes.
  The final live run passed outdoor and indoor pointer conversations, hidden-layer
  rejection, restoration, community reset and world reload, with no uncaught
  browser errors. It aims at a stable chest landmark while animation stays on.
  Scene readiness allows 60 seconds for the full asset load; conversation waits
  remain five seconds. The optional decision service returned HTTP 502 during
  this local run; the authored local fallback handled conversations.
- `preview/e2e/people-picking.js` passed actual clicks on a seated restaurant guest
  and a standing worker without relocating the visitor. The worker resumed work
  after recognition/conversation and held the task while attending. All 94 seated
  foot targets across the loaded district had maximum actual error 0.000001291 m.
  Screenshot: `output/playwright/people-picking.png`. Initial automation needed to
  wait for the rail's viewport transition before projecting click coordinates.
- `preview/e2e/interaction-lifecycle.js` passed direct outdoor and counter-staff
  clicks, hidden-interior rejection, restored-interior clicks, scenario reset and
  world reload. No uncaught errors. The moving-limb regression first reproduced a
  stale skinned bounding box; picking now refreshes both the box and sphere.
- `preview/e2e/moving-people.js` clicked six walking residents, covering all six
  shipped rigs in the live district. Each opened the correct dialogue, held
  position during conversation, resumed walking after close, and kept the
  visitor in place. Directory controls establish the initial approach, then
  actual keyboard input steps back beyond the courtesy stop radius. Routes and
  animation clocks keep running. The read-only diagnostic projects a chest bone
  because an estimated head point from animated bounds intermittently missed.
  Screenshots: `output/playwright/moving-people-local-{00..05}.png`.
- `preview/e2e/pointer-gestures.js` reproduced two selection bugs before the fix:
  right clicks opened dialogue, and a camera drag returning to its origin also
  selected the person. After the fix, right and middle clicks and the returning
  drag leave dialogue closed; a primary click still selects the person without
  moving the visitor. Screenshot: `output/playwright/pointer-gestures.png`.
- Optional `/v1/decisions` returned HTTP 502 during this run; authored dialogue and
  local behavior continued. These passes do not verify live model responses.
- `preview/e2e/player-forms.js` passed against the production build on local port
  4181: Jevica defaults, exactly three forms, loaded portraits, each vehicle,
  completed ascent, additional Space ascent and landing, camera switching, mobile
  keyboard controls and no uncaught page errors. Landing waits for both the flight
  button and the throttled altitude readout. No deployment was performed.

- `preview/e2e/grounded-motion.js`: passed all six actual shipped rigs over 301
  frames on an inclined fixture, including acceleration, turning and stopping.
  2,052 planted samples; maximum target error under 0.001 mm. Screenshot sequence:
  `output/playwright/grounded-motion-{0,60,110,170,230,300}.png`.
- `preview/e2e/crowd-motion.js`: six actual rigs passed 1,441 frames each of
  opposing sidewalk groups and sharp corners/reversals. All reached their
  destinations; 25,679 planted-foot samples retained contact and orientation,
  with maximum target error 0.000000987 m. Four clicks on rendered walking poses
  selected the right person; four opaque foreground checks rejected selection.
  No uncaught errors. These are deterministic fixture frames using the production
  simulation, avatar animation and picker, rather than live district click timing.
  Screenshots: `output/playwright/crowd-{passing,turns}-{frame}.png`.
- The three-minute district simulation sampled all 24 outdoor residents at 30 Hz:
  zero road incursions, 75–184 m traveled per resident, and no continuous movement
  blockage longer than 0.2 seconds. The regression requires legal surfaces,
  sustained progress and no three-second deadlock. A separate test verifies that
  a pending route recovery cannot overwrite a newer redirect.
- `preview/e2e/resident-life.js`: passed current district controls, route worker,
  bounded reaction batches, conversation holds, pause/resume, weather sheltering,
  reduced motion and native UHD buffer. Sampled actual foot-target error was
  0.000000957 m in the final crowd pass, with no uncaught browser errors. The test
  uses the current Weather control and development-only read-only diagnostics.
- `preview/e2e/render-budget.js`: the final full-district UHD sweep measured
  median 50 ms and p95 66.7 ms for Alien, Witch, Jevica and Jevica's flying bubble,
  approximately 20 fps. Before this renderer pass, the same local starting view
  measured about 100 ms. Jevica's submitted triangle count dropped from roughly
  29.0 million to 24.5 million per frame. The 3840×2160 output, all 230 trees, all
  38 planted beds and the full character population remained loaded; AO and
  refraction remained enabled. Refraction returns to full resolution at 1080p.
  No uncaught errors. Screenshots: `output/playwright/render-budget-{form}.png`.
  These local Chrome samples do not establish target-GPU or native performance;
  20 fps still leaves a visible motion-smoothness gap.

## Still required for the full goal

- Broaden whole-body clearance beyond sampled box furniture to seated contacts,
  rounded and sloped fixtures and continuous movement. The bartender torso/counter
  intersection was resolved by moving the station to the clear service end; the
  apparent wrist seam was resolved by correcting the support pose.
>>>>>>> Stashed changes
- Expand live pointer acceptance beyond six walking rigs to tightly clustered
  crossings, partial occlusion and touch gestures. Rendered fixture acceptance
  covers walking poses and foreground obstruction; district acceptance covers
  outdoor, counter and seated clicks, hidden layers, reset and reload.
- Develop wrapping and pinch grips, tool-specific manipulations, handovers and
<<<<<<< Updated upstream
  realistic task transitions beyond the verified flat-hand support and counter cycles.
=======
  realistic task transitions beyond the verified flat-hand support, tablet tapping
  and counter cycles.
>>>>>>> Stashed changes
  Inspect every occupation in its furnished workplace. Current procedural cycles
  are not complete physical task simulation or proof of hyper-realism.
- Refine upper-body weight transfer and foot coordination beyond the verified
  passing, cornering, reversal and contact sequences. Current procedural movement
  remains short of a complete biomechanical model.
- Visually review walking, stopping, turning, seated interactions, carrying,
  worker gestures, crowd passing and indoor/outdoor encounters in real rendering.
<<<<<<< Updated upstream
- Improve rendering cost from the measured UHD runs and broaden movement
=======
- Improve rendering cost from the latest ~20 fps UHD run and broaden movement
>>>>>>> Stashed changes
  acceptance to worker tasks, carrying, seated interactions and crowded turns.
  These passing tests alone do not establish hyper-realistic movement.
- Bring native Unreal to the same interaction and motion scope, then verify it.
  Source audit: `RiverStreetPawn.cpp` provides E greetings through `GreetNearby`;
  `RiverOaksWorld.cpp` currently returns a generic greeting. The procedural native
<<<<<<< Updated upstream
  animation proxy blends stride rotations over a relaxed standing pose, without the
  browser's ground-contact solver, station routines or encounter directory.
  The native follow-ups above add compile, automation, and sampled rendering
  evidence; they do not establish full browser/native parity.

## Consolidated PR boundary
=======
  animation proxy applies stride rotations to the reference pose, without the
  browser's ground-contact solver, station routines or encounter directory.
  No native compile or rendered acceptance was performed for this browser pass.

This pass did not create a commit or release. Goal remains active.
>>>>>>> Stashed changes

This branch incorporates PR #14's playable forms, human fashion palettes and
established worker tasks on current main, including PR #15's invasion. It adds
interaction and movement recovery, pointer fixes, rendering cost reductions and
invasion integration fixes. A PR from this branch supersedes the code in #14;
review and close that overlapping PR when this replacement is accepted.

The latest hand-fitting changes are included in this delivery. Native Unreal
parity, live Jev availability and the remaining realism targets remain separate
work. The broader movement goal remains active.
