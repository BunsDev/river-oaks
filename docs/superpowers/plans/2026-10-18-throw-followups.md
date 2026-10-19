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
- **Sounds (`throw-sounds.js`):** synthesized WebAudio with no files. `play()` returns `{ stop }` (the shuffleboard hiss stops with its slide), and a broken audio stack never throws into a game.
  - The cues are release, dart, dart-miss, tap, clink, plop, slide, knock, axe-stick and axe-bounce.
  - Each throw's press unlocks the context inside its own gesture: WebKit starts audio only there, and a shared throw's first sound waits for the town's reply. Quiet by default.
  - One Sound switch is shared by every throwing sheet and remembered per viewer (`river-oaks-game-sounds`).
- **Flights (`board-flight.js`):** on the darts and axe sheets the dart or axe leaves the hand below the board and arcs onto where it landed, shrinking, in about 260 ms; reduced motion lands it at once.
  - Shared boards fly to the town's landing for the thrower's own throw. The reply names it (`thrown`, recorded before the house answers in the same reply).
  - The Throw button holds while the town answers (`pending`), so a double click is one throw. A reply for a sheet closed or reopened meanwhile is dropped.
  - The regular's darts fly too.
- **Wine pong:** a release whoosh, then the right contact as the ball first comes down (plop into a glass, clink off a rim, tap on the linen) and as it settles.

## Files owned

- **New:** `preview/src/throw-sounds.js`, `preview/src/board-flight.js`, and their tests.
- **Changed:**
  - `preview/src/axe-rules.js` and `axe-panel.js`;
  - `server/axe-games.js` and `world.js` (the axe `distanceTo` only), and `server/darts-games.js` (the reply's `thrown`);
  - `preview/src/plaza-shuffleboard.js` and its CSS;
  - `plaza-darts.js` and its CSS, and `plaza-wine-pong.js` (sounds and flight);
  - `main.js` (test hooks and the axe distance);
  - `salon-guide-content.js` (the shuffleboard page);
  - tests: `preview/tests/axe-rules.test.js`, `server/tests/axe-games.test.js`, `server/tests/axe-venue.test.js`, `server/tests/darts-games.test.js`;
  - journeys: `plaza-shuffleboard`, `axe-venue`, `plaza-darts`, `ipic-darts`, and the design-review script `axe-venue-views.mjs` (moved off the removed `holdAt`; not run, since it rewrites `docs/design/axe-and-darts`).

## Results

At `c5f29643` (before the review):
- **Focused unit tests:** 74 passed across axe rules, flight, sounds, controls, shuffleboard, darts, wine pong, the guide, and the axe and darts server suites. After the guide edit, 32 more passed.
  - The checkpoint test caught a `-0` landing (JSON stores it as `0`); axe landings normalise it now.
- **Build:** `pnpm run build` passed.
- **Journeys** (local Chromium, under the browser lock):
  - `pnpm run test:experience plaza-darts plaza-wine-pong plaza-shuffleboard` passed: 24, 36 and 23 checks.
  - `node preview/e2e/axe-venue-runner.mjs` passed 8 checks.
  - `node preview/e2e/ipic-darts-runner.mjs`: the first run stopped walking to a waypoint before any darts ("could not reach 1.4, 20.6", load in the hundreds). The rerun passed 6 checks, but main was merged into the tree during it, so it is not counted.
- **Main:** merged at `b79914ad`; main's plans index lacked the plans from #515 and #529, regenerated at `36afb585`.

## Independent review (read-only subagent) and fixes

No server-authority or checkpoint defect: a forged point, stick or distance is refused, a NaN distance is refused before anything is stored, and stored throws keep `{point, stuck}`.

Fixed:
1. **A double send:** a double click (or a held Enter) on the axe or shared darts Throw sent two throws before the first reply. Against the house both were taken, and the second flight followed the first axe, because `before` came from the 200 ms snapshot.
   - Now `pending` holds the button until the town answers, and the server names the thrower's own throw (`thrown`).
   - The ticket is taken at press time, so a reply for a closed or reopened sheet is dropped.
2. **The design-review script** `axe-venue-views.mjs` still called the removed `holdAt`.
3. **`flying` could stay on:** an exception inside the sound code could leave it set. `play()` now catches everything, and every flight clears `flying` in a `finally`.
4. **WebKit silence:** the audio context was first made after the town's reply, outside the gesture. Presses now call `sounds.unlock()`.
5. **A dimmed Throw button:** after New game or a mode switch mid-flight, the darts Throw button stayed dimmed. Those actions, and close, now clear `pending` and `flying`.
6. **The shuffleboard hiss** ran for the simulated length (about twice the animation, four times under reduced motion). It is now sized to the animation and stopped when the slide ends or is cancelled.

Regressions:
- `server/tests/axe-games.test.js` and `darts-games.test.js` check that `thrown` names the thrower's own throw when the house answers in the same reply.
- `throw-sounds.test.js` covers the early stop, the unlock, and a context whose `createBuffer` throws.
- The `ipic-darts` journey makes alice's first dart a double click and checks that exactly one dart lands.

After the fixes:
- 19 focused tests passed (sounds, flight, axe and darts server suites), then 40 across every darts and axe command test plus the shuffleboard, darts and axe rules.
- `pnpm run build` passed.

## Final results

Each run below logged the head it started and ended on, and no tree was edited while it ran.

At `4dcb19a0` (the review fixes):
- `pnpm run test:experience plaza-darts plaza-wine-pong plaza-shuffleboard` passed 24, 36 and 23 checks.
- `node preview/e2e/ipic-darts-runner.mjs` passed 7 checks, including "a double click on Throw while the town answers throws one dart".
- `node preview/e2e/axe-venue-runner.mjs` passed 8 checks.
- `pnpm run verify` (core) passed: agent 121, preview 3619 with 1 skip, server 677 with 204 skips (the distributed suites, which need `REDIS_URL`), desktop 76, Python 141.
- Hosted CI passed all 16 checks.

Main `5ce4e767` (#520, #522, #533, #538) merged at `ea807b93`. The plans index was the only conflict and is regenerated. At `ea807b93`:
- 56 tests across the throw, darts, axe, shuffleboard and wine pong files passed, and `pnpm run build` passed.
- The plaza journeys passed 24, 36 and 23 checks; IPIC darts 7; axe venue 8.
- `pnpm run verify` (core) passed: agent 121, preview 3627 with 1 skip, server 697 with 207 skips (the same distributed suites), desktop 76, Python 141.
- **Hosted `verify` fails at the history secret scan, for every PR, not because of this one.**
  - `verify.yml` scans every remote branch (`gitleaks git --log-opts=--all`).
  - Commit `00a74a7c` on #545's branch adds a character source manifest whose public SHA-256 digests trip `generic-api-key`.
  - #545's own config allows them; main's does not.
  - #546 (owned by `claude:river-oaks-95`) brings the allowlist to main.

Not run: `axe-venue-views.mjs`, because it rewrites `docs/design/axe-and-darts`; `pnpm run verify full`; any human play review or real-device audio check.

## Next action

1. After #546 lands, merge main and confirm hosted `verify` passes on the new head.
2. Merging needs Val (`pnpm run land 542`).
