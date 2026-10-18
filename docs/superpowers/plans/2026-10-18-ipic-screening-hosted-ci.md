# Hosted CI runs the IPIC screening journey

- **Task:** `ipic-screening-hosted-ci` (live register), owner `claude:office-seats-363 (928f5d63)`.
- **Branch / worktree:** `ci/ipic-screening-hosted-20261018` in `../river-oaks-screening-ci`, from main `a00a4d19`.
- **Decision:** Val, 2026-10-18: "Add the journey to CI". It had been held as a recurring cost. The ten-cycle soak
  stays a local profile.

## Change

- **`preview/e2e/ipic-screening-launch.js`:** `screeningLaunchOptions()`. Locally, headless SwiftShader as before.
  With `RIVER_OAKS_SCREENING_SOFTWARE=1` on Linux, a headed browser on Mesa (ANGLE over GL) under Xvfb, the path
  the shared and security journeys use on CI. Anywhere else that flag refuses to run.
- **`preview/e2e/ipic-screening-runner.mjs`** uses it. `pnpm run test:screening` runs the journey.
- **`.github/workflows/verify.yml`:** the `preview checks` job runs `xvfb-run -a pnpm run test:screening` with
  `RIVER_OAKS_SCREENING_SOFTWARE`, `LIBGL_ALWAYS_SOFTWARE` and `LP_NUM_THREADS=2`, after the reflections check.
  On failure it uploads `screening.json` and the failure screenshots.
- **`preview/e2e/ipic-screening.js`:** the short runs 52.6 s, and a loaded machine can spend most of it on the late
  join and the convergence window. A local run here failed at the pause step with "The film has ended". Before
  pausing, the host now starts the film again when under 12 s remain. That is setup only; the pause assertions
  are unchanged.
- **`docs/testing.md`** records the hosted step.

## Checks

| Check | Result |
| --- | --- |
| `node --test preview/tests/ipic-screening-launch.test.js`, written first | Failed (no module), then 3/3 |
| `pnpm run test:screening` (local SwiftShader) | First run failed at the pause step ("The film has ended"), which led to the guard; the rerun passed 12 checks |
| `pnpm run verify` | Passed: agent 112, preview 3371, server 753 with Redis skips, 76/76 |
| Hosted Verify on the PR (Mesa) | RESULT_HOSTED |
