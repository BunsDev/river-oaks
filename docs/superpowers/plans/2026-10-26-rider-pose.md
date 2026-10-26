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
- **Core gate:** `pnpm run verify` (core, Python 3.12) passed on 2026-10-26, 23:06–23:14Z, at a 1-minute
  load of 57 (receipt `.runtime/agent/core.json`):
  - 276 of 276;
  - 4176 pass, 1 skipped;
  - 915 pass, 225 skipped (Redis-gated server cases);
  - 120 pass, 3 skipped.

  Core excludes Redis, browser, native and live acceptance.

## Gaps

- `cycling-rack` needs its own investigation on main: something in the plaza (static or
  a resident, `plaza-bicycle.js` `canOccupy`) now blocks the westward leg. It is not fixed
  here.
- A long gown still covers the legs and clips the frame while riding.
- The pose is not checked on phone or WebKit renders.

## Next

Open the draft PR, update the register, and report the `cycling-rack` failure on main.
