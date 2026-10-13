# Wait for the store intro before the walking HUD in spatial-circulation — 2026-10-13

**Objective:** stop `spatial-circulation` timing out on
`.store-intro[open]` in the `preview experience (places)` shard. From
2026-10-11 to 2026-10-13 the shard failed 13 of 73 Verify attempts: 7 on this
wait (on main, on dependabot #265 and #295, and on unrelated branches) and 6 on
`store-intro`'s camera-cut check, 4 of them on one run of an in-progress
branch. This task covers the first.

**Branch / worktree:** `fix/store-intro-claim-race-20261013` in
`../river-oaks-intro-race-20261013`, from `9f77d13`. The diagnostic branch
`diag/intro-race-20261013` (worktree `../river-oaks-intro-diag-20261013`)
carries temporary tracing and a push-only workflow. It is never merged and is
deleted at retirement.

## Evidence

- Every failure report (`ci-experience.json`) shows the player inside the shop,
  no intro, no page errors and exactly two console 503s. Locally the 503s are
  `/v1/settings/elevenlabs` and `/v1/settings/jev`. The browser fixture runs no
  decisions backend, so they happen on every run and are unrelated.
- Failed runs rendered at 5–8 fps (17 fps on #295). Five of the seven failed at
  the first shop, about 25 s into the journey.
- A probe repeated the journey's entry steps with the intro director's inputs,
  cancels and claim results traced (diagnostic runs 38371514586 and
  38372207742, CI's Mesa renderer). It reproduced once in 52 entries, with the
  town socket routed through Playwright as the journey does. In that run the
  claim answered `firstVisit: true` and the intro played its full 6 s, but
  `#walking-hud[data-inside]` stayed empty from before the claim until after
  the intro ended.

## Cause

The intro director starts from the town's snapshot (`main.js` `introRoom`).
The walking HUD sets `data-inside` from the local room when it repaints, and it
does not repaint while the intro holds the camera (`walking.halt()`). On a slow
frame the intro can open before the HUD reports the room, so `data-inside`
appears only after the intro closes. The journey waited for `data-inside`
before looking for the intro, at both the entry check and the following wait,
so it sat through the whole intro and then waited 60 s for an intro that had
already ended. Players are not affected: the HUD is hidden during the intro and
repaints as soon as it ends.

## Change

`preview/e2e/spatial-circulation.js`: after stepping inside, accept an open
intro as well as `data-inside` or the cooldown notice. Wait for the intro, skip
it, then require `data-inside`. The check that the HUD reports the room is kept,
moved after the intro.

## Verification

- Forced order: the probe answered each shop's first claim at once (later
  claims `false`, as the town does), which often lets the intro open before
  the HUD repaints. It then ran the whole journey on this Mac's GPU.

  | Journey | Intro opened before the HUD | Normal order |
  | --- | --- | --- |
  | main's `spatial-circulation.js` | 1 run, failed: `locator.waitFor: Timeout 60000ms` on `.store-intro[open]`, the CI error | 3 runs, passed |
  | this branch | 2 runs, passed | 3 runs, passed |

  A seventh main attempt never started the journey: the probe's own second
  page did not become ready within 30 s.
- `pnpm run test:experience spatial-circulation store-intro
  contextual-first-visit`: all three passed.
- `pnpm test`: 2676 tests, 2675 pass, 0 fail, 1 skipped (run on this
  branch's base before the journey edit, which no unit test reads).
- `pnpm run verify`: `core: passed`.

## Gaps

- The forced order is a local stand-in. The natural ordering appeared once in
  52 traced CI entries, so hosted runs alone cannot show the fix quickly. The
  places shard's pass rate over the following days is the check.
- `store-intro`'s "sequence cuts from actual exterior to interior" failures are
  a separate flake and are not addressed here.
- Why the HUD sometimes lags the snapshot by a second or more on Mesa was not
  traced further. Players never see it, because the HUD is hidden during the
  intro.

## Not changed

While a first-visit claim is in flight (about 2.3 s on CI), one frame with
`canPlay` false (travel, another dialog, photo mode) makes the director discard
the town's answer. The town has already recorded the visit, so that intro is
lost for good. This is real in `preview/src/store-intro.js` and a unit test
shows it, but it was not seen in any traced run, so it is left out of this fix.
The patch is kept in the session scratchpad as
`store-intro-held-claim.patch`.

## Next step

PR, then `pnpm run land`. Retire this branch and delete `diag/intro-race-20261013`.
