# Town first-snapshot stall under software rendering

**Task:** `town-first-snapshot-stall` · **Branch:** `fix/town-first-snapshot-stall` · **Owner:** river-oaks-c2

## Objective

From 2026-10-12 04:57Z, about 60% of Verify runs failed `email access` in **preview
checks**. The test timed out waiting for `.multiplayer-roster[data-connected="true"]`.
The required shared multiplayer journey failed the same way ("Two accounts share the
roster and rendered avatars"). Every merge in the landing queue was blocked. Find the
cause and fix it, without loosening the test.

## Evidence

- **Not the ticket lifetime.** #276 raised tickets to 60 s, and the failures continued.
  The failure dump (run 38213739399, attempt 1) showed the town socket `opened 1,
  closed 0`, then the gate hidden and `multiplayer: 'joined'`. That dump is taken
  after the 60 s wait, so the join completed, but late.
- **Not the runner.** All 40 runs checked used runner image `20261002.596`. Passing
  durations of the test were 50–117 s both before and after.
- **It starts with #274.** Before #274 (liquid-glass HUD) merged at 04:57Z, the only
  failures were on two PRs that changed this test or its browser harness themselves.
  Since then about 60% of runs have failed, on every kind of branch, `main` included.
- **Mechanism.** #274's town gate is on screen for the whole join. It adds:
  - a full-viewport `backdrop-filter` veil over the live canvas;
  - a blurred card;
  - two endless animations inside the glass, one of which (`liquid-bead`) animates
    `background-position`, a main-thread repaint every frame.

  On CI's Mesa software compositor (`LP_NUM_THREADS=2`), every frame re-blurs the screen
  and repaints on the main thread. That is the thread that applies the first snapshot.

## Change

- **Marking:** `markRenderingMode()` in `preview/src/hardware-acceleration.js` sets
  `data-rendering="software"` on `<html>` when the existing renderer check finds a
  software renderer. The same check already drives the "Hardware acceleration is
  unavailable" notice.
- **Stylesheets:** under `:root[data-rendering=software]`, following river-oaks-3b's
  spec:
  - **HUD sheets and liquid glass:** the reduced-transparency tints, with no backdrop
    filter (`hud-glass.css`).
  - **Town gate:** a plain veil with no backdrop filter, and the drift and bead
    animations stopped. The static rim stays (`multiplayer.css`).
  - **Map button:** the lens stops turning (`game-hud.css`).
  - **District map:** no halo or target animation, no `.world-map-self` transition, and
    building drop shadows off (`world-map.css`).

GPU users keep the glass.

## Checks

| Check | Result |
| --- | --- |
| `node --test preview/tests/hardware-acceleration.test.js` | 22/22 |
| `pnpm run test:experience hardware-acceleration` | Passes. With the five source files reverted it fails: `{"rendering":null,"sheet":"blur(24px) …","card":"blur(28px) …","veil":"blur(4px) …","drift":"liquid-drift"}` |
| `pnpm run verify` (core) | Passed |
| `pnpm run test:security:e2e` (local GPU) | 2/2 (email access 5.7 s locally, against 50–117 s on CI's software renderer) |
| Hosted `preview checks`, four attempts on cd9d486 (run 38217397738) | 4/4 passed; email access 87, 60, 49, 57 s. At the old ~60% failure rate, four passes by chance is about 2.6%. The same run's places shard failed once on `store-intro` ("sequence cuts from actual exterior to interior", a 3.1 s timed camera check); nothing in `preview/src` waits on an animation event, so the CSS change can't block it. |

## Gaps

- **Local GPU only:** the local browser runs use a GPU (Metal), so they don't reproduce
  CI's software stall. The proof is repeated hosted runs.
- **Left to river-oaks-3b's follow-up:**
  - the map's infinite SVG animations and filter shadows for GPU users;
  - #274's reduced-motion rule for the status bead, which loses on specificity.

## Next step

#281 is open and proven. Land it with `pnpm run land 281`, then requeue #278. river-oaks-3b
follows with `world-map-paint-cost`.
