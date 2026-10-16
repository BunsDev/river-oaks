# #418 slice 1: Courtyard House on the Garden Office baseline (2026-10-15)

## Objective and ownership

#418 (local rollout under #413): improve Courtyard House, Atelier Boutique and Corner Café one
template at a time on the Garden Office baseline (#416 landed as `05a5e9fe`, #417 as
`5dc0303a`). This slice is House: "seating/contact, cabinet/sink fit, bed fabric, wet-room and
patio material scale". Val asked to continue with this work on 2026-10-15.

- Register task `studio-house-template-418`, owner `claude:river-oaks-safe-edits (e9aa0185)`.
- Branch `feat/studio-house-template-20261015` in `../river-oaks-studio-house`, from `83025a0b`.
- Codex owns draft #459 (`space-furniture.js` v1 bounds, Garden Office manifest). This slice
  leaves that file alone: new House forms are in `space-furniture-home.js`.

## Baseline (player height, `studio-template-stations`, main `83025a0b`)

A new journey, `preview/e2e/studio-template-stations.js`, captures any template the way
`studio-office-stations` captures the office: the entry, one station per required route target
facing its role object, and the exit, under daylight, warm and evening light. Stations come
from the template's route profile. `STUDIO_TEMPLATE` picks the template and
`STUDIO_CAPTURE_TAG` names the set.

What the House baseline showed:

- **Kitchen:** the sink's worktop was 0.755 m, beside 0.900 m cabinet worktops. Its front sat
  5 cm ahead of theirs. Doors and worktops were unit rounded boxes stretched to size, so a 2.8 m
  run had pillow-like doors and 22 cm rounded ends.
- **Bathroom:** the full-height clear glazing of the east and south façades ran along the
  bathroom. The toilet stood free in the room, its bowl facing that glass.
- **Bed:** made of flat boxes in one cream, with the headboard 0.96 m from the wall. The
  mattress and duvet were stretched unit boxes.
- **Living room:** the sofa was 0.81 m off the wall and 0.91 m from a coffee table set across
  it, and the armchair faced away. The rugs were 30–35 mm thick, so legs sank into them.
- **Floors:** the patio's herringbone bricks drew 0.58 m long, and the bathroom's sandstone rows
  0.6 m. Both floor textures repeated every 2.4 m. The limestone patio table showed paving
  joints.

## Change

- **`space-templates.js` (House recipe only):**
  - **Bathroom:** plaster walls on the bathroom's street sides (`bathroom-east-wall`,
    `bathroom-street-wall`). `east-window` now glazes the bedroom only; `entry-right` keeps 2 m
    beside the door. Toilet, shower and vanity have their backs on walls (cistern on the street
    wall). The vanity worktop is at 0.85 m.
  - **Kitchen:** the sink height is 1.17 m, so its worktop (0.77 of its height) meets the 0.9 m
    runs. Sink and cabinets share one front line, 3.5 cm off the wall.
  - **Bedroom:** the bed's headboard is on the north wall, with a bedside table at each side of
    its head. The wardrobe stands against the bathroom wall, out of the bedroom window.
  - **Living room:** the sofa backs onto the west wall. The coffee table runs parallel to it,
    0.43 m from its front, and the armchair faces it.
  - **Patio and rugs:** patio chairs 0.125 m from the table; rugs 12 mm thick.
  - **Kitchen sink base:** oak, to match the run.
  - **Bathroom light:** a round ceiling pendant over the bathroom. Walled in, the room was dim
    under the Evening preset. House now has 2 lights, against the office's 3 and the
    renderer's limit of 4.
  - **Plants:** the entry and corner plants moved out of the bathroom and the kitchen run.
  - All object IDs, route roles and walk targets are unchanged.
- **`space-scene.js`:**
  - **Floor texture scale:** floors repeat their texture at real unit sizes (`FLOOR_TILE_M`):
    herringbone brick about 24 cm long, limestone in 30 cm rows.
  - **Stone slabs:** table tops, desk tops, worktops and basin surrounds are one plain slab, not
    paving.
  - **Cabinet rounding:** doors and worktops of cabinets, counters and sinks are rounded in
    metres (`trueRound`) and stay direct children, so mesh and triangle counts are unchanged.
  - **Bed:** drawn by the new House form, in textile materials (`MeshPhysicalMaterial` with
    sheen).
- **`space-furniture-home.js` (new):** a metric bed:
  - timber frame on legs and an upholstered headboard;
  - a mattress, and a duvet that lofts and drapes down the sides and foot;
  - a sheet fold and two pillows leaning on the headboard;
  - a throw across the foot.

  Every part stays inside the v1 footprint and height at any size.
- **`studio-pilot-acceptance.test.js`:** the occupied-use fixture takes per-template people.
  House has someone at the kitchen sink and at the vanity.

**Effect on Garden Office:**
- **Visible changes:** its reception counter top and kitchenette basin surround lose the
  stretched stone texture and become plain limestone. Its kitchenette doors and worktops get
  crisp true-size edges.
- **Cost:** objects, meshes and triangles are unchanged (40 / 326 / 24,318). It holds 7 more
  cached geometries (23 → 30), one per door and worktop size.
- **Manifest:** space-furniture.js is unchanged, so its sha256 is the same and the manifest
  test passes.

## Checks

| Check | Result |
| --- | --- |
| `node --test preview/tests/studio-house-template.test.js` on unchanged code | 1 pass, 7 fail, each for its reason (sink 0.755 m beside 0.900 m; door stretched; `east-window` on the bathroom edge; headboard 0.96 m from the wall; mattress stretched; sofa 0.91 m from the coffee table; brick 0.58 m) |
| Same, after the change, plus a bed size sweep (5 sizes × 2 yaws) and the bathroom light | 10/10 |
| `node --test preview/tests/studio-*.test.js server/tests/studio-assets.test.js` | 107/107, none skipped |
| `studio-pilot-acceptance.test.js` (occupied use) | 2/2 (office unchanged, House new) |
| `STUDIO_TEMPLATE=house pnpm run test:experience studio-template-journey` | passed, 13 checks |
| `STUDIO_TEMPLATE=office pnpm run test:experience studio-template-journey` | passed, 13 checks, the same as #417's journey |
| `studio-template-stations` | House before and after, Boutique and Café before, office before and after: 3 presets each, 0 page errors |
| `studio-pilot-perf.mjs`, interleaved main/branch × 2 rounds | see below |
| `pnpm run verify` (core, on `83025a0b` + this change) | passed, 11/11 tasks. agent 112/112; preview 3,329/3,331 (1 skipped, 1 todo); server 599/753 (154 skipped: Redis and live services); desktop 69/69; pytest 141; build, lint, demo and secrets passed |

**Journeys:**
- **House:** the coffee table moved into the bathroom doorway is refused with a bathroom
  finding and stays put. Undo and redo of a finish work, save keeps the House context, reload
  reassesses, and a stale tab cannot overwrite.
- **Walked tour (House):** living room 10.9 s, kitchen 17.8 s, bedroom 16.1 s, bathroom 13.3 s
  (6 waypoints through the door), patio 3.5 s, each back to the arrival.
- **First House run:** failed on the journey itself, not the house. The bedside tables were
  already walnut, so the stale-tab edit changed nothing and left nothing to undo. The journey
  now uses the oak kitchen runs and refuses a no-op edit.
- **Captures:** the first House and Boutique runs timed out placing the arrival. Setting East
  and then North can pass through furniture (bedroom to bathroom crosses the bed), which Studio
  refuses. Placement now retries in the other order.

**Frame times** (Chromium 156, ANGLE Metal on M3 Max, 1440 × 1000, vsync off, 3 × 180 frames
per view; load 14–23):

| Run | House p50 (ms) | House p95 (ms) | House calls / triangles | Office p50 / p95 (ms) |
| --- | --- | --- | --- | --- |
| main r1 | 1.3–2.3 | 3.5–6.4 | 368–670 / 31,928–59,744 | 1.5–2.4 / 3.3–7.4 |
| main r2 | 1.2–1.8 | 3.8–5.4 | same | 1.4–2.1 / 3.5–4.4 |
| branch r1 | 1.4–2.0 | 3.7–6.0 | 373–678 / 32,668–61,296 | 1.3–1.6 / 3.6–5.2 |
| branch r2 | 1.2–1.6 | 3.4–4.3 | same | 1.1–1.7 / 3.4–3.7 |

- **Garden Office:** draw calls and triangles are identical to main; its frame times differ
  only within noise.
- **House:** 5–8 more draw calls and 0.7–1.6k more triangles per view, with no
  frame-time regression measured. Template opens: 334–443 ms on both sides.
- **Receipts:** the scratchpad perf folder, and `.runtime/acceptance/perf/receipt.json`
  format.

Scene cost per template (objects / meshes / triangles / unique geometries / materials), main
`83025a0b` → branch:

| Template | Main | Branch |
| --- | --- | --- |
| Garden Office | 40 / 326 / 24,318 / 23 / 20 | 40 / 326 / 24,318 / 30 / 20 |
| Courtyard House | 44 / 337 / 29,902 / 24 / 22 | 47 / 341 / 30,678 / 43 / 25 |
| Atelier Boutique | 37 / 286 / 20,094 / 30 / 19 | 37 / 286 / 20,094 / 38 / 19 |
| Corner Café | 41 / 361 / 31,806 / 31 / 19 | 41 / 361 / 31,806 / 38 / 19 |

## Gaps and next step

Not run: physical devices, packaged builds, VoiceOver, touch, and the soak, asset and a11y
pilot checks for House. Those are still office-only, and this slice changes no Studio UI.

Design review of the captures is Val's. The Garden Office kitchenette sink also sits 15 cm
below its worktops (0.95 m sink, 0.77 ratio); that belongs to #416 and is left unchanged. Then Boutique (one shelf/plinth family, warm retail light, display
scale) and Café (counter and coffee-machine scale, one chair/table family, tableware,
terrace). The Café baseline already shows its pastry display as an empty brass box and its
counters' stone tops as stretched texture.
