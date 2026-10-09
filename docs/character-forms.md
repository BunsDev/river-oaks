# Playable character forms

**Jevica belongs to the approved waitlist administrator account**
(`user_01M40Y914S1H4EJCEHH91DKTAY` in Staging; `user_01M402HKJYDTH1QJM5NAQDZ4HH` in Production). Other accounts start as Sable and cannot
select either Jevica form. Only that account
can call Jev and her vehicle in multiplayer. Among playable characters, only Jevica can fly. Players can choose the seven other
characters, and every character comes in a humanoid and a beast form; see
[characters, styles and forms](#characters-styles-and-forms). The Witch and Alien forms were removed
on September 23, 2026, together with their portraits, costumes, broom and personal
UFO. Her bubble flight, camera controls and server-confirmed wishes remain.
Residents are humans with six coordinated fashion palettes; see
[world direction](world-direction.md).

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
look's label and role. Accounts and town checkpoints store appearance
IDs, so every ID that existed before forms keeps its meaning: `woman-casual` is
still Sable's fox and `man-tailored` is still the human Aurel. New looks have new
IDs, such as `sable-human` and `kai-noir-beast`.

In shared play, appearance and beast-movement preference follow the signed-in
account between worlds and server instances. The account record is authoritative
when a resident joins or reconnects; an active world also refreshes it on
heartbeat. The first visit after this account store was introduced seeds it
from the previous River Oaks checkpoint when that account has a saved look.
World checkpoints keep their own copies for room recovery. Old device-only
appearance preferences are no longer read.

The wolf-eared Aurel (`midnight-host-hybrid`) was removed on October 2, 2026. A
account or checkpoint that saved him loads his wolf form instead, and the
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
planted-foot solve. **Shift** opens a fast ground sprint, with a touch **Hold to sprint**
control. Foxes turn sharply; wolves and cats lope; deer cover more ground in a
straight line and slow more through tight turns. Each beast has its own pace and
turning feel. Walls, terrain steps and world bounds still stop movement. The
shared town derives its speed limit from the account's confirmed beast form and
movement choice, so an upright player cannot claim beast speed. Riding keeps its
usual pose. Only Jevica's humanoid and fox forms can use bubble flight; changing
character or form in the air requires landing first.

The choice belongs to the account, like the appearance. The town remembers it, applies it only while
the account wears a beast form, and peers see the posture on the remote avatar.
The client sends the `movement` command with `upright` or `beast`. A town server
from before beast movement answers `invalid_command`, and the client reports that
the town doesn't support beast movement yet. Quick person, style and form clicks
reach the town as one change, sent as soon as its two-second appearance cooldown
allows.

To verify, run `node --test preview/tests/beast-forms.test.js
preview/tests/romance-look.test.js preview/tests/foot-placement.test.js`,
`pnpm run test:server`, `pnpm run test:experience player-forms beast-movement`
and `pnpm run test:shared required`.

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

Third person is the default. **V** switches cameras. For Jevica, **B** takes off or lands,
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

## Retired activities

Auto visits, alien invasion, local resident reactions, and telekinesis were
removed with single-player. Jevica's shared-town vehicle, companion, flight,
and wish capabilities remain subject to account permissions.
