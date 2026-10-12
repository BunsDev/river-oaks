# Cache Playwright browsers in CI

Objective: stop every browser job downloading Chromium from Playwright's CDN.

- Splitting `preview` into parallel jobs (#252) turned one browser download into
  six per run.
- On #277's first attempt, `preview checks` failed when Playwright's ffmpeg download
  timed out after 30 s.

Owner: Claude Code session `46fc41e0-26d1-4116-956a-7cac77a13769`. Task
`ci-playwright-cache`. Branch `ci/playwright-cache-20261012` from `main` at `f4db264`.

## Change

`.github/workflows/verify.yml` gains the same two steps before each
`pnpm exec playwright install --with-deps chromium`, in the checks, shared and
experience jobs:

- Read the Playwright version (`pnpm exec playwright --version`, currently
  `1.64.0`).
- Restore and save `~/.cache/ms-playwright` with `actions/cache` v6.1.0, pinned to
  `55cc8345863c7cc4c66a329aec7e433d2d1c52a9` and released 2026-06-26. The key is
  `playwright-<os>-<version>`, so a Playwright upgrade starts a fresh cache.

The install step is unchanged: it still adds the system packages, and it skips
browsers already in the cache. When parallel jobs miss together, only one saves
the cache; the others log a warning, which is harmless.

## Checks

- `actionlint`: clean.
- The version parse was checked locally (`Version 1.64.0` becomes `1.64.0`).
- Hosted proof on this PR's run 38210371692:
  - Attempt 1: `Cache not found for input keys: playwright-Linux-1.64.0`. The jobs
    downloaded Chrome, FFmpeg and the headless shell, and a successful job saved
    the cache.
  - Attempt 2 (rerun): all six browser jobs logged `Cache restored from key:
    playwright-Linux-1.64.0`, with 0 downloads from Playwright's CDN.
- Both attempts failed only on the email-access browser test. That's the 15 s
  town-ticket problem #276 fixes, so this lands after #276.
