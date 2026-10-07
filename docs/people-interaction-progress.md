# People interaction and movement goal

> Historical implementation record. Solo gameplay and its browser journeys have
> been retired. See [current testing](testing.md) and [town setup](multiplayer.md).

Goal: people remain interactive wherever they are, occupations fit workers and
other visitors, and character movement becomes hyper realistic end to end.

Current scope is strictly browser functionality, per Val's September 25 direction.
Unreal/editor work is stopped and is not a completion dependency for this scope.
Continue browser interactions, worker roles, movement, Jevica and carriage behavior.
Preserve the separate native worktree; its older evidence below is historical.

## Current implementation

- The browser dragon wish now uses a detailed, locally generated reptile model:
  connected limbs, clawed feet, tapered neck and tail, recessed slit eyes, curved
  horns, thick scalloped wing membranes and tension veins. Five owned PBR maps
  provide overlapping scale color/relief/roughness, leather grain and horn wear.
  Breathing, head, tail and wing motion keep the feet planted; reduced motion
  freezes the pose. Undo releases every owned resource once. The model uses
  28 meshes and 53,928 triangles and is spaced clear of the recipient's body.
  This is procedural browser geometry, not a scanned or externally sourced asset.
  The September 25 verification passes all 309 unit tests and the production build;
  the existing large Three.js chunk warning remains. All five wish lifecycles
  also pass through the real browser controls, including hatch, plea, undo and
  mobile layout (52 assertions). See [dragon verification](../data/reports/browser-wish-dragon.json).

- Pedestrians, shoppers and workers are human again. Original rig skin, hair, eyes
  and head geometry are preserved; alien anatomy is limited to invading crew.
  Jevica is now the sole playable identity; Alien and Witch player forms are retired.
  Browser inspection verified all 24 outdoor and 169 indoor people retain human
  skin materials and visible faces, all 25 mannequins have no alien anatomy, and
  the earlier playable Alien received Grey anatomy before its retirement. Outdoor/indoor pointer conversations,
  hidden-layer rejection, reset and reload pass without uncaught browser errors.

- Outdoor residents and every non-mannequin boutique staff/guest figure share
  encounter identities, dialogue, memory, role context and directory access.
- Indoor identities use the same IDs as their skinned meshes. Keyboard encounters
  stay in the visitor's room; directory selection can enter the person's store.
- Selecting an outdoor person from inside a store first leaves through that
  store's mapped exit, then approaches the resident. The directory regression
  starts indoors and reaches all 193 identities. Fresh checks also pass keyboard
  conversations in all 30 shops, 13 interaction lifecycle assertions, 31 moving
  resident assertions across six rigs, and three mounted conversation assertions.
  The 285 unit tests and production build pass. See
  [directory transition evidence](../data/reports/browser-directory-transitions.json).
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
- The 62 workers use rig-fitted contacts for trays, fabric, jewelry, eyewear,
  samples, tablets and fragrance blotters. The reach check permits 17 docked
  counter stations; other workers hold their load at a rig-fitted height.
  Conversation pauses work, and reduced motion now freezes the work cycle.
  Shared prop resources and the six human fashion palettes remain intact.
  Fragrance workers support the tray with one palm and pinch a paper scent strip
  between the other hand's thumb and index finger.
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

## Remaining browser acceptance — September 25

The user objective is interactive people throughout the district, appropriate
worker roles, and realistic movement end to end. A complete biomechanical or
physical task simulation is not a separate user requirement. Older lists of
pinch-grip, touch, airborne-conversation and turn-continuity work are superseded
by the dated evidence sections below.

- **Full-scene frame pacing:** isolated rig checks pass, but the first profiled
  1440 × 1000 district run measured roughly 20–30 fps. Removing duplicate AO
  traversals improves the street median, but slow frames remain. Profile the
  remaining scene/render costs without trading away the requested character
  and environment detail or disabling residents.
- **Complete interaction review:** retain the directory, pointer, keyboard,
  touch, occlusion, room-transition, elevated-person and carriage-conversation
  coverage. Reconcile those reports with the current sources after integration;
  passing directory visits alone does not prove every input path.
- **Coherent visual review:** assess walking, stopping, turning, passing,
  carrying, seated conversation and work/release/re-grasp in the live browser.
  The dated rig/contact reports prove specific invariants, not the overall
  impression of realistic movement or its responsiveness in the full district.
- **Scope:** native Unreal parity is excluded by the browser-only direction.
  Historical native notes do not require editor work.

The worker-role review is verified in the September 25 entry below. The
[worker role index](browser-worker-roles.md) maps all 62 workers to their 22
occupations, authored dialogue, and seven shared task families.

## Consolidated PR boundary

This branch incorporates PR #14's playable forms, human fashion palettes and
established worker tasks on current main, including PR #15's invasion. It adds
interaction and movement recovery, pointer fixes, rendering cost reductions and
invasion integration fixes. A PR from this branch supersedes the code in #14;
review and close that overlapping PR when this replacement is accepted.

The latest hand-fitting changes are included in this delivery. Native Unreal
parity, live Jev availability and the remaining realism targets remain separate
work. The broader movement goal remains active.


### Jevica appearance refinement, September 22, 2026

Jevica now has a softer oval face and jaw, subtle cheek and lip shaping,
warmer brows, refined shoulder and neck proportions, and gently waved blonde
hair. The changes belong to her dedicated hero asset and cloned materials.
The six resident GLBs remain byte-identical. Her rose gown, crown, wand,
and bubble flight are retained, and the portrait was regenerated from the model.

The final pass passes 224 JavaScript tests, the production build, and Ruff for
the generator. Forty-two browser checks pass, including the three authorized
forms, portrait loading, flight, landing, cameras, and mobile controls. Source
review found no actionable correctness findings. Studio front, profile, back,
and walking captures are retained with receipts in
`data/reports/jevica-appearance.json`.

The walking capture exposed an existing knee/skirt intersection, reproduced
with the pre-change GLB. A new pose-driven skirt adjustment resolves the sampled
intersection without changing skin geometry or gait. Four skirt layers deform;
rigid crown and wand attachments continue to batch by material.

The regression measures actual skinned leg vertices against rendered gown
triangles. It passes 54 poses across 30, 60, and 120 Hz: translated parent,
turning, 1.65 and 3.2 m/s walking, stopping, bubble flight pose, and landing.
A separate size check catches stale skin bind transforms when initially placed
far from the origin. Both regressions failed before their respective fixes.
Local costume update measurements are about 6.6–6.8 ms median and 8.1–8.5 ms
p95; these are CPU fixture timings, not district FPS or target-device acceptance.

Coverage is bounded to sampled lower-body vertices in the covered skirt band.
Continuous triangle collision, photoreal facial animation, physical cloth, and
native Unreal parity remain open. This browser refinement remains uncommitted;
the broader goal is active.


### Browser shoe contact, September 23, 2026

Walking now preserves the shape of the shoe soles as knees bend. The imported
shoe weights assigned part of the sole to the calf, pulling visible shoes up to
1.66 cm through the floor while the ankle-target tests still passed. Lower-shoe
calf influence now transfers to the foot joint, retaining ball-joint influence
and blending back to the original cuff above the ankle. Each avatar owns the
changed geometry; source assets and other instances stay intact.

A separate slope defect placed the ankle at its flat-ground vertical offset
after rotating the shoe to the terrain. The solver now preserves ankle-to-sole
distance along the ground normal, including avatar scale. This removes the
additional roughly 1.15 cm penetration found on 26.6-degree slopes.

`preview/e2e/shoe-contact.js` measures actual skinned shoe vertices against the
rendered planar terrain across all six resident rigs. Eleven runs cover level
ground, positive and negative slopes, starts, turns, stops, and 30/60/120 Hz.
The 26,454 planted-foot samples pass; measured clearance error is below 0.002 mm.
Both defects have failing baseline evidence. Close-up renders show the restored
sole profile and ground contact. Unit tests verify shape retention, cuff motion,
weight totals, source isolation, disposal ownership, and scaled slope support.

All 227 JavaScript tests and the production build pass. Existing crowd passing,
turning, walking-mesh picking, all 62 worker contacts, and Jevica's gown checks
also pass. The live district check selected six walking residents, held their
conversations, and verified movement resumed. Its fixed-time retreat initially
left the player inside the courtesy-stop radius; it now waits for measured
separation, without injecting movement or changing simulation rules.

The exact results, source hashes, and integration checks are recorded in
`data/reports/browser-shoe-contact.json`. This verifies sampled shoe vertices on
planar terrain, not continuous triangle collision, heel-to-toe roll, irregular
footholds, stair climbing, or complete biomechanical realism. Native Unreal work
remains separate. The broader goal remains active and this browser work is
uncommitted.


### Browser uneven-ground support, September 23, 2026

Foot placement now checks terrain beneath the actual shoe footprint and fits
landing orientation at the destination. Previously, the landing height used the
new terrain but the shoe angle came from beneath the body. A flat-to-ramp
transition reproduced 5.48 cm penetration; wavy terrain also exposed roughly
1.8 cm of floating contact. Ankle-target tests alone did not catch either.

The solver caches lower-shoe support vertices once, then queries their rotated
footprint for landing height and swing clearance. Planted targets remain fixed.
The rendered fixture now uses a subdivided terrain mesh and height queries with
the same triangle diagonal. Six-rig wave and ramp checks pass at 30, 60, and
120 Hz with 14,796 planted samples. Maximum sampled penetration is 0.725 mm;
planted float remains below 0.001 mm.

The local CPU benchmark uses actual district terrain, all 30 room definitions,
and the Jevica player rig. Updating 24 moving residents measured 1.1 ms median
with footprint checks versus 0.8 ms with those checks disabled. Player updates
using the production room lookup measured at most 0.2 ms p95 in this run.
Costume updates and rendering are excluded; this is not a district FPS claim.

All 228 JavaScript tests and the production build pass. The planar shoe,
grounded motion, crowd passing/turning, Jevica gown, and six live walking-person
interaction regressions also pass. The source review found no actionable
correctness issue and requested the cost measurement above.
`data/reports/browser-uneven-foot-contact.json` records the exact evidence and
shared integration regressions. Close-up renders confirm the contact improvement,
but also show cuff/sock intersection artifacts on the woman-casual model.
Those clothing defects, heel-to-toe roll, sharper steps, moving support, complete
biomechanical realism, and native parity remain open. The goal stays active;
this work is uncommitted.

### Browser sock and trouser fit, September 23, 2026

The casual resident's socks now stay beneath the trouser cuffs in the sampled
walking poses. The original sock mesh protruded 4.8 mm through the trousers at
bind pose and up to 6.15 mm during walking. Fitting the geometry alone still
left 1.75 mm of overlap because the two layers had different ankle skin weights.

`preview/src/sock-fitting.js` fits the disconnected knitted sock surfaces to the
actual trouser triangles, then matches their interpolated bone influences. The
fit runs once on each avatar's owned geometry. Exposed cuffs remain, and leather
and sole positions and normals are preserved. All six resident GLB files remain
byte-identical. No additional work runs in the animation loop.

The clearance check covers 519 poses at 30, 60, and 120 Hz on flat, wavy, and ramp
terrain. Its 190,992 vertex and triangle-centroid checks retain at least 1 mm of
clearance, with no uncovered probes. Matched before/after close-ups show the
white patches removed during walking. Unit coverage checks scaled avatars,
translated and rotated models, ankle bends, weight totals, and source isolation.
All 230 JavaScript tests and the production build pass. Review caught a change
to non-sock normals; those normals are now preserved and asserted explicitly.
The six live walking-person interactions, all 62 worker contact checks, and
14,796 planted-foot samples on uneven terrain also pass. The terrain contact
measurements match the preceding pass.

`data/reports/browser-cuff-fit.json` records the source hashes, renders, test
results, and fitting cost. These checks cover the shipped casual outfit and
sampled poses, not continuous clothing collision or full biomechanical realism.
Heel-to-toe articulation, sharper steps, moving supports, and native parity
remain open. This work is uncommitted and the broader goal remains active.

### Browser heel-to-toe articulation, September 23, 2026

Walkers now land heel-first, lift the heel for push-off, and flex the toe joint.
Previously, the foot solver held the entire shoe flat throughout stance. The
new rocker uses the shoe's actual cached sole samples and their toe-joint skin
weights. It preserves the previous ground-support vertex as the foot rotates,
then selects the next supporting vertex from the terrain footprint. A decaying
position offset carries that movement into the swing phase.

The contact review caught a false proof: an initially selected rotation pivot
could sit 3.3 cm above flat ground while another vertex supported the shoe.
The revised solver and tests track the actual supporting vertex. Nine runs
cover all six rigs on flat, wavy, and ramp terrain at 30, 60, and 120 Hz. Across
22,194 stance samples, maximum sampled shoe penetration is 0.721 mm and the
selected support's terrain gap remains below 0.001 mm. The test also measures
174,772 consecutive near-ground vertex pairs; their maximum tangential motion
is 2.05 mm per frame, so the result does not claim every contact-patch vertex
is perfectly stationary.

Unit tests reproduce and fix two related state errors: leg lengths retained
an old parent scale, and paused relocation retained toe flex from the previous
step. All 233 JavaScript tests and the production build pass. Close-up renders
show heel landing and toe push-off. All six resident assets and Jevica's asset
remain unchanged. `data/reports/browser-foot-roll.json` records exact metrics,
source hashes, review findings, and integration results.
The grounded-motion, cuff-clearance, gown-clearance, and six live walking-person
interaction regressions pass. Updating 24 moving residents with the actual
district terrain queries measured 1.2 ms median and 1.4 ms p95 in the local CPU
fixture. This excludes rendering and costumes; it is not a district FPS claim.

This remains procedural animation, not motion capture or a full biomechanical
simulation. Body-height motion, stair handling, moving surfaces, complete
clothing collision, and native parity remain open. The broader goal stays
active and these changes are uncommitted.

### Browser body height and starting steps, September 23, 2026

Jevica and the residents now walk more upright. The previous fixed pelvis offset
lowered the body by 14–16 cm throughout walking, even when the supporting foot
was beneath the hip. Body height now follows leg reach, with a gradual transfer
toward the planned heel landing and a damped return to standing height.

Removing the crouch exposed two related defects. The swing path ended above the
rotated shoe's contact height, producing a 2.6 cm ankle drop at landing. Swing
clearance now uses that rotated footprint and an arc with zero endpoint velocity.
The initial step also used a full stride while the supporting foot started
beneath the body. A shorter first departure prevents that foot from falling far
behind. The same behavior applies after stopping and restarting.

Nine browser runs cover Jevica and all six resident rigs at 30, 60, and 120 Hz
on flat, wavy, and ramp terrain. Flat-ground body lowering stays within 5.02 cm;
the supporting leg retains at least 94.18% extension during the sampled
mid-support phase. World-space pelvis speed stays below 1 m/s in these fixtures.
These are regression bounds, not validation against motion-capture data.
The old fixed crouch fails the same sampling window on all seven rigs. A
separate start/restart test reproduces excessive lowering with the old full
first stride. All 235 JavaScript tests and the production build pass.

The foot-contact regression covers 23,541 stance samples. Maximum sampled shoe
penetration is 0.348 mm; the maximum consecutive near-ground vertex motion is
1.78 mm per frame. The cuff, Jevica gown, grounded-motion, and six live
walking-person conversation checks also pass. Updating 24 moving residents
with district ground queries measured 1.3 ms median and 1.7 ms p95 locally,
excluding costumes and rendering. These timings do not establish district FPS.
All seven character assets retain the hashes from the preceding appearance pass.

`data/reports/browser-body-motion.json` records the metrics, comparison checks,
source hashes, and local renders. Stair handling, moving support surfaces,
complete clothing collision, motion-capture validation, and native parity remain
open. The broader goal stays active; this work is uncommitted.

### Jevica reference styling and coordinated arms, September 23, 2026

Jevica now follows the supplied pink-gown reference: one flowing skirt, gold
floral embroidery around the neckline and hem, an open gold crown, warm blonde
hair, and a luminous star wand. Her rebuilt mesh includes a subtle bust
adjustment, narrower shoulders, and a tailored bodice that bridges the skin's
concavities. The relaxed arms sit closer to her sides. The portrait is rendered
from this model; the district layout and six resident asset files are unchanged.

The arm gait now follows the actual rendered feet rather than a separate fixed
stride clock. This keeps opposite arm and leg movement coordinated when steps
shorten or turn. Jevica uses a smaller arm swing; carrying reduces the occupied
arm's swing. Stops, suspension, reduced motion, and flight release have unit
coverage. The authored coordination is not biomechanical validation.

All 237 JavaScript tests, the production build, and the generator's Ruff check
pass. Browser fixtures cover seven rigs on three terrains at 30, 60, and 120 Hz.
Arm/leg correlation is at most -0.9016, and sampled world-space wrist speed stays
below 2.10 m/s. Fifty-four gown poses cover walking, turns, fast walking, stops,
bubble flight, and landing. Sampled leg-to-cloth clearance is at least 17.8 mm;
arm-to-cloth clearance is at least 16.2 mm. Front, side, portrait, and walking
renders were inspected. These sampled checks do not prove complete garment
collision or photorealism.

`data/reports/jevica-reference-style.json` records the current asset receipt,
source hashes, measurements, and render paths. Earlier appearance/body reports
remain historical snapshots. An independent review attempt hit a usage limit;
local review and automated checks completed. The broader movement and
interaction work remains active, and the changes are uncommitted.

### Jevica as the sole playable character, September 23, 2026

The Witch and Alien player forms are retired at Val's request. Their costumes,
portraits, broom/UFO vehicle paths, Witch flight pose, appearance selector, and
transformation prompts are removed. Jevica retains the reference-inspired pink
and gold gown, bubble flight, camera controls, celebrity reactions, and casting.
The separate invasion encounter continues to use its enemy species and saucers.

Retirement assertions first failed against the old roster and factories. The
updated factories reject retired identities, the roster exposes only Jevica, and
magic belongs to her. All 238 JavaScript tests and the production build pass.
Browser checks verify the single-character desktop/mobile controls, bubble
ascent and landing, camera switching, and a complete invasion start/cast/reset
cycle with Jevica. The wand's additive glow is excluded from the ambient-occlusion
depth pass after mobile visual review caught a black rectangular artifact; a
regression test reproduces that missing exclusion.

See `data/reports/jevica-only.json` for the final checks and source hashes.
This supersedes earlier three-form descriptions in historical progress entries.
The development server remains available at `http://127.0.0.1:5181/`; changes
remain uncommitted.

### Indoor motion continuity, September 23, 2026

Indoor people now retain their displayed pose when the camera moves beyond their
animation range or their room is culled. Work and idle clocks pause together,
and the first visible frame resumes at the saved phase. The previous distance
path reset the pose while advancing the task clock; a 62-worker reproduction
measured a 66.75-degree single-frame forearm jump. Idle motion now uses a local
clock as well, so a hidden interval cannot change its phase abruptly.

Display mannequins no longer enter visitor-attention poses. Their null encounter
identity matched an empty selection, producing turns of up to 97.4 degrees in
the baseline fixture. They are now explicitly excluded from animation updates.

`preview/e2e/station-motion.js` covers all 169 indoor people at 30, 60, and 120 Hz,
including short distance-boundary crossings, longer hidden-room intervals,
conversation holds and resumed work. All 507 person/rate runs pass: paused task
clocks do not drift and wrists retain their exact position on the first resumed
frame. The largest normalized joint difference on that frame is below 0.000001
radians. All 25 mannequins remain stationary at each rate. The existing distance
budget remains; this pass fixes continuity around it, not complete task dynamics.

The 238 JavaScript tests and production build pass. Local before/after rendered
fixtures are stored under `output/playwright/station-*`. Role-specific grips,
handovers, complete clothing collision, target-hardware performance, and native
parity remain open; the overall goal is still active.

The contact regression also passes for 62 workers and six prop types, with
52,204 palm/touch samples and 6,502,698 sampled body vertices against nearby box
furniture. Seated and counter mesh clicks, worker conversation holds and resumed
work, and all 193 directory encounters pass. Reduced-motion checks cover every
indoor person: idle task solving stops while conversation attention remains
available. A positive resumption check requires at least 0.9 seconds of work-clock
progress in the final one-second window, preventing a permanently frozen person
from satisfying the continuity test. All person/rate cases pass that check.

`data/reports/browser-station-motion.json` records the baseline failures, current
metrics, hashes and rendered artifacts. These changes remain uncommitted.

### Fragrance worker handling, September 23, 2026

Fragrance consultants and perfumers now demonstrate a paper scent strip while
supporting their sample tray with the other hand. The strip lifts, holds for
inspection and returns; the existing task clock pauses during conversation and
under reduced motion. The supporting palm moves under the load. Counter stations,
human identities and the district layout stay in place.

The pinch is fitted to each clone's skinned thumb and index, with bounded thumb
rotations and unchanged finger lengths. The strip's free end follows a relaxed
wrist rather than forcing the wrist sideways to match a fixed paper angle.
The first regression failed because perfumery workers still used generic samples.
Subsequent geometry checks caught knuckle intersections and excessive wrist bend;
the final checks retain those constraints.

All 245 JavaScript tests and the production build pass. The grip checks cover six
rigs at two scales and seven task phases. Independent review found no actionable
issues and checked 269,976 hand triangles across those 84 cases without a paper
intersection. The triangle check is now part of the regression test, using a
50-micrometer inset to distinguish penetration from surface contact.

The rendered worker regression covers all 62 staff, seven task types and 17
docked stations. Its 22 pinch samples inspect 39,842 hand vertices; the largest
pad-to-paper gap is 0.37 mm. Existing support/touch contacts and sampled body-to-box
furniture clearance pass. Both fragrance workers complete the lift/hold/return at
30, 60 and 120 Hz. Maximum wrist speed is 0.30 m/s and strip-tip speed is 0.33 m/s;
conversation holds have no task-clock or grip-position drift, and work resumes.
All 193 directory encounters, live seated/counter mesh picking and reduced-motion
checks for all 169 indoor people also pass.

See `data/reports/browser-fragrance-work.json` for source hashes, metrics and
rendered artifacts. The hand maintains its pinch throughout this demonstration;
setting down, releasing and handing over objects remain open, along with complete
clothing collision, biomechanical validation, target-hardware performance and
native parity. The overall goal stays active. These changes are uncommitted.


### Carriage, grounding and touch interactions, September 24, 2026

Jevica can summon, board, drive and leave her rose-and-gold carriage. Her seated
pose follows its tilt, both shoes rest on the footboard, and the gown folds over
her lap. The camera keeps her visible and has clearance after dismounting. Nearby
residents remain available for conversations without unmounting or relocating
her. Takeoff now checks bubble clearance before entering flight; attempting it
beside the coach previously left her unable to rise.

Outdoor movement, foot placement, vegetation and fixtures use a spatial index
of the actual terrain, road, sidewalk and kerb triangles. Four wheel contacts
follow those surfaces. Independent sampling of the rendered tyre vertices at
parked, travelled and stopped positions has a maximum 0.22 mm gap in this run.
The ground sampler is separately compared with Three.js raycasts, including
transformed and instanced support geometry. Fitted upholstery buttons contact
the indented cushion triangles.

The district now has an intentional retrofuturistic garden palette: ivory ceramic,
teal enamel and glass, brass detailing, rounded canopies, orbital lamps and
terrazzo interiors. Existing mapped positions, mature planting and human
occupations remain intact. See [world direction](world-direction.md).

Validation: 265 unit tests pass; the production build passes with its existing
large-chunk advisory. Browser acceptance passes 14 carriage checks, 6 phone ride
checks, 3 mounted conversation checks and 37 touch interaction checks. The full
193-person directory sweep opens each encounter and verifies a visible,
reachable character. The touch checks select actual seated and worker meshes
on phone/tablet and verify primary-pointer ownership, cancellation, capture loss,
focus loss and movement-control release. No uncaught browser errors were recorded
in those acceptance runs.

Evidence and source hashes are in [carriage evidence](../data/reports/jevica-carriage.json)
and [touch evidence](../data/reports/browser-touch-people.json). The reference
carriage is interpreted with locally authored geometry; it is not an identical
scan. These checks do not establish complete cloth simulation, motion capture
quality, all-object collision, target-hardware performance or Unreal parity.
Object set-down, release and handover remain open. The broader people/motion goal
stays active, and this worktree must be retained. Changes are uncommitted.

### Counter release and re-grasp, September 24, 2026

Workers at 17 reachable counters now set their loads onto the worktop, withdraw
their hands, relax their fingers, and re-grasp before lifting. The load rests on
the rendered worktop instead of floating 6 mm above it. Workers without a
supporting surface keep carrying their loads. The fragrance worker keeps her
paper pinched while the other hand releases the tray.

The existing 12-second work clock drives every phase. Conversations and reduced
motion pause that clock, including halfway through a reach. Unloaded wrists relax
relative to their forearms. A fixed world-space hand orientation caused sideways
bends when the torso turned toward a conversation; the contact regression caught
this and retains its original wrist limits.

All 277 JavaScript tests and the production build pass. The six-rig regression
checks support before liftoff, release after landing, finger relaxation, wrist
position and rotation continuity, and unchanged source skeletons. It also checks
all seven task types without a counter and verifies that the paper remains held.
Independent review found no remaining blocker and no hand-triangle/tray
intersections across the six rigs at 60 Hz during withdrawal and re-grasp.

Rendered acceptance covers all 17 docked workers at 30, 60, and 120 Hz. All 51
cases pass, including conversations during re-grasp. Maximum wrist speed is
0.48 m/s, maximum wrist rotation speed is 5.83 rad/s, and contact-point drift
during conversation stays below 0.00015 mm. Sampled hand vertices clear both
loads and counter furniture. Wrist articulation can continue while the contact
point and work clock stay fixed.

The suspension checks pass for all 169 indoor people at three frame rates
(507 cases). Resuming visibility causes no wrist-position jump or task-clock
drift. Under reduced motion, all 169 people stop idle task updates while
retaining conversation attention.

The complete contact regression passes for 62 workers and seven task types.
Live mesh picking and all 193 directory encounters pass. The final carriage
regression also passes 14 desktop checks, six phone checks, and three mounted
conversation checks. These browser runs recorded no uncaught errors.

See [worker release evidence](../data/reports/browser-worker-release.json) for
metrics, source hashes, and rendered views. This completes counter set-down and
re-grasp. Object handovers, releasing the scent strip, full clothing collision,
biomechanical validation, target-hardware performance, and native parity remain
open. The broader goal stays active. Changes are uncommitted; retain this worktree.


### Fragrance paper release, September 24, 2026

The fragrance worker now rests the paper in a small brass clip on the sample
tray, withdraws and relaxes her hand, and re-grasps before sliding the paper
out for inspection. Reinsertion reverses that path. The existing 12-second
work clock preserves conversation pauses and visibility suspension. Unsupported
workers keep holding the paper above their trays.

The hand path clears the tray and counter. The supported wrist uses an outward
elbow solution to avoid sideways bending and sudden elbow jumps. Close-up review
also exposed a sample bottle crossing the fingers; its fragrance-only position
now leaves the approach clear. Other sample trays retain their layout.

All 283 tests and the production build pass. The six-rig regression checks
release, support, contact, wrist and elbow continuity, and hand/paper/stand
clearance. Both hands also clear all six bottle/cap volumes using their actual
rendered convex geometry. An independent probe found zero intersections across
721 frames per rig at 60 Hz. Browser acceptance passes 12 fragrance cases at
30, 60 and 120 Hz, including conversations during re-grasp and extraction. All
62 workers pass contact checks with bottles and caps included in hand and body
collision sampling. Six final rendered poses have zero sampled body collisions.

Jevica's carriage also passes a fresh 23 checks: 14 desktop, six phone, and
three mounted-conversation checks. Boarding, driving, braking, grounding and
dismounting work without uncaught browser errors.

See [fragrance release evidence](../data/reports/browser-fragrance-release.json)
for logs, metrics, source hashes and screenshots. Fragrance release is complete.
Object handovers, full clothing and biomechanical validation, target-hardware
performance, native input acceptance and native parity remain open. The broader
goal stays active. Changes are uncommitted; retain this worktree.

### Carriage grounding follow-up, September 24, 2026

A fresh drive test caught intermittent tread penetration that the earlier
sampled contact envelope missed. Suspension now uses the actual rotating tread
vertices and moves wheels vertically in world space. This also fixes oscillation
when a tilted carriage crosses a narrow raised road detail.

All 285 unit tests, the production build and 23 desktop/phone/conversation checks
pass. Both new geometry regressions failed before the fix. Independent review
covered 189 turned, reversed, sloped and mirrored cases. The phone checks passed
with the same timeouts after isolating the scene; two simultaneous district
scenes had timed out during startup. Concurrent-scene startup performance is
not accepted by this pass.

See [current carriage verification](../data/reports/jevica-carriage-final-check.json).
Carriage riding is complete in the dev preview. Broader native realism and
integration remain open; preserve both uncommitted worktrees.


### Pedestrian presence, September 25, 2026

The unconditional 2.8 m visitor stop radius is removed. Pedestrians use the
existing passing and personal-space checks around Jevica; a passing nod does not
own their body heading or route. An explicitly opened conversation still holds
the selected resident, and closing it releases the route without requiring
Jevica to step away. Wishes, support visits and paused scenarios retain their holds.

Both new regressions failed before this change: walking beside Jevica stopped,
and a stationary Jevica prevented a pedestrian from reaching the opposite stop.
The focused 42-test suite now passes, including collision clearance, conversation
holds, acknowledgements, wishes and volunteer work. Real browser controls pass
39 assertions across six walking rigs, including direct mesh selection, no
visitor relocation, resumed routes and absent floating reaction captions.
All 311 unit tests and the production build also pass.
See [NPC presence evidence](../data/reports/browser-npc-presence.json).

The touch rerun passes 37 checks at tablet and phone widths, selecting a real
seated diner and server, preserving visitor position, and checking drag, second
finger, capture-loss and focus-loss cancellation. Cold scene loading crossed the
old 30-second limit; startup now permits 90 seconds without changing gesture
assertions. The older intermittent capture-cancellation failure did not reproduce
in this run; no pointer implementation fix or definitive resolution is claimed.


### Pending pointer capture, September 25, 2026

The intermittent cancelled-tap failure now has a deterministic reproduction and
fix. Releasing capture within the original trusted pointerdown clears pending
capture before the browser dispatches either gotpointercapture or
lostpointercapture. The previous selection state therefore survived cancellation
and opened a worker conversation at pointerup.

Captured gestures now check ownership before returning a camera delta or tap.
Walking selection explicitly owns host capture; other gesture modes keep their
existing behavior. The real-worker regression failed before this patch and now
passes seven assertions, including proof that no capture lifecycle event occurs,
no cancelled conversation opens, and a fresh tap still selects the exact worker.
Both focused unit regressions also failed before the patch and pass afterward.
The existing phone/tablet suite passes all 37 assertions, including seated/worker
selection, primary/secondary touch, jitter, capture/focus loss and movement-pad
release. All 313 unit tests and the production build pass.
See [capture cancellation evidence](../data/reports/browser-pointer-capture.json).
This resolves the pending-capture path left open by the earlier proximity pass.


### Physical pedestrian space, September 25, 2026

Street avoidance now checks room and overlapping body height instead of treating
every XY position as an obstacle. Indoor residents and airborne wish recipients
no longer block a route projected onto the street. Jevica participates in passing
and clearance when on foot or hovering low enough to overlap a pedestrian;
indoors or overhead she is excluded. Landing restores normal avoidance. The
rendered flight wish and these checks share one lift calculation. Explicit
conversations and narrative wish disruptions retain their existing holds.

Three new regressions failed before the change and now pass. The focused suite
passes 40 checks; all 316 unit tests and the production build pass. Seven live
browser assertions cover takeoff, landing, room entry and indoor conversations,
using actual controls and outgoing resident packets without injected state or
network replies. See [pedestrian space evidence](../data/reports/browser-pedestrian-space.json).

A separate remaining interaction gap is now explicit: talking reach still uses
an elevated wish recipient's base ground position and rejects Jevica above 2.5 m.
The next interaction pass must align conversation targeting with rendered height,
including line of sight and room boundaries, without teleporting either person.


### Elevated conversations, September 25, 2026

Conversation range now measures actual three-dimensional eye-to-eye distance.
Rendered wish height, seated eye height and dog-form eye height are shared by
pointer reach, keyboard targeting, nearby ranking and approach visibility. A
nearby airborne conversation keeps Jevica's current movement state and position;
an out-of-range airborne selection cannot rebuild grounded movement. Grounded
directory approaches account for vertical separation as well as horizontal range.

Five regressions failed before this change. The focused suite passes 41 tests;
all 321 unit tests and the production build pass. Fifteen live browser assertions
cover a granted flight wish, actual flying-mesh clicks, keyboard E, unchanged
Jevica position/altitude, distant-height rejection, conversation from below and
undo. A fresh directory run reaches all 193 identities, including 169 indoor
people and 62 workers across 22 occupations. The three carriage-conversation
checks also pass, retaining the rider's mounted position. No simulation state
was injected into the airborne acceptance run.
See [elevated conversation evidence](../data/reports/browser-airborne-conversation.json).
This resolves the height-targeting gap identified in the preceding physical-space
pass. Overall movement realism still requires the rendered quality audit; these
interaction results do not establish that broader goal by themselves.


### Conversation gaze, September 25, 2026

Rendered review confirmed that changing a partner's height left the worker's
head at the same 0.02 rad elevation. Conversations now drive a bounded, damped
head-and-neck response toward the visitor. Outdoor body turns use the visitor
rather than the camera, and airborne wish offsets are accounted for in the rig's
posing frame. Station attention retains its supported arms and planted legs.
Ending a conversation eases the gaze back toward its task or idle pose; culling
cannot spend hidden time in a single visible jump.

The stationary-pose regression failed before the change. Frame-rate, bounds,
interruption and suspended-time tests pass at 30, 60 and 144 Hz. Rendered checks
cover all six outdoor rigs plus 14 station/guest cases, including seated guests
and all seven prop types (fabric, blotter, eyewear, jewelry, samples, tablet and
tray). Across 7,200 sampled frames, maximum head change is 0.0385 rad per 60 Hz
frame, foot drift is zero, and supported-hand target error stays below 0.001 mm.
The live airborne conversation run retains all 15 passing assertions. All 326
unit tests and the production build pass.
See [conversation gaze evidence](../data/reports/browser-conversation-gaze.json).

The next motion review should inspect how a resident rejoins its route after
turning to converse: simulation heading and rendered heading currently have
separate owners during the conversation, so their transition needs direct proof.


### Browser conversation-to-route facing continuity — 2026-09-25

A rendered production rig reproduced a 1.571-radian (90-degree) body snap when
its conversation closed. The visible body faced the visitor, while the route
controller retained its prior heading. Standing conversations, greetings and
assistance now update the same simulation heading used by walking. The renderer
reads that heading, so route release begins from the actual facing direction.
Explicit conversations can still turn while route motion is paused.

Two new regressions failed before the fix and pass afterward, including 30,
60 and 144 Hz updates. All six rendered outdoor profiles maintain identical
simulation/render headings and a maximum 0.05334-radian turn per 60 Hz frame
through the conversation and release. Each resumes its route. The live district
passes all 39 moving-person checks, including pointer selection and position
holding during conversations. All 328 unit tests and the production build pass.
Evidence: `data/reports/browser-conversation-release.json`.

The live acceptance setup now waits for the published chatting state after a
directory jump. Reading the HUD immediately when the dialogue opens can capture
the visitor's pre-jump position before the next scene tick. This is a test setup
synchronization change, not a looser position tolerance.

This closes the previously identified split-heading issue. It does not prove
complete movement realism; foot contact and weight transfer during standing
turns still need a focused rendered review.


### Browser standing-turn foot alignment — 2026-09-25

Actual rendered shoe probes found no meaningful support sliding, but a fast
standing turn left each shoe up to 1.497 radians (86 degrees) behind the body.
The landing orientation was captured at lift-off and became stale while the
body continued turning. Turning steps now begin at a smaller alignment error
and follow the natural stance target while airborne. The supporting foot stays
fixed. Ordinary travel and stop-settling steps retain their existing behavior.

The new regression failed before the fix and passes in both turn directions at
30, 60 and 120 Hz. Six actual rigs pass half-turns and reversals on flat and
uneven rendered terrain at those rates (36 profile/rate/terrain samples). The
flat 60 Hz worst-case lag decreases to 0.992 radians (57 degrees); the full
matrix stays below 1.079 radians. Maximum sole penetration is 0.041 mm, support
patch motion is below 0.001 mm, and no sample loses both support feet or crosses
the legs. All nine existing rendered walking/contact runs pass, as do all 329
unit tests and the production build.

Evidence: `data/reports/browser-standing-turns.json`, with before/after images
at `output/playwright/standing-turn-before.png` and
`output/playwright/standing-turn-after.png`. Body weight transfer during these
standing steps still needs a separate visual review; the contact measurements
do not establish complete motion realism.


### Browser standing-step torso counterbalance — 2026-09-25

A new actual-rig test measured zero support-driven chest displacement while the
feet stepped around a standing turn. A small damped waist lean now follows the
support foot and active turning step. Its envelope releases as the foot lands;
reduced motion, flight and riding suppress the effect. The neck preserves its
world orientation because waist and neck rest axes differ between character
rigs. Planted feet remain unchanged by the upper-body adjustment.

The previously failing regression passes with a transformed/scaled parent,
steady gaze, fixed feet, neutral recovery, reduced motion and flight. Seven
production rigs including Jevica pass flat/uneven terrain at 30/60/120 Hz (42
samples). Average chest movement toward support during mid-step is at least
4.7 mm; peak lateral movement stays below 9.5 mm. Sole contact remains within
the prior standing-turn tolerances. All nine body-motion runs pass for all
seven profiles, alongside all 330 unit tests and the production build.
Evidence: `data/reports/browser-standing-balance.json` and
`output/playwright/standing-turn-balance.png`.

This adds torso counterbalance, not a whole-body physical center-of-mass model.
The next acceptance pass should review complete live route/conversation/work
loops and frame pacing, then reconcile remaining interaction and role coverage
against the original browser objective.


### Full-district frame profile and AO traversal pruning — 2026-09-25

Local Chromium measurements at 1440 × 1000 found a street median near 50 ms
and walking/worker-conversation medians near 33 ms. CPU call-path attribution
identified two full-scene AO visibility traversals, including hidden room
skeletons, costing roughly 5 ms per sampled frame. One pruned traversal now
handles custom foliage/glass exclusions and GTAO's line/point exclusions.
Already hidden branches are skipped; originally hidden flags and dynamically
added props retain correct behavior. Existing error-path restoration remains.

A new hidden-subtree regression failed before implementation and passes after.
The repeated local profile retains the same scene draw-call counts and shows a
street median near 33 ms. The p95 remains near 67 ms; this does not establish
smooth full-scene frame pacing. CPU profiling overhead and runtime variability
also limit the inference. No render resolution, geometry detail, AO quality or
resident activity was reduced.

All 331 unit tests and the build pass. A fresh directory run visits all 193
encounters, including 169 indoors and 62 workers across 22 role titles, without
uncaught browser errors. This is directory/visibility/reach coverage, not a
replacement for the separate pointer, touch and physical-interaction checks.
Evidence: `data/reports/browser-district-frame-profile.json` and reproducible
profile script `preview/e2e/district-frame-profile.js`.


### Ground-contact query throughput and live verification — 2026-09-25

The next CPU profile identified ground-surface queries as a hot path. The
triangle index now uses 2 m buckets and caches only the most recently queried
bucket per world. Every heel, toe and wheel query still evaluates exact rendered
triangles; no height quantization or approximate terrain plane was introduced.
Rebuilding a world replaces its cache, including empty-bucket results.

A reproducible coherent-probe benchmark using district terrain and generated
sidewalks improved from 72.7 ms to 14.9 ms for 345,600 queries, with identical
height checksums. Measured index heap increased from 3.5 MB to 8.0 MB and setup
from 11 ms to 21 ms. These are benchmark-local figures, not total application
memory or a frame-rate claim. The full-scene profile still has slow frames.
Run it with `node --expose-gc preview/e2e/ground-query-cost.mjs`.

All 332 tests pass, including rendered-triangle equivalence, cross-world query
isolation, boundary probes and rebuild invalidation. The final build passes.
Fourteen carriage checks pass, with parked/driven tyre contacts at rendered
paving and successful ride/dismount. A new live outdoor probe records 7,920 foot
samples across 22 visible residents; 5,501 stance contacts remain within 0.185 mm
of registered surface points. Actual ankles reach their adjusted IK targets to
within 0.001 mm.

The live diagnostic was corrected to use the heel/toe-adjusted IK target and a
3D surface-contact distance. At a sharp curb, a submillimeter lateral skinning
offset can place a vertical query over the lower road, producing a misleading
curb-height gap. Comparing the rendered sole point with the nearby valid surface
point retains the same 3 mm contact tolerance. Evidence:
`data/reports/browser-ground-query-cost.json` and
`preview/e2e/district-ground-contact.js`.

### Nearby encounters across rooms and elevations, September 25, 2026

The walking HUD previously limited its nearby list to three people before
checking reachability. Unavailable people could crowd out a valid encounter.
It now tests candidates in distance order and stops at the first valid one.
The action also tries all same-room candidates instead of stopping after six.
Nearby offers use the same 4.5 m vertical bound as direct conversation; actual
selection still requires the full 3D talking distance or a valid approach.

Both new regressions failed before the patch. All 334 unit tests and the build
now pass. The real Nearby button opens reachable, same-room conversations at
all 193 encounter locations: 24 outdoors and 169 indoors across 30 rooms.
Fifteen airborne pointer/keyboard checks also pass, including preserving flight
position and rejecting distant conversations. Both browser runs report no
uncaught errors. Evidence is in `data/reports/browser-nearby-encounters.json`;
the full location sweep is `preview/e2e/nearby-encounters.js`.

This closes the nearby-selection gap. It does not replace the remaining live
movement review, worker-role index, or full-scene frame-pacing acceptance.

### Worker occupations and conversation, September 25, 2026

Workers now explain their occupation through distinct work descriptions and
stories. Their return greetings retain the workplace and role, and their topic
buttons offer **About your work** and **A detail from your work**. Guests keep
the ordinary topics. The authored routines also enter the existing reaction
context. The role catalog describes fictional work and makes no real tenant
service promises.

All 62 rendered workers passed the live browser check across 22 occupations and
seven task families. Each worker was reachable, displayed the expected task,
answered both work topics, remembered a return visit, paused work during the
conversation, and resumed afterward. The guest check confirmed that worker
labels do not persist when selecting a dining guest. All 335 unit tests and
the build pass. The browser had no uncaught errors; the separate reaction
service returned 503 responses, so local fallback behavior was exercised.

Use the [worker role index](browser-worker-roles.md) and
`data/reports/browser-worker-roles.json` for the role-by-role evidence. This
completes the role/dialogue/task-assignment review. Overall movement realism
and full-scene frame pacing remain open.

### Hidden station transform cost, September 25, 2026

Hidden worker rooms now suspend the renderer's recursive transform updates as
well as their animation clocks. `SuspendedStationGroup` marks the room dirty
when its visibility or an ancestor's visibility hides it. The next visible
update refreshes the branch. Explicit world-position queries keep Three's
normal behavior. The change applies only to station groups whose animation
already suspends while hidden.

In the fixed worker fixture, hidden visits fell from 10,195 objects to 24 room
roots. All 2,078 visible objects still updated. The median transform-update
cost fell from 1.72 ms to 0.20 ms. A live district ABBA comparison measured
roughly 2.3 ms per frame before and 0.27 ms after for station updates. Draw
counts and triangle counts matched within each comparison pair. Overall frame
timing remained about 33 ms median and 67 ms at p95, so the full-scene pacing
requirement remains open.

All 194 station figures, including seated guests and mannequins, returned with
identical skeleton matrices, skinning palettes, and bind transforms after a
hidden interval. The Nearby control still passed at all 193 encounter locations.
All 338 tests and the build pass, including explicit hidden queries, moved
parents, asynchronous child attachment, and re-entry with cached local matrices.
Both browser regressions reported no uncaught errors. The measurements and
source hashes are in `data/reports/browser-station-transforms.json`.

### Offscreen planting submissions, September 25, 2026

Shrub and grass instances now use 12 m spatial batches instead of district-wide
bounds. Every plant retains its source geometry, material, placement, color, and
shadow behavior. Individual batches can be culled when they leave the view.

The live street comparison submitted 2,431,440 fewer triangles per main scene
pass, with 48 additional draw calls. An ABBA comparison within the same running
scene confirmed that tradeoff with all residents active, but did not establish
a frame-rate gain. The graphics backend is ANGLE Metal on an Apple M3 Max.
The added pass profiler separates scene, AO, bloom, and output work; its local
GPU timings remain diagnostic under the current desktop workload.

A fixed planting fixture produced identical pixels before and after spatial
partitioning. Unit coverage verifies that offscreen plants leave the submitted
set while all transforms, colors, materials, and shadow flags remain intact.
All 339 tests, the build, and 39 live moving-NPC interaction checks pass. Evidence
is in `data/reports/browser-planting-culling.json`. Full-scene pacing remains
open. The headless acceptance tab is parked on a blank page between runs to
avoid leaving a second district rendering alongside the dev window.

### Three.js arm articulation, September 25, 2026

Walking now uses two authored quaternion clips through Three.js `AnimationMixer`:
shoulder swing and elbow/wrist follow-through. Clip sampling follows the actual
leg placement, with a short forearm delay at shoulder reversals. The new flex
blends in during walking and settles on stopping. Carrying reduces motion on
the loaded side. Reduced motion suppresses the added articulation, and flight
and carriage riding release it. Mixers dispose with their avatars.

The mixer writes to a separate pose buffer before layering onto the rig. This
preserves repeated held poses when the avatar resets its bones each frame and
keeps the existing foot solver, gestures, gaze, and station hand contacts under
their current owners. These are authored procedural clips; no motion-capture
assets or additional dependencies were added. See the
[Three.js animation API](https://threejs.org/docs/pages/AnimationMixer.html).

All 340 tests and the build pass. The browser motion sweep covers all seven rigs
on flat ground, waves, and a ramp at 30, 60, and 120 Hz: 63 combinations. Arm/leg
opposition stays coordinated, added elbow flex ranges from about 3.6 to 12.4
degrees, and the forearm pose settles within 0.001 degrees of rest. Twelve
rendered poses were reviewed across Jevica and two pedestrian models, including
walking and stopped states. This verifies the added upper-body articulation;
overall movement realism and full-scene frame pacing remain open. Evidence is
in `data/reports/browser-three-gait.json`.

### Force telekinesis, September 25, 2026

Jevica can target nearby people and the 15 existing street bins through the
Force panel or by clicking their rendered models. Keyboard and touch controls
lift, hold, push, and lower targets. The lift uses damped acceleration; push
impulse depends on mass. Small collision substeps check buildings, street
fixtures, other bodies, and the carriage. Landing uses rendered ground heights.
Moved bins participate in visitor collision and pedestrian passing behavior.
No street fixtures move until the player acts on them.

Outdoor people pause their routes during a hold and replan from the landing
position. Indoor people lift in place, preserving their work poses and carried
props; their task clocks pause until landing. The elevation is shared with
conversation reach checks. Wishes cannot be granted during a Force hold.
Jevica reaches with her free hand and retains the wand in her other hand.

All 347 tests and the build pass. The browser acceptance exercises rendered
person lift, person push, bin lift and push, worker pause/resume, pointer
targeting, keyboard release, and touch controls. These bodies stay upright;
ragdolls, destructible scenery, and general manipulation of arbitrary scene
meshes are outside this implementation. Controls and limits are documented in
[character forms](character-forms.md#force-telekinesis). Evidence is in
`data/reports/browser-force.json`.

### Browser carrying and motion polish, September 25, 2026

Held outdoor targets now follow Jevica's walking and turning with their pickup
offset preserved. Horizontal motion has mass-aware damping, bounded acceleration
and speed, and collision substeps that slide along free axes. Lowering releases
the follow target; people resume navigation after landing and bins remain at
their new positions. Indoor workers still lift in place.

Jevica faces the held target when moving backwards or sideways. Directional foot
placement uses travel direction to start steps, while the casting arm and wand
arm blend out most walking swing. Releasing restores ordinary gait. The camera
returns smoothly after an obstacle clears, with immediate collision retraction.

A single reusable Points pool emits pink, pearl and champagne sparkles from the
wand's animated tip and around the lifted target. Emission continues while
carrying and softens during lowering. Released particles expire; changing worlds
clears the effect. Reduced motion uses ten stationary glimmers instead of travel
or twinkle. The normal pool is capped at 256 particles.

The UI pass covers the rail, People/Places/Settings navigation, conversation and
wish actions, character and spell cards, movement controls, and theme changes.

| Severity | Location | Before | After | Why |
| --- | --- | --- | --- | --- |
| High | `player-avatar.js`, `force-controls.js` | Pointer action buttons could retain keyboard movement focus | Pointer actions return focus to the canvas; keyboard action focus remains reachable | Input continues without an extra scene click |
| High | `ui-motion.css` | Opening visibility could delay focus by one animation frame | Visibility changes immediately on open; only closing is delayed | Keyboard navigation works throughout the visual transition |
| Medium | `force.css`, `ui-motion.css` | Active phone spell controls covered more of the scene and competed with the movement pad | Compact hold card, bounded scrolling and space above the open pad | Touch movement and release stay reachable |
| Medium | `force-controls.js` | Empty target list could appear blank after reset | Explicit no-target option and disabled casting | Clear unavailable state |
| Medium | `ui-motion.css`, `theme.js` | Inconsistent press feedback and abrupt panel changes | Shared 120 ms presses, interruptible 180 ms panel motion, immediate theme changes | Consistent feedback without delaying keyboard input |

Photoreal assets, full ragdolls, facial animation, physical cloth and a stable
full-district frame rate remain separate quality targets. This pass does not
establish AAA-level visual fidelity. Human screen-reader acceptance and a manual
10%-speed Animations-panel review were not performed.

Validation: all 356 tests and the production build pass. Browser acceptance
passes 132 assertions covering carrying, UI focus and motion, touch/reduced
motion, NPC interaction, carriage regression and the rendered Jevica casting
gait. The three directional casting runs retain planted targets without slip
and keep foot IK error below 0.005 m. Screenshots were reviewed for the wand
stream, target sparkles, mobile controls and casting poses. The existing Three.js
bundle-size warning remains. Evidence: `data/reports/browser-lift-polish.json`.

### Jewelry render cost, September 25, 2026

The crown and earring crystals were requesting a refraction texture even when
each gem occupied only a few pixels. That texture required another render of
the opaque district, including millions of tree-leaf triangles. Refraction now
fades in as the largest individual jewel spans 8–16 CSS pixels. Close views
retain the original optics; facets, reflection, clearcoat and all geometry
remain intact at every distance. Foliage and environment layout are unchanged.

Paired baseline/adaptive/adaptive/baseline runs at 1440×1000 CSS pixels, with
normal and Retina density, removed at least 7,026,502 triangle submissions and
619 draw calls from the main render pass. The fixed scene dropped from
22.24 million to 15.22 million triangles, about 32%. Mean CPU time in that pass
fell by about 2.0 ms at normal density and 2.4 ms at Retina density. Frame times
still varied: these local Chromium runs do not establish a locked frame rate.

The fixed portrait is pixel-identical to the original optics. In the full-body
studio view, 84 of 900,000 pixels change, with all geometry preserved. All 357
tests and the production build pass. Browser acceptance passes 89 assertions
covering image comparisons, both display densities, telekinetic carrying, NPC
interaction and carriage riding. The existing Three.js bundle-size warning
remains. Evidence: `data/reports/browser-jewel-optics.json`. Sustained frame
pacing, first-use shader latency and overall photorealism remain open.

### Conversation body language, September 25, 2026

Outdoor speaking poses previously used a continuous sine-wave head bob. Indoor
staff did not receive the current speaking identity. Both now use short nods,
slight lateral tilt and quiet pauses. Each person's identity seeds a separate
cadence; listening responses are smaller and less frequent. Damped transitions
preserve motion when speech starts, stops or is interrupted. Culling suspends
the optional motion clock, and reduced motion suppresses the added nods.

The speaking identity now reaches the indoor renderer from actual audio
playback. Head motion layers onto conversation gaze without changing the feet,
worker hand constraints or work clock. Closing a conversation still resumes the
existing task. Chest breathing remains; continuous head oscillation is removed.

Rendered checks cover all seven character models, the seven worker task
families, and seated people. Feet show no measured drift, worker contact error
stays below 0.000001 m, and head poses remain continuous through each nod. A
separate district check exercises real HTMLAudio playback, mute and close using
a generated silent WAV response; it verifies state wiring rather than voice
synthesis quality. Rest/nod/pause portrait strips were reviewed for two rigs.

At this stage, the source assets contained no facial joints or morph targets.
Lip sync, blinks, expressive eye motion and facial animation remained open, alongside overall
photorealism and sustained frame pacing. This pass does not establish
hyperrealistic or motion-captured performance. Evidence and validation results
are recorded in `data/reports/browser-conversation-motion.json`.

Validation: all 360 tests and the production build pass. Browser checks pass 105
assertions across rig motion, speech controls, NPC interaction and telekinetic
carrying, plus the existing gaze/support sweep across 14 indoor and six outdoor
cases. The existing Three.js chunk-size warning remains. Dev stays on port 5181.

### Eyelid animation, September 25, 2026

All seven browser character models now include left and right eyelid shape
keys. Skin, Jevica's eyebrows and lashes, and the affected resident hair roots
share each character's blink timing. Eyes close quickly, hold briefly and reopen
more slowly, with independently seeded pauses between blinks. Reduced motion
keeps the eyes open. Hidden rooms suspend the facial clock; telekinetically held
workers continue blinking while their task and work clock remain paused.

The shapes use Mika Suominen's CC0
[MakeHuman Faceunits 01](https://static.makehumancommunity.org/assets/assetpacks/faceunits01.html)
pack. Its archive and extracted eyelid files are verified before export. The
builder generates isolated candidates; a separate merge appends sparse facial
data to the original GLBs. It verifies exact geometric vertices, skin bindings
and triangle topology, including Jevica's different subdivision vertex splits.
Every byte of the original binary payload remains intact, preserving skin,
clothes, proportions, textures and existing animation bindings. Asset receipts
record the original and current hashes and the facial source.

Browser comparisons show pixel-identical neutral portraits for all seven models.
Geometry probes see the eye surfaces when open and eyelid skin when closed on
both sides. Jevica's lash shapes follow the lids. Open/closing/closed portraits
were reviewed. The added facial data totals 1,112,916 bytes across all seven
models. No scanned likenesses or new dependencies were added.

This is the first facial animation layer. Lip synchronization, expressive eye
tracking, broader facial expression and photorealistic performance remain open.
Evidence is in `data/reports/browser-facial-motion.json`.

Validation: all 368 tests, 126 browser assertions and the production build pass.
The browser checks cover eyelid geometry, live and held-worker blinking, reduced
motion, speech controls, NPC interaction, telekinetic carrying, carriage riding
and the casting gait. Local median frame intervals were 16.7 ms; the 95th
percentile was 33.4 ms in all three runs with CPU profiling enabled. These are
observations, not a sustained frame-rate guarantee. The existing Three.js
chunk-size warning remains. Dev stays on port 5181.

### Conversational eye tracking, September 25, 2026

The six resident models and Jevica previously moved their eye surfaces only with
the head. Each instance now has two eye pivots. The existing partial globe meshes
remain intact, with a pivot fitted to each globe's widest ring. The runtime owns
the added bones, eye skin bindings and geometry copies; cached models, source
GLBs and skin/clothing data remain unchanged. Neutral portrait comparisons are
pixel-identical for all seven models.

Conversation targets are transformed into each eye's current head frame. The
eyes acquire a target faster than the head turns and compensate for conversational
nods, with separate origins allowing convergence at nearby distances. Rotation
is limited to 0.3 radians horizontally and 0.18 vertically. Targets behind the
head or within 0.25 m release eye contact instead of rolling the eyes backward or
forcing extreme convergence. Closing a conversation eases the eyes toward rest.
Reduced motion retains purposeful tracking; optional blinking stays suppressed.

Indoor workers retain bounded eye tracking toward Jevica while lifted, including
after the conversation closes, without advancing their work clock. Outdoor
residents track conversation targets, and Jevica's existing spell target now
also drives her eyes. Normal Jevica conversation attention is not wired in this
pass; eye tracking does not yet include expressive scanning or saccades.

Rendered acceptance measures eye contact during nods across all seven rigs,
the worker task families and seated people. Eye and head continuity are measured
separately: their simultaneous motion adds in world space. Angular limits apply
when a frozen worker pose puts the target outside the available eye range.
These checks establish bounded tracking and stable support, not hyperrealistic
facial acting. Lip synchronization, expressive facial performance, improved
character materials and sustained frame pacing remain open.

Evidence: `data/reports/browser-eye-tracking.json`.

Validation: all 372 tests, 145 browser assertions and the production build pass.
Coverage includes neutral images, eye tracking, blinking, reduced motion, speech
controls, NPC interaction, telekinesis, carriage riding and casting. Local RAF
measurements show a 16.7 ms median and 33.4–50 ms at the 95th percentile with CPU
profiling enabled; they do not establish sustained 60 FPS. The existing Three.js
chunk-size warning remains. Dev stays on port 5181.

### Reciprocal player attention, September 26, 2026

Jevica now looks toward the active conversation partner, including seated people
and targets elevated by wishes or telekinesis. The target uses the same encounter
position and eye-height data as interaction reach. Her eyes compensate for head
movement, and conversation enables the subtler listening nods already used by
residents.

When standing on foot, she gradually turns her body toward the speaker, with
turn velocity eased in and capped at 1.4 radians per second. Her existing
standing-step solver repositions the feet. Closing a conversation releases eye
contact and decelerates an unfinished body turn. Walking retains control of body
facing. Flying and carriage riding retain their existing body orientation; head
and eye attention remains bounded. A partner outside that range is not followed
by twisting the seated body. Spell targeting takes priority over conversation.
The camera and navigation position are not changed by attention.

Rendered motion checks show planted targets without slip and negligible foot
IK error. Live checks cover outdoor and indoor conversation, reduced motion,
release and seated interaction. The turn-speed measurement uses animation-frame
timestamps; delayed callback execution time can incorrectly inflate measured
speed during shader compilation.

This completes the conversation target connection for Jevica. Lip synchronization,
expressive scanning and facial acting, material realism, cloth and sustained
frame pacing remain open. Evidence: `data/reports/browser-player-attention.json`.

Validation: all 376 tests, 124 browser assertions and the production build pass.
Coverage includes reciprocal attention, reduced motion, conversation release,
manual movement after dialogue, carriage conversation, foot support, blinking,
NPC interaction, speech controls, telekinesis, carriage riding and casting.
Local profiled RAF intervals have a 16.7 ms median and 50–66.7 ms at the 95th
percentile; sustained frame pacing remains open. The existing Three.js chunk-size
warning remains. Dev stays on port 5181.

### Shared character skeletons, September 26, 2026

Three.js's skeleton-cloning helper creates a separate skeleton for each skinned
mesh, including meshes that use the same cloned bones and inverse bind matrices.
Each avatar now shares exact matches within its own model. Different bone objects
or any different inverse bind matrix keep a separate skeleton. Mesh geometry,
materials and bind transforms are not rewritten. Duplicate skeleton resources
are retired once; character instances keep independent animated bones. The eye
controller retains its separate two-bone skeleton.

All seven character models preserve every tested posed vertex exactly, and all
seven browser portraits remain pixel-identical. The loaded district's 1,097
skinned meshes now reference 438 skeleton objects, including the separate eye rigs.
The paired browser benchmark reconstructs the original per-mesh duplication,
then alternates duplicate/shared/shared/duplicate runs at normal and Retina
density. In the matched initial scene, main-pass skeleton updates fall from 241
to 95, bone-matrix updates from 10,376 to 2,638, and texture uploads from 124 to 49.
Draw calls and triangle submissions remain identical in that scene.

Average instrumented main-pass CPU time falls by about 0.6 ms at both densities.
The timing samples still have slow frames and are not evidence of sustained
60 FPS. The measured reductions in skeleton work and uploads are the direct
result; material, cloth, facial-performance and wider frame-pacing work remains
open. Evidence: `data/reports/browser-avatar-skeletons.json`.

Validation: all 380 tests, 181 browser assertions and the production build pass.
Coverage includes all seven rigs, eye tracking, blinking, conversation motion,
Jevica attention, NPC interaction, telekinesis, carriage riding and casting.
The separate district profile has a 16.7 ms median and 33.4–50 ms at the 95th
percentile; it remains an observational measurement. The existing Three.js
chunk-size warning remains. Dev stays on port 5181.

### Speech-shape foundation, September 26, 2026

All seven browser character profiles now have isolated speech candidates with
fifteen MakeHuman Visemes 02 shapes, fitted teeth and a tongue. The build verifies
the CC0 target archive and transfers offsets to affected accessories. The merge
retains the shipped binary payload, geometric topology, UV seams, skin weights,
existing blink accessors and mesh/node weights. Oral geometry reuses the original
skeleton after hierarchy, transform and inverse-bind checks. Separate output paths
prevent the build commands from replacing their inputs.

Twenty-two browser assertions pass. All seven neutral faces and existing
accessories remain pixel-identical when oral meshes are hidden. Visible teeth
change 15–39 of 252,000 portrait pixels. Contact sheets for every profile were
reviewed across all fifteen shapes. These checks establish compatible geometry;
they do not establish natural articulation at speech speed.

The candidates add 19,516,888 bytes across the seven models. Jevica's candidate
is 12,403,512 bytes, close to the 12 MiB per-character limit. In the initial
1440×1000 district view, exposing oral meshes on all visible figures raises
main-pass draw calls from 1,063 to 1,157 and triangle submissions from 15,215,457
to 15,571,153. Hiding those meshes restores the original counts. Both variants
have a 16.7 ms median and about 33.3 ms at the 95th percentile in this local
sample. The sample is observational and does not establish a sustained frame
rate. Speech geometry should load where needed, with inactive mouths culled.

An isolated Kokoro 0.6.1 prototype also verified an official model that exposes
phoneme durations. Two voices generated 4.03 and 4.73 seconds of audio in about
2.58 seconds each, with 63 ordered phoneme timings per line, all within the audio
bounds. The model checksum matches the official release asset digest. This Mac
needed explicit Homebrew eSpeak library and data paths; the bundled library
initially attempted to read a missing build-machine path.

The live game still uses the existing assets and voice service. Playback timing,
shape transitions, cancellation/replay, reduced motion and conversation-context
acceptance remain to be integrated and verified. No Unreal editor work was done.
Evidence: `data/reports/browser-speech-shapes.json`. All 385 tests, the production
build and the changed Python scripts' Ruff checks pass. The existing Three.js
chunk-size warning remains. Dev stays on port 5181.

### Live phoneme-driven speech, September 26, 2026

Kokoro speech now animates residents' mouths using the model's phoneme timings
and the actual audio playback clock. Adjacent shapes overlap through short
anticipation and release windows. The optional voice dependency is pinned to
Kokoro ONNX 0.6.1 and a verified duration-capable model. Timing metadata travels
in an optional RIFF chunk inside the WAV; ordinary WAV playback remains valid.
The browser ignores missing or invalid timing metadata and keeps untimed/device
speech neutral. The server validates timing order, duration and payload bounds
before caching a response.

Speech geometry loads only when a voiced conversation needs its profile. The
active figure receives relative mouth targets and oral meshes on its existing
skeleton. Blink controls, original materials, styling and body geometry are
preserved. Playback completion or cancellation closes the mouth over 120 ms and
restores the original geometry. Blur and hidden-page suspension dispose of the
temporary binding immediately. Late preparation cannot attach a cancelled face.
Oral visibility follows body visibility after wish effects update, preventing
floating teeth during invisibility. The seven speech variants and source receipts
are bundled separately under `preview/public/assets/characters/speech/`.

All seven rigs were checked with real HTMLAudio playback of a locally generated
timed WAV, including reduced motion and restoration after completion. The live
district check uses the actual local synthesis service and covers an outdoor
resident, serving and tablet work, a seated resident, a lifted worker,
invisibility, replay, mute, close and reduced motion. No speech variants download
at district startup. Existing interaction, gaze, blink, carriage, casting and
untimed-speech checks remain green.

On this Mac, the bundled eSpeak dylib exits while trying to read its build-machine
data directory. The service now selects the installed system eSpeak library on
macOS and reports unavailability before native initialization if none is found.
The documented setup includes that prerequisite and refreshing the larger pinned
model. The updated loopback service is running on port 8765; browser dev remains
on port 5181.

Validation: 393 browser-domain tests, 107 Python tests, 212 browser assertions,
Ruff and the production build pass. The existing Three.js chunk warning remains.
Evidence: `data/reports/browser-live-speech.json`. This establishes functional lip
synchronization in local Chromium. Human audiovisual assessment, broader facial
acting, skin/material realism, cloth and sustained target-hardware frame pacing
remain open; this is not a claim of completed hyperrealism.

### Gown contact sampling cost, September 26, 2026

Jevica's gown contact pass now computes each bone transform once per pose,
instead of once per weighted vertex. A private CPU cache preserves the
renderer-owned skeleton data. Sampling still reads current geometry, bind
transforms and morph influences, including temporary speech geometry.

Paired reference/cached/cached/reference browser runs measure median costume
updates of 3.7/2.3/2.2/3.6 ms, about a 38% reduction. Eight sampled poses per run
cover walking, turning, casting and stopping. Every gown vertex matches the
Three.js reference exactly, and rendered pixel hashes match across all runs.
These are fixture CPU timings, not sustained district frame-rate acceptance.

The 54 clearance poses at 30, 60 and 120 Hz still pass, with minimum sampled
leg clearance of 17.8 mm and arm clearance of 28.6 mm. Moving spellcasting,
telekinetic carrying, carriage riding and UI motion regressions pass. Validation:
395 JavaScript tests, 88 browser assertions, the clearance poses and the
production build. The existing Three.js bundle-size warning remains.
Evidence: `data/reports/browser-gown-sampling.json`. Dev remains on port 5181.
Broader material, cloth and motion-realism acceptance remains open.

### Jevica waist seam, September 26, 2026

Close-up review exposed bare skin between the bodice and skirt. The skirt's
contact fitting stopped below the waist, leaving about 2 mm of skin protrusion
in standing and moving poses. The independent seated fold bypassed fitting and
allowed about 7.3 mm of protrusion at the back of the waist.

The skirt now fits through the waist with a 6 mm target clearance beneath the
bodice. Seated fitting uses the folded skirt's own radial profile and 5 mm
vertical cells; the standing skirt's wider cells missed the compressed fold.
The folded geometry and profile are prepared once, and boarding or dismounting
resets the fitting field. The leg-clearance margin remains unchanged.

All 73 waist poses pass, including rest, walking, turns, moving spellcasting,
stopping, bubble flight, landing, inclined carriage seating, repeated boarding
and dismounting, and reduced motion. Minimum sampled waist clearance is 4.4 mm.
The existing 54 leg/arm poses retain at least 17.8 mm and 28.8 mm clearance,
respectively. Close-up front/back renders confirm the covered waist seam.

Validation: 395 JavaScript tests, 58 browser assertions, both clearance
sequences and the production build pass. Cached sampling still matches the
reference gown vertices and rendered pixel hashes; the expanded fit measures
2.7 ms median costume CPU time versus 4.2–4.3 ms without caching. This is a
fixture measurement, not sustained district FPS. The existing Three.js chunk
warning remains. Evidence: `data/reports/browser-jevica-waist.json`.

The casting close-up also shows a separate small skin intersection near the
back of the right shoulder/bodice. That asset defect remains open, alongside
the broader material, physical cloth and full-scene motion acceptance. No
Unreal work was performed; browser dev remains on port 5181.

### Jevica visible shoulder fit, September 26, 2026

The casting close-up exposed skin in front of the shoulder fabric. The source
bodice had been smoothed through parts of the underlying body while retaining
its earlier skin weights. At costume creation, an owned geometry now fits
points needing clearance to nearby body triangles and inherits their blended,
normalized weights. The target is 6 mm in bind space. Cached assets, the skin
mesh, garment topology and volume away from the contact region stay intact.
This fitting runs once, not in the animation loop.

The reference comparison reproduces exposed skin at four of five sampled view
rays, with up to 2.8 mm protrusion. The corrected fabric covers all five. The
same body patches and their mirrored counterparts remain covered through 36
walking, casting, release, flight, landing and resting poses at 30, 60 and
120 Hz. Their minimum view-ray clearance is 7.9 mm. Before/after close-ups
confirm that the visible shoulder patch is gone.

This is a bounded appearance correction. The independent, wider posed-surface
probe still detects underarm intersections. A general projection experiment
distorted the tight arm/torso fold and was discarded; it is not in the runtime.
The source-pose test and visible shoulder coverage do not establish complete
clothing collision. The underarm geometry/weighting still needs work.

Validation: 396 JavaScript tests, 86 browser assertions, the reference comparison,
73 waist poses, 54 leg/arm poses and the production build pass. Moving casting,
telekinetic carrying and carriage regressions remain green. The existing
Three.js chunk warning remains. Evidence: `data/reports/browser-bodice-fit.json`.
Browser dev remains on port 5181; no Unreal work was performed.

### Curb contact and walking query cost, September 26, 2026

The live district sweep found a planted sole about 9 mm above its valid ground
contact. The foot solver needed 21 cm of pelvis adjustment while its fixed
limit allowed 18 cm: the leading foot had reached the road while the navigation
root remained on the sidewalk. The limit now accounts for the terrain descent
beneath the leading or planned landing foot, bounded to 20 cm of additional
allowance. The requested adjustment is bounded before release smoothing.

The corrected live sweep samples 7,920 feet across 180 frames and 22 visible
outdoor residents. Its largest planted support gap is 0.19 mm; ankle error is
below 0.001 mm. Existing contact thresholds were retained. A regression covers
seven production rigs, four curb positions relative to the gait and 30, 60 and
120 Hz, while checking that the pelvis remains above the upper ground surface.

The occupancy check also stops recomputing the same ground height for every
placed object. An isolated ABBA benchmark of 28,800 district queries with 16
obstacles drops from 170–179 ms to 32–33 ms, with identical occupancy, object
checks and height checksums. Heights remain fresh between queries. Live frame
profiles were variable and do not establish an FPS improvement.

Validation: 398 JavaScript tests, 193 resident visits, 62 workers across 22 roles,
78 pointer/telekinesis/carriage assertions, 63 body-motion cases and the build
pass. The existing Three.js chunk warning remains. Evidence and source hashes:
`data/reports/browser-curb-contact.json`.

Foot contact is not full curb-motion acceptance. The separate diagnostic
`node preview/e2e/curb-body-motion.mjs` still finds abrupt body-height changes
on sharp 16 cm edges: its largest single-frame drop is about 15.8 cm at 120 Hz.
Navigation-root height transfer and changing shoe support need correction next.
The diagnostic is recorded as an open defect, not a passing realism gate.
Deeper underarm intersections, material realism and sustained frame pacing also
remain open. Browser dev stays on port 5181; no Unreal work was performed.

### Curb body-height transfer, September 26, 2026

The navigation root correctly jumps from sidewalk height to road height, but
the rendered body previously inherited that jump immediately. It also retained
the pelvis adjustment computed on the upper surface, producing a deep crouch.
Abrupt elevation changes now add a decaying world-space body offset. Continuous
slopes follow navigation directly, and relocation clears the offset. Foot
targets still use the exact ground; the temporary body offset does not consume
the leg's existing compression allowance.

The paired production-rig comparison at 60 Hz reduces the largest body-height
change at that handoff from 15.4 cm to 2.3 cm per frame. Across 84 browser curb
cases, handoff speed stays below 1.59 m/s and actual ankle error stays below
0.001 mm. The rendered workwear comparison shows the removed deep crouch at
the same foot placement. Smoothing every terrain change initially regressed
uneven-ground motion; the final correction applies only to abrupt jumps, and
the existing flat, wave and ramp checks pass unchanged.

Validation: 399 JavaScript tests, 168 ascending/descending unit curb cases,
relocation reset, 84 browser curb cases, 63 body-motion cases, live district
ground contact and 78 interaction/telekinesis/carriage assertions pass. The build
passes with its existing Three.js chunk warning. Evidence and eight rendered
reference/corrected frames: `data/reports/browser-curb-height-transfer.json`.

The full curb stride still needs work. The diagnostic isolates a separate
landing discontinuity before the navigation root crosses the edge: one leading
ankle drops about 4.8 cm between its final swing frame and contact, forcing a
roughly 4.7 cm body drop. Production animations show a corresponding remaining
whole-stride peak of 5.23 m/s. Correct the shoe support transition at landing
next; the successful navigation-height handoff is not full realism acceptance.
Deeper underarm intersections, materials and sustained frame pacing remain
open. Browser dev stays on port 5181; no Unreal work was performed.


### Glass impacts, cabin seating and the coachman, September 26, 2026

Thrown bins now break the actual facade or door pane they hit. The bin spends
its horizontal impulse at impact and falls outside any solid display backing.
The pane's exact transform restores after 20 seconds of simulation time. Static
panes remain instanced; moving door leaves use their current world transforms.
Fragments share a 192-triangle pool, check each vertex against the ground and
fade out within four seconds. Slow props cannot pass through intact glass.

The coach is 10% smaller, including its collision footprint and rotating tread
samples. Jevica sits inside, with both shoes solved against the cabin floor on
flat and tilted coaches. Decorative wheel centers have independent bearing
inertia and coast after braking; reduced motion retains ordinary wheel rolling.

Prince Jev (formerly the coachman Jules) is an additional fictional character:
a prince in a navy dress uniform who drives from the front bench and, in
companion mode, walks with Jevica under Jev's control. His stable encounter identity follows the carriage. Directory,
mesh-click and seated conversations all pass in the real browser. Outdoor
conversation rays now test the actual eye height against placed objects, so the
front bench blocks walking without hiding the driver above it. He stays at his
job and is excluded from pedestrian routing and volunteer assignment. The
existing 24 pedestrians retain their full sidewalk and three-minute crowd tests.
His reins rest on the bench while he walks. Force handling and wish visuals
still need integration.

The curb touchdown correction also preserves the swing endpoint when progress
reaches one. Updating that endpoint on the landing frame had shifted it five
millimetres across a curb edge, producing a 4.8 cm ankle drop in the diagnosed
case. The 84-case synthetic whole-body diagnostic now peaks at 1.61 m/s, down
from 5.60 m/s. Another ankle landing discontinuity still reaches 3.23 m/s;
these results do not establish seamless gait for every landing.

Validation: all 411 JavaScript tests and the production build pass. Browser
coverage includes 10 glass assertions, 25 Force regression assertions, 17 coach
assertions, five driver assertions and four seated-conversation assertions.
The driver and updated cabin were visually inspected. Reports:
`data/reports/browser-glass-and-coach.json` and
`data/reports/browser-curb-touchdown.json`.

The unicorn team, carriage autopilot, manual/Jev hydraulics, stronger push-away,
library-based dance spell, smoke grenade, masked staff, evacuation and skippable
exit cutscene remain open in `browser-effects-delivery.md`. Comprehensive scene
performance, clothing and movement realism also remain unfinished. Browser dev
and the decision bridge return HTTP 200 on ports 5181 and 8765. No Unreal work,
commit, push or merge was performed.
