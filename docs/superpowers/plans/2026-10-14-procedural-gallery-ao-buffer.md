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

Investigate which visible objects and geometry calls dominate the AO pass during a moving gallery view. Keep full-resolution AO as the baseline, and do not revive the 0.75 or 0.5 buffer variants without new evidence. Target-device selection and human shading review still gate the broader rollout.
