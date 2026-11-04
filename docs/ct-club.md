# The CT Club

A fictional, code-only underground techno club for River Oaks (Val, 2026-11-04).
Not a mapped tenant and **not yet placed in the district**: the precise street
position is still to be decided, so the whole room is built to move.

## The room

- **Size:** 40 m long × 16 m wide × 6 m high — "20 people-lengths long and 3
  people stacked tall", as requested.
- **Frame:** one store-room-shaped plan (`preview/src/ct-club-plan.js`),
  shared by the browser and the walking collision, like `axe-room-plan.js`. The
  plan is emitted at any facade with `planCtClub({ east, north, yaw })`;
  the default `(0, 0, 0)` is the pending position. When the position is chosen,
  a host calls the plan with those numbers, sets `room.floor` (below grade, with a
  stair throat in the door gap), and joins the room + its interior to the venue
  plumbing the way `venue-rooms.js` joins the axe room.
- **Layout along the 40 m axis** (local `a` across, `d` inward):

  | d | zone |
  | --- | --- |
  | 0–4 | entry throat, brass jambs, red door glow, entry mat |
  | 4–24 | the edge-glow bar (left wall) with stools and a chai urn |
  | 8–26 | the lounge (right wall): edge-glow couches, chairs, glow tables |
  | 16–33 | the edge-lit dancefloor: 1 m LED tiles, disco ball at the center |
  | 33–39.4 | DJ booth, central subwoofer bank and two big corner speaker stacks |

## Lighting (all cheap)

- **The room carries ten named ambient lights** (so it is never pitch black and
  hosts can automate each zone): `light.ambient.entry`, `light.ambient.bar.north`,
  `light.ambient.bar.south`, `light.ambient.lounge.north`,
  `light.ambient.lounge.south`, `light.ambient.dancefloor.north`,
  `light.ambient.dancefloor.center`, `light.ambient.dancefloor.south`,
  `light.ambient.stage`, `light.ambient.speakers`. Each is an `AmbientLight` whose
  `userData` carries `{ kind, zone, role, baseColor, baseIntensity }` and whose
  anchor sits at its zone, so a swap to a point/rect light keeps the same spot.
  Find them on `root.userData.lights = { group, list, byName }`.
- **Every glow is an emitter** — emissive `MeshStandardMaterial` or unlit
  `MeshBasicMaterial` with instance colors. No real lights are animated.
- **The dancefloor** is 13 × 17 one-metre tiles, each ringed by a thin unlit
  strip with per-instance color — the whole floor is **two** instanced meshes.
- **The bar** carries edge glow along its serving edge and under its lip, and a
  back glow trough behind the bottles; the **chairs and couches** carry a violet
  glow on their seat edges and a low base strip.
- **Four corner strobes** fire rarely (each under 1% duty, flashes ≤60 ms) and
  **four RGB corner spots** cycle slowly.
- **The disco ball** spins slowly; **RGB lasers** burst out of it for ~2 s of
  every 9 s. Lasers are thin tapered additive cones, so a burst costs three
  material writes.
- `root.userData.tick(t)` advances the above from the host's render loop; with
  reduced motion the room is static. `lightPositions` feed the world's shared
  light pool, which lights only the positions near the camera.

## Files

- `preview/src/ct-club-plan.js` — pure-JS plan (shared with the server
  walker): zones, fixtures, collision obstacles, light positions, summary.
- `preview/src/ct-club-interior.js` — the Three.js builder
  (`buildCtClubInterior`); builds under node (no canvas).
- `preview/tests/ct-club.test.js` — plan, interior, instancing,
  animation gating and reduced-motion regressions.
- `preview/e2e/fixtures/ct-club.html` / `.js` — a design harness to
  inspect the room at `/e2e/fixtures/ct-club.html` (`← →/J K` tour,
  `N` next view, `i` toggles the info overlay listing every visible item and the
  ten light names, `window.clubFixture.sample()` for a CPU sample).

## Design notes

- No staff: the room's people stay empty so it never changes resident counts.
- No windows, no exterior texture work: a buried concrete "bunker" shell with a
  door gap reserved for the future stair throat.
- The big speaker wall is a central subwoofer bank behind the DJ plus two tall
  corner stacks, each a grille enclosure with instanced driver cones and a
  glowing bass port.
- "Chai" is read charitably as both a chai kettle (a copper urn on the bar under
  an amber glow) and seating — the chairs and couches are edge-lit too.
