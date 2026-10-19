# #418 slice 3: Corner Café on the Garden Office baseline (2026-10-15)

## Objective and ownership

#418, Café: "Counter/coffee-machine scale, shared chair/table family, convincing tableware and
terrace". Retain the counter, preparation, indoor seating and terrace, the customer and prep
paths, the seat approaches, and the return from the terrace and entrance.

- Register task `studio-cafe-template-418`, owner `claude:river-oaks-safe-edits (e9aa0185)`.
- Branch `feat/studio-cafe-template-20261015` in `../river-oaks-studio-cafe`, stacked on slice 2
  (`feat/studio-boutique-template-20261015`, #474), which is stacked on slice 1 (#466, landed as
  `c71a7325`).

## Baseline (player height, main `83025a0b`, captures in the House slice's evidence folder)

- **Contact:** the coffee machine and the pastry display floated 2 cm above the 1.05 m counter
  tops, and the table vases 1 cm above the tables.
- **Prep sink:** its worktop was 0.747 m beside 0.92 m prep cabinets, 5 cm forward of them.
- **Service counters:** their cabinet doors faced the customers. The espresso machine
  (1 × 0.6 × 0.6 m) faced them too.
- **Pastry display:** raised brass "glazing" drew as an empty brass box.
- **Tables (every template):** the top was a unit rounded box stretched to size, giving a
  16 cm corner radius on a 2 m table. Legs were 5.5% of the table's width, so 11 cm on that
  table.
- **Terrace:** one planter and two chairs.

## Change

- **Café recipe** (IDs, route roles and walk targets unchanged):
  - **Service side:** the service counters turn 180°, so the doors face the staff and customers
    see closed fronts.
  - **Prep sink:** height 1.195 m, so its worktop meets the 0.92 m prep run, fronts in line.
  - **Espresso machine:** two groups at 0.8 × 0.55 × 0.5 m, facing the barista.
  - **Contact:** machine and pastry case on the counter tops, vases on the tables.
  - **Terrace:** a second planter at its west edge.
- **Renderer** (`space-scene.js`):
  - deep raised glazing (elevation > 0, depth > 0.3 m) is a glass display case;
  - tables are drawn by the true-size table form.
- **`space-furniture-home.js`:**
  - **`table`:** a 30 mm top with a 3 mm edge, on 45 mm square legs set 5 cm in, with aprons.
    It is the same family as the Garden Office desk, and every template's tables use it.
  - **`displayCase`:** a base, slim brass posts, glass sides and top, a glass shelf, and four
    pastries a level in three baked tones.
- **Harness:**
  - **Journey (Café settings):** the valid edit is the finish of table 2. The blocking move puts
    the west planter on the terrace stand point, after an accepted move north. The stale-tab
    check uses tables 3 and 4.
  - **Occupied use:** a customer at the pastries, a barista at the machine and someone at the
    prep sink.
  - **Contact test:** now covers all four templates, including raised display cases.
- **Garden Office records:** `space-scene.js` source hashes refreshed. Bounds and costs are
  unchanged.

Tableware is the pastry case, the espresso machine's cups and the table vases. A cup and
saucer on each café table would need a tableware kind in the catalog; that is a decision for
Val, not a variant of an existing kind.

## Checks

| Check | Result |
| --- | --- |
| `node --test preview/tests/studio-cafe-template.test.js preview/tests/studio-boutique-template.test.js` on the slice-2 base | 7 pass, 6 fail, each for its reason (machine 2.0 cm above its counter; sink 0.747 m beside 0.920 m; a door faces the customers; no case glass; stretched table top; 1 terrace planter) |
| Same after the change | 13/13 |
| `node --test preview/tests/studio-*.test.js server/tests/studio-assets.test.js` | 132/132, none skipped |
| `STUDIO_TEMPLATE=cafe pnpm run test:experience studio-template-journey` | passed, 13 checks. The west planter moved onto the terrace stand point is refused with a terrace finding. Walked tour: seating 8.9 s, service 12.8 s, preparation 17.4 s, terrace 5.3 s, each back to the arrival |
| `pnpm run verify` (core, on `6ce17faf` + this change) | passed, 11/11 tasks. agent 112/112; preview 3,365/3,366 (1 skipped); server 599/753 (154 skipped); desktop 76/76; pytest 141; build, lint, demo and secrets passed |

**Disk sweep (22:17–22:24 CDT):** a familiar's disk reclaim deleted every worktree's
`node_modules`, and then every `dist` inside packages reinstalled meanwhile. The first verify
run (`three` not found) and two journey starts (`vite` not found) failed on missing packages,
not on this change. Once the sweep finished, `pnpm install --frozen-lockfile --force` restored
them, and the tests above were all rerun.

Scene cost (objects / meshes / triangles), slice-2 base → this branch:

| Template | Base | Branch |
| --- | --- | --- |
| Garden Office | 40 / 338 / 26,478 | 40 / 346 / 26,574 |
| Courtyard House | 47 / 340 / 30,954 | 47 / 352 / 31,098 |
| Atelier Boutique | 39 / 307 / 24,810 | 39 / 315 / 24,906 |
| Corner Café | 41 / 361 / 31,806 | 42 / 403 / 35,490 |

Each table adds four aprons. The Café's extra meshes come from five tables, the pastry case
(19 parts replacing an empty box) and the second planter.

**Captures** (`studio-template-stations`, Café and office, three presets each, 0 page errors):
customers see closed counter fronts, the glass case shows its shelf and pastries, and the
tables have slim true-size tops and legs.

**Frame times** (vsync off, interleaved against the slice-2 base, load 7–23):

| Run | Café p50 / p95 (ms) | Café calls | Office p50 / p95 (ms) | Office calls |
| --- | --- | --- | --- | --- |
| base r1 | 1.4–2.3 / 3.4–7.2 | 383–719 | 1.2–1.6 / 3.2–3.5 | 354–672 |
| base r2 | 1.3–1.6 / 3.2–3.8 | | 1.4–2.3 / 3.2–6.9 | |
| branch r1 | 1.3–1.5 / 3.2–3.5 | 429–798 | 1.1–1.6 / 3.2–3.6 | 362–688 |
| branch r2 | 1.5–2.1 / 3.7–5.7 | | 1.7–1.9 / 3.8–4.5 | |

No regression in frame time. The Café adds 46–79 draw calls per view and the office 8–16.

## Gaps and next step

**Journey:** the first Café run failed on the journey itself, not the café: tables 3 and 4 are
already walnut, so the stale-tab edit changed nothing. The stale-tab check now uses the
terrace table and the prep cabinets.

**Still open:** design review of the captures (Val), and whether café tables should carry
place settings, which needs a catalog kind. Not run: devices, packaged builds, VoiceOver and
touch.
