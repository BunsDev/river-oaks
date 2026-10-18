# #418 slice 2: Atelier Boutique on the Garden Office baseline (2026-10-15)

## Objective and ownership

#418, Boutique: "Coherent shelf/plinth family, warm retail lighting, believable display
scale". Retain the displays, checkout and two fitting rooms, and the route to both fitting
rooms and the checkout.

- Register task `studio-boutique-template-418`, owner `claude:river-oaks-safe-edits (e9aa0185)`.
- Branch `feat/studio-boutique-template-20261015` in `../river-oaks-studio-boutique`, stacked
  on slice 1 (`feat/studio-house-template-20261015`, draft #466, `0032d0cc`). The two slices
  share `space-scene.js` and `space-furniture-home.js`; the PR targets main after #466 lands.

## Baseline (player height, main `83025a0b`)

`STUDIO_TEMPLATE=boutique pnpm run test:experience studio-template-stations`, with captures in
the House slice's evidence folder:

- **Display family:** the wall displays mixed oak (west) and walnut (east), and the checkout
  storage was oak behind a walnut counter.
- **Shelving:** drawn as generic bookcases. Boards were 105 mm thick on the 2.1 m units,
  because each board was 5% of the unit's height. White "books" carried floating boxes.
- **Plinths:** the window plinths and the table riser, limestone or terracotta cabinets, drew
  cabinet doors.
- **East façade:** the full-height clear glazing ran behind the east displays and along both
  fitting rooms.
- **Mirrors:** the fitting-room mirrors were clear glass.
- **Floating objects:** both display products floated 2 cm above their tables, and both window
  artworks 1 cm above their plinths.
- **Lighting:** two lights, both over the display tables; none over the checkout.
- **Placement:** the wall and east displays stood 16 cm off their walls, and the checkout
  storage 13.5 cm.

## Change

- **Recipe** (`space-templates.js`, Boutique only; IDs, roles and walk targets unchanged):
  - **Walls:** a solid east wall behind the displays and fitting rooms; the east glazing
    remains at the front corner.
  - **Display family:** walnut for every wall display and the checkout storage, limestone for
    plinths and one table, brass fittings.
  - **Placement:** displays and storage stand on their walls.
  - **Contact:** products sit on the table tops and art on the plinths.
  - **Lighting:** a linear pendant over the checkout (3 lights).
- **Renderer** (`space-scene.js`): variants chosen by finish and proportion, with no new
  document fields:
  - a **stone cabinet** (limestone, concrete or terracotta) is a solid plinth over a shadow
    gap;
  - **thin raised glazing** (elevation > 0, depth ≤ 6 cm, height ≥ 0.8 m) is a silvered
    mirror;
  - the **shelf kind** is drawn by the new true-size form.
- **`viewport.js`:** a mirror material gets the room reflection map at
  `min(1, 4 × the preset's reflections)`. Every other finish keeps the preset's faint
  reflections. Without this the mirror rendered dark at the warm preset's 0.2.
- **`space-furniture-home.js`:** true-size shelving:
  - 25 mm sides and 22 mm boards about 36 cm apart, over a recessed kick;
  - a 9 mm back, and bays at most 0.9 m wide;
  - in the bay spaces, a third hold two folded garments, a third a plain lidded box, and the
    rest stay open.
- **Harness:** Boutique settings in `studio-template-journey`:
  - valid edit: finish of display table two;
  - blocking move: the checkout plant into fitting room one's entry;
  - stale tab: table one and plinth two.

  The occupied-use test adds a customer and staff member at the checkout.

**Effect on the other templates:**
- **Garden Office:** its storage shelf becomes the true-size form. Meshes go from 326 to 338
  and triangles from 24,318 to 26,478.
- **Courtyard House:** its media console changes the same way. Meshes go from 341 to 340 and
  triangles from 30,678 to 30,954.
- **Corner Café:** unchanged (it has no shelves, stone cabinets or mirrors).

## Checks

| Check | Result |
| --- | --- |
| `node --test preview/tests/studio-boutique-template.test.js` on the slice-1 base | 1 pass, 6 fail, each for its reason (product 2.0 cm above its table; mixed timbers; a plinth has doors; a 105 mm board; no mirror pane; 2 lights) |
| Same after the change | 7/7 |
| `node --test preview/tests/studio-*.test.js server/tests/studio-assets.test.js` | 114/114, none skipped |
| `studio-pilot-acceptance.test.js` (occupied use) | 3/3 (office, House, Boutique) |
| `STUDIO_TEMPLATE=boutique pnpm run test:experience studio-template-journey` | passed, 13 checks |
| `studio-template-stations` | Boutique and office after, 3 presets each, 0 page errors |
| `pnpm run verify` (core) | passed, 11/11 tasks. agent 112/112; preview 3,337/3,339 (1 skipped); server 599/753 (154 skipped); desktop 69/69; pytest 141; build, lint, demo and secrets passed |
| After the mirror reflection change: Studio tests, Boutique journey, `world-studio` journey | 115/115; 13 checks; passed |
| After merging main (`be38c507`, including #459's Garden Office records and the v0.2.1 release) | Garden Office records failed only on `space-scene.js` source hashes, which were refreshed. Studio tests 124/124. `pnpm run verify` passed: agent 112/112; preview 3,357/3,358 (1 skipped); server 599/753 (154 skipped); desktop 76/76; pytest 141. A first run failed `desktop/tests/sign.test.js` because the worktree predated the merge's new `@electron/osx-sign` dependency; `pnpm install --frozen-lockfile` fixed it |

**Boutique journey:**
- The checkout plant moved into fitting room one's entry is refused with a finding naming that
  room. Undo/redo, save/reload and the stale tab all pass.
- Walked tour: sales floor 11.2 s, checkout 18.8 s, fitting room one 21.3 s and fitting room
  two 23.2 s, each back to the arrival.

**Frame times** (vsync off, slice-1 base and branch interleaved; load varied from 15 to 150):

| Run | Boutique p50 / p95 (ms) | Calls / triangles |
| --- | --- | --- |
| base r1 (load 83) | 1.9–2.3 / 5.5–6.4 | 300–568 / 20,212–40,128 |
| base r2 (load 132–150) | 1.4–1.8 / 3.3–4.0 | same |
| branch r1 (load 15) | 1.2–1.7 / 3.3–4.0 | 319–612 / 24,880–49,584 |
| branch r2 (load 24) | 1.6–2.0 / 4.3–6.1 | same |

**Garden Office overhead view:** in rounds 1 and 2 its p95 varied from 3.6 to 11.1 ms on the
branch and from 3.6 to 7.4 ms on the base. Two more interleaved rounds gave 3.6 and 3.6 ms on
the branch, against 6.4 and 3.5 ms on the base. The spread is noise. Office station views on
the branch stay at p50 1.3–1.9 ms and p95 3.2–5.0 ms, as on the base. The office gains 12
draw calls (342 → 354 at the stations).

Scene cost (objects / meshes / triangles), slice-1 base → this branch:
- Boutique: 37 / 286 / 20,094 → 39 / 307 / 24,810.
- Office: 40 / 326 / 24,318 → 40 / 338 / 26,478.

The first shelf draft used three rounded garments per stack and rounded boxes, which came to
35,394 triangles and 325 meshes for Boutique. Two garments and plain boxes brought that down
to the figures above.

## Gaps and next step

Val authorized committing, pushing and merging to main on 2026-10-15. Design review of the
captures is still Val's. Not run: physical devices, packaged builds, VoiceOver and touch.
Mirrors reflect the neutral room map, not the actual room.
