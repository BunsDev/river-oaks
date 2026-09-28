# Playable character forms

**Jevica is the only playable character.** The Witch and Alien forms were removed
on September 23, 2026, together with their portraits, costumes, broom and personal
UFO. Her bubble flight, celebrity reactions, camera controls and magic remain.
Residents are humans with six coordinated fashion palettes; see
[world direction](world-direction.md). Alien enemies belong to the separate
invasion scenario.

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
**Space** rises and **C** lowers altitude. Jevica flies in a bubble. Character controls also expose these
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
API key**. The manual key stays in memory until the bridge restarts. A separate
voice-ID form changes the selected voice without replacing the key. The **Jev ·
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
- `preview/e2e/player-forms.js`: the sole playable identity, absence of the appearance selector, real portrait loading,
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
