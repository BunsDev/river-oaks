# Gallery ambient occlusion sample trial

Objective: retain useful full-resolution ambient-occlusion shading during repeated generated-gallery walks while reducing missed-refresh tails. Compare a lower GTAO/denoise sample count with the same uninstrumented five-cycle route and a same-camera image before proposing a runtime change.

Owner: `codex-root-20261014-ao-sampling`. Branch/worktree: `perf/procedural-gallery-ao-sampling-20261014` in `/Users/buns/Documents/GitHub/BunsDev/river-oaks-ao-sampling-20261014`, based on draft PR #356 diagnostic head `c2e8f27b0f8b22339370129b28c4a658f6ec6d6a`.

Files owned: `preview/src/render-pipeline.js`, `preview/tests/render-pipeline.test.js`, this ledger and the plans index. The primary checkout's live task register was claimed before worktree creation; unrelated dirty state and earlier PR worktrees remain untouched.

## Starting evidence

- The prior AO buffer experiment rejected 0.75 and 0.5 resolution: repeated moving p95 remained about 33.3–33.4 ms, and half resolution introduced coarser edge noise.
- The opt-in PR #356 profiler found about 442–449 AO geometry calls per frame across visits. Whole-pass GPU timer p50 rose from about 2.3 ms on first entry to 6.5–7.7 ms on revisits in two local three-visit runs, while CPU and draw count stayed stable. One revisit still held 16.7 ms moving p95, so GPU timer growth alone does not prove the missed-refresh cause.
- The runtime currently uses full-resolution AO below UHD, with ten GTAO samples and eight Poisson denoise samples at the 1440 × 900 pilot viewport. The existing Auto-quality PR #354 turns AO off after sustained moving tails; this trial tests whether a cheaper AO variant can retain useful shading.
- `pnpm install --frozen-lockfile`, `uv sync --locked`, and `pnpm run agent:doctor` passed in this worktree. The initial doctor pass correctly identified the missing Python environment before `uv sync`.

## Checks and results

Two uninstrumented `RIVER_OAKS_GALLERY_QUALITY=sharp pnpm run test:experience generated-gallery-cycle-soak` runs passed on the same local Apple M3 Max / Chromium Metal browser at 1440 × 900. Both used native-resolution AO and the same real keyboard route, with 2.63–2.71 m of movement per visit and 629 aggregate render calls per frame. The baseline used ten GTAO/eight denoise samples; the trial used six/four:

| Samples | Moving p95, visits 1–5 | Intervals above 25 ms, visits 1–5 | Decision |
| --- | --- | --- | --- |
| 10/8 baseline | 16.7, 33.4, 33.4, 33.4, 33.4 ms | 0, 22, 22, 23, 19 | Reproduced sustained tails |
| 6/4 trial | 16.7, 33.4, 33.4, 33.4, 33.4 ms | 0, 25, 25, 25, 24 | No pacing gain; more missed intervals |

Ignored receipts: `.runtime/ao-samples-baseline.json` and `.runtime/ao-samples-six-four.json`. The sixth/fourth-sample cycle-5 image is `.runtime/ao-samples-six-four-cycle5.png`. Compared at the same route and camera with the full-sample capture in the ring-validity worktree, the trial looked flatter under the associate and along the wall/floor trim. These are local agent observations, not human visual approval.

The trial's `preview/src/render-pipeline.js` edit was restored. There is **no AO runtime code change** to deliver; focused source tests, core/full and hosted gates are not claimed for the rejected variant. The new ledger is evidence of a negative experiment, not a passing performance fix.

For the final evidence-only branch, `pnpm run plans:index`, `pnpm run test:agent`, and `pnpm run verify` passed (`.runtime/agent/core.json`). That core result covers the restored baseline runtime and documentation; it does not turn the rejected six/four variant into a verified change.

## Next action

Keep the full-resolution ten/eight-sample baseline. Avoid further sample-count or AO-buffer reduction without new evidence; use the verified Auto AO-off fallback in draft PR #354 while target-device and human shading acceptance remain open. Resume broader interior requirements through the existing Studio/authoring work rather than treating this local AO experiment as rollout proof.
