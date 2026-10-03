# Playable character forms

**Jevica belongs to the approved waitlist administrator account**
(`user_01M40Y914S1H4EJCEHH91DKTAY` in Staging; `user_01M402HKJYDTH1QJM5NAQDZ4HH` in Production). Other accounts start as Sable and cannot
select either Jevica form in single player or multiplayer. Only that account
can call Jev and her vehicle in multiplayer. Players can choose the seven other
characters, and every character comes in a humanoid and a beast form; see
[characters, styles and forms](#characters-styles-and-forms). The Witch and Alien forms were removed
on September 23, 2026, together with their portraits, costumes, broom and personal
UFO. Her bubble flight, celebrity reactions, camera controls and magic remain.
Residents are humans with six coordinated fashion palettes; see
[world direction](world-direction.md). Alien enemies belong to the separate
invasion scenario.

## Characters, styles and forms

The character picker chooses a person, then a style when that person has more
than one, then a form. Every style comes in a humanoid form and a beast form, so
each person, style and form names exactly one look.

| Character | Styles | Beast form |
|---|---|---|
| Jevica, rose enchantress | Rose silk | White fox |
| Sable, fox charmer | Ivory city dress | Fox |
| Rowan, wolf wanderer | Field jacket | Wolf |
| Vesper, velvet confidante | Wine velvet | Panther |
| Aurel, midnight host | Black brocade | Wolf |
| Lyra, lynx muse | Sunlit daywear | Lynx |
| Kai, starlight maker | Celestial formal, explorer casual, starlit noir | Snow leopard |
| Silvan, forest aristocrat | Masculine, feminine | Deer: a stag or a doe |

Changing person keeps the current form, and keeps the style when the new person
has it. `preview/src/shared-appearances.js` lists the characters and derives each
look's label and role. Devices, accounts and town checkpoints store appearance
IDs, so every ID that existed before forms keeps its meaning: `woman-casual` is
still Sable's fox and `man-tailored` is still the human Aurel. New looks have new
IDs, such as `sable-human` and `kai-noir-beast`.

The wolf-eared Aurel (`midnight-host-hybrid`) was removed on October 2, 2026. A
device, account or checkpoint that saved him loads his wolf form instead, and the
town stores the replacement ID.

A beast form wears the same clothes as its humanoid form. It replaces the head
with a sculpted animal head from `preview/src/animal-face.js`, furs the skin and
adds a tail. Sable's fox keeps her bespoke look in `sable-look.js`. Looks without
reference art show a studio portrait captured from the 3D model.

### Beast movement

A beast form can also move like its animal. Turn it on with **Beast movement** in
the character controls, or press **P** (prowl) while the scene has focus.
Humanoid forms walk upright and don't offer it.

- **Standing:** the character settles into a low crouch, arms held ready and
  tail lifted.
- **Walking:** the chest leans forward over bent knees in a prowl.
- **Running:** the gait opens into a lope with longer strides, a rise through
  each step, and the tail streaming behind and swinging against turns.

The posture eases in and out over a fraction of a second, and the legs keep their
planted-foot solve. Flying and riding keep their usual poses. Beast movement
changes how the body moves, not how fast: walking and running speeds stay the
same, inside the shared town's movement limit.

In solo play the choice is stored on the device. In the shared town it belongs to
the account, like the appearance. The town remembers it, applies it only while
the account wears a beast form, and peers see the posture on the remote avatar.
The client sends the `movement` command with `upright` or `beast`. A town server
from before beast movement answers `invalid_command`, and the client reports that
the town doesn't support beast movement yet. Quick person, style and form clicks
reach the town as one change, sent as soon as its two-second appearance cooldown
allows.

To verify, run `node --test preview/tests/beast-forms.test.js
preview/tests/romance-look.test.js preview/tests/foot-placement.test.js`,
`npm run test:server`, `npm run test:experience -- player-forms beast-movement`
and `npm run test:shared -- required`.

## Reference direction

The reference direction retains adult proportions and animated rigs. The supplied
September 23 pink-gown image supersedes the earlier statue styling for Jevica:

- Jevica: a single flowing rose-pink ballgown, fitted bodice, gold floral
  embroidery at the neckline and hem, an open gold crown, warm blonde hair,
  and a luminous pink-white star wand. The district layout stays intact.
The references are visual inputs, not shipped textures or purchased statue
meshes. The existing local character assets retain their source receipts.
The costume uses procedural geometry. Jevica and all six resident rigs have
independently timed eyelid animation, with skin, brows and lashes moving together
where applicable. Their eyes also track nearby targets independently of the
head: residents follow conversations, and Jevica follows conversation and spell
targets. While standing, she gradually steps around to face her conversation
partner; a spell target takes priority. Dialogue retains its movement pause,
and walking resumes after it closes. Seated and airborne body poses are retained.
Reduced motion keeps the eyes open while retaining this tracking. Photoreal skin, expressive
facial animation, lip synchronization and physically simulated cloth remain
quality targets.

Jevica's September 22 refinement gives her a softer oval face, less angular
jaw, subtle cheek and lip shaping, warm brown brows, refined shoulder and neck
proportions, and gently waved blonde hair. These are authored changes to her
dedicated mesh and materials. This refinement preserved the six resident meshes. Her
rose gown, crown, wand, and bubble flight are retained, and the character portrait
is regenerated from the updated model. The single skirt now adjusts around her
animated lower body, expanding with a step and relaxing as she stops. This
pose-driven clearance preserves the skin and walking animation; it is not a
physical cloth simulation.

The September 23 refinement adds a subtle bust adjustment, narrower shoulders,
closer resting arms, and a sewn bodice envelope that bridges skin concavities.
Gold scrollwork is an original procedural texture with separate silk and metal
roughness. Arm swing follows actual foot placement in opposite phase, with a
smaller amplitude for Jevica; her upright gait and bubble flight remain intact.

`scripts/build_jevica.py` applies the shape targets before fitting the rig,
eyes, brows, hair, and bodice. `jevica.sources.json` records the macro values,
detail targets, asset size, and hash so you can reproduce the appearance.

## Controls and rendering

Third person is the default. **V** switches cameras. **B** takes off or lands,
**Space** rises and **C** lowers altitude. **P** turns beast movement on or off
in a beast form. Jevica flies in a bubble. Character controls also expose these
actions, with a collapsed mobile panel and portraits of the actual models.

Accessories following the same bone are batched by material. In the same studio
fixture, the original static batching pass reduced Jevica from 175 to 41 render
calls, including the fixture's passes. Jevica's
deforming skirt remains separate; her rigid accessories still batch.
These historical fixture measurements do not establish current district FPS.
Jevica's crown and earring crystals retain their facets, reflection and clearcoat
at every distance. Refraction fades in as the largest jewel spans 8–16 CSS
pixels, keeping full optics in close views without a second opaque-scene render
for tiny gems at street distance. The threshold is consistent across display
densities. See `data/reports/browser-jewel-optics.json` for the paired browser
measurements and fixed-image comparison.
Alien anatomy and filtered head geometry use shared caches; per-person
identities, skeletons and material instances remain independent.

## Force telekinesis

Open **Force · telekinesis** or press **T** while the scene has focus. Choose a
nearby target from the list, or click a person or street bin while Force mode is
enabled. **G** lifts and holds, **R** pushes, and **X** or **Escape** lowers the
target. The same actions have touch buttons. Acquisition requires a visible
target in the same space within eight metres. One target can be held at a time.

Outdoor people and the district's 15 street bins can be lifted, carried and pushed.
Walk with **WASD** or the touch pad while holding a target; drag or use the arrow
keys to turn the hold. The pickup offset is preserved, with damped following
and bounded acceleration. Obstructed targets slide along clear axes or stop;
the Force card shows when the path is blocked. **X** releases the moving hold
into a controlled landing. **R** applies a push in the target's direction.
People land and resume their routes; bins remain where they land. Pedestrians
and Jevica avoid moved bins. Indoor people can be lifted and lowered in place;
their work clocks pause and their carried props stay with their hands. Active
wishes and Force holds are mutually exclusive. Leaving the room, riding, or
moving too far away starts a controlled landing.

Push impulse depends on mass. Gravity, drag, small collision substeps, and
rendered paving heights govern movement and landing. Jevica reaches with her
free hand while holding her wand in the other. The bodies remain upright under
the Force: this is constrained telekinesis, not a ragdoll or destruction system.

Pink, pearl and champagne sparkles stream from the actual wand tip and rise
around the lifted target. They continue during carrying, soften during lowering,
and fade after release. One reusable pool caps the effect at 256 particles.
Reduced motion replaces travel and twinkle with ten stationary glimmers.
Jevica keeps facing the target while backpedalling or strafing; arm swing blends
down during casting and returns after release.

Pointer spell and character actions return focus to the scene for immediate
movement. Keyboard users retain control focus. Mobile holds use a compact card
above the movement pad. Shared UI feedback lasts 120–180 ms, with immediate
keyboard navigation and no transitions under reduced motion. The third-person
camera retracts immediately at obstacles and eases back into open space.
Buildings, trees, fixed planters, shop fixtures, and parked vehicles stay fixed.

`preview/e2e/force.js` checks real pointer and keyboard interactions with people,
bins, and a worker. `preview/e2e/force-mobile.js` exercises touch controls.

Thrown bins now break the specific storefront pane they hit. They stop at the
impact and fall outside the display backing. Each pane restores after 20 seconds
of simulation time; its frame stays intact. Debris uses one shared mesh with a
192-triangle maximum. Six unit tests cover misses, moving doors, exact restoration,
resource ownership, ground clearance and low-energy contact.

## Royal vehicles and Prince Jev

Choose the **Pink Rolls-Royce** or **Rose motorcycle**, then **Call vehicle** and
**Ride with Jev**. The six-wheel glass-canopy car follows the supplied reference,
with a continuous pink shell, slim lighting, gold aero wheel spinners and quiet
jewel glints. Both vehicles use gold rather than silver brightwork. The original
procedural models are artistic interpretations, not licensed scans or photorealism
acceptance evidence. TypeSafe's charcoal, paper and rose styling informs the garage.

Jev drives both; Jevica takes the rear passenger seat. W/S gives forward/reverse
directions, A/D steers, and **Step out** finds clear ground. Tyre contact follows
actual rotated tread samples. Parking and swept motion share the vehicle's real
footprint and avoid buildings, pedestrians and tree supports. Spinners coast on
independent bearings; reduced motion suppresses their decorative animation and
pulsing glints. These vehicles currently belong to standalone play.

**Jev smart drive** calls `/v1/chauffeur` through the loopback bridge. Jev chooses
cruise, slow, yield or stop; local code follows the right-hand mapped lane and
retains collision and speed limits. Manual input immediately cancels the drive.
Missing keys, invalid/stale answers and expired decisions hold position. Start
`uv run --env-file .env river-oaks serve`, then use **Settings → Jev API key** if
needed. The key stays in the bridge. Mock-provider tests verify the complete
control path; live driving quality still requires a configured key and evaluation.

Jev is 1.74 m, close to Jevica's 1.685 m. His hair is dirty blond/brown. His crown
uses an oval measured at the actual wearing height, with lower points; Jevica's
filigree crown receives the same fitted treatment. Motorcycle posing uses a
slight forward lean, outward knees, fitted hand grips and footpegs. Jevica wears
opaque skinned rose trousers under her seated gown; the wand is stowed while
riding. Costume and seated motion remain procedural, not simulated cloth.

**Walk with Prince Jev** (J) lets him keep pace beside her across roads and plazas,
through shop doors, and into flight. He chooses the street-facing side where clear.
His authored dialogue and `/v1/companion` policy express affection and confidence
while honoring her wishes and personal space. **Send Jev to the vehicle** cancels
following; he lands and returns physically before the vehicle can move.

When she takes off, Jev unfolds large pearl, blush and gold angel wings. Curved,
layered feathers use eight instanced draws plus one sparkle draw; articulated wing
shoulders and tips ease between lifting, hovering and gliding. His measured arm
rig places one relaxed hand forward and the other close to his chest. Predictive
following, bounded acceleration and jerk, swept clearance, look-ahead obstacle
steering and banking keep motion continuous. Flight maneuvers are local game
logic, not remote inference. Reduced motion suppresses decorative wingbeats.
The system is a procedural artistic treatment, not physical feather simulation.

Jev's ElevenLabs voice defaults to **Adam**, `s3TPKV1kjDlVtZbl4Ksh`.
Add `ELEVENLABS_API_KEY` to the bridge environment, or use **Settings → ElevenLabs
API key**. The manual key stays in memory until the bridge restarts. **Jev's voice**
in the same section offers the named voices in `preview/src/jev-voices.js` (Adam,
`OQkHNgFcqzRY82loyxsc`, and the original Jev voice) and a **Custom voice ID…**
option for any voice in your ElevenLabs library. Choosing a voice applies it at
once without replacing the key; the bridge reports the active voice back so the
picker shows it after a reload. The **Jev ·
ElevenLabs / residents · local** speech mode routes only Jev's dialogue to
ElevenLabs; other residents retain Kokoro. Voice remains explicitly mutable and
can be turned off in Spoken dialogue. Closing the conversation, muting, hiding
or leaving the app aborts pending playback. MP3 responses are bounded and cached
for eight lines at most; this voice path currently has no phoneme-aligned lip sync.
The bridge uses the official [text-to-speech API](https://elevenlabs.io/docs/api-reference/text-to-speech/convert).
The encounter keeps its stable internal ID for conversations and interactions.

## Verification entry points

- `npm test`: navigation, flight, head replacement, source isolation, costume
  transforms and resource ownership.
- `npm run build`: production bundle.
- `preview/e2e/force.js`: real pointer selection, wand/target effects, carrying
  a bin while walking, facing, landing, pushing and worker task pause/resume.
- `preview/e2e/force-mobile.js`: trusted touch movement during a hold, pad
  clearance, compact controls and reduced-motion glimmers.
- `preview/e2e/ui-polish.js`: People/Places/Settings navigation, focus return,
  interrupted panel motion, theme changes, conversations and press feedback.
- `preview/e2e/carriage.js`: mounted sole contact on flat and tilted coaches,
  current vehicle road contacts, boarding, riding, safe exits, walking and bubble flight.
  Current vehicles and companion flight are covered by `node desktop/vehicles-e2e.js`.
- `preview/e2e/unicorn-carriage.js`: retained unicorn artwork, coach following,
  ground contact and gait transitions in the studio fixture. The live district uses
  the Rolls and motorcycle.
- `preview/e2e/carriage-mobile.js`: real touch boarding, driving, braking and
  dismounting at a 390×844 viewport.
- `preview/e2e/carriage-conversation.js`: a real nearby resident conversation
  while Jevica remains seated at the same position.
- `preview/e2e/touch-people.js`: trusted touch ownership, cancellation, capture
  loss, focus loss, actual seated/worker mesh taps and phone/tablet movement pads.
- `preview/e2e/player-forms.js`: standalone Jevica, real portrait loading,
  takeoff, measured ascent, landing, camera toggles and mobile keyboard controls.
- `preview/e2e/character-portraits.js`: regenerate Jevica's local PNG portrait
  from `/e2e/fixtures/jevica.html` using the Playwright CLI.
- `preview/e2e/jevica-gown.js`: rendered lower-body vertex clearance at 30, 60,
  and 120 Hz, with translated parents, turns, walking, stops, and flight poses.
  Also checks arm clearance, oversized skirt deformation, and CPU update timings.
- `preview/e2e/store-encounters.js`: same-room conversations across all stores.
- `preview/e2e/grounded-motion.js`: foot contact on the six actual resident rigs.
- `preview/e2e/upper-body-motion.js`: arm/leg opposition and wrist continuity
  across the seven rigs, three terrains, and three frame rates.
- `preview/e2e/body-motion.js`: Jevica and the six resident rigs at 30, 60, and
  120 Hz on flat, wavy, and ramp terrain. Checks supporting-leg extension,
  body-height continuity, foot reach, and return to standing height.

Browser artifacts go to `output/playwright/`. Native Unreal work is stopped and
outside this scope. See [people interaction progress](people-interaction-progress.md)
for remaining browser movement and performance acceptance.

## Sable reference refinement

Sable keeps the stable `woman-casual` appearance ID and Jevica base rig. Both
local and remote players pass through `createSableLook` in
`preview/src/sable-look.js`. Her owned mesh hides the original human face,
replaces the hair with layered waves, leaves the crown free of sunglasses, and
attaches a full cream-tipped tail to the pelvis. The ivory outfit has a triangular
hem slit, a flat belt, chest-level pendant and connected heeled sandals. The
visible fox eyes follow the existing blink/gaze timing; reduced motion restores
the tail's rest orientation and leaves the eyes open. Source rig geometry is
never modified, and instance geometry, textures and materials are disposed.

The character card uses `sable-portrait.png`, captured from the playable model.
The separate full-reference link retains the supplied city-crosswalk image.
Regenerate the portrait with `node preview/e2e/sable-portrait.js`.

This remains a **procedural approximation**, not an identical reconstruction of
the reference. Fur density, hair grooming, facial sculpt, body proportions,
cloth deformation and material detail still differ. A matching authored rig and
materials would replace this approximation; the reference PNG is not a 3D asset.

Verification: `node --test preview/tests/romance-look.test.js`,
`npm run test:experience -- sable player-forms`, and
`npm run test:shared -- development`. The Sable journey captures front, profile,
back, portrait, walking and mobile views and exercises both local and remote
avatar construction. Shared-town acceptance checks the selected Sable appearance
reaching a second browser's rendered remote avatar. These checks establish
functional behavior, not visual equivalence or production deployment.

### Sable facial detail pass

`preview/src/sable-face.js` authors a smoothly sampled fox face with recessed eye
sockets, an integrated short muzzle, feathered cream cheek markings, directional
fur relief, a rounded triangular nose and a surface-following smile. Chestnut
iris fibres and pupils are painted into each curved eye opening. Independent
gaze moves each iris texture and catchlights inside fixed eyelids; blink folds
the eyelids and lashes together. Eye maps belong to the individual avatar and
are disposed with the look. Reduced-motion behavior is unchanged.

Short cheek fibres, tapered brows, and wrapping temple locks add
close-up detail. The character selector portrait is regenerated from this same
playable model with `node preview/e2e/sable-portrait.js`. This remains a procedural
interpretation: it is not a pixel-identical reconstruction of the supplied art.
Unit coverage checks finite UVs/normals, independent bounded gaze/blink, shared
rig isolation and texture disposal; `npm run test:experience -- sable` checks the
real local/remote loader and playable character journey.

### Sable all-angle refinement

Sunglasses and their frames/arms are removed. The ears now have closed, cupped
geometry with warm backs, rounded rims and cream interiors. A continuous scalp
cap and thick, tapered hair locks replace the flat ear and hair cards. Their
roots follow the crown before falling into waves. The shorter muzzle, smaller
irises and shorter lashes soften the face; brows and a subdivided eye surface
follow the actual sculpt, preventing detached eyes or fur cutting through them.

Run `node preview/e2e/sable-turntable.js` for ten views of each local and remote
avatar: eight horizontal angles plus elevated and low views. It writes PNGs and
`results.json` to `output/playwright/sable-turntable/`. Inspect these images for
likeness and silhouette; the automated assertions verify rendering, absence of
sunglasses and both ears, not subjective naturalness. Unit ray checks verify ear
volume from four directions and prevent fur occluding the open eye interiors.
The supplied reference stays unchanged; the selector uses the updated model.
