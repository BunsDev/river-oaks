# Office lift ride: the body stays on the car floor (2026-10-15)

## Objective and ownership

Val, 2026-10-15: "patch the direction the user travels when the elevator moves up. keep
the player on level plane with the elevator". Branch `fix/office-lift-ride-level-20261015`
in `river-oaks-lift-ride-level`, owner `claude:river-oaks-safe-edits (e9aa0185)`, register
task `office-lift-ride-level`, base `15c5b7d1` (origin/main at pickup). #449 and #450
landed meanwhile and also edit `office-world-scene.js` (live outlook lights and
visibility), not the presentation pose or `inspect`; main is merged in after the fix.

## Finding

A browser probe of the street arrival (`preview/e2e/office-lift-ride.js`, first as a
recorder) sampled `window.__riverOffice()` every frame. The placed avatar (`holder`) and the
camera kept a constant height above the rising car (18.429 m and 20.289 m minus elevation,
every frame from 0 to 24.3 m), yet the screenshots showed Jevica standing in the car while
the doors closed and **gone** at Level 2, Level 4 and as the doors opened.

Cause: `foot-placement.js` treats any height change faster than 1.2 m/s as a curb step. The
rendered body keeps its old height, decaying toward the new one at 8/s, and the pelvis then
rises at most 0.5 m/s (`RISE_CAP`); the planted shoes stay at their world positions. The car
climbs at up to about 15 m/s, so every frame read as a step: the body and shoes stayed
behind while the car rose, i.e. they travelled down through the car floor relative to it,
and would have needed about 49 s to climb 24.3 m.

## Change

- `foot-placement.js`: optional `locomotion.platform`, the world position of a moving floor.
  Its per-frame travel is added to the remembered world state (last root position, body
  root height, body height, planted shoe targets, swing endpoints) before the step logic, so
  the climb is neither a curb step nor a relocation. Without `platform` nothing changes.
- `foot-roll.js`: `carry(offset)` moves the remembered contact and last target the same way.
- `player-avatar.js`: passes `pose.platform` into the locomotion it already forwards.
- `office-world-scene.js`: the ride presentation passes the stage (car) position as
  `platform`; `inspect()` also reports the rendered shoes' world heights (`shoes`) so a
  journey can check where the body is drawn, not only where it is placed.

## Checks and evidence

- Unit regression (`preview/tests/curb-descent.test.js`, "a body standing in a rising lift
  car rides on its floor with both shoes on it"): woman-casual and jevica at 30, 60 and
  120 Hz on the real arrival curve. On the unchanged code it failed at woman-casual 30 Hz
  frame 42 ("l shoe out of reach by 0.105 m"); with the change the hips and both shoes
  stay within 5 mm of their standing height above the floor, and every shoe in reach.
- Browser journey `office-lift-ride` (experience runner, Metal ANGLE): with the platform
  hand-off removed from `player-avatar.js` (main's behaviour) it **failed**: "Both shoes
  ride on the car floor: worst 21.546 m at ascending 24.3 m", and the screenshots show an
  empty car. With it, **passed**: worst 0.000 m over 200 and then 201 frames, Jevica
  standing in the car at Level 2 and Level 4. It now runs in CI's `preview experience
  (places)` shard (that job took 7 of its 20 minutes on main).
- Focused suites: curb-descent, foot-placement, foot-roll, walking-posture,
  upper-body-gait, office-world-presentation, office-skyline: 50/50.
- `pnpm run verify`: core passed (112/112; 3,297/3,299 with 1 skipped; server 598/751
  with 153 skipped; 69/69; pytest 141).
- `office-visit` journey: every ride, walking and leaving check passed; the run then
  timed out (15 s) waiting for the owner's "Accept" button in the guest-request step at
  load average 103. A rerun alone timed out earlier, in setup before the
  ride (60 s), with load still about 100 (another browser and a VM). The guest step is left
  to CI's places shard, which runs `office-visit` before landing.

## Gaps and next step

Not run: hosted CI (pending), the legacy fallback scene (its car does not move), a
physical device, and the penthouse layout's own lift (a fixed-endpoint transition with no
moving car). Val authorized PR, landing when CI is green and retirement (2026-10-15).
