# Procedural GPU matrix harness

## Objective

Make the generated gallery Auto AO-tail comparison reproducible on physical GPUs
without editing journey source between runs. This prepares the existing
[GPU acceptance matrix](2026-10-14-procedural-gpu-acceptance.md); it does not
replace target-device runs or Val's live visual and accessibility review.

## Ownership

- Task: `procedural-gpu-matrix-harness`
- Branch: `test/procedural-gpu-matrix-harness-20261015`
- Files: `preview/e2e/generated-gallery-cycle-soak.js`, the GPU acceptance plan,
  and this ledger.

## Changes and evidence

- Journey reads `RIVER_OAKS_GALLERY_AO_TAIL=off|on`, defaults to the shipped off
  mode, adds `aotail=on` only for opt-in runs, and records the selected mode in
  the JSON result.
- GPU plan gives explicit paired commands and requires three repetitions per
  mode on the same device.

## Checks

- `RIVER_OAKS_GALLERY_CYCLES=1 RIVER_OAKS_GALLERY_AO_TAIL=off RIVER_OAKS_E2E_REPORT=gallery-tail-final-off.json pnpm run test:experience generated-gallery-cycle-soak`: passed with the active-mode assertion; receipt at `.runtime/procedural-gpu-matrix-harness/gallery-tail-final-off.json`.
- The same command with `RIVER_OAKS_GALLERY_AO_TAIL=on` and `gallery-tail-final-on.json`: passed with the active-mode assertion; receipt beside the off result.
- `pnpm run verify`: passed; `.runtime/agent/core.json`. This ran before the final active-mode assertion and generated plan index; the focused journeys cover that assertion.
- `pnpm run plans:index --check`: passed after the index update.
- `REDIS_URL=redis://127.0.0.1:16389 pnpm run verify full`: passed against a disposable loopback Redis service; `.runtime/agent/full.json`. The service was stopped after the run. This command started before the final active-mode assertion and plan edits; the final focused journeys and index check cover those changes.

The one-cycle local receipts are harness checks, not target GPU performance
acceptance. The tracked report files rewritten by the browser runners were
restored after their ignored receipts were retained under `.runtime/`.

The iPhone Safari row is next, but the current Vite/browser fixture and local
identity are loopback-only. The GPU plan now records the need for a separate
test-only phone access path before that row can be measured.

## Next step

Review the final diff, commit and prepare a PR. Then create the dedicated
test-only phone access path and resume the physical device matrix in the
existing `procedural-gpu-acceptance` task.
