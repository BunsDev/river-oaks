# Ribbonwing (#777)

Register task `ribbonwing-20261029`, branch `feat/ribbonwing-20261029`, worktree
`river-oaks-ribbonwing`, stacked on #737 (`feat/landowner-hovercraft-20261028`,
`1cd96019`). Issue: BunsDev/river-oaks#777.

## Objective

Replace the landowner's flying vehicle with the finalized two-seat Ribbonwing
from Val's two final references. Then deliver its flight, VTOL, roll, loop, tuck
dive and Petal Roll, with server-owned entitlement, occupancy and validated
flight, consistent for the pilot, passenger and observers.

The work lands in increments:

| Increment | Scope | State |
| --- | --- | --- |
| 1 (this PR) | D0 source map; reference import and hashes; D1 metric blockout, decisions and canonical views; procedural runtime model with interior, LODs, colliders, attachments and rig; integration into the existing `hover` path; the D1 comparison baseline | ready for review |
| 2 | Server-validated maneuvers: commands with id/seq/start, deterministic authored paths, swept-volume and recovery-altitude admission, dedupe of stale/reordered/duplicate input, focus loss and revocation recovery; orientation in poses | not started |
| 3 | Two-player occupancy: passenger consent, server-derived passenger pose, disconnect recovery and safe landing, teardown; a two-client journey | not started |
| 4 | Bounded audio/VFX; detail art toward the references' materials; performance and disposal measurement in town | not started |

## D0: located (unchanged by this PR unless stated)

See [the brief](../../design/ribbonwing/brief.md#d0-the-craft-this-replaces). The
craft in Val's screenshots is #737's `hover` kind. `createFlightVehicle('jevica')`
is unrelated and untouched.

## Files owned (increment 1)

New files:

- `preview/src/ribbonwing-design.js`: canonical source; metric data and pure functions.
- `preview/src/ribbonwing-rig.js`: mechanisms derived from accepted state.
- `preview/src/ribbonwing.js`: model, LODs, attachments and adapter.
- `preview/e2e/fixtures/ribbonwing.{html,js}` and `preview/e2e/ribbonwing-views.js`.
- `scripts/ribbonwing/{png,silhouette,reference-panels,measure-references,compose-sheet}.mjs`.
- `docs/design/ribbonwing/` (references, `reference-index.json`, `brief.md`,
  `camera-manifest.json`, `d1-baseline.json`, `evidence/`), and this ledger.
- `preview/tests/ribbonwing.test.js`.

Changed files:

- `vehicle-config.js`: hover spec, `chauffeur` flags, `vehicleChauffeured`, `riderSeat`, plan envelope.
- `road-vehicles.js`: the coach geometry is removed; `hover` returns the Ribbonwing.
- `parked-carriage.js`: pilot seat, accepted-state rig, boarding reach, `mechanisms`.
- `carriage-parking.js`: plan-aware `carriageContains`.
- `carriage-motion.js`: exit leaves room for the follow camera.
- `remote-players.js`, `player-avatar.js`, `driving-hands.js`, `vehicle-glints.js`, `walking-ui.js`.
- `main.js`: the `__riverCarriage().mechanisms` debug field.
- `preview/e2e/hover-coach.js`, `preview/tests/vehicles.test.js`.
- `docs/world-direction.md`, `docs/multiplayer.md`.

## Decisions

The D1 decisions are numbered 1–11 in the brief. Increment 1 also made these:

- The kind id stays `hover`, so the server, checkpoints, chauffeur packet gates
  and saved vehicles need no migration.
- The procedural JS in `ribbonwing-design.js` and `ribbonwing.js` is the
  editable source. No GLB is exported yet: the runtime builds from the source,
  and a GLB export is deferred until detail art (increment 4).
- Following #767's convention, `chauffeur:true` marks the kinds Jev drives. The
  owner pilots the Ribbonwing from the left seat, and Jev stays out of it until
  the passenger work in increment 3.
- Colliders: the walker and camera envelope is now plan-shaped (a half-width
  profile along the length). The rectangle walled off the space ahead of the
  wings where the steps and exits are.

## Checks

- [x] `node --test preview/tests/ribbonwing.test.js preview/tests/vehicles.test.js preview/tests/carriage*.test.js`:
  49 passed, 0 failed (2026-10-29). Covered:
  - design invariants and palette;
  - fan margin 0.20 m;
  - ladder reach and clearance;
  - headroom ≥ 1 m;
  - tuck, gear and nozzle envelopes;
  - rig interlocks and reversal;
  - hostile input (a NaN turn yawed the nozzles fully left; fixed);
  - attachments at their points;
  - LOD budgets;
  - dispose-once;
  - plan envelope;
  - exits with camera clearance, with the rolls exit unchanged.
- [x] `node scripts/ribbonwing/measure-references.mjs`: both reference hashes verified.
- [x] `node scripts/browser-lock.mjs 'ribbonwing views' -- node preview/e2e/ribbonwing-views.js .runtime/ribbonwing/d1-baseline`
  then `node scripts/ribbonwing/compose-sheet.mjs …`: no page errors.
  `docs/design/ribbonwing/d1-baseline.json` records the IoU, aspect and zones
  per view, the occupant fit, the stats and every capture hash.
- [x] `node scripts/browser-lock.mjs 'ribbonwing hover journey' -- pnpm run test:experience hover-coach`:
  passed on the fifth local run, and again on the final files.
  - Run 1 failed at its last check because the body was hidden after the
    dismount.
  - Runs 2–4 found the cause: the rectangular obstacle, then the follow
    camera's 1.3 m bubble at a 3 m exit.
  - After the plan envelope and the camera-clearance exit fixes, it passed 23
    checks. These include canopy and steps opening on approach, Jevica at the
    controls, steps stowing and the canopy closing once seated, the feet
    retracting above 3 m and deploying before touchdown, and the server
    carrying altitude.
  - `data/reports/experience.json` was restored after each run.
- [x] `pnpm run verify` (core), first run: 4350 passed, 5 failed, 1 skipped.
  - All five failures were garment-bake provenance: `driving-hands.js` and
    `vehicle-config.js` are bake inputs.
  - Reran `node scripts/bake-{coat-tails,lyra-drapes,silvan-drapes,skirt-seat-morph,vesper-skirt}.mjs --write`.
    Only the input-hash lines of the five `*-morph-receipt.json` files changed;
    no morph data changed.
- [x] `pnpm run verify` (core), second run: passed.
  - preview: 4355 passed, 0 failed, 1 skipped.
  - Other stages: 1080 passed with 283 skipped, and 127 passed with 5 skipped.
  - Agent, server, desktop and build stages passed.
  - Receipt: `.runtime/agent/core.json` (status passed, dirty tree on `1cd96019`).
  - Core excludes Redis, browser, native and live-auth checks.
- [x] Hover journey rerun on the final files: passed, 23 checks.
- [ ] `pnpm run verify full`: not run. The browser stages and the hosted
  matrix run on the draft PR.
- [ ] Hosted `preview` on the draft PR.

## Results

| View | D1 IoU | View | D1 IoU |
| --- | --- | --- | --- |
| top | 0.873 | underside | 0.804 |
| left | 0.657 | hover | 0.654 |
| right profile | 0.647 | front | 0.645 |
| stunt | 0.576 | rear | 0.459 |
| ¾ | 0.448 | boarding | 0.382 |

Regression floor = D1 − 0.03. Pink coverage is about 0.1–0.2 of the silhouette
against the references' 0.25–0.38.

Craft budget, near / medium / far:

| LOD | Draws | Triangles |
| --- | --- | --- |
| near | 57 | 70.0k |
| medium | 41 | 26.1k |
| far | 15 | 1.9k |

The near level is within the unchanged 65-draw, 130k-triangle budget. The
model builds in about 0.1 s in node.

Occupant fit:

- Headroom over the heads is 0.20 m (pilot) and 0.23 m (passenger).
- Jevica's gown dips 0.08 m below the cockpit floor but stays inside the hull.
- Seven shared 5 cm voxels where the shoulders and elbows touch.

## Gaps (honest scope)

- No maneuvers, roll, loop, tuck dive or Petal Roll in play yet. The tuck
  pose exists only in the rig and the fixture.
- No pitch or roll in the authoritative pose.
- No passenger occupancy, so no two-client journey.
- No audio or VFX module.
- No GLB export.
- Materials are lighter than the references; detail art has not started.
- Not measured: performance in town and disposal across repeated garage swaps.
- The capture comparison is silhouette IoU plus coarse colour zones. It is
  not a pixel match and not Val's visual acceptance.
- Not tested: device, touch and human accessibility.

## Rollback

Revert the increment's merge commit. The `hover` kind, its server rules and the
saved vehicles are unchanged, so the coach returns as it was on #737.

## Next step

Run `pnpm run verify`, sign and commit, then open a draft PR against #737's
branch. After that, increment 2.
