# TypeSafe Place Residential Heights

Task `typesafe-place-20261028`, owner `claude:river-oaks-91 (a3bcb4)`, branch
`feat/typesafe-place-20261028`, worktree `../river-oaks-typesafe-place`, stacked on
`fix/jevica-roof-flight-20261028` (#723, flight over district roofs).

## Objective

Val (2026-10-28), from the concept art "TypeSafe Place Residential Heights — elevated
living in a connected neighborhood": build it as playable land, shown in the dev town
while it is built.

Val's decisions (2026-10-28):
- **Placement:** new land east of Woodland Heights, continuing Twentieth and Eighteenth
  Streets. A new opt-in revision `typesafe-place-1` composed on `woodland-heights-1`. This
  takes the world past 3×; nothing existing changes.
- **Towers:** two signature towers at 20 storeys (4.6 + 19 × 3.5 = 71.1 m). The flight
  ceiling rises to clear them so Jevica can fly over Penthouse Row.

## Design

A 150 m strip (frame x 552.888–702.888) over the District's whole north–south span, as five
city-kit neighborhoods split at Twentieth's north side, the promenade centreline and Place
Avenue's west edge (see the [place doc](../../level-design/expansion/typesafe-place.md)).

| Concept panel | In the world |
| --- | --- |
| Luxury Living | 20-storey residential tower west of Place Avenue, balconies on every storey |
| Penthouse Row | 20-storey tower east of the avenue with a setback penthouse crown and terraces |
| Sky Gardens | mid-rise residences with planted garden roofs |
| Everyday Retail | 2–3 storey shop rows along Twentieth and Eighteenth, café sets on the sidewalk |
| Neighborhood Green | a lawn court with paths, tree rows, benches and a pink ribbon sculpture |
| Walkable Neighborhoods | a tree-lined north–south boulevard (Place Avenue) joining both cross streets |

- Connections: only Twentieth and Eighteenth Streets, through 2 m ground-only seams over
  Woodland's street ends, as Woodland joins Studewood.
- Kit additions: a residential tower style (balcony slabs, glass bands), a garden roof,
  a crown roof with a pink light band, blush/rose materials, and `landmark/ribbon`.
- Flight: `walking.js` computes the ceiling from district roofs too, so it becomes about
  80 m in this revision only; earlier revisions keep 41.1 m.
- Server: a checkpoint migration back to Woodland moves people on TypeSafe ground to
  the nearer cross street, first in the Redis chain.
- Streaming: Heights streams the two neighborhoods. Their bytes are measured against the
  unchanged 16 MiB ceiling; any ceiling change is Val's decision.

## Files owned

`config/destinations/typesafe-place-{north,penthouse,uptown,green,south}.json` (+ locks), `shared/typesafe-place{,-layout}.js`,
`preview/src/typesafe-place-world.js`, `server/district-typesafe-checkpoint-migration.js`,
the manifest location, revision lists (`district-data.js`, `garden-campus-district.js`,
`main.js`, `redis-room.js`), `heights-stream.js`, `world-location-label.js`, city-kit
catalog/render additions, `walking.js` flight ceiling, the footprint audit, tests, the place doc
and its `world-expansion.md` section.

## Checks

Focused kit, composition, walking, flight and migration tests; `pnpm run verify`; the dev
town in a browser (through `scripts/browser-lock.mjs`); streaming bytes headless and in
the browser; reachable-ground audit; hosted Verify.

## Results

- 2026-10-28: worktree from `ac99bbce` (#723); task claimed; ledger written.
- Recipes generated from one layout (scratchpad `gen.py`, seed 2026); locks written for
  all five and `pnpm run destination check` passes.
- Two neighborhoods measured 8.6 MiB for the towers' half, with 89 meshes. Balconies were
  redrawn as whole-face runs, retail materials and lamps trimmed, and the strip split
  into five neighborhoods. Measured headless: 2.12, 3.02, 2.54, 2.40 and 2.40 MiB, with
  43–59 meshes. The 16 MiB stream ceiling is unchanged; the shared part is estimated at
  9.77 MiB, so three or four TypeSafe parts are resident at once.
- Walking in was blocked by Woodland's street-end hedges. They are opened in this
  revision only, and detach restores Woodland byte for byte.
- Flood fills with failed chunks showed unreachable courts. Passages were added
  (luxury, uptown, south) so each court reaches a street within its own site.
- Flight ceiling: 80.503 m here, 41.09 m for every earlier revision.
- Focused: `preview/tests/typesafe-place.test.js` 12/12;
  `server/tests/typesafe-place.test.js` 6/6, including Redis on an isolated port;
  171 neighbouring tests pass.
- Footprint (`--reachable`): TypeSafe is 165,700 m² at 1 m, +23,668 m², 3.5621×. The
  0.5 m grid exceeds the audit's one-million-cell budget, so TypeSafe is measured at 1 m
  only; the guard is not raised. Earlier revisions match the base commit `ac99bbce`
  exactly.
- Dev town on `typesafe-place-1`: http://127.0.0.1:5179/ with local fixture identities.
  Screenshots are in the session scratchpad; they are review evidence, not acceptance.

## Status

In progress. Opt-in revision only; nothing activated, deployed or merged.

## Next step

Layout, recipes and kit additions; wire the revision; run the dev town on it for Val.
