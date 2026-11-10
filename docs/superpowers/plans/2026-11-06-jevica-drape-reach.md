# Jevica drape: update only the rows the peplum reads

Objective: cut per-frame CPU for every Jevica-costumed player without changing anything drawn, as a
fix toward the v0.3.0 phone two-player CPU p95 row (+11.0% against a +10% budget on the low
resident budget, measured 2026-11-03 by `v030-perf-attribution-20261103`). Budgets are not changed
here.

Owner: `claude:river-oaks-c7 (178fa13a)`, taken over from `claude:river-oaks-4f (3158e24e)` with the v0.3.0 goal on 2026-11-06 (the owner was not running and its claims had expired). Task `v030-drape-reach-20261106`, branch
`perf/jevica-drape-reach-20261106`. Feeds `v030-perf-attribution-20261103` and
`v030-blockers-20261103`. Landing needs Val's authorization.

## Why the drape

CPU profiles of desktop two-player (v0.2.2 `f4dd959a` vs #878+#685 `e1c4b28d`, 2026-11-03, 20 s
each) put the drape's `update` at 5.1% of the whole profile in both, about 12% of the frame
callback's time. It is not a regression: `jevica-drape.js` is unchanged since v0.2.2. Each
Jevica-costumed player runs one, the local player (`player-avatar.js`) and every remote player
(`remote-players.js`), so two-player frames pay it twice.

Since #775 the drape moves a short peplum at the waist, but each frame it still skinned and spread
every thigh and calf contact sample down to 1 m below the waist, updated all 45 × 64 field cells,
and recomputed the peplum and its normals whenever any cell changed, including leg rows the peplum
never reads.

## Change

A peplum vertex reads two adjacent field rows; a contact sample spreads at most four rows either
way. `jevica-drape.js` now finds the rows the cloth reads (standing and seated grids separately),
skips samples that cannot reach them, and updates only those rows. Everything the cloth reads is
computed exactly as before, so vertices, normals and pixels are unchanged. Samples are still skinned
to find their height.

## Checks

| Check | Result |
| --- | --- |
| `node --test preview/tests/jevica-reference-look.test.js` | 10/10 |
| `jevica-drape-reach` journey: ABBA full range vs read rows, exact vertices, normals, pixel hashes over walking, seated and standing up; costume update CPU | **passed** on main `230d8814`, 2026-11-07 13:58–13:59Z: all four runs match the full-range reference exactly (vertices, normals, 14 pixel hashes each). Costume update median / p95: reference walking 2.0 / 2.2 and 1.9 / 2.2 ms, read rows 1.0 / 1.2 and 1.1 / 1.2 ms; seated 1.0 / 1.3 and 1.0 / 1.2 ms against 0.7 / 1.0 and 0.6 / 0.9 ms. The same on `1dc64db1` at 13:57Z. |
| `gown-contact-samples`, `jevica-gown`, `jevica-waist` | **passed**, same runs |
| `pnpm run verify` | **passed** on main `230d8814` plus this change, 14:00–14:05Z: tooling 307/307, preview 5230 pass / 1 skip / 30 todo, server 1132 pass / 285 skip, desktop 127 pass / 5 skip, Python 215 |

The fixture (`preview/e2e/fixtures/jevica.js`) now passes `riding` and `seatToFloor`, so the seated
grid is covered.

## Next step

After #885 lands and the v0.3.0 head is pinned, measure phone two-player against v0.2.2 with and without this change (`v030-perf-attribution-20261103`). Landing needs Val's authorization.

The costume timings are the fixture's isolated `outfit.update`, one avatar, headless Chromium on this M5 Max; they are not a district frame-rate or phone measurement.
