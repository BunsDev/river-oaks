# Five Rooms spatial contract (#838, #825 M1)

**Task:** `five-rooms-layout-825-20261101`. **Branch:** `feat/five-rooms-layout-825-20261101`,
stacked on #827 (`origin/feat/ribbon-route-825-20261031` at `97be93bd`). **Worktree:**
`../river-oaks-five-rooms-layout-825`. **Owner:** `claude:river-oaks-c2 (f075bf)`, taken over
2026-11-01T10:40Z from `claude:river-oaks-6d (2a62a6) worker:layout-838`, which stopped on a
usage-limit error and left an unreviewed draft of `shared/city-kit/five-rooms-layout.js`
(6d released the claim by message).

## Objective

One versioned, validated spatial contract: five venue envelopes with entrances, blank interiors
and attachment points; the complete Ribbon (the #827 spine unchanged, a south segment, the link to
the Gardens) with links to every entrance; exclusions rebuilt from the live District including tree
pits and crowns; a deterministic validator with demonstrated failures; the measured tenant map and
proposed retirements for Val. Data and validation only, nothing renders.

## Files owned

- `config/ribbon/five-rooms.json` (new, `five-rooms-v1`)
- `shared/city-kit/five-rooms-layout.js` (new)
- `preview/tests/five-rooms-layout.test.js` (new); one test added to
  `preview/tests/ribbon-route-district.test.js`
- `docs/design/five-rooms/layout.md`, `measure.mjs`, `plan.svg` (new)

## Results

- v1 validates against live `district.json`: 5 venues, 3 segments (all `blocked`, each with a
  confirmed blocker list and moves), 70 modules, 146 posts, 5 links, 5 camera corridors, 1024
  exclusions, 4 proposed retirements, 0 posts left out; plan hash `8e0c37a9f64dddfb`.
- Measured: 30 tenants in 9 buildings (tables in `docs/design/five-rooms/layout.md`).
- **Finding (affects #827/#828):** the spine crosses the mouth of side lane `osm-way-625330795`;
  modules 001-004 cross its carriageway and posts 002-004 stand in it. #827's test modelled only the
  central lane. Regression added to `ribbon-route-district.test.js`.
- **Finding:** every segment is blocked by street trees (14 pits in walks, 10 crowns below the 4.0 m
  canopy top). At the kit's 3.0 m clear height link-studios clears, south loses tree-108 and the
  spine keeps only tree-104 (measured).
- Fixes to the inherited draft: the Gardens check was a no-op (`validateGardenCampus` returns
  `{ ok, findings }`, the draft read `.length`); end-join shared posts were refused as standing in
  the neighbouring walk; the lane-end allowance measured from the wrong end of the lane; link
  reaches are now doorway zones applied before expansion, so a post never lands in a door's reach;
  a threshold may open into its host's box; venue-venue overlap is refused (1 cm party-wall
  tolerance); blocked records name only zones that must move.
- Demonstrated failures (each names the element): venue over a kept tenant (Amorino), entrance with
  no link (`entrance:atelier`), post in a tree pit (`tree-pit-117`), camera corridor crossed by
  canopy (`ribbon:spine:module:NNN`), Gardens ring change, plus stale, missing and over-claimed
  blocker records and an attachment outside its envelope.

## Checks

| Check | Result |
|---|---|
| `node --test preview/tests/five-rooms-layout.test.js` | 11/11 pass |
| `node --test preview/tests/ribbon-route-district.test.js preview/tests/ribbon-layout.test.js` | 13/13 pass |
| `node docs/design/five-rooms/measure.mjs` | hash `8e0c37a9f64dddfb`, tables in layout.md |
| `pnpm run verify` (core), 10:18-10:27Z at load 65-74, before the layout.md wording fix | passed, `.runtime/agent/core.json`: agent 294/294; preview 4801 pass, 0 fail, 1 skip, 35 todo (of 4837); server 1110 pass, 0 fail (of 1395); desktop 127 pass, 0 fail (of 132); python 215 passed; secrets no leaks |
| hosted `preview` aggregate | pending (draft PR) |

## Decisions for Val

1. Retirement list: option A (Amorino -> Counter, Van Cleef & Arpels -> Atelier, IPIC -> Starlight
   Screen, Hermès -> Shade Garden; Studios + Overlook at Gardens E2 and roof decks, no retirement),
   or alternatives per venue (layout.md).
2. Shade Garden as a court inside the Hermès bay (or the chosen alternative).
3. Street trees: move 14 pits and lift 10 crowns (#840), or a 3.0 m canopy clear height.
4. Side-lane mouth: a ribbon-1 crossing span, or split the spine at the kerbs (new #827 spine IDs).
5. Bench-5 body and the REF-HW-01 bed in the walks.
6. Door clearance: confirm the 2.4 x 2 m working value or measure a door.

## Gaps

- Every retirement is proposed; v2 records Val's choice.
- No segment is clear; Shells may render blocked placements only behind a flag.
- The crown model is LiDAR data; the drawn EZ oak carries leaves from about 12% of its height, so
  data crown lifts clear the drawn tree only if the renderer honours `crownBase`; the #840 worker
  also finds tree-28, -124 and -172 over the spine walk in the drawn mesh. The #828 graybox slab is
  0.12 m, this model's 0.4 m.
- Camera corridors are interior sight lines (plus the Gardens P2 axis); approach shots wait for
  #842's matched cameras.
- Hosted checks, Val's decisions and merge authorization are outstanding; #826/#827 merge first.

## Follow-up taken

At 6d's request: the smallest #827 fix for the side-lane mouth (maxSpan cannot bridge it: the kit
caps spans at 6 m and the mouth is 8.7 m), as its own task and draft PR on
`feat/ribbon-route-825-20261031`.

## Next step

Hosted `preview` on the draft PR; hand the decision list to the #825 steward (river-oaks-6d) and
Val; version the contract after the decisions.
