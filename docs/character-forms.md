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
Buildings, trees, fixed planters, shop fixtures, and the carriage stay fixed.

`preview/e2e/force.js` checks real pointer and keyboard interactions with people,
bins, and a worker. `preview/e2e/force-mobile.js` exercises touch controls.

Thrown bins now break the specific storefront pane they hit. They stop at the
impact and fall outside the display backing. Each pane restores after 20 seconds
of simulation time; its frame stays intact. Debris uses one shared mesh with a
192-triangle maximum. Six unit tests cover misses, moving doors, exact restoration,
resource ownership, ground clearance and low-energy contact.

## Rose carriage

**Call carriage** parks the blush, ivory and gold coach on a clear nearby road.
**Ride carriage** boards the cabin seat within eight metres. **W/S** moves forward
or reverses; **A/D** and the arrow turn controls steer. Releasing movement brakes
the coach. Its wheels rotate with travelled distance and follow the rendered
road surface. The full footprint stays on roads and crossings and checks for
buildings, trees and nearby residents. **Leave carriage** selects a clear exit
with room for the third-person camera. Summoning and bubble flight are disabled
while riding. Taking off also requires enough clear space for the bubble beside
the parked coach. Nearby residents remain available for seated conversations.

Wheel contact uses the actual rotating tread vertices. Suspension moves each
wheel vertically in world space, keeping it grounded on slopes and narrow raised
road details without oscillating across their edges. The September 26 coach is
10% smaller, including its parking footprint and tyre-contact samples. Decorative
wheel centers spin on independent bearings and coast after braking; reduced
motion keeps the centers attached to normal wheel rotation. The requested
unicorn team, reins, hydraulics and carriage autopilot are still in development.
Prince Jev, a fictional prince, drives the coach from the front bench. He wears
a midnight-velvet dress tunic with an ivory collar, a gold coronet set with a
sapphire and rubies, fringed gold epaulettes, a crimson sash, a gold belt,
double-breasted buttons and a star of order (`preview/src/prince-costume.js`).
The sash, belt and buttons are fitted to the rig's measured torso rather than
placed by hand. His body is a dedicated hero mesh, `prince-jev.glb`, built by
`scripts/build_prince.py`: a young, tall, athletic MPFB body with a defined jaw,
cheekbones and brow, wearing the CC0 tailored suit, shoes and hair and Jevica's
high-detail eyes, brows and lashes, surface-deformed onto his proportions. It is
a fictional generic appearance, not a scan or likeness.

**Companion mode.** Choose **Walk with Prince Jev** (or press **J**) and he
steps down from the bench to walk with Jevica. Jev, through the loopback bridge's
`/v1/companion` route, chooses how he accompanies her: beside her, a step ahead,
a step behind, pausing attentively, a courtly bow, or returning to the carriage.
Code keeps geometry: slots mirror or fall back to single file on narrow paths,
and he never enters a footprint, the parked coach, a step over 40 cm or her
personal space. When she flies far away he rejoins behind her; when she rides,
he takes the bench again and steps back down when she leaves. While Jev is
unconfigured or uncertain, a local stand-in keeps him walking and the panel says
"Local follow" with the reason, so no local rule is presented as a Jev decision.
He has a directory entry and accepts pointer and seated conversations; his
Force and wish visuals remain open work.

The model is locally authored geometry inspired by the supplied September 23
reference: curved cabin, gold filigree, faceted wheel hubs, pearl details, glass
lanterns, velvet seats and a domed roof crest. It is not a scan or an identical
licensed asset. Tufting buttons attach to indented upholstery triangles. Jevica's
skirt folds over her lap, and both shoes solve against the cabin floor in the
carriage's tilted frame. This is procedural posing, not simulated cloth.

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
  four road contacts, boarding, riding, safe exits, walking and bubble flight.
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
