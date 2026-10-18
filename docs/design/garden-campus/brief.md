# The Gardens: measured campus contract (#506)

The Gardens replaces the parking garage `osm-way-625330790` with three stepped rental office towers, two public Floor 4 skywalks and a planted public ground, inside the garage's own parcel. This brief records what the contract decides and how the next packages consume it. The numbers live in one place, [`shared/garden-campus-layout.js`](../../../shared/garden-campus-layout.js). [`layout-contract.json`](layout-contract.json) and the views ([site plan](views/site-plan.svg), [Floor 4](views/floor-4.svg), [long section](views/section-u16.svg)) are generated from that module.

## What is fixed

| | |
| --- | --- |
| Source | garage `osm-way-625330790`, district blob `566d7c52`, commit `153471bc` |
| Parcel | the garage ring itself: 6,838.982905 m², west edge 181.22 m, 37.72–37.76 m wide, not a rectangle |
| Frame | u east across the plot, v north along it, z above the garage base 18.25939 m; source origin and axes as pinned; renderer `[east, altitude, -north]` |
| Towers | T1 Grove Offices 6 floors (tiers 2/2/2), T2 The Commons 7 (3/2/2), T3 Atelier Offices 6 (2/2/2); floors at z 0, 5, 9, 13, 17, 21 (and 25 in T2) |
| Roofs | decks 25 / 29 / 25; parapets 26 / 30 / 26; roof access headhouses to 28 / 32 / 28; caps 28.1 / 32.1 / 28.1 |
| Skywalks | B12 23 m and B23 15 m, facade to facade at Floor 4 (z 13); 4 m overall, 3 m clear, 0.35 m slab, 1.25 m guards |
| Public route | three Floor 4 galleries (u 14.5–17.5), four 3 m landings, three 3 m core spurs, both decks, and T2's z 13 terrace where B12 lands |
| Ground | P1 promenade and P2–P9; café, pergola and pool; entries E1–E3 joined to their paths by explicit seams |
| Retained | the IPIC party wall (v 82.54–181.22, 98.68 m) stays closed; no east street |

The existing office roof is 51.28383 m absolute. T2's cap (50.35939 m) stays 0.92 m below it, and the IPIC mass (18.5 m) stays below the campus.

## Decisions made executable

- **Identity and versions.**
  - Ids: `GARDEN_CAMPUS_ID` is `river-oaks-garden-campus`. Floors are `T1-F1`…; suites are `T1-F2-W-S`, numbered `T1-201`; skywalks are `B12`/`B23`, with portals `B12-from`/`B12-to` and landings `T1-F4-north`….
  - `GARDEN_CAMPUS_VERSIONS` is `{schema 1, layout '3.0', floors 1, support 1, units 1}`. Any change to an id, dimension, elevation or connection bumps `layout`; renumbered floors bump `floors`; changed level, surface or transition semantics bump `support`; changed suite identities or boundaries bump `units`.
  - Persisted positions, leases and level state record these versions. `checkCampusCompatibility` refuses on any major mismatch, and the consumer relocates to the street.
- **Source versus authored.** `source` holds the garage ring exactly as pinned. Everything else is authored. With a district, the validator re-derives the parcel and refuses a changed ring, base or missing entry lane.
- **Support.**
  - Levels are keyed by elevation across the whole campus, as agreed with the #508 owner: `garden-campus/l0`…`l7` at z 0, 5, 9, 13, 17, 21, 25, 29.
  - `campusSupportAt(levelId, u, v)` returns the surface the occupant stands on, or `null` (off the level, or inside a shaft, guard or planter).
  - Nothing returns the highest surface at a point. Upper surfaces never enter the district ground lookup (`groundSurfaceHeight` takes the highest triangle), so a street walker under B12 stays on the ground.
  - B12 meets T2's z 13 terrace at the same level before the facade. Below B12 the P2 route keeps 12.65 m. Below B23, T3's z 9 terrace keeps 3.65 m (standing height 2.45 m plus 0.3 m headroom required).
- **Cores and roof access.**
  - Each reserved 5 × 6 m core keeps its envelope: a 3 × 2.6 m lift shaft, a 3 × 3.4 m enclosed stair hall, and a 2 × 6 m lobby meeting the 3 m spur.
  - Stairs are paired level-change portals, as in generated interiors; the lift is the step-free route. `CORE_DECISION` records why: a walked, code-like switchback would need about 5 × 9.4 m. Growing each core 3.4 m north would remove about 28.9 m² of suite per upper floor, about 549 m² across the campus, so it was not adopted.
  - Roof access emerges through a 3 m headhouse inside each core; the headhouse door opens onto the roof garden.
- **Public and private.** Ground paths, F1 halls, core lobbies and spurs, every spine, terrace passages, terraces, roofs and both skywalks are public. Suites are private-suite, with one door each onto a public spine. Residual strips are service. Crossing the campus never needs a lease.
- **Units.**
  - 43 suites, 3,279.7 m² net, computed from real geometry: plate minus core, spur, spine and terrace passage.
  - Each suite has at least a 3 m short side, a 1.7 m door onto public circulation, and a desk anchor with 1.27 m seated clearance.
  - Top-tier east strips (1.5 m) are recorded as service residual, never as suites. Commercial terms are unset (#509).
- **Body clearance.** Clearances use `AVATAR_ENVELOPE` (0.505 / 0.888 / 2.45 / 1.27 m). On 2026-10-18 the 11 current human appearances were remeasured ([avatar-envelope.json](avatar-envelope.json)):
  - widest body 1.01 m (Jevica);
  - tallest 2.45 m (forest aristocrat);
  - widest turning 0.561 m (Lyra);
  - widest seated reach 0.932 m (forest aristocrat, feminine).

  The constants bound all of them; body width and height are exact.
- **Seams and thresholds.**
  - Entries are parcel vertices. Each seam follows the boundary vertices to its path, so the 4.6–18 mm gaps are real geometry, not tolerance.
  - Lane altitudes differ from the base by −0.031 (E1), −0.011 (E2) and +0.059 m (E3). Thresholds over 0.1 m would need a ramp.
- **Cameras.** `01-southeast-aerial`, `02-street-under-b12`, `03-floor4-bridge-walk`, `04-northwest-high-oblique`, `05-office-terrace-outlook` (approximate: the office roof edge nearest the campus).

## Interface for consumers

All of it is pure data and functions, with no Three.js, DOM or server state.

| Export | Use |
| --- | --- |
| `GARDEN_CAMPUS_LAYOUT` | deep-frozen contract: source, frame, context, parcel, towers (levels, cores, terraces, roofs, silhouettes), bridges, ground, entries, seams, cameras, policy |
| `campusLevels()` | per level: `surfaces` (id, kind, rect or polygon, access `public`/`private-suite`/`service`), `obstacles` (lift, stair, guard, headhouse, planter), `keepClear`, `portals` (lift/stairs with `toLevel`/`toPortal`), `openings` (skywalk portals, terrace doors, suite doors, entrances); roofs and terraces carry `reachedBy` |
| `campusSupportAt(levelId, u, v)` / `campusSurfacesAt(u, v)` | support for an occupant / what is stacked at a point |
| `campusRoute(from, to, {publicOnly, walkOnly})` / `campusGraph()` | connection graph over circulation zones |
| `campusUnitInventory()` | suite id, number, level, net area, door and desk anchor, terms unset |
| `sourceToCampus`, `campusToSource`, `campusToScene` | frames |
| `validateGardenCampus(layout, {district, required})` | findings; an accepted layout has none |
| `checkCampusCompatibility(required)` | version gate for persisted state |

## Migration notes

- The district file is not edited. The garage remains a `parking` building in `district.json` until #507 adds a server-selected content revision that replaces it. The garage should stay the default until that revision is accepted.
- **Collision today.** The garage ring is in `district.collisionPolygons` exactly (index 1 at `566d7c52`), so the whole parcel blocks walking. #507's campus revision must remove that polygon and add campus collision built from these surfaces and obstacles. It must not shrink a clearance to fit art. A test pins the polygon's presence, so a district change is noticed.
- The generic interior recipe (`generateBuildingInteriorPlan`) stacks 4.2 m then 3.5 m storeys; the campus is 5 m then 4 m. That recipe must not generate these towers. A test pins the difference.
- No persisted state exists yet. The first persisted campus positions, leases or level state must record `GARDEN_CAMPUS_VERSIONS` and use `checkCampusCompatibility`.

## Handoff

| Owner | Consumes | Next action |
| --- | --- | --- |
| #507 shells, overlay (tracker owner) | towers, floors, cores, bridges, ground, entries, seams, obstacles | `attachGardenCampus(world)`, renderer shells, street rooms, collision, a content revision with the garage as default, fingerprint migration with #512 |
| #508 public traversal (tracker owner) | `campusLevels`, `campusSupportAt`, portals, openings, keepClear, `reachedBy` | server-side levels `garden-campus/l<i>`, paired stair/lift portals (1.3 m reach, free landing), continuous bridge walking, above/below two-player proof |
| #509 leases | `campusUnitInventory`, unit ids, door openings, `GARDEN_CAMPUS_VERSIONS.units` | lease records keyed on unit id + layout version; commercial terms stay unset |
| #510 suite journey | suite door openings (public spine to private suite), desk anchors | admission through the door seam only |
| #511 finishes and rendering | silhouette caps, planting beds, cameras | planting inside caps and outside keep-clear zones |
| #512 acceptance | validator, named cameras, versions | integrated journey and migration checks |

## Reproduce

```sh
node --test preview/tests/garden-campus-layout.test.js
node scripts/garden-campus-views.mjs --check     # validator plus published files
node scripts/garden-campus-views.mjs             # regenerate after a contract change
```

A 3D review page draws the contract live: `pnpm exec vite --config preview/vite.config.js --port <port>` with `RIVER_OAKS_DEV_TOWN=off`, then open `/e2e/fixtures/garden-campus.html`.
