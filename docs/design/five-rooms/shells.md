# Five Rooms shells (#839): massing notes and review cameras

Builders: [`preview/src/five-rooms/`](../../../preview/src/five-rooms/) (`index.js`
`buildFiveRoomsShells(contract, { finish, groundAt })`), the finished Ribbon:
[`preview/src/ribbon-finish.js`](../../../preview/src/ribbon-finish.js) (`buildRibbon`, same
inputs as `buildRibbonGraybox`). Tests: `preview/tests/five-rooms-shells.test.js`,
`preview/tests/ribbon-finish.test.js`. Contract: `config/ribbon/five-rooms.json` at
`five-rooms-v2` (the builder refuses any other version).

## Rules every shell follows

- **Contract only.** A venue is built in its frontage frame: origin at its first entrance centre on
  the contract floor height, x along the frontage, y up, z out through the door. Footprint,
  interior, floor and attachments all come from the record; a moved record moves its shell (the
  test moves every venue 5 m east, 3 m south and 0.5 m up and checks every vertex follows).
- **Blank.** Floor slab, side and back walls on the interior ring, ceiling at the contract clear
  height (3.6 m), a frontage with its entrance. No shop fit-out, menus, seats or gameplay. Role
  anchors (counter, seat cluster, screen, bed) stay data in `userData.fiveRooms.attachments`.
- **Out of the way.** Nothing stands past 1.2 m in front of the frontage (the Ribbon walk is
  2.3 m or more from every bay door), nothing enters the 2.4 x 2 m door zone below 2.6 m, and no
  part below the canopy top comes within a post's width (0.3 m) of any Ribbon walk.
- **Depth.** Every outward face stands at least 0.3 m in front of the footprint's frontage edge
  (where the mapped wall and the retired storefront are) and any two parallel faces of different
  materials are either buried or at least 0.06 m apart (`safeGap` at the audit's 120 m reach).
  `findDepthFights` reports 0 pairs for the shells alone and with the finished Ribbon.
- **One family, few draw calls.** Pink `#F486A1`, ivory, mint glass, chrome, ink, and a warm
  lamp. All five shells merge into one mesh per material: 8 draw calls, about 16k triangles. The
  Ribbon is 5 instanced meshes (posts, canopy, edges, fans, lamps).
- **Pink light.** By day every emissive is off. `userData.relight({ twilight })` (the atmosphere's
  `twilight`, as `office-penthouse-graybox.js` takes it) lights pink only on usable things (the four
  bay doors and the Atelier display frame) and the landmarks (the Starlight marquee band and the
  three Overlook lanterns); porch lights and Ribbon lamps burn warm white.

## The five rooms

| Venue | Roof form | Entrance | Glazing rhythm | Fascia |
|---|---|---|---|---|
| Counter | pink upswept boomerang canopy across the frontage | square lit jambs | low serving band: ivory plinth to 0.9 m, wide panes to 2.7 m, pink bullnose ledge | ivory |
| Atelier | flat pink cantilever with rounded corners over the door | lit round-headed portal (opening 2.6 m, clear to 2.6 m) | full-height panes at 0.9 m between deep chrome fins | ivory |
| Starlight Screen | capsule marquee (ivory, lit pink band, ivory) with a chrome starburst finial | pink parabolic arch spanning twice the door, lit jambs | closed ivory frontage with two ink poster frames in chrome | pink |
| Shade Garden | open court: pink parabolic ribs every ~2.2 m, no ceiling | lit jet-bridge hoop | low ivory garden wall (0.9 m) under a chrome trellis | pink |
| Studios + Overlook | ivory saucer with a pink rim on twin chrome hoops | open twin hoops at the P2 threshold | open threshold | none |

Overlook lanterns stand on the T1, T2 and T3 roof decks under their campus-frame anchors
(`attach:overlook:t*-lantern`): a chrome column from the deck (`campusSurfacesAt`) to a lit
globe at the anchor, an ivory saucer cap.

## Open points for Integration (#841) and Val

- **Retired storefronts.** The retired tenants' store rooms and storefront fronts still draw on
  main. The shells stand 0.3 m proud of the frontage and the interior floor is 5 cm thick on the
  contract floor height; #841 retires those rooms (and their floors) when it wires the shells in,
  and reruns the depth journey on the live scene.
- **P2 width.** The Studios hoops stand inside the 5.98 m threshold, leaving 5.6 m between the
  legs against the 6 m P2 opening. #841 decides whether the legs are collision or the hoops move
  outside the threshold (needs a contract change).
- **Clock face.** #839 names a clock face among the landmark lights; the v2 contract has no clock
  anchor, so no clock is built. Add one through the Spatial contract (#838) if wanted.
- **The Ribbon drawn.** `buildRibbon` draws the #827 spine (`district-spine.json`) as main does.
  The contract's south and link-studios segments are `blocked`; they render only behind a flag
  once their blockers move (#840 / Val decisions 2 and 5).

## Review cameras

The matched noon and night captures need the shells in the live scene, which is #841's wiring
(`main.js` is not this slice's file). Cameras, from the contract's `cameraCorridors` and the
spine, for #841 and the #842 QA packet:

| Camera | From | Looks at |
|---|---|---|
| counter | Ribbon spine walk, 6 m south-west of `entrance:counter` | the boomerang and serving band |
| atelier | Ribbon spine walk opposite `entrance:atelier` | portal, fins, cantilever |
| starlight | spine walk 8 m north of `entrance:starlight-screen` | marquee and arch |
| shade-garden | south walk opposite `entrance:shade-garden` | hoop, trellis, ribs through the opening |
| studios-overlook | `link-studios` walk end, then T2 roof deck | saucer on hoops, lanterns |

Each at noon (`daylight` preset, hour 13) and night (hour 21).
