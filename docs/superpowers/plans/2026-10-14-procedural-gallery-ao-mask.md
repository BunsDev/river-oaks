# Gallery AO exterior geometry experiment

Objective: preserve interior contact shading while reducing repeated moving-frame tails in the generated gallery. Measure whether omitting exterior roots from the ambient-occlusion geometry pass only, while retaining them in the beauty pass, improves the pilot without unacceptable view-through-glass artifacts.

Owner: `codex-root-20261014-ao-mask`. Branch/worktree: `perf/procedural-gallery-ao-mask-20261014` in `/Users/buns/Documents/GitHub/BunsDev/river-oaks-ao-mask-20261014`, based on draft PR #357 head `07f44c61cefb6c13961b8a853789d8603634221b`.

Files owned: `preview/src/render-pipeline.js`, `preview/src/main.js`, `preview/tests/render-pipeline.test.js`, this ledger, generated plans index and this task's branch-register entry. The primary checkout's live task register was claimed before worktree creation; unrelated dirty work is preserved. The paired iPhone belongs to a separate active device probe and is outside this experiment.

## Starting evidence and constraints

- The local Apple M3 Max / Chromium Metal five-visit gallery route at 1440 × 900 has full-resolution AO-on moving p95 near 16.7 ms on visit 1 and 33.3–33.4 ms on visits 2–5. The Auto AO-off fallback in draft #354 returns later moving p95 to about 16.7 ms but looks flatter. Lower AO buffer resolution and lower sample counts did not sustain a frame benefit and were restored.
- The opt-in AO diagnostic in draft #356 observed about 442–449 geometry calls per frame; roughly 170 were interior. Whole-pass GPU time rose from about 2.3 ms on first entry to 6.5–7.7 ms on revisits in two runs, while CPU and draw counts stayed stable. One revisit remained smooth despite the larger query value, so this is a hypothesis, not a proven cause.
- Beauty rendering must continue to show the district through the open glazed frontage. Only the AO normal/depth geometry pass may omit exterior roots while an approved generated room is active. Existing foliage/glass exclusions, previously hidden branches, and visibility restoration on failure must hold. No server movement, collision or published-plan changes are in scope.

## Checks and results

`pnpm install --frozen-lockfile`, `uv sync --locked`, and `pnpm run agent:doctor` passed. The first five-visit journey passed but its report write failed because the new worktree lacked `.runtime`; it is not used as performance evidence. After creating that ignored directory, the uninstrumented baseline passed on Apple M3 Max / Chromium Metal, Sharpest AO-on at 1440 × 900. The exact receipt is `.runtime/ao-mask-baseline.json` and the cycle-5 image is `.runtime/ao-mask-baseline-cycle5.png`.

| Baseline visit | Moved | Moving p95 | Moving p99 | Intervals above 25 ms |
| --- | ---: | ---: | ---: | ---: |
| 1 | 2.66 m | 16.7 ms | 16.8 ms | 0 |
| 2 | 2.70 m | 33.4 ms | 33.4 ms | 28 |
| 3 | 2.69 m | 33.4 ms | 33.4 ms | 27 |
| 4 | 2.69 m | 33.4 ms | 33.5 ms | 25 |
| 5 | 2.69 m | 33.4 ms | 33.4 ms | 22 |

The baseline reported 629 calls on the sampled moving frame and stable post-return resources (546 geometries, 205 textures).

The first trial required the third-person camera to remain physically inside the room. Its five-visit route passed, but moving p95 stayed 33.4 ms on visits 3–5 and the AO geometry diagnostic still counted 425–427 calls/frame, with about 170 interior calls. Camera room containment appears to be false through much of the moving route, so this condition barely removed exterior AO. The first trial's receipts are `.runtime/ao-mask-trial.json` and `.runtime/ao-mask-geometry.json`; its cycle-5 image was visually close to baseline. That camera-containment condition was removed.

The retained trial activates only while the server snapshot assigns the player to a ready approved generated level and the interior layer is visible. The beauty pass still renders exterior roots; the GTAO normals/depth pass hides them and restores their original visibility even when the pass throws. The one-visit opt-in diagnostic passed and counted 195.1 AO calls/frame (170.1 interior, 13 player, 7 Prince Jev), down from about 445 on earlier matched AO-on diagnostics. This is geometry-call evidence, not an exact isolated GPU-time saving.

Two uninstrumented five-visit occupancy-scoped trials passed on Apple M3 Max / Chromium Metal, Sharpest AO-on at 1440 × 900. All walks moved 2.63–2.72 m and post-return renderer resources stayed stable. Exact receipts: `.runtime/ao-mask-occupancy-trial.json` and `.runtime/ao-mask-occupancy-repeat.json`.

| Run | Moving p95, visits 1–5 | Intervals above 25 ms, visits 1–5 |
| --- | --- | --- |
| Baseline | 16.7, 33.4, 33.4, 33.4, 33.4 ms | 0, 28, 27, 25, 22 |
| Mask trial | 16.7, 16.8, 33.4, 33.3, 33.2 ms | 0, 1, 9, 10, 5 |
| Mask repeat | 16.8, 33.4, 33.4, 33.3, 33.3 ms | 0, 12, 16, 10, 12 |

The missed-refresh count improved in both trials, but p95 did not consistently reach 16.7 ms. This is a partial cost reduction, not a 60 Hz or broader-rollout acceptance result. The earlier Auto AO-off fallback still provides the smoother local mode if its flatter shading is accepted.

`RIVER_OAKS_E2E_REPORT=../../.runtime/ao-mask-frontage-trial.json pnpm run test:experience generated-gallery-render-cost` passed with a player-height view through the glazing and upper-level route. The same journey passed after temporarily restoring the exact base runtime; a shell trap restored the trial source and `cmp` verified both files. Matched frontage screenshots are ignored `.runtime/ao-mask-frontage-{baseline,trial}.png`. The exterior remained visible through the glazing, and sampled frontage render calls fell from 1,460 to 1,165. Local visual inspection found no obvious composition break, but human appearance review is still missing.

`node --test preview/tests/render-pipeline.test.js preview/tests/interior-exterior-culling.test.js` passed 12/12 with zero skips, covering normal-pass exclusion, interior retention, exterior restoration after success and failure, and existing culling. `pnpm run build` passed. Core and full gates are pending on the final source.

The first `pnpm run verify` passed after the measured trial. Source review then found that the office presentation also calls the shared pipeline. The final render loop now sets or clears the AO mask before either the normal street path or office path can render. `RIVER_OAKS_E2E_REPORT=../../.runtime/ao-mask-office-visit.json pnpm run test:experience office-visit` passed all elevator, walking, reduced-motion, guest denial and revocation checks with no guest browser errors. After this render-loop fix, `pnpm run plans:index`, the focused 12/12 tests, `git diff --check`, and `pnpm run verify` passed (`.runtime/agent/core.json`). Core still skips Redis/browser.

`REDIS_URL=redis://127.0.0.1:16402 pnpm run verify full` passed on the final runtime source (`.runtime/agent/full.json`, finished 2026-10-14T11:10:12Z). Tooling 76/76, preview 3,040 pass/1 existing skip, Redis server 673/673 with zero skips, desktop 54/54 and Python 141/141 passed; build, lint/format, dependency audit and secret scans passed. All ten standard experience journeys and 21 shared journeys passed, including World Studio, two-level creator publication and `creator-objects`. The Redis service was an owned loopback process and was stopped after the gate. Exact browser reports and full log were preserved in ignored `.runtime/ao-mask-full-{experience,shared}.json` and `.runtime/ao-mask-full.log`; tracked historical reports were restored. The opt-in five-cycle and frontage journeys ran separately and are not part of this full profile. Hosted CI, physical target-device performance and human visual approval remain unverified.

## Next action

Sign/push this verified slice as a draft PR stacked on #357, then check exact-head hosted CI. Keep the partial frame-time result and target-device/human visual gates explicit; do not expand archetypes or merge on this local evidence alone.

## Main integration, 2026-10-14

PR #357 landed as `093b8d0f45b2ebaf5a680ac8b0999f889c7b46c6`. Merged current main into this branch without conflicts and reconciled the #356–#358 live task rows. Focused AO pipeline/culling tests passed 12/12. The integrated `generated-gallery-render-cost` and `office-visit` browser journeys passed, as did the Sharpest/AO-on five-cycle gallery soak (`.runtime/ao-mask-main-five.json`): moving p95 was 33.4 ms on visit 1 and 16.7–16.8 ms on visits 2–5, with each walk moving 2.63–2.69 m; eviction and return renderer counts remained 542/200 and 546/205. This local pacing differs from earlier runs and does not close target-device performance. `TMPDIR=/Volumes/Passport/river-oaks-agent-tmp-contact pnpm run verify` passed core on the integrated tree. The original #358 head passed isolated Redis full; exact-head hosted checks remain required after push. Human review of the AO mask's through-glass appearance remains separate from Val's later approval of the #382 pilot contact-shading screenshots.
