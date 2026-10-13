# Email access: give CI's cold first render its own join allowance — 2026-10-13

**Objective:** stop `email access` timing out on
`.multiplayer-roster[data-connected="true"]` in `preview checks`. After #281
it still failed about 15% of attempts (5 of ~33 since 2026-10-12 08:00Z), on
heads with and without #297, including a head that differed from main only in
a test file.

**Branch / worktree:** `fix/email-access-cold-join-20261013` in
`../river-oaks-email-join-20261013`. The diagnostic branch
`diag/email-join-20261013` (temporary, never merged) carried the timeline
instrumentation and push-only workflows.

## Evidence

- Repeated email-access runs on CI's Mesa renderer, with a page-side timeline
  of socket open, first message, roster connected and long animation frames
  (run 38388176396, 3 jobs × 8 runs):
  - The **first** run on each runner was slow: one failure, then joins of 45 s
    and 26 s.
  - Runs 2 to 8 on the same runner joined in 5 to 18 s.
  - On a cold run, the page's first render was one 20 to 32 s frame inside
    three.js's render callback. That is shader compilation on llvmpipe. The
    socket was created, or its open event handled, only after that frame.
  - Once the socket opened, the first snapshot was handled within about 50 ms.
    The server and the join code are fine.
  - In the failing cold run the roster did connect, at 30 s page time. A
    second 14 s frame then kept Playwright from seeing it before the 60 s wait
    ended.
- **Cache experiment** (run 38389181791):
  - With a fresh `MESA_SHADER_CACHE_DIR` for every run, all 6 runs were slow
    (joins of 33 to 55 s, 1 failure).
  - With the default cache on one machine, only the first run was slow
    (57.9 s).
  - The cache is about 11 MB (`~/.cache/mesa_shader_cache`).
- **Cross-runner cache** (run 38390404738): a cache saved on one runner and
  restored exactly on another, as an `actions/cache` hit, did not warm it. Its
  first run still compiled for 28 s, and the cache grew instead of being
  reused. Most likely the shaders are compiled for each machine's CPU. So
  caching shaders in CI is not a reliable fix.

## Cause

Every CI job is a fresh runner with a cold Mesa shader cache, so this test's
single run always pays the full first-render shader compile on the page's
main thread. That takes 26 to 58 s of the 60 s roster allowance. The app's
join is not slow: GPU runs join in about 6 s, and warm Mesa runs in 5 to 18 s.

## Change

`preview/e2e/email-access.test.js`:

- Under `RIVER_OAKS_SECURITY_SOFTWARE` the roster wait allows 150 s, and the
  test allows 240 s overall. A GPU run keeps 60 s and 120 s.
- The checks are unchanged: one town socket, the roster connected, then the
  app usable.
- Every run logs `Town join: roster connected N ms after admission`, so a
  slower join shows in the CI log before it fails.

## Verification

- **Fresh cache every run** (run 38394776120, 2 jobs × 6, this change on the
  diagnostic branch): 12 of 12 passed. Joins took 18.9 to 57.9 s, five of them
  over 50 s.
- **Local GPU:** `node --test preview/e2e/email-access.test.js` passed, logging `Town join: roster connected 4242 ms after admission (allowance 60000 ms)`.

## Not done

A renderer change could keep the first-visit compile off the page's main
thread, for example `renderer.compileAsync` with `KHR_parallel_shader_compile`.
That would help real visitors without a GPU, who also wait 20 to 30 s on a
first visit, but it is renderer work and out of this fix's scope.

## Next step

PR, land, then retire this branch and delete `diag/email-join-20261013`.
