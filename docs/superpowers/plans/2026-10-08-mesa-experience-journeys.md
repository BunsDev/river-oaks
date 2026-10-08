# photo-mode and rail-navigation under Mesa (follow-up to #181)

## Objective

#181's hosted step ran contextual-first-visit, photo-mode and rail-navigation under
Mesa/Xvfb. photo-mode captured a one-colour photo and rail-navigation's reload
check failed, so only contextual-first-visit stayed in CI. Find and fix both
causes, then run all three in CI again. Branch `fix/mesa-experience-journeys` in
`.worktrees/river-oaks/mesa-experience`, based on `7391360`; PR #182.

## Method

Mesa cannot run on the macOS workstation and Docker's daemon was unresponsive, so
a temporary workflow on the draft PR reproduced the failures and was then removed.
The experience runner now records failure diagnostics (page/console errors, draw
calls, quality and pipeline stats, WebGL renderer, window/screen/canvas sizes).

- Run 1 (first diagnostics run on #182): software mode was active
  (0 samples, 0.25 scale, AO off) and each draw issued ~528 calls and 2.1M
  triangles, so the scene drew but the frame was uniform. A 1920x1200x24 Xvfb
  screen made no difference.
- Run 2 (37766546908): rail-navigation passed with the play-rail fix below. Same
  spawn and yaw: `alice` 1,135 colours, `owner` (Jevica) 21; walking did not help.
- Run 3 (37767072607), owner view with one module patched in flight: baseline 21,
  no bloom 1,489, no wand-glow sprite 21, flat-shaded override 21; alice 1,135.

## Causes and changes

1. rail-navigation: the play rail saved its open state only from the queued
   `toggle` event, so Escape then an immediate reload could lose the write.
   `setOpen` now saves synchronously (`play-dock.js`); `play-dock.test.js` fails on
   the old code and passes on the fix.
2. photo-mode: under the CPU normal-colour override, bloom's blur spread some
   owner-only geometry's values across the whole frame. CPU acceptance now
   disables bloom (`createRenderPipeline({ bloom })`, `main.js`), like AO, shadows
   and MSAA; `pipeline.stats.bloom` reports it. GPU rendering is unchanged. The
   specific owner-only object was not identified.
3. The hosted CI step and the `experience` profile task run all three journeys again.
4. The next hosted run (Verify 37769572012, ledger-only commit) failed photo-mode at
   "closing restores the actual HUD visibility": the HUD fades back in through its
   opacity transition, and the instant `checkVisibility` read raced it on the slow
   runner. The journey now waits (bounded, 5 s) for the starting visibility.

## Checks

- [x] Unit: `play-dock` (2) and `render-pipeline` (9) red/green as recorded above.
- [x] `npm test` 668 pass; agent tests 10; GPU journeys contextual-first-visit,
      photo-mode and rail-navigation pass; `npm run verify -- web`: agent 17,
      preview 668, server 267 (101 Redis skips), desktop 9, build.
- [x] Hosted CI on `76a4cb4` (Verify 37767811704): contextual-first-visit,
      photo-mode and rail-navigation pass under Mesa; all 18 shared journeys pass
      with bloom off in CPU mode; all 10 check runs succeeded.

## Limits

Mesa runs prove fixture behaviour, not visual quality. The owner-only geometry
that bloom amplified under the override is not identified; GPU users never render
with the override.
