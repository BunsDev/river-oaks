# District Ribbon graybox (#825 slice 2b)

**Task:** `ribbon-graybox-825-20261031`. **Branch:** `feat/ribbon-graybox-825-20261031`, stacked on
slice 2a (`feat/ribbon-route-825-20261031`, #827, `1fa64ead`), which stacks on slice 1 (#826).
**Owner:** Cody. **Status:** the spine draws as grey massing under `pink-jet-age` only; local
evidence below. Not merged, not deployed, not a human visual review.

## Objective

Draw the District spine (`config/ribbon/district-spine.json`) as simple shapes, only when the
player opts into `?finish=pink-jet-age` (or the stored `river-oaks-finish`). Classic stays
byte-for-byte the same scene.

## Files owned

- `preview/src/ribbon-district.js` (new): the District exclusion builder (doors, storefront
  benches, lane lamps/planters/bins, building boxes, the lane carriageway in ≤5 m pieces) and
  `districtRibbonPlan(world)`. It moves out of the slice 2a route test so the renderer and the test
  expand the spine against one builder. The door zone (2.4 m × 2 m) is still a working value.
- `preview/src/ribbon-graybox.js` (new): `ribbonAppliesTo(world, finish)` and
  `buildRibbonGraybox({ world, plan, groundAt })`. It uses one grey `MeshStandardMaterial`
  (`#b8b5ae`, no emissive) and four `InstancedMesh`es (posts, canopy slabs, fans, lamp heads),
  which is 4 draw calls however long the route gets. A world that refuses the spine (a door on an end
  post, say) gets an empty group with `userData.ribbon.refused`, not a failed load.
- `preview/src/main.js`: builds the graybox after the bike racks when `ribbonAppliesTo(data,
  cityKitFinish)`, standing it on `groundSurfaceHeight`. Adds `finish.ribbon` to
  `__riverSpatialStream()`. World teardown already disposes `worldGroup` meshes.
- `preview/tests/ribbon-graybox.test.js` (new, 5 tests), `preview/tests/ribbon-route-district.test.js`
  (now imports the shared builder; same 3 assertions).

## Pink rule

There is no pink and no light in this slice. Graybox is massing only, and nothing in it is usable yet
(#825's rule: pink light only on usable things and 3 night landmarks). Lamp heads are grey
spheres and give off no light.

## Checks and results (2026-10-31)

| Check | Result |
| --- | --- |
| `node --test preview/tests/ribbon-graybox.test.js preview/tests/ribbon-route-district.test.js preview/tests/ribbon-layout.test.js` | 17 pass, 0 fail |
| `pnpm run build` | built; sign-in page check "7 files, all served before sign-in" |
| Browser capture (below) | classic: `ribbon: null`, no `Ribbon graybox` group; pink-jet-age: group present, 4 meshes, 0 page errors |
| `pnpm run verify` (core, 21:28–21:34 UTC, same tree minus this ledger) | passed; receipt `.runtime/agent/core.json`. Node suites 294/294, 4794 pass + 36 skipped of 4830, 1110 pass + 285 skipped (Redis) of 1395, 127 pass + 5 skipped of 132, 0 fail; Python 215 passed |

The Float32 instance matrices store x ≈ −2760 m only to within about 0.24 mm, so placement
assertions compare to within 1 mm (the plan is rounded to mm).

### Browser capture

`.runtime/ribbon-graybox/capture.mjs` (local, not committed) runs under the shared browser lock.
It opens one loopback town (`startFixture('commons')`), then one page per finish with the same three
cameras at 15:00, with the interface hidden, 1280×800 at DPR 1. Output:
`.runtime/ribbon-graybox/capture-2026-10-31T21-28-18-043Z/` (`report.json`,
`{walk-north,ipic-side,overhead}-{classic,pink-jet-age}.png`). The capture ran at HEAD `1fa64ead`
with this slice's changes uncommitted (listed in `report.dirty`). Host load was 10.0 at the start and 12.0 at the end.

| Finish | `finish.ribbon` readout | Group inventory |
| --- | --- | --- |
| classic | `null` | absent |
| pink-jet-age | `district-spine`, hash `feba870d6c9cebe7`, 34 modules, 69 posts, 18 lamps, 34 fans, 0 seats, skipped `ribbon:spine:post:019:l`, drawCalls 4 | 5 objects, 4 meshes, 3 geometries, 0 textures, 8,432 geometry bytes |

Frame draw calls were 1325→1356 (walk-north), 865→873 (ipic-side) and 1117→1106 (overhead).
`pink-jet-age` also restyles other kit parts, so these totals are not the Ribbon's cost. The
Ribbon's cost is its 4 instanced meshes.

Looked at by the agent, not a human review: the posts stand on the paving between the lane
furniture and the shop fronts. The canopy runs past IPIC, and one span bridges the Van Cleef &
Arpels bench. The classic frames show no Ribbon.

## Gaps

- **Street trees are not exclusions.** The lane's trees are not in `laneFixtures`, and their
  crowns stand close to the canopy's kerb edge (visible in `ipic-side-pink-jet-age.png`). No
  check stops a crown from passing through the 3.6 m canopy.
- Posts are drawn, not collision; server movement is unchanged.
- There is still a 2.0 m walk with a 10 cm passing window (slice 2a), the door zone is an assumed
  value, and the south half and the links to the other rooms are not drafted.
- No night or dusk capture, no WebKit, and no device frame budget.

## Next step

Val: decide on widening (bin-54 and lamps) and street-tree clearance before materials (slice 3).
Then publish this stack in order (#826 → #827 → this) once merge is authorized.
