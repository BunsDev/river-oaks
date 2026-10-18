# Throw follow-ups: shuffleboard and axes, sounds, a dart flight

## Objective

Val, 2026-10-18, after #535 (darts release and acceleration, wine pong repositioning), chose the throw follow-ups:
- bring #535's researched controls to shuffleboard and the axe lanes, which still used two-stop sweeping meters;
- add throw sounds;
- show a dart's flight.

- Task `throw-followups-20261018`, owner `claude:river-oaks-c5 (1e70822d)`.
- Branch `feat/throw-followups-20261018` in `../river-oaks-throw-followups-20261018`, from `origin/main` `ab0059fc` (#519 on #535).
- No other register task owned shuffleboard or the axes.

## Research

- **Axe throwing:** distance sets the rotation, and rotation decides whether an axe sticks.
  - Under one turn the handle hits first (step back); over one turn the top hits first (step closer).
  - Power is not the fix: the World Axe Throwing League's guide prefers changing distance to changing grip or throw, and Knives of the North's guides agree.
  - The standard throwing line is 12 ft (3.66 m), and venues let throwers stand back to about 15 ft.
- **The flight** follows #535's projectile model for darts (Smeets, Frens & Brenner 2002): the release sets the across position, and the speed sets the height through gravity drop.

## Design

- **Axes (shared, `server/axe-games.js` holds them):**
  - Left/right moves the release line; up/down sets the throw speed, 6.5–11 m/s. The height comes from the flight over the thrower's real distance to the target, so stepping back lands lower for the same throw.
  - The axe turns once over 4.1 m. `rotationError = distance / 4.1 − 1` plus a hand twist of 0.04 turns per unit draw. It sticks within ±0.11 turns, on the board, and on a 97 % grain roll.
  - Measured stick rates by distance: 3.66 m 51 %, 3.9 m 91 %, 4.1 m 96 %, 4.4 m 82 %, 4.7 m 16 %, 5.0 m 1 %.
  - The server takes the distance from the player's own position (`world.js` `distanceTo`, lane target minus room depth). The client sends only `release: [across, speed]`, and a forged `aim` or `stuck` is refused.
  - The reply's `rotation` ('clean', 'under' or 'over') becomes the coach's hint: "The handle hit first: under-rotated. Step back a little." It is feedback, not stored, so checkpoints keep `{point, stuck}` and need no version bump.
  - The house thrower throws from the ideal distance with its own hand.
- **Shuffleboard (practice):**
  - Left/right aim (Right drifts right as seen), up/down power, with taps, holds, Shift and sway as in `throw-controls.js`.
  - A click on the table solves for the aim and power that stop a lone puck there. The aim line and the lone-puck stop mark are always shown.
- **Sounds (`throw-sounds.js`):** synthesized WebAudio with no files.
  - The cues are release, dart, dart-miss, tap, clink, plop, slide, knock, axe-stick and axe-bounce.
  - They are created on the first throw (a user gesture) and are quiet by default.
  - One Sound switch is shared by every throwing sheet and remembered per viewer (`river-oaks-game-sounds`).
- **Flights (`board-flight.js`):** on the darts and axe sheets the dart or axe leaves the hand below the board and arcs onto where it landed, shrinking, in about 260 ms; reduced motion lands it at once.
  - Shared boards fly to the town's landing for the thrower's own throw, found by index because the house may answer in the same reply.
  - The regular's darts fly too.
- **Wine pong:** a release whoosh, then the right contact as the ball first comes down (plop into a glass, clink off a rim, tap on the linen) and as it settles.

## Files owned

- **New:** `preview/src/throw-sounds.js`, `preview/src/board-flight.js`, and their tests.
- **Changed:**
  - `preview/src/axe-rules.js` and `axe-panel.js`;
  - `server/axe-games.js` and `world.js` (the axe `distanceTo` only);
  - `preview/src/plaza-shuffleboard.js` and its CSS;
  - `plaza-darts.js` and its CSS, and `plaza-wine-pong.js` (sounds and flight);
  - `main.js` (test hooks and the axe distance);
  - `salon-guide-content.js` (the shuffleboard page);
  - tests: `preview/tests/axe-rules.test.js`, `server/tests/axe-games.test.js`, `server/tests/axe-venue.test.js`;
  - journeys: `plaza-shuffleboard`, `axe-venue`, `plaza-darts`, `ipic-darts`.

## Results so far

- **Focused unit tests:** 74 passed across axe rules, flight, sounds, controls, shuffleboard, darts, wine pong, the guide, and the axe and darts server suites. After the guide edit, 32 more passed.
  - The checkpoint test caught a `-0` landing (JSON stores it as `0`); axe landings normalise it now.
- **Build:** `pnpm run build` passed.
- **Journeys** (`plaza-darts`, `plaza-wine-pong` and `plaza-shuffleboard`, then the IPIC darts and axe venue two-browser runners): queued until load is under 60 with 5 GB free. At queue time load was 478 with 1.1 GB free (other sessions' gates and builds).

## Next action

Read the journey results, then:
1. run `pnpm run verify`;
2. make a signed commit;
3. open a PR and watch hosted CI.

Merging needs Val.
