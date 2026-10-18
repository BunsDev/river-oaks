# Darts release and acceleration, and wine pong repositioning

## Objective

Val, 2026-10-18:
- Darts: "left and right for where to release the dart and up and down for the acceleration", with mechanics researched against virtual-darts practice.
- Wine pong: repositioning must not exit the game, and its mechanics should improve.

- Task `throw-mechanics-darts-pong-20261018`, owner `claude:river-oaks-c5 (1e70822d)`.
- Branch `feat/throw-mechanics-darts-pong-20261018` in `../river-oaks-throw-mechanics-20261018`, from `origin/main` `97304fb7`.
- No other register task or worktree touched darts or wine pong at the start.

## Files owned

- `preview/src/darts-rules.js`: the shared release physics.
- `preview/src/plaza-darts.js`, `preview/src/plaza-darts.css`: the sheet; one module serves the plaza, IPIC and venue boards.
- `server/darts-games.js`: the shared boards' authority.
- `preview/src/plaza-wine-pong.js`, `preview/src/plaza-wine-pong.css`.
- `preview/src/throw-controls.js` (new): the shared held-key control, with `preview/tests/throw-controls.test.js`.
- `preview/src/plaza-salon-plan.js`: `winePongNear` and `WINE_PONG_LEAVE` only.
- `preview/src/salon-guide-content.js`: the darts and wine pong pages and their throw diagrams only.
- `preview/src/main.js`: the test hooks for these games only.
- Tests: `preview/tests/darts.test.js`, `preview/tests/wine-pong.test.js`, `server/tests/darts-games.test.js`, `server/tests/darts-ipic.test.js`.
- Journeys: `preview/e2e/plaza-darts.js`, `preview/e2e/ipic-darts.js`, `preview/e2e/plaza-wine-pong.js`.

## Research

- **Real darts.** Smeets, Frens & Brenner, "Throwing darts: timing is not the limiting factor", *Exp Brain Res* 144:268–274 (2002):
  - The board is 2.37 m away with the bull at 1.73 m.
  - The hand accelerates at about 50 m/s² to a peak of 5.8–6.7 m/s, and the dart leaves near the top of the hand's path.
  - Horizontally no force acts after release, so release direction alone sets where the dart lands across the board. The speed sets the height, because the dart falls on its way: too slow lands low, too fast lands high.
  - Point-mass model: `FT = z / (v cos φ)` and `y = y₁ + v sin φ · FT − g/2 · FT²`.
  - Amateur scatter: vertical SD 2.9–6.1 cm and horizontal SD 2.7–6.1 cm.
- **Games.** The Wii PDC World Championship Darts games:
  - aim with a cursor, and throw strength sets the height: a hard throw lands above the cursor, a soft one below;
  - offer assist levels that show the strength before the throw;
  - offer a Nunchuk stick scheme to set power without motion timing.
  
  Reviews criticised the DS version's small sweet-spot power meter for pulling attention off the board. Hand sway that grows while you hold gives the throw a moment to time (GTA V darts). Swipe-based darts map swipe speed to height and swipe angle to direction. Reviewers consistently ask for aiming to be separate from letting go.
- **Beer pong games.** Two-step aim then power (First South Beer Pong), pull back to charge (Cinderblock Champion) and swipe throws are all used. A trajectory or landing preview is common. The skill comes from timing a moving target, not from hidden numbers.

## Design

### Darts

- **Left/right sets the release line** across the board, in millimetres, because the horizontal is a straight line from the release.
- **Up/down sets the hand's acceleration.** Over a 0.36 m stroke, acceleration gives the release speed (`v = √(2·a·s)`: 50 m/s² gives 6.0 m/s). The release angle is fixed, so the nominal 6.0 m/s lands at bull height (`φ ≈ 16.5°` over 2.0 m from hand to board).
  - The height then follows the paper's parabola.
  - The control range is 35–75 m/s²; about 60 m/s² reaches the treble 20.
- **Hand scatter.** Horizontal is a direction error (18 mm, as the shared boards have used). Vertical is a speed error of 0.09 m/s, so it carries 18 mm at 6 m/s and more on a slow, loopy throw, less on a firm one.
- **Sway.** A slow, bounded sway of the release line and acceleration (about ±7 mm each) grows after five seconds held still. You time the throw as the guide passes your target.
- **Landing guide.** The predicted landing (before scatter) is drawn on the board by default. It can be turned off for an assist-free throw read from the acceleration gauge and the last dart.
- **Authority.** Shared boards receive only `release: [x, acceleration]`. The server adds the scatter and computes the landing; a forged `aim` point is refused.

### Wine pong

- **Left/right aims, up/down sets the power.** Both are held, Shift gives fine control, and a gentle sway is applied. A click or drag on the table view sets the target. Space or Throw throws. The landing marker is always shown.
- **Reposition keeps the game open.** The sheet stays, the meter pauses and focus returns to the world, so walking moves the avatar and the hand on the sheet follows live. X or Throw resumes at your end.
  - Stepping a little off the legal end pauses with a prompt instead of closing.
  - Only walking well away from the table (or Leave, Esc, X before repositioning) puts it away.

## Checks

To run:
- `node --test preview/tests/darts.test.js preview/tests/wine-pong.test.js server/tests/darts-games.test.js server/tests/darts-ipic.test.js preview/tests/salon-guide.test.js`
- `pnpm run test:experience plaza-darts plaza-wine-pong`; the IPIC darts journey runs where browsers allow.
- `pnpm run verify`.

## Implementation

- `darts-rules.js` (pure, shared by the client and server):
  - `THROW`: 2.0 m, 0.36 m stroke, 35–75 m/s², ±230 mm across, release angle 16.51°.
  - Functions: `releaseSpeed`, `heightAt`, `landingOf`, `accelFor` (inverse), `HAND` {18 mm, 0.09 m/s}, `handDraw`, `throwLanding` (held to ±400 mm, the checkpoint bound) and `validRelease`.
  - Measured mapping:
    - 35 m/s² lands 254 mm low (off the board);
    - 50 m/s² hits the bull;
    - 60.5 m/s² hits the T20;
    - 70 m/s² hits the D20;
    - 75 m/s² lands 198 mm high.
    
    Vertical scatter for the same speed error: 23 mm at 42 m/s², 18 mm at 50, 13 mm at 62 and 11 mm at 70. Near the T20 one m/s² is about 8 mm, the treble ring's width.
- `server/darts-games.js`: `throw` takes only `release: [x, acceleration]` and flies it with its own draws. A forged `aim` point, a release out of range, and an extra `point` are refused (`invalid_darts`). Landings are now held to the recorded square; before, a logistic tail could exceed the checkpoint's 400 mm bound.
- `plaza-darts.js` (plaza, IPIC and venue boards):
  - Left/right (or A/D) move the release line; up/down (or W/S) move the acceleration. A tap is one step (2 mm, 0.25 m/s²); a hold keeps moving (120 mm/s, 9 m/s² per second); Shift makes both a quarter.
  - A drag on the board places the release under the pointer.
  - The hand sways (±7 mm, ±0.8 m/s², up to double after 12 s held). The landing guide can be toggled and its setting persists per viewer.
  - The acceleration gauge marks the bull's acceleration and your last throw; there is a readout.
  - Practice darts get the same hand error, seeded per game and dart.
- `throw-controls.js`: a tap is a step; a hold moves by elapsed time, not frames.
- `plaza-wine-pong.js`:
  - Left/right aim and up/down set the distance (taps 0.01, holds 0.3 a second, Shift fine). A click or drag on the table sets the target. The hand sways (about ±3 cm at the rack) and the landing mark is always shown.
  - Reposition (button or R) keeps the sheet open: the world takes the keys, the launch follows the walk live, Throw reads Resume, and X resumes ("Resume wine pong").
  - Stepping off the end pauses with "Walk back to the west end of the table to throw"; only walking more than 2.5 m beyond either end's reach (`winePongNear`) closes the table.
  - The hand pulse is off under reduced motion and software rendering.

## Results

- **Focused unit tests:** `node --test preview/tests/darts.test.js preview/tests/wine-pong.test.js preview/tests/throw-controls.test.js preview/tests/salon-guide.test.js server/tests/darts-games.test.js server/tests/darts-ipic.test.js`: all passed.
- **Full preview suite:** `node --test preview/tests/*.test.js`: 3,553 passed, 0 failed, 1 skipped (already there).
- **Build:** `pnpm run build` passed.
- **Journeys** (`pnpm run test:experience`, Chromium, browser lock):
  - Run 1 (18:21Z, load 56): darts failed because a held key moved only 8 of the expected 48 mm (per-frame integration lost time on slow headless frames), which led to `throw-controls.js`. Wine pong failed reading the play label before the HUD's 150 ms repaint.
  - Run 2 (18:42Z): darts failed because the debug `last` overwrote the game's `last` (renamed `lastRelease`). Wine pong passed through Reposition, the live launch and Resume, then failed walking to a blocked off-end spot.
  - Run 3 (19:07Z): `plaza-darts` **passed**. Wine pong's off-end walks were refused: the town's 1 s travel cooldown (`TRAVEL_COOLDOWN_MS`) met immediate retries.
  - Run 4 (19:10Z): `plaza-wine-pong` **passed**, now pausing and retrying a refused walk once.
  - `plaza-shuffleboard` **passed** (19:13Z).
- **Two-browser runners:** `node preview/e2e/ipic-darts-runner.mjs` **passed**: three treble-20 releases went through the town (416 left), Bob's board shows them, and an out-of-turn release was refused. `node preview/e2e/axe-venue-runner.mjs` **passed**.
- **Reports:** the runs' `data/reports/experience.json` is kept as an ignored receipt in `.runtime/throw-mechanics-receipts/`; the tracked report is unchanged.
- **Live viewing:** Val's dev server for this worktree runs on `http://127.0.0.1:5197/` (local fixture identities, town on 8799, waitlist and moderation files in the session scratchpad).
- **Core `pnpm run verify`:** pending at commit time; it is recorded in the PR.

## Next action

Push once the core gate passes, open the PR, and watch hosted CI. Merging needs Val. Gaps:
- no sound or new 3D throw animation;
- no human play review or real phone check;
- the axe lanes and shuffleboard keep their two-stop meters.
