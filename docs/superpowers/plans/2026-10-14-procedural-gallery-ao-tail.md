# Auto quality response to moving gallery frame tails

Objective: make Auto quality react when a moving interior view repeatedly misses display refreshes even though its median frame interval stays fast. Keep manual Sharpest and Smoothest behavior, server-approved interiors, and the visible route unchanged.

Owner: `codex-root-20261014-ao-tail`. Branch/worktree: `perf/procedural-ao-tail-20261014` in `/Users/buns/Documents/GitHub/BunsDev/river-oaks-ao-tail-20261014`, stacked on draft PR #353 head `e419b5a4c8a23a1b81a95b1d3eb879564cc0212b`.

Files owned: `preview/src/render-quality.js`, `preview/tests/render-quality.test.js`, this ledger, the generated plans index, and this task's branch-register entry. The primary live register was claimed before creating the worktree. Existing branches and primary dirty files are preserved.

## Evidence and decision

- PR #353's local Apple M3 Max / Chromium Metal five-cycle moving gallery audit at 1440×900 reproduced 33.3–33.4 ms p95 on later keyboard walks, with 12–21 intervals above 25 ms in 1.7 seconds. Stationary p95 remained 16.7–16.8 ms. Position, authoritative occupancy, opaque-view exterior culling and renderer resource counts stayed stable.
- Smoothest (0.75 render scale, AO off) and Auto at full scale with `?ao=off` both held moving p95 to 16.7–16.8 ms across five visits, zero intervals above 25 ms. This points to AO work on this local view but does not establish target-device performance or authorize a visual-quality tradeoff.
- Auto's current governor waits for a 45-frame median above 26 ms to reduce resolution; a 10–25% run of 33 ms frames can leave the median at 16.7 ms and evade adaptation. A sustained tail signal can temporarily disable AO while keeping full-resolution beauty rendering. Recovery must be delayed and bounded to avoid a visible on/off oscillation. One short hitch must not change quality.

## Verification and limits

Add focused unit behavior for sustained tails, isolated spikes, steady overload, recovery and manual preset isolation. Run the named moving browser journey on the same Mac and inspect per-cycle AO state, frame distribution and visual captures. Then run `pnpm run verify` and isolated-Redis `pnpm run verify full` before a signed commit. Hosted checks and human visual/target-device acceptance remain separate.

- The focused regression failed before the governor change: two tail-heavy windows left AO enabled. After the patch, 11/11 render-quality tests pass. Auto drops AO after two windows with at least 12% of frames at or above 26 ms while the median remains fast. Native-resolution beauty stays intact. A 120-window calm hold plus the existing recovery delay restores AO; isolated tails, steady overload and manual modes retain their tested behavior.
- The first five-cycle browser journey passed but its runner could not write a report because this new worktree lacked its ignored `.runtime` directory. After creating that directory, the recorded rerun passed (`.runtime/ao-tail-five.json`, 112.1 seconds) on Apple M3 Max / Chromium Metal at 1440×900. Cycle 2 still had 33.4 ms moving p95, 21 frames above 25 ms and AO on at sample end. By cycle 3 Auto had disabled AO without changing its scale; cycles 3–5 held moving p95 at 16.7–16.8 ms, with 0, 1 and 1 frames above 25 ms. Each walk moved 2.63–2.69 m; renderer counts returned to 542 geometries/200 textures after eviction and 546/205 after return.
- Compared `output/playwright/gallery-cycle-5.png` with the AO-on capture in the #353 worktree. The AO-off wall/floor and fixture contact shading looks flatter, while the gallery geometry, staff, art, exit action and cullable interior remain visible. This is agent visual inspection, not Val's human acceptance. Target-device measurement and AO visual approval still gate rollout.
- `pnpm run verify` passed (`.runtime/agent/core.json`): agent, preview, server, desktop, build, Python, demo, and secrets checks passed. The focused render-quality suite passed 11/11.
- `REDIS_URL=redis://127.0.0.1:16398 pnpm run verify full` passed with a disposable local Redis service (`.runtime/agent/full.json`): all 17 result groups passed, including the dependency audit, Redis server tests, security browser, ten experience journeys, and 21 shared journeys. The Redis service was stopped. Generated experience reports were archived under ignored `.runtime/ao-tail-full-*.json` and restored from git so they do not enter the patch. This gate does not prove target GPU, production, native, human visual, or accessibility acceptance.

## Next action

Commit the verified candidate and open a draft PR stacked on #353. Wait for exact-head hosted checks. Preserve the visual tradeoff and target-device acceptance gaps; keep broader building archetypes gated.
