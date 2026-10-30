# Bicycle riding pose (2026-10-26)

Task `rider-pose-20261026`. Branch `feat/rider-pose-20261026` from main a13c853b, in the
worktree `../river-oaks-rider-pose-20261026`. Owner: claude:ios-draw-budget-289 (4c25a886).
Requested by Val on 2026-10-26: "enhance the way the player sits and moves on the bike to
look more realistic".

## Objective

A rider on the plaza bicycle (the local player and remote players) should look like they
are riding it:

- the crank turns with the distance ridden;
- the ball of each foot stays on its pedal, with the heel dropping over the top of the
  stroke and the toe pointing through the bottom;
- the hands hold the grips and follow the steering;
- the torso leans forward like a city-bike rider, and the head stays up;
- at a stop, the rider slides forward off the saddle with the foot on the lower-pedal side
  on the ground.

Movement, collision and server state do not change. Reduced motion keeps the pedalling,
because it follows the player's own movement, but drops the hip rock.

## Baseline (main a13c853b)

- `avatars.js` places a bicycle rider's feet 0.44 m forward of the saddle at
  bottom-bracket height, as if resting on a floor, with no pedals involved. The arms
  take a fixed bend in the air (`upperarm .20`, `lowerarm .60`).
- `road-vehicles.js` has two static pedal boxes at bottom-bracket height and no crank
  arms. The chainring is a horizontal disc: the cylinder was never rotated onto the
  bike's axle.
- `driving-hands.js` already places palms on a vehicle's `grips` for the carriage
  driver (motorcycle or rolls), but nothing uses it for the bicycle.

## Reach probe (`.runtime/rider/reach-probe.mjs`, all nine rigs)

| Measure | Women's rigs | Men's rigs |
| --- | --- | --- |
| Thigh-to-ankle reach | 0.770–0.788 m | 0.862–0.868 m |
| Ankle to ball of the foot | 0.12–0.13 m | 0.14 m |

- Thigh to the pedal at the bottom of the stroke: 0.817–0.821 m. Every rig reaches it
  with a slight knee bend, with the ball of the foot on the pedal.
- Upright shoulder to grip: 0.639–0.657 m, against an arm reach of 0.455–0.523 m. The
  rider needs a forward lean of about 22–25°.
- Ground below the thigh when seated: 0.945 m, beyond every rig's straight-leg reach. A
  stopped rider must come forward off the saddle to put a foot down.

## Files owned

- New: `preview/src/bicycle-crank.js`, `preview/src/bicycle-rider.js` and
  `preview/tests/bicycle-rider.test.js`.
- `preview/src/road-vehicles.js` (bicycle crank and pedals),
  `preview/src/vehicle-config.js` (bicycle grips and steering pivot) and
  `preview/src/driving-hands.js` (bicycle grip frame, shared arms).
- `preview/src/avatars.js` (riding block), `preview/src/plaza-bicycle.js` (pedalling
  model, crank, ride pose steering), `preview/src/player-avatar.js` and
  `preview/src/remote-players.js` (riding inputs only).

## Checks

- Focused: `bicycle-rider.test.js` (every rig, a full crank turn, steering, the stop
  stance and reduced motion), plus the `vehicles`, `plaza-bicycle`, `furniture-pose`,
  `remote-players` and `carriage` tests. The new test must fail on main's riding block.
- `pnpm run verify`.
- The cycling-rack browser journey, and inspected captures at several crank phases,
  while steering and at a stop.

## Results

Recorded on the uncommitted branch at base a13c853b (2026-10-26).

- **Focused suites:** `bicycle`, `vehicles`, `plaza-bicycle`, `furniture-pose`,
  `remote-players`, `carriage*`, `driving`, `cycling-leaderboard`, the garment bake tests
  and `bake-provenance` all pass: 122 of 122, none skipped.
- **The new tests are behavioural.** With main's `avatars.js` riding block swapped in,
  keeping the branch's crank and bike, 3 of the 4 `bicycle-rider.test.js` tests fail:
  - "woman-casual l at 0°: the ball of the foot is over the spindle (-0.304, 0.004)";
  - "the right shoe stands on the ground (0.300 m)".

  The fourth test, the bike's own crank, passes. The file was restored and its hash
  checked.
- **Bake provenance:** `avatars.js` is a bake input, so the five garment bakes were rerun
  with `--write`.
  - All six `*-morph-data.js` outputs are byte-identical (`shasum -c`).
  - Only the five receipts' input hashes change.
  - No bake input changed on main between a13c853b and c6eba6a3.
- **Captures:** `preview/e2e/rider-captures.js` is a local tool and is not committed.
  - It ran through the experience runner (log `.runtime/rider/browser-3.log`, passed) and
    saved 19 shots to `output/playwright/rider-*.png`.
  - Rowan was worn so the legs show. The camera follows the bike every frame.
  - Inspected:
    - Pedalling at 0.8–3.7 m/s: hands on the grips, a forward city-bike lean with the
      head up, and the boots on turning pedals.
    - A stop: the left foot on the ground beside the front wheel, the right boot ready
      on the forward pedal.
    - Bars at full lock while stopped: the bars, front wheel and shoulders turn
      together.
    - A second account's view: the same pose, pedalling and stopped.
  - An earlier run in Jevica's gown showed the gown covering both legs and clipping
    through the top tube. That is the existing garment, not this change.
- **`cycling-rack` journey:** fails, and the failure predates this branch.
  - On this branch (`browser-1.log`, `browser-2.log`) and on main 40f4e786 (scratch log,
    `RIVER_OAKS_E2E_REPORT=cycling-main-20261026.json`) it stops in the final
    "due west" heading hold.
  - Each time the bike stands at speed 0 on full right lock, after 19.6 m and 17.2 m here
    and 17.3 m on main, short of the 20 m the journey needs.
  - The bike's occupancy guard is unchanged here.
- **Merge of main 52c43c7a (f4b69767, 2026-10-27).** #691 had become unmergeable.
  - Only the five garment receipts conflicted, on their input hashes. They were rebaked on
    the merged tree, and all `*-morph-data.js` are byte-identical.
  - Focused rider suites: 83 of 83. Bake and receipt tests: 380 of 380.
  - Core gate: passed, 03:23–03:28Z, on the staged merge (`.runtime/rider/verify-merge.log`;
    its label says 9ee35b4c, which differs from 52c43c7a only in CI-scope files):
    - 289 of 289;
    - 4229 pass, 1 skip;
    - 970 pass, 251 skips;
    - 127 pass, 5 skips.
  - `cycling-rack` is intermittent on both trees, with one stall. The bike stands at speed
    0 against the plaza's long white table at about (−2795.2, 1295.5), after 17–19 m, in
    the final due-west hold (failure capture in `scratchpad/rider-snap-merge/output`).
    - On main 52c43c7a it passed twice and failed once. Including 40f4e786: 2 of 4.
    - On this branch, before and after the merge, it passed once in 6 runs.
    - The last four runs alternated main, branch, branch, main
      (`scratchpad/cycling-abba.log`): pass, fail, pass, fail.
  - A frame probe (local, `scratchpad/rider-frame-probe.js`) ran in the same alternating
    order. Every run held 60 fps standing and riding (median and p95 16.7 ms, max 16.8 ms)
    and rode 5.7 m in 4 s, so the rider pose costs no frames and doesn't change the ride
    (`scratchpad/frame-probe-abba.log`).
- **Core gate:** `pnpm run verify` (core, Python 3.12) passed on 2026-10-26, 23:06–23:14Z, at a 1-minute
  load of 57 (receipt `.runtime/agent/core.json`):
  - 276 of 276;
  - 4176 pass, 1 skipped;
  - 915 pass, 225 skipped (Redis-gated server cases);
  - 120 pass, 3 skipped.

  Core excludes Redis, browser, native and live acceptance.

## Gaps

- `cycling-rack` needs its own investigation on main. Its heading controller sometimes
  turns west too late and pins the bike against the plaza's long white table. Once
  stopped, the bike can't turn. It is not fixed here.
- A long gown still covers the legs and clips the frame while riding.
- The pose is not checked on phone or WebKit renders.

## Next

Hosted checks on #691's merged head. Merging awaits Val. `cycling-rack` belongs to a
separate task on main.
