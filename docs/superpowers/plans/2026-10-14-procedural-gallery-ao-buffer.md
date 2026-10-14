# Gallery ambient occlusion buffer experiment

Objective: preserve useful ambient-occlusion shading during repeated gallery movement while avoiding the local missed-refresh tails that led Auto quality to disable AO entirely. Keep the beauty scene and glass refraction at full resolution at the pilot's 1440 × 900 viewport.

Owner: `codex-root-20261014-ao-buffer`. Branch/worktree: `perf/procedural-gallery-ao-buffer-20261014` in `/Users/buns/Documents/GitHub/BunsDev/river-oaks-ao-buffer-20261014`, stacked on draft PR #355 head `9eac78b651d2debbc5607468c06ceee7a3e050eb`.

Files owned: `preview/src/render-pipeline.js`, `preview/tests/render-pipeline.test.js`, this ledger, generated plans index, and the task's branch-register entry. The primary live register was claimed before worktree creation. Unrelated dirty state is preserved.

## Starting evidence

- On the exact #355 head, `RIVER_OAKS_GALLERY_QUALITY=sharp pnpm run test:experience generated-gallery-cycle-soak` passed with five real keyboard walks on Apple M3 Max / Chromium Metal at 1440 × 900. AO stayed on at full resolution, and moving p95 was 16.7 ms on visit 1 then 33.3–33.4 ms on visits 2–5, with 13–25 frame intervals above 25 ms on each later walk. Each walk moved 2.66–2.71 m. Local receipt: the parent worktree's ignored `.runtime/ring-sharp-baseline.json`.
- Earlier Auto with AO off after repeated tails held 16.7–16.8 ms moving p95 but looked flatter. The renderer currently makes a GTAO geometry pass plus the full-screen AO work at native AO resolution below 2560 × 1440. The pilot render cost diagnostic measured several milliseconds of GPU time in GTAO, so testing a smaller AO buffer is warranted; that diagnostic is not a moving-frame or target-device proof.

## Experiment and verification

The focused HD buffer contract failed before each trial change and passed 10/10 afterward. Both trials kept the beauty scale and glass transmission scale at 1. The named five-cycle journey passed for each variant on the same local M3 Max / Chromium Metal browser at 1440 × 900:

| AO buffer | Moving p95, cycles 1–5 | Intervals above 25 ms, cycles 1–5 | Decision |
| --- | --- | --- | --- |
| Full resolution baseline | 16.7, 33.4, 33.3, 33.4, 33.3 ms | 0, 20, 13, 25, 20 | Reproduced sustained tails |
| 0.75 scale | 16.8, 16.7, 33.4, 33.4, 33.3 ms | 1, 0, 21, 21, 12 | One improved revisit; later tails persist |
| 0.5 scale | 16.8, 33.3, 33.4, 33.3, 33.4 ms | 0, 24, 19, 18, 13 | No sustained frame benefit |

The full-resolution baseline receipt is in the parent worktree's ignored `.runtime/ring-sharp-baseline.json`; trial receipts are `.runtime/ao-buffer-sharp-five.json` and `.runtime/ao-buffer-half-sharp-five.json` here. All walks moved about 2.6–2.7 m and kept AO enabled. The half-scale cycle-5 screenshot (`.runtime/ao-buffer-half-cycle5.png`) showed coarser, darker edge noise than the full-resolution control in the parent worktree. These are local agent observations, not target-device or human visual approval.

Both runtime and test trial edits were restored. There is **no AO buffer code change** to deliver, so core/full gates and a PR are not claimed for this experiment. The original Auto AO-off adaptation in draft PR #354 remains the only proposed behavior change.

## Next action

The follow-up diagnostic `preview/e2e/generated-gallery-ao-geometry.js` instruments `GTAOPass.render` and `renderer.renderBufferDirect` only during three 1.7-second keyboard walks. It records AO geometry calls by named root, the number of frames where the generated-room exterior cull is eligible, and frame intervals. Its first smoke exposed a harness ordering mistake: the Cartier teleport ran before the authoritative outdoor state and travel cooldown settled. The corrected journey waits for both, then passed with `RIVER_OAKS_E2E_REPORT=ao-geometry-three.json pnpm run test:experience generated-gallery-ao-geometry` on local Apple M3 Max / Chromium Metal, 1440 × 900, Sharpest quality and AO enabled.

| Visit | AO calls/frame | Interior calls/frame | Exterior-cull eligible AO frames | Moving p95 | Intervals above 25 ms |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 446.4 | 170.1 | 6/104 | 16.7 ms | 0 |
| 2 | 447.3 | 170.1 | 5/92 | 33.4 ms | 11 |
| 3 | 444.0 | 170.1 | 6/89 | 33.3 ms | 15 |

The other large AO roots were plaza salon (~53–54 calls/frame), unnamed mesh (~49–50), mature urban shade trees (~48), and street furniture (~29). The cull was eligible before and after each walk, but the moving camera exposed the glazed frontage for most intervening frames. Stable calls with worsening intervals reject draw-count growth as the cause of the repeat-visit tail. The diagnostic's per-draw JavaScript instrumentation adds CPU work, so its frame intervals are corroboration of the uninstrumented cycle soak, not a fresh frame budget. The exact receipt is ignored `.runtime/ao-geometry-three.json` in this worktree.

`pnpm run verify` passed on the diagnostic and ledger source (`.runtime/agent/core.json`); this is the core profile, which skips Redis and browser acceptance. After adding explicit AO-on and Sharpest assertions, the named three-cycle journey passed again (`.runtime/ao-geometry-three-final.json`, 47.8 seconds): 449, 447 and 449 AO calls/frame while moving p95 was 16.8, 33.3 and 33.3 ms.

Draft PR #356 was opened on #355 at signed diagnostic head `0755fc59412891fa1882338d05829ccc957f8d9c`. All ten hosted checks, including aggregate `preview`, passed on that exact head. `REDIS_URL=redis://127.0.0.1:16400 pnpm run verify full` then passed on the same head (`.runtime/agent/full.json`, 2026-10-14T08:54:54Z–09:16:55Z): 673 Redis server tests passed with zero skips, ten standard experience journeys and 21 shared journeys passed, and the remaining full-profile audits passed. The isolated loopback Redis process was stopped. Browser reports were preserved as ignored `.runtime/ao-geometry-full-{experience,shared}.json`; the tracked historical reports were restored. The opt-in AO diagnostic was run separately and is not part of the standard full-profile browser list.

## Next action

The opt-in journey now records one `EXT_disjoint_timer_query_webgl2` query around the entire GTAO pass every fourth moving frame, plus per-pass CPU and total main-thread timing. The extension was available with no disjoint or pending queries. Two separate three-visit runs passed on local M3 Max / Chromium Metal, 1440 × 900, Sharpest with AO on:

| Run | Visit | GTAO GPU p50 | GTAO CPU p50 | Main-thread p95 | Moving interval p95 | AO calls/frame |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| A | 1 | 2.36 ms | 1.8 ms | 13.8 ms | 16.7 ms | 444 |
| A | 2 | 7.65 ms | 1.8 ms | 14.3 ms | 33.4 ms | 444 |
| A | 3 | 6.72 ms | 1.9 ms | 14.2 ms | 33.4 ms | 442 |
| B | 1 | 2.32 ms | 1.8 ms | 14.3 ms | 16.8 ms | 449 |
| B | 2 | 6.50 ms | 1.7 ms | 13.7 ms | 33.3 ms | 445 |
| B | 3 | 6.70 ms | 1.9 ms | 13.8 ms | 16.7 ms | 446 |

Receipts: ignored `.runtime/ao-timing-three.json` and `.runtime/ao-timing-pass-repeat.json`. The higher GPU timer values on revisits are repeatable while AO CPU and draw count stay flat, but visit B3 remained at 16.7 ms. The timer therefore does not by itself prove the missed-refresh cause. A separate five-query-per-frame stage experiment produced sums larger than the whole pass and changed frame pacing; its ignored `.runtime/ao-timing-stages-three.json` is retained as invalid attribution evidence, and the stage instrumentation was reverted.

## Next action

Test a lower-sample AO variant at full resolution against a fresh uninstrumented five-cycle baseline and same-camera visual capture. Retain it only if repeated moving pacing improves without unacceptable shading loss. Target-device selection and human shading review still gate the broader rollout.

## Main integration, 2026-10-14

PR #355 landed as `46c44df7e45f0b73363a66734be6f14978b2d6a7`. Merged current main into this branch without conflicts and reconciled the #354–#356 live task rows. The opt-in `generated-gallery-ao-geometry` journey passed on the integrated tree (`.runtime/ao-geometry-main-merge.json`), recording about 434–446 AO geometry calls per moving frame over three visits. `TMPDIR=/Volumes/Passport/river-oaks-agent-tmp-contact pnpm run verify` passed the core gate. The original #356 head had already passed the isolated Redis full profile; exact-head hosted checks remain required after this integration push. This diagnostic is measurement evidence and does not change the production render path.
