# People interaction and movement goal

Goal: people remain interactive wherever they are, occupations fit workers and
other visitors, and character movement becomes hyper realistic end to end.

## Current implementation

- Pedestrians, shoppers and workers are human again. Original rig skin, hair, eyes
  and head geometry are preserved; alien anatomy is limited to the player form and invading crew.
  Jevica remains the default, with Alien and Witch as the other player forms.
  Browser inspection verified all 24 outdoor and 169 indoor people retain human
  skin materials and visible faces, all 25 mannequins have no alien anatomy, and
  the player still receives Grey anatomy. Outdoor/indoor pointer conversations,
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
- Pointer selection requires a primary click. Camera drags remain drags even
  when they return to their starting point; cancellation and lost capture clear
  the pending click.
- Indoor staff have eased inspection, preparation, serving and presentation
  cycles. Conversation holds the task, blends head/torso/arm attention and resumes
  work afterward. Bodies stay at their stations instead of rotating planted feet.
- The 62 workers retain PR #14's rig-fitted palm support for trays, fabric,
  jewelry, eyewear, samples and tablets. The conservative reach check permits one
  docked counter station; other workers hold their load at a rig-fitted height.
  Conversation pauses work, and reduced motion now freezes the work cycle.
  Shared prop resources and the six human fashion palettes remain intact.
  The separate hand-fitting work remains in the active original checkout.
- Conversations use eye-level visibility independently of walking collision:
  counters allow talking, shelving and room boundaries still block it. Choosing
  an indoor person finds an unoccupied approach within their room and talking
  range, including workers at the back of a shop.
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
  rejects obsolete results. Pausing during recovery retains the current visit
  route for retry, while weather, reset and redirect changes still fence stale work.
- The ambient-occlusion geometry pass reuses the main pass's transforms and
  shadow maps. Scene antialiasing remains in the multisampled compositor; the
  fullscreen canvas does not repeat it. At UHD, offscreen refraction uses half
  resolution while the main image remains native resolution. Smaller foliage
  batches reduce offscreen instance submissions without changing source models,
  canopy layers, stem positions or planting density.

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

## Still required for the full goal

- Broaden sampled hand/body clearance to continuous motion, seated contacts and
  rounded or sloped furniture. Add wrapping and pinch grips beyond flat support
  and the fitted tablet-tapping pose.
- Expand live pointer acceptance beyond six walking rigs to tightly clustered
  crossings, partial occlusion and touch gestures. Rendered fixture acceptance
  covers walking poses and foreground obstruction; district acceptance covers
  outdoor, counter and seated clicks, hidden layers, reset and reload.
- Develop wrapping and pinch grips, tool-specific manipulations, handovers and
  realistic task transitions beyond the verified flat-hand support and counter cycles.
  Inspect every occupation in its furnished workplace. Current procedural cycles
  are not complete physical task simulation or proof of hyper-realism.
- Refine upper-body weight transfer and foot coordination beyond the verified
  passing, cornering, reversal and contact sequences. Current procedural movement
  remains short of a complete biomechanical model.
- Visually review walking, stopping, turning, seated interactions, carrying,
  worker gestures, crowd passing and indoor/outdoor encounters in real rendering.
- Improve rendering cost from the measured UHD runs and broaden movement
  acceptance to worker tasks, carrying, seated interactions and crowded turns.
  These passing tests alone do not establish hyper-realistic movement.
- Bring native Unreal to the same interaction and motion scope, then verify it.
  Source audit: `RiverStreetPawn.cpp` provides E greetings through `GreetNearby`;
  `RiverOaksWorld.cpp` currently returns a generic greeting. The procedural native
  animation proxy applies stride rotations to the reference pose, without the
  browser's ground-contact solver, station routines or encounter directory.
  No native compile or rendered acceptance was performed for this browser pass.

## Consolidated PR boundary

This branch incorporates PR #14's playable forms, human fashion palettes and
established worker tasks on current main, including PR #15's invasion. It adds
interaction and movement recovery, pointer fixes, rendering cost reductions and
invasion integration fixes. A PR from this branch supersedes the code in #14;
review and close that overlapping PR when this replacement is accepted.

The latest hand-fitting changes are included in this delivery. Native Unreal
parity, live Jev availability and the remaining realism targets remain separate
work. The broader movement goal remains active.
