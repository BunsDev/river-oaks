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
| 1 (#779) | D0 source map; reference import and hashes; D1 metric blockout, decisions and canonical views; procedural runtime model with interior, LODs, colliders, attachments and rig; integration into the existing `hover` path; the D1 comparison baseline | ready for review |
| 2 | Server-validated maneuvers: commands with id/seq/start, deterministic authored paths, swept-volume and recovery-altitude admission, dedupe of stale/reordered/duplicate input, focus loss and revocation recovery; orientation in poses | pushed to #779 (`1b84cb19`) |
| 3 | Two-player occupancy: passenger consent, server-derived passenger pose, disconnect recovery and safe landing, teardown; a two-client journey | in progress (see below) |
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

## Increment 2: server-owned maneuvers

Files:

- `preview/src/ribbonwing-maneuvers.js` (new, shared by server and clients): the
  four authored paths, the swept centre and wingtips, minimum entry altitudes
  (roll 3.92 m, loop 3 m, tuck dive 9.05 m, Petal Roll 3 m) and `validManeuver`.
- `preview/src/server-clock.js` (new): the town-clock estimate from `serverTimeMs`.
- `server/world.js`: the `maneuver` command, `maneuverRefusal`, settle on
  command, tick and snapshot, poses refused while active, and checkpoint and
  restore of the active maneuver.
- `preview/src/multiplayer-client.js`: `maneuver(kind)` (rising seq, one retry
  with the same id). Poses are suppressed until the path ends.
- `preview/src/parked-carriage.js`: the craft follows the path (yaw, then pitch,
  then roll) and feeds the rig the `maneuver` phase and tuck. It adopts or ends
  a maneuver from snapshots. Land and leave wait for the end.
- `preview/src/remote-players.js`: observers replay the path on the town clock,
  turning about the rider's seat.
- `preview/src/player-avatar.js`: the maneuver buttons and keys 1–4, and refusal
  messages. `main.js` wires the request and the debug fields.
- Tests: `server/tests/ribbonwing-maneuvers.test.js` (7) and
  `preview/tests/ribbonwing-maneuvers.test.js` (2). The journey adds maneuver
  steps to `preview/e2e/hover-coach.js`.

Decisions:

- Paths are deterministic functions of server time, and the craft's heading is
  fixed for the whole path. No orientation is streamed; every client derives
  it, so pilot and observers cannot disagree beyond clock-estimate error.
- Admission sweeps the whole path once. Recovery is a level hover at the
  current path point, which admission already proved clear.
- An early checkpoint draft converted the active maneuver into its recovery
  pose. That would end every maneuver whenever the Redis room restores from the
  checkpoint (another instance or a cache miss), so the active maneuver is now
  saved and re-validated instead.

Checks so far:

- `node --test server/tests/ribbonwing-maneuvers.test.js`: 7 passed.
- `node --test preview/tests/ribbonwing-maneuvers.test.js preview/tests/ribbonwing.test.js preview/tests/vehicles.test.js`:
  27 passed.
- `pnpm run test:server` (before the checkpoint change): 1085 passed, 1 failed,
  283 skipped. The failure was the office "supported district checkpoint
  recovery" test at load 44; it passed alone in 5.7 s. Not caused by this
  diff (no vehicle state), but it must be rerun.

- `node scripts/browser-lock.mjs 'ribbonwing maneuver journey' -- pnpm run test:experience hover-coach`:
  passed on the eleventh local run (27.5 s, 31 checks). `data/reports/experience.json`
  was restored after every run. The new checks:
  - maneuvers shown aloft;
  - a tuck dive from 5 m refused with the reason;
  - the roll admitted and published in the snapshot;
  - a maximum tilt of 3.00 rad, a level finish and the pilot still seated;
  - the path ending 0.00 m from its admitted end;
  - the town and the pilot agreeing.

  The failed runs found real defects, now fixed:
  1. The `carriage.maneuver(kind)` method shadowed the `maneuver` getter, so the
     UI saw a maneuver as always active. It is renamed `flyManeuver`.
  2. Ending a maneuver zeroed the movement budgets, so the pilot's first hover
     pose was `movement_too_fast`, and its correction unseated her. It now gets
     the 0.1 reset budget used elsewhere. A server regression test fails
     without the fix.
  3. A pose arriving during a maneuver was refused with a correction, which
     unseats the pilot. It is now refused without one, and the page stops
     sending poses while the request is pending.
  4. A riding pose reports the pilot's seat, so the path is the seat. The page
     had put the craft's origin on the path, about 1.4 m off. The craft now
     turns about the seat, as observers already did.

  The other runs were diagnostics, and one journey check was corrected to
  compare the seat rather than the craft origin.

Not covered:

- The downed and held aborts are verified by reading the code only, with no
  crime-flow test.
- The loop, tuck dive and Petal Roll are flown only in the server tests and the
  path tests. The journey flies the roll.
- Observer replay has no two-client run yet; that comes with increment 3.

## Increment 3: the passenger seat

Files:

- `server/world.js`: `ribbonwingCommand` (invite, cancel, board, leave),
  `seatView`, `settleSeat`, `setDownPassenger` and `releasePassenger`. Passengers
  are refused other commands, and a pilot's travel, stepping out or leaving sets
  the passenger down. Also checkpoint pairing and validation, and separation on
  a block.
- `server/blocks.js`: invitations and boarding toward a blocked account are
  screened as if aimed at someone absent.
- `preview/src/ribbonwing-seat.js` and `.css` (new): the passenger's walker
  transport, which rides the pilot's craft as drawn, and the seat panel (invite,
  board, cancel, step out; G steps out).
- `preview/src/remote-players.js`: passengers are drawn in the pilot's craft,
  remote or this page's own. Adds `craftOf` and `holderOf`.
- `preview/src/multiplayer-client.js`: no poses while aboard; `ribbonwing(body)`.
- `preview/src/walking-ui.js`: the "Riding in the Ribbonwing" title.
- `main.js`: wiring, and the `__riverRibbonwingSeat()` debug hook.
- Tests: `server/tests/ribbonwing-passenger.test.js` (5) and
  `preview/e2e/ribbonwing-passenger.js` (three clients). The journey is added to
  the hosted `commons` experience shard in `.github/workflows/verify.yml`.

Decisions:

- **Consent.** The pilot invites one named person and they accept. The
  invitation lasts 60 s and is not saved.
- **Position.** The passenger's position is derived on the server from the
  pilot's live pose, so pilot, passenger and observers all follow one source.
  Clients draw the passenger in the pilot's craft object, so the seat stays
  attached through rolls.
- **Safe landing.** A set-down uses the first clear spot (in bounds, free, not
  in a room or private home, 0.8 m from others) on rings around the point below
  the seat. Stepping out on the ground uses the point beside it. The fallback is
  the arrival spot.
- **Pilot disconnect.** A pilot who disconnects is removed after the
  transport's 30 s departure grace, and the passenger is then set down. During
  the grace the craft hovers where it was.

Checks so far:

- `node --test server/tests/ribbonwing-passenger.test.js server/tests/blocks-world.test.js`:
  15 passed.
- `node scripts/browser-lock.mjs 'ribbonwing passenger journey' -- pnpm run test:experience ribbonwing-passenger`:
  passed on the second run (120.7 s, 21 checks):
  - invite and board through the panels;
  - the town seats alice 0.68 m to the right;
  - Jevica's and bob's pages draw alice in the seat;
  - stepping out is refused aloft (button and G);
  - alice's view rolls (3.08 rad) and bob keeps her in the seat through the
    roll;
  - she steps out beside the landed craft (3.28 m) and walks on;
  - she boards again, Jevica's page closes aloft, the town sets alice down
    after 30 s, and she walks on while bob sees her on foot.

  The first run failed only on the journey's own measurement: it compared the
  seat base with the cushion, 0.92 m apart.

- `pnpm run verify` (core) passed on the increment 3 tree (dirty on `1b84cb19`):
  agent 289/0, preview 4357/0/1 skipped, server 1092/0/283 skipped, and the
  desktop, build, python, demo and secrets stages.
- `hover-coach` rerun:
  - The first run failed at "Boarding puts Jevica at the controls" after 9.5 s.
    The journey read the HUD title in the same frame boarding landed, and the
    title repaints every 150 ms.
  - The journey now waits for the title to change and reports what it read.
  - The second run passed 31 checks in 21.8 s. That the stale read caused the
    failure is likely but not proven.

Limits:

- bob's seat measurement checks that bob's page draws alice from Jevica's craft
  as bob draws it. It is not an independent cross-page comparison at one
  instant.
- The roll is the only maneuver flown with a passenger in the browser.
- During the 30 s grace after a pilot disconnects, the passenger hovers where
  the craft stopped. The craft does not land itself.

## D2 paint pass

Files:

- `preview/src/ribbonwing.js`:
  - pink insets on both faces of each wing, from behind an ivory leading-edge
    band to a thin trailing rim, with a fan hole;
  - the far wing is lacquer;
  - the body swoosh is widened;
  - `bendWing` gains a `surface` mode that lays a 4 mm skin 5 mm off the
    tapered face;
  - `tessellate` splits cap triangles before bending.
- `preview/src/ribbonwing-design.js`: version `d2-paint-1`.
- `preview/e2e/fixtures/ribbonwing.js`: perspective near plane 0.05. At 0.02 the
  depth precision at 24 m (about 1.7 mm) let the skins z-fight.
- `docs/design/ribbonwing/d2-paint.json` and `evidence/d2-{comparison,canonical}.png`,
  plus brief decision 12.

Results:

- The first render, with flat caps, buried the upper paint: top pink fell from
  0.19 to 0.14.
- With tessellated caps:
  - pink rises in every view (top 0.19 → 0.23, front 0.19 → 0.27, underside
    0.10 → 0.30);
  - every view stays at or above its D1 floor except the rear, at 0.401 against
    0.429;
  - brief decision 12 records why: the true, thinner wing replaces a thickened
    artifact.
- Near level: 57 draws and 92k triangles (it was 71k). Medium: 41 draws and
  32k. Far: unchanged.
- `node --test preview/tests/ribbonwing.test.js`: 8 passed.

## Increment 4a: effects and export

Effects (`preview/src/ribbonwing-sounds.js`, `ribbonwing-trails.js`):

- **Sounds** are synthesized, with no audio files:
  - a fan hum per craft that follows its fan rate and distance;
  - one-shots for the canopy, the gear and a maneuver's start.
- **Sound bounds:**
  - at most 2 hums, for the nearest crafts within 45 m;
  - at most 6 one-shot voices at once;
  - each one-shot kind no more than once every 0.4 s per craft.
- **Sound gating:**
  - no audio context until a click or key;
  - the page's one game-sounds switch (`throw-sounds.js`) silences everything, and the garage's maneuver row carries its toggle;
  - a hidden tab is silent;
  - `dispose()` stops every node, closes the context and removes the gesture listeners.
- **Wingtip ribbons:** one mint ribbon per wing side, drawn only during a maneuver.
  - Each is a fixed 40-sample ring in preallocated buffers, with one draw per side.
  - They fade out over 1.1 s afterwards.
  - Reduced motion draws none.
  - They are freed once with the vehicle.
- **Debug hook:** `window.__riverRibbonwingEffects()`.

Export (`scripts/ribbonwing/export-glb.mjs`, manifest `docs/design/ribbonwing/export-manifest.json`):

- **Contents:** the editable source is exported to a GLB.
  - It holds the three LOD levels as named nodes, 30 attachments, 6 colliders as named empty nodes with their shapes in extras, 16 materials and 13 mechanism pivots.
  - GLTFLoader sanitizes node names; match on `userData.name`.
- **Round trip:** loading the GLB back with three's GLTFLoader gives identical triangle counts (near 92,055, medium 31,829, far 1,872), attachment positions within 1e-5 m, every material and every pivot.
- **Determinism:** the export is byte-for-byte deterministic. Runtime handles in `userData` were made plain; before that, the file embedded random uuids.
- **Size and hash:** 10,744,884 bytes, sha256 `3518a80d…41a74b3b`. The binary is not committed; the exporter reproduces it.
- **Omitted:** the procedural micro-detail DataTexture, because GLTFExporter needs a DOM canvas to encode images. The game still builds the craft from source.

Tests:

- `preview/tests/ribbonwing-effects.test.js` (3 tests), with a counting WebAudio stand-in. Covers the gesture gate, hum bounds, the switch and hidden tab, one-shot crossings, rate limits, the voice cap, ribbon bounds and fade, reduced motion and dispose-once.
- `preview/tests/ribbonwing-export.test.js` (1 test): round trip, determinism and the size cap.
- hover-coach adds two ribbons during the roll, at most 40 samples each, which fade afterwards.

Verification on the paint, effects and export tree:

| Check | Result |
| --- | --- |
| `pnpm run verify` (core) | passed |
| agent | 289 passed, 0 failed |
| preview | 4361 passed, 0 failed, 1 skipped |
| server | 1092 passed, 0 failed, 283 skipped |
| desktop | 127 passed, 0 failed, 5 skipped |
| python | 171 passed |
| build, demo, secrets | passed |
| `pnpm run test:experience hover-coach` | passed, 33 checks in 23.5 s |

An earlier preview run was voided: it read `ribbonwing.js` mid-edit (4 failures, `createRibbonwingTrails is not defined`). It was stopped and rerun on the frozen tree.

Not covered:

- No one has listened to the sounds; the tests prove bounds, not how they sound.
- No device audio test.

## In-town cost and disposal

`preview/e2e/ribbonwing-lifetime.js` is a diagnostic journey, not in the hosted shards. Run it with:

```
node scripts/browser-lock.mjs 'ribbonwing lifetime' -- pnpm run test:experience ribbonwing-lifetime
```

As the owner, it calls the Ribbonwing and the motorcycle in turn, six Ribbonwing calls in all. Changing the ride disposes the old model. Two runs passed on 2026-10-29, at host load 23–25:

| Measure | Run 1 | Run 2 |
| --- | --- | --- |
| Renderer geometries before / after | 570 / 570 | 570 / 570 |
| Renderer textures before / after | 167 / 167 | 167 / 167 |
| Craft-owned resources while parked | 30 geometries, 1 texture | 30 geometries, 1 texture |
| Geometries on each parked call | 600 every call | 600 every call |
| Collected heap growth over the cycles (bound 12 MB) | 3.0 MB | 3.7 MB |
| fps, motorcycle in view | 60.7 | 53.8 |
| fps, Ribbonwing in view | 60.0 | 56.8 |
| Page errors | none | none |

- The 1 craft texture is the procedural detail map.
- The heap growth is bounded, not zero. It was not attributed with heap snapshots, so a small per-build retention is not ruled out.
- Frame rate is load-dependent and reported only. Whole-frame calls and triangles shift with where the craft parks and the camera's view, so they are not a cost measure. The model's own cost is in `ribbonwing.test.js`: near 57 draws and 92k triangles.

Not measured:

- GPU time.
- Device or mobile frame rates.
- Many Ribbonwings at once.

## All four maneuvers in the browser

`preview/e2e/ribbonwing-maneuvers.js` is a new experience journey. The roll stays in hover-coach.

- As the owner: board, climb past 10.5 m, then fly the tuck dive (key 3), loop (2) and Petal Roll (4) in turn, land and step out.
- Each endpoint is computed from the shared path module (`maneuverPose`) in Node and compared with both the pilot's seat and the town.
- First local run passed: 21 checks in 31.5 s, host load about 21.

| Maneuver | Endpoint error (seat / town) | Altitude (town / path) | Signature observed |
| --- | --- | --- | --- |
| tuck dive | 0.00 / 0.00 m | 8.23 / 8.23 m | tuck 1.00, drop 6.0 m |
| loop | 0.00 / 0.00 m | 8.23 / 8.23 m | inverted at the top (up −1.00), nose vertical (1.00) |
| Petal Roll | 0.00 / 0.00 m | 8.23 / 8.23 m | roll 3.03 rad, tuck 0.45 |

- Each finishes level with Jevica seated.
- No pose was corrected through the whole flight, and there were no page errors.
- The tuck dive's path has no pitch term, so it drops nearly level. The journey does not claim a nose-down dive.

Hosted failure on `8e0d310e`, preview experience (commons): `ribbonwing-passenger` failed "alice's page says she is riding in the Ribbonwing". The same journey had passed locally with 21 checks.

- The check read the HUD title immediately after the seat was granted, but the title repaints every 150 ms.
- hover-coach had the same race on "Piloting", fixed earlier.
- Both reads in the passenger journey (aboard and on foot again), and hover-coach's "Flying" read, now wait for the repaint and print the title they saw.
- The race is the likely cause, not a proven one: the hosted log shows only the message.

After the fixes, one local run of all three on the final tree passed: hover-coach 33 checks (24.6 s), ribbonwing-passenger 22 (138.5 s), ribbonwing-maneuvers 21 (31.8 s).

Hosted failure on `aa255f44`, preview experience (ribbonwing):

- `ribbonwing-maneuvers` passed (41 s).
- `ribbonwing-passenger` failed at line 96: "Timeout 10000ms" waiting for the town to see alice 0.5 m from where she stepped out.
- The failure screenshot shows the runner on software rendering. The journey held S for a fixed 900 ms, which can be only a frame or two of movement there. This is the likely cause, not proven.
- Both walk-aways (after stepping out, and after being set down) now hold the key until the town sees her move, up to 30 s. On a timeout they report her town and local positions and the town's last refusals. Each peer page collects refusals from load.
- Local rerun passed: 22 checks in 102.2 s.

CI: commons took 16 min with `ribbonwing-passenger` failing early, against a 20-min timeout. Commons returns to #737's `east-garden-commons hover-coach`. A new `ribbonwing` shard runs `ribbonwing-passenger ribbonwing-maneuvers`.

## Status at handoff (2026-10-30)

| Gate | Revision | Result |
| --- | --- | --- |
| `pnpm run verify full` | snapshot of `aa255f44` (`git archive` → snapshot commit `957ec05f`), isolated Redis on port 16779 | passed |
| Hosted Verify | `aea00600` | all 21 checks passed |

`verify full` stages:

| Stage | Result |
| --- | --- |
| dependency audit | no vulnerabilities |
| agent | 289 passed, 0 failed |
| preview | 4362 tests, 0 failed |
| server with Redis | 1417 tests, 0 failed |
| desktop | 132 tests, 0 failed |
| build, python lint/format/tests, demo, secrets, secret history | passed |
| browser security | 2 passed |
| reflections | passed |
| experience | 16 journeys passed |
| experience-commons | passed |
| shared | passed |
| ipic-screening | passed |
| journeys overall | 49 passed, 0 failed |

- The stages waited about 1.5 h on other sessions' browser locks.
- `aea00600` differs from `aa255f44` only in `preview/e2e/ribbonwing-passenger.js` and this ledger.
- `verify full`'s journey lists do not include hover-coach or the Ribbonwing journeys. Those ran in the hosted shards and in separate local runs.

Hosted Verify on `aea00600` includes:

| Check | Result |
| --- | --- |
| preview experience (ribbonwing) | passed in 4 min |
| preview experience (commons) | passed in 8 min |
| aggregate `preview` | passed |

Earlier hosted failures, both fixed or explained:

- `8e0d310e`: stack rehearsal, the pre-#756 defect; the base lacks #756. Also a passenger title race, now fixed.
- `aa255f44`: the passenger walk-away hold, now fixed.

Not done or not verified:

- No human, device, audio, mobile or GPU acceptance. Nobody has listened to the sounds.
- Pink coverage still trails the references in top, hover and stunt views. Detail art beyond the D2 paint pass is not done. Silhouette IoU is not a pixel match.
- The rear IoU sits below its D1 floor; the floor is now reset to D2 (decision 12).
- Heap growth over six Ribbonwing calls is 3–4 MB. It is bounded but not attributed.
- The GLB omits the procedural micro-detail texture. The binary is not committed; the exporter reproduces it byte for byte.
- Rollback with live checkpoints carrying `maneuver` or passenger fields has not been exercised against #737's restore.
- The base #737 is 114 commits behind main and lacks #756. Rebasing the stack is the owners' call.
- The craft does not auto-land during the pilot-disconnect grace.
- The downed and held maneuver aborts are verified only by reading the code.

## Rollback

Revert the increment's merge commit. The `hover` kind, its server rules and the
saved vehicles are unchanged, so the coach returns as it was on #737.

## Next step

Run `pnpm run verify`, sign and commit, then open a draft PR against #737's
branch. After that, increment 2.
