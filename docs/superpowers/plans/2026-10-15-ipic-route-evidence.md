# IPIC #364: routes, seats, collision agreement, screen data and exports (2026-10-15)

Task `ipic-route-evidence-364` · branch `test/ipic-route-evidence-20261015` · worktree `../river-oaks-ipic-route-evidence-20261015` from `origin/main` `9d83cd31` · owner claude:river-oaks-1b (b929a625) · parent #359, package #364.

## Objective

Prove the existing IPIC (`ipic-photo-v1`) against measured bodies and the server:

- both escalator lanes, the upper lounge, the auditorium doorway, every seat with the others occupied, safe stand and the return to the street;
- client and server agreement on heights and on solids;
- false-claim rejection, and exclusive seat claims and release.

Also hand #365 the screen bounds and sightlines, check the export scripts, and capture T1–T3 and the five photo views at runtime. Keep G1 (the lift stays decorative). Report art defects; don't restyle.

## Scope boundary

#368's two-account journey and ten-cycle soak are claimed by `claude:office-seats-363` (tasks `office-ipic-journey-368`, `ipic-screening-soak-368`). This task doesn't duplicate them. Findings that matter to them were sent to that session (river-oaks-39) at 07:36Z: the sofa trap, the new colliders, the caption suspicion, the Playwright cache fix and the T3 film capture. `server/world.js` is in Codex's live `office-world-lifecycle-reliability` scope, so the sofa stand fix is not made here.

## Files owned

- `preview/src/ipic-plan.js`: `IPIC_SCREEN` and four colliders for drawn solids.
- `preview/src/ipic-interior.js`: the screen reads `IPIC_SCREEN`; no geometry change.
- `preview/src/ipic-circulation.js`, new: clearance, bottleneck, route, reachability and seated footprints.
- `preview/src/main.js`: DEV-only `__riverRenderAudit.view()` / `release()`.
- `scripts/ipic-review-data.mjs`, `docs/ipic-review/circulation.json` and `docs/ipic-review/screen.json`, all new.
- New tests: `server/tests/ipic-routes.test.js`, `preview/tests/ipic-agreement.test.js` and `preview/tests/ipic-circulation.test.js`.
- `preview/e2e/ipic-photo-views.mjs`, new, and `docs/design/office-ipic/captures/T*.png` with `ipic-runtime-receipt.json`.
- `docs/ipic-interior.md`, the #364 section.
- This ledger and `2026-10-15-ipic-route-evidence/` (the measurement script and `seated-extents.json`).

## Measurements

**Seated and standing extents.** Measured on 2026-10-15 with Chromium 156 and Metal ANGLE, on the real rigs (skinned vertices) in the game's seat path. Script: `2026-10-15-ipic-route-evidence/measure-seated-extents.mjs`.

| Pose | Worst look | Extent |
| --- | --- | --- |
| Seated, forward (legs) | man-tailored | 0.644 m |
| Seated, back (tails) | kai-formal-beast | 1.155 m |
| Seated, side | man-tailored | 0.514 m |
| Standing, total width | woman-casual | about 0.80 m |

The 2026-10-11 envelope (`AVATAR_ENVELOPE`, 1.01 m wide) used `Box3.setFromObject`, which takes bind-pose bounds. It is kept as the gate, and the posed figures are reported next to it. The 22-appearance list is unchanged since `f34fa0c8` (2026-10-05).

## Results (this branch, before commit)

- **Behavioural regressions that failed first:**
  - `ipic-agreement` on the unmodified plan named the aisle rail (0.22 m), the Tuck Room shelving, the Express counter and the lift front as drawn solids inside walkable space. All four have colliders now.
  - The sofa stand fails on `main`; it is kept as a `todo`.
- **Focused IPIC set:** `node --test preview/tests/ipic-*.test.js server/tests/ipic-*.test.js scripts/tests/office-ipic-*.test.js preview/tests/screening-contract.test.js` gave **59 tests: 56 pass, 0 fail, 2 todo, 1 skipped** (the Redis case, which needs `REDIS_URL`).
- **Redis case:** `REDIS_URL=redis://127.0.0.1:16493` (throwaway `redis-server --save '' --appendonly no`) **passed**. Of two coordinators, exactly one sits and the other gets `seat_occupied`. The reconnect grace holds the seat, and after 11 s the seat is released.
- **`pnpm run verify` (core) passed** on the working tree that became the first commit. Receipt: `.runtime/agent/core.json`.

  | Step | Result |
  | --- | --- |
  | agent | 109/109 |
  | preview | 3104: 3102 pass, 1 skip, 1 todo (the passage) |
  | server | 688: 539 pass, 148 skipped (Redis cases without `REDIS_URL`), 1 todo (the sofa) |
  | desktop | 69/69 |
  | pytest | 141 passed |
  | build, demo, secrets | passed |
- **Blender** (`/Applications/Blender.app`, 5.2.2 LTS): re-importing the committed GLB gives 57 meshes, 131,284 triangles and 12 packed images, the same as the committed `docs/ipic-review/blender.json` (4.2.3 LTS). Only the byte count differs (10,027,663 against 10,101,846), which is the Blender version. The committed `.blend` is kept unchanged; the 5.2.2 output is in the session scratchpad.
- **The two `todo` tests reproduce the open defects:**
  - the sofa returns `stand_blocked`;
  - the lounge-to-auditorium gap is 1.005 m.

## Decisions for Val

1. **The lounge sofa traps its sitter** (`stand_blocked`, on `main` today). Choose one:
   - **(a)** a server stand point per bench seat: authored in `ipicSeatSites`, tried before the radial search in `world.js` `stand()`. This is engineering, after Codex's world.js scope lands. Recommended.
   - **(b)** open the lounge grouping: move the coffee table well clear of the sofa. This is a visible layout change.
2. **The lounge-to-auditorium gap** is 1.005 m against the accepted 1.01 m. Choose one:
   - nudge the lounge planter about 5 cm west;
   - accept it, since posed bodies are at most 0.80 m.
3. **The reception's fluted backing** is drawn across the right escalator entrance, over 0.97 m of the lane's 1.71 m. It is an art fix for design, because a collider would close the lane.
4. **Recliner footrests and bases have no collision.** Choose one:
   - add colliders, which moves the 0.9 m approach points into blocked space (sitting still works from up to 3.6 m);
   - accept them as seat zones.
5. **Auditorium geometry** (design and #365):
   - the front row is 2.79 m from a 9.8 m screen: 104–119° across, 46° up to the top edge;
   - the back row loses the bottom 35 % of the screen behind the headrests.

   The fit is a sample-auditorium estimate. Either move rows back, add a rake, or keep key picture content and any burned-in text in the upper 65 %.

## Next

1. Export check: `node scripts/export-ipic.mjs`, then Blender (`/Applications/Blender.app/Contents/MacOS/Blender --background --threads 2 --python scripts/export-ipic-blender.py`). Compare against the committed GLB and .blend (sha256 `4279d80d…` / `eb4d9203…`).
2. Runtime captures: `node preview/e2e/ipic-photo-views.mjs`.
3. `pnpm run verify`; sign, PR and land.
