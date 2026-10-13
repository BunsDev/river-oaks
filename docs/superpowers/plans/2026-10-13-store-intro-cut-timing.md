# Sample the store intro's camera cut instead of timing it — 2026-10-13

**Objective:** stop `store-intro` failing "sequence cuts from actual exterior
to interior" in the `preview experience (places)` shard. On code that includes
#281 it failed 6 of 22 places-shard attempts: 4 of 4 attempts on `cd9d486`
(run 38217397738), once on `ff7b803`, and once on `8f84a8c`, which passed on
rerun. `cd9d486` and the next head, `37af532`, which passed twice, differ only
in docs, so this is timing, not code.

**Branch / worktree:** `fix/store-intro-cut-timing-20261013` in
`../river-oaks-intro-cut-20261013`, from `9d37efb`.

## Cause

The intro plays two camera shots on its own clock (`store-intro.js`
`update`). It shows the street outside the facade for 2.4 s, then the room
until 6 s. The clock starts on the intro's first frame after the dialog opens.
The check read the camera once when the dialog appeared. It then held W while
taking a screenshot and waiting a fixed 3.1 s, read the camera again, and
required the two readings to be more than 3 m apart. On a 5–8 fps software
renderer:

- the first reading can come before the intro's first frame, so it records the
  walking camera, not the street shot;
- the screenshot can take long enough that the second reading lands after the
  6 s intro has ended, when the camera is back on the walking view.

Either way the two readings can be less than 3 m apart with nothing wrong in
the intro. The same delay also puts the next step, Escape, after the intro has
ended. Main's journey with the CPU slowed 6× on this Mac failed 2 of 3 runs on
"Escape restores walking focus". In both, the intro had stayed open for exactly
6.0 s and closed by itself.

## Change

`preview/e2e/store-intro.js`:

- **Cut check.** Before stepping inside, the journey starts an in-page
  `waitForFunction` with `polling: 'raf'`. On every frame while the intro is
  open it records the camera's depth behind Harry Winston's facade, using the
  facade point and inward direction from `planStoreRooms` (the intro's own
  coordinates). It resolves once a sample more than 3 m in front of the facade
  is followed by one more than 0.5 m inside, or when the intro closes. The
  shots sit at about −5.5 to −5 m and 0.85 to 1.15 m. A first attempt sampled
  from the test process and still missed the whole street shot once in three
  runs at 6× throttle: its first read came after 2.4 s.
- **Escape.** Escape follows as soon as the cut is seen, before the slower
  checks, so it reaches a playing intro. A failure lists every recorded depth,
  and the journey result reports them.
- **Reference screenshots.** `store-intro-exterior.png` and
  `store-intro-interior.png` are taken during the Hermès intro, which is left
  to finish on its own, when each shot is first seen. No check waits on them.
- **Reduced motion.** The intro closes itself 2.2 s after its first frame. At
  6× throttle that came before "Continue" was clicked, and the click waited
  60 s. The journey now checks the button's label, then presses it in the page
  only if the intro is still open, and requires the intro closed. With the
  other fixes in place, the journey reaches this step even on slow runs, so
  leaving it would only have moved the flake.

## Verification

All runs are on this Mac's GPU. The slowed runs used Chromium CPU throttling at
6× (`Emulation.setCPUThrottlingRate`) through the session probe, which runs the
journey file as the experience runner does.

| Journey | Runs at 6× throttle | Result |
| --- | --- | --- |
| main | 3 | 1 passed, 2 failed "Escape restores walking focus" (the intro had stayed open exactly 6.0 s and closed itself) |
| first fix (cut sampled from the test process) | 6 | 4 passed, 2 timed out clicking reduced-motion "Continue" |
| second fix (reduced motion handled) | 3 | 2 passed, 1 failed the cut check: its first sample was already inside (0.85 m) |
| this branch (cut recorded in the page every frame) | 3 | 3 passed |

- `RIVER_OAKS_E2E_REPORT=… pnpm run test:experience store-intro` (no
  throttle): passed, 12 checks. There were 145 per-frame samples from −5.5 m
  through −5 m to 0.85 m. Both reference screenshots show the right shot (the
  Hermès storefront from the street, then the shop interior).
- `pnpm run verify`: `core: passed` (unit 2674 pass, 0 fail, 1 skipped).

## Gaps

- Throttling the CPU on a GPU Mac only stands in for CI's Mesa renderer. The
  hosted places shard over the following days is the real check.
- The "second entry does not replay intro" and reload checks still use a
  1.2 s wait. On a slow run that can only miss a wrongly replayed intro; it
  cannot fail a correct build.

## Next step

PR, then `pnpm run land`, then retire the branch.
