# MVP release readiness (#587)

## Objective and ownership

Validate and stabilize the TypeSafe Place world expansion MVP (District → Bayou Market Commons → District) as it exists on `main`. Collect automated and hands-on evidence for travel, multiplayer synchronization, interactions, accessibility, rendering, asset streaming and recovery. Compare against the original District baseline, keep a prioritized defect list, resolve release blockers before cosmetic work, and publish a reproducible release checklist with a readiness decision.

Task `mvp-release-readiness-20261024`, owner `claude:mvp-release-readiness-70028024`, branch `test/mvp-release-readiness-20261024`, worktree `/Users/buns/Documents/GitHub/BunsDev/river-oaks-release-readiness`, pinned candidate origin/main `2cbc4dc470897bd8ee4da059ac8795885ee594c1`. Owned files: this ledger, `docs/acceptance/mvp-release-readiness-20261024.md` and its evidence directory, and any unowned release-blocker fix claimed in the register before editing.

Other owners' work is consumed as evidence and not edited: integration PR #623 (`integrated-expansion-mvp-20261023`, codex; its worktree holds an uncommitted merge of `2cbc4dc4`), activation rehearsal #630, perf protocol #626, walking-control contrast (`movement-pad-contrast-20261024`, codex) and Bayou luxe polish.

Collaborator: Codex session `codex:01a16c8c-86e6` works in this worktree under a user-selected boundary. It owns only `docs/superpowers/plans/2026-10-24-mvp-release-collaboration.md`, `docs/acceptance/mvp-release-gate-collaboration-20261024.md` and the ignored `.runtime/release-readiness/codex-investigation/`. Never stage or commit those files from this task. The #623 integration now belongs to `codex:goal-01a16c6e-9a25`.

## Session start reconciliation (2026-10-24 ~05:45 UTC)

- The host restarted about 38 minutes before this session. No earlier verification or lander process survived. The landing queue was empty.
- origin/main is `2cbc4dc4` (#621). It includes the destination slice #611 (Bayou Market Commons, opt-in revision `east-garden-commons-market-1`). Streaming #582/#583, the #587 gate fixes and authoring preservation exist only in PR #623, which is draft and CONFLICTING with main.
- Issues #582–#587 are open; #580/#581 are closed.

## Checks and results

| Check | Command | Result |
| --- | --- | --- |
| Prerequisites | `pnpm install --frozen-lockfile`, `uv sync --locked`, `pnpm run agent:doctor full` | Passed once `REDIS_URL` named the owned loopback Redis on 127.0.0.1:16521 (persistence off) |
| Full gate | `REDIS_URL=redis://127.0.0.1:16521/0 pnpm run verify full` (Python 3.12 first on PATH) | Running; log `.runtime/release-readiness/full-001.log`. All 13 non-browser stages passed in about 5.5 min: tooling 218/218, preview 3,902 passed and 1 skipped, server 1,128/1,128 with Redis and no skips, desktop 115 passed and 3 skipped (Windows-only), Python 156 passed |
| Reachable area | `node preview/audit/world-expansion-footprint.js --reachable` | Gardens 46,477.75 m² vs Market 52,030.75 m² at 0.5 m (ratio 1.11948). Projected capacity at District density is 2.99×. Receipt `.runtime/release-readiness/footprint-2cbc4dc4.json` |
| Hosted Verify on main | `gh run list --branch main` | `2cbc4dc4` **failed** (run 40056830998): `preview experience (commons)` plus a one-off email-access timeout in `preview checks` |

## Hosted Commons journey reliability (P1)

The `preview experience (commons)` job failed on 6 of 13 Verify runs since the destination merged: main `00a36290`, `c3d1196c`, `c786ce1d`, `2cbc4dc4`, and PR heads `d4ba39a7` (#628) and `bb1300b7` (#630). It passed on `072bb756`, `c005074d`, `e19dbadd`, `95e2552e`, `07ca386d`, `8d72756c` and `10809935`. Logs are in `.runtime/release-readiness/hosted-commons/`.

Five of the six failures stall on the first walk after the shared chess game (`owner plaza` or `alice plaza`). The sixth timed out on a 10 s wait after the Lantern Walk completed. In the stalls the stuck positions repeat across runs exactly: alice at (edge+92.14, −1313.35), owner at (edge+93.86, −1316.65). Speed is 0, velocity decays to denormals and `showBody` is false. The hosted report shows llvmpipe at about 9 fps.

Reproduced in Node (`.runtime/release-readiness/probe-stand-walk.mjs`):

- The server's `stand` puts both players at exactly those positions.
- The production walking solver, posing through the real authority, reaches the next waypoint from both stand spots with zero rejections (owner 37 accepted poses, alice 47).
- Authority, collision and the stand spot are therefore not the cause. The client did not apply forward input after standing.

The CI-like diagnostic `.runtime/release-readiness/commons-diagnostic.mjs` keeps the journey's assertions and steering unchanged and only adds tracing. It runs the journey under SwiftShader with key, pointer, focus and visibility tracing. It is queued.

## Full gate full-001 terminal result

`full-001` ran from 05:46:45 to 08:05:10 UTC on `2cbc4dc4`, clean, and exited 1. The receipt is `.runtime/release-readiness/full-001.json`, the log `full-001.log`, and the experience report is preserved as `full-001-experience.json` (the tracked file was restored).

- **Passed (15 stages):** all 13 non-browser stages, plus `security-browser` (2/2, including email access) and `reflections`.
- **Failed:** `experience` hit the 20-minute aggregate stage deadline (1,200,064 ms, killed) while running the last journey. Queue admission (3,389,790 ms) was correctly excluded from that deadline.
- **Not run:** `shared` and `ipic-screening`.

Within the experience stage:

- **Commons journey:** `east-garden-commons` on Metal passed every check through the owner's return. That covers both arrivals, Market Street, outward travel, shared chess, the post-chess plaza walk (the hosted stall point), reconnect with identity and position, all five lanterns, completion credit for both players and the lit-lantern status. It was killed during the final return legs, so the journey has no terminal pass.
- **Campus traversal (first failure, preserved):** `garden-campus-traversal` failed with "could not walk to under B12". Alice was on Floor 2 of the Gardens campus. This is a non-expansion journey (#508); it passed in hosted CI on the same head.
- **Host load:** one-minute averages of 24–44 from other sessions' work during the stage. This is a likely, but unproven, factor in both the deadline and the campus failure.

Results from the separate lock turn so far, both on `2cbc4dc4` with the same Redis:

- `garden-campus-traversal` retry passed (09:00:52–09:03:27 UTC; source clean apart from the journey patch below).
- `east-garden-commons` passed on Metal in 3.8 min (09:03:27–09:07:16 UTC). That run used the pulse-only driver patch, SHA-256 `15d0f7a2…`, patch saved as `.runtime/release-readiness/commons-rerun-journey.patch`. It is the terminal local pass the killed full-001 stage lacked; it is not a clean-head pass.
- Shared passed 27/27 from 09:07:16 to 09:28:59 UTC under one-minute load of 52–57.
- `ipic-screening` passed (09:28:59–09:30:44 UTC).
- The full-001 experience report holds 16 results: 15 passed and `garden-campus-traversal` failed; `east-garden-commons` was killed before writing its result.

Every full-profile stage and journey therefore has a passing result on `2cbc4dc4`. They come from one interrupted full run plus one completing lock turn, which is weaker evidence than a single uninterrupted pass.

Core `core-001` passed 11/11 with the final journey patch (SHA-256 `f497df97…`, unchanged start to end), 09:04–09:16 UTC: tooling 218/218, preview 3,902 + 1 skip, server 867 + 219 Redis-only skips, desktop 115 + 3 Windows-only skips, Python 156; build, lint, demo and secrets passed.

The original plan for that lock turn, `rest-of-full.sh`, reruns `garden-campus-traversal` alone, `east-garden-commons` alone, then `test:shared` and the IPIC runner on the same head and Redis. It copies each generated report and restores the tracked ones. These count as separate evidence and do not relabel full-001.

## District parity: matched performance and visuals (ABBA)

The runs used `.runtime/release-readiness/perf-abba.sh` under one held browser lock from 05:59 to 06:39 UTC. The harness was the unmodified `preview/audit/world-expansion-baseline.js` on `2cbc4dc4`: three warmed 30 s samples per workload, Sharp quality, reduced motion, Metal Chromium 156 on an M5 Max, and fixture loopback authority. The run order was A1 Gardens spawn, B1 and B2 Market revision at the same District spawn, A2 Gardens spawn, then C1 on Market Street. All five runs passed with zero page errors, zero asset failures and zero reconnect drift. One-minute host load was 12–17 during A and B and 22–29 during C. Comparison: `docs/acceptance/mvp-release-readiness-20261024/perf-abba-comparison.json`, built by `.runtime/release-readiness/perf-compare.mjs`.

| Workload | B/A CPU p95 | B/A mean frame | B/A frame p95 | B/A reconnect | C/A CPU p95 | C/A draw calls |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Desktop, 1 client | 1.073 | 1.006 | 1.000 | – | 0.879 | 0.558 |
| Desktop, 2 clients | 0.957 | 0.894 | 0.999 | 0.994 | 0.809 | 0.538 |
| Phone viewport, 1 client | 0.946 | 1.000 | 0.997 | – | 0.996 | 0.608 |
| Phone viewport, 2 clients | 0.942 | 1.001 | 1.249 | 0.734 | 0.790 | 0.589 |

Every CPU and reconnect ratio is within the provisional budgets (≤1.10 and ≤1.20).

The only frame-p95 excursion is phone two-client at 1.249 (pooled 33.4 → 41.7 ms). It sits on the 60 Hz refresh step: the six samples alternate between 33.4 and 50 ms while the mean frame interval is unchanged (1.001). That is consistent with the quantization #626 documented. Because #626's protocol amendment is unapproved, it stays recorded as a literal exceedance of the provisional budget (acceptance D11). The collaborator ledger made the same point.

With the Commons composed, the District keeps 16% more renderer geometries and 5–6% more textures, and desktop first-player readiness is 16–20% slower. That is consistent with main building the Commons eagerly; the #583 streaming in PR #623 targets it. Heap rose about 3% (410 → 422 MB).

The destination view (C) costs less than the District arrival on every metric.

Visuals: the Gardens and Market spawn captures differ in 0.04–0.38% of pixels (max channel difference above 24). That is the same size as Gardens-vs-Gardens run noise (0.04–0.24%), from animated birds and figures. The District arrival is visually unchanged. Inspected images are in `docs/acceptance/mvp-release-readiness-20261024/` (JPEG, with source hashes).

On Market Street I noted:
- a brick lane, tree rows, storefronts and lamp posts, with the Bayou Lantern tower as the landmark;
- storefront glazing that reads as flat dark panels;
- bare open ground on the horizon past the tower;
- a HUD that still shows the District street address and "public district paths".

## Production download

I built production bundles of main before and after the destination merge (`827886fd` vs `00a36290`) with `vite build`. Gzipped JS went from 1,949,772 to 1,966,546 bytes (+16,774, +0.86%). CSS grew by 109 bytes. The merge added no binary assets, only a one-line `world-manifest.json` change. This is within the ≤10% cold-load budget.

## Post-chess and Commons journey stalls: two modes

The task-local diagnostic `.runtime/release-readiness/commons-diagnostic.mjs` keeps the unchanged journey's assertions and timeouts, and adds tracing of steering decisions, page key/pointer/focus/visibility events, WebSocket refusals and self-state. The runs:

- SwiftShader runs at about 2 fps on this Mac (diag-002). That is too slow to match CI: steering converged, but per-frame step clamping limited walking to about 0.6 m/s. Not representative.
- **Metal with CPU throttling ×8 matches CI exactly**: auto quality, scale 0.6, 9 fps (diag-004).
- A minimal page using the production `pointer-gesture.js` showed drags of 12–504 px apply exactly, even with 100 ms busy frames (`drag-probe-*.json`). Drag loss is ruled out.

**Mode A: reproduced and root-caused (journey driver, not product).** In diag-004, alice stalled on her first Market Street waypoint, 1.04 m from the target. The trace showed:

- zero WebSocket refusals and no self-state changes;
- every turn converging to a heading difference of 0.000.

The driver keeps W held across browser round trips for every distance. At 9 fps each check comes about 1.2 m later, which is more than twice the 0.35 m arrival radius. So the walker overshoots, turns 180°, overshoots back, and repeats until the 120 s deadline. Her yaw wound to −25 rad.

This also explains:
- hosted run 40051578967 (alice moving at 3.1 m/s, 2.3 m from target, "stalled");
- why passing hosted runs took 35–112 s for a ~20 m post-chess walk.

#623's tighter 0.15 m radius would make the cycle more likely.

**Fix** (claimed in the register; driver only): within 2 m, `walk()` now releases W after each pulse and waits for walking speed below 0.05 m/s before measuring again. Far walking keeps the continuous hold, which its comment says avoids braking on CPU CI. The tolerance line is untouched so #623 does not conflict. Verification is the 9 fps diag-005 rerun, red at diag-004 and expected green; it is queued.

**Mode B: not yet reproduced.** In four hosted failures, a player who stood up from the chess chair never left the stand spot. Position matches the server stand spot to within 5e-4 m, yaw is 0.036–0.115 rad off the target heading, and speed is 0. The Node probe shows the server stand spots and the production solver accept every step, so authority and collision are excluded. The denormal velocity does not prove a W press, because `clear()` zeroes velocity but leaves spring acceleration. The candidate cause remains a browser-side condition that prevents turn convergence after stand-up. The collaborator's focused trace (`codex-investigation/post-chess-focused-001`, 08:11–08:20 UTC, SwiftShader, setup by approved travel beside the chairs) used the original driver (journey SHA-256 `fe06b5a9…`, equal to HEAD). Chess, stand-up and both plaza walks passed in 3/3 attempts, so mode B was not reproduced. Its "source-drift" flag came from this task's driver edit at 08:13 UTC, which landed after its source was read. That timing is recorded so the flag is not misread as an unexplained change. diag-005 (9 fps, patched driver) continues the search.

## Decisions and delivery (2026-10-24, about 12:00 UTC)

Val answered three questions:

- **Delivery:** draft PRs, with the D1 fix PR landed through `pnpm run land` once hosted checks pass. The readiness PR stays draft.
- **Reachable area:** 1.12× accepted for the MVP (D5); 3–5× remains a program target.
- **Performance:** adopt #626's paired continuous-metric protocol (D11).

Fix PR #639 (`fix/commons-journey-overshoot-20261024`, worktree `river-oaks-commons-driver-fix`):

- Contains only the pulse change, the exact file verified in browser runs (SHA-256 `15d0f7a2…`), on main `c41c379a`. The journey file is unchanged since `2cbc4dc4`.
- Signed commit `407328e7`, which GitHub reports as verified.
- Independent review: ready. Two minor notes: a sub-frame pulse can be missed and is then retried, and a null pose fails loudly rather than hanging.
- The lander (owner `claude:mvp-release-readiness-70028024`) was queued at 12:04 UTC behind the sweep's #635. The sweep session (`river-oaks-a3`) held its other landers so #639 lands first.

The final driver version adds refusal capture, so a stall error and every journey report carry the town's latest refusals and corrections (SHA-256 `f497df97…`). It passed `core-001` and a normal Metal Commons journey (driver-verify, 12:04 UTC). Its 9 fps diagnostic run (diag-006) is pending. It ships as a separate follow-up after #639 lands.

## #639 hosted result and the D14 server fix

#639's lander stopped at 12:24:55 UTC and nothing merged: hosted Verify run 40092445030 failed `preview experience (commons)` on both attempts. Both stalled alice on her District approach at the D14 corner, (−2726.52, −1302.54) and (−2726.49, −1302.56). Velocity was exactly zero, consistent with repeated `blocked` corrections. None of the 13 pre-patch hosted failures stalled there. The precise-arrival driver puts the walker exactly on the planner's corner waypoint, and the next straight leg grazes the building, so #639 alone turns D14 into a deterministic CI failure. Logs: `.runtime/release-readiness/pr639-commons-attempt{1,2}.log`. The sweep session was told to resume its landers.

Fix, in the same branch, claimed in the register:

- In `pose()` (`server/world.js`), the per-sample checks are now one polyline check.
- When a ground move without a vehicle is refused `blocked` on its straight chord, the two axis-aligned elbows between the same poses are tried. Each uses the same 0.15 m collision, private-home and private-suite checks.
- A clear elbow is accepted and charged to the movement budget at its full length.

New `server/tests/movement-corner-elbow.test.js` (four tests; 3 failed with `blocked` before the fix, 4/4 pass after):

- The captured pose pair is accepted.
- The production walker reaches the arrival round both route corners with zero refusals.
- An elbow move is charged its full length.
- A 0.6 m graze whose chord and both elbows cross the corner margin is still refused.

Verification so far:

- `REDIS_URL=<isolated 127.0.0.1:16522> pnpm run test:server`: the first run failed one unrelated Redis transport test (crime hit fan-out, socket closed 4003 before the first snapshot, host load about 60). That test passed 3/3 in isolation both with and without the change. The rerun passed 1,135/1,135 with zero skips.
- Core run 1 on the fix worktree failed `server-tests` at its 600 s deadline (SIGKILL), at the same time as filesystem "Interrupted system call" errors. The same server suite without Redis then passed in 34 s (874 passed, 219 Redis-only skips). The failed receipt is kept as `core-elbow-001-failed.json`. Core run 2 is in progress.
- Independent review: **ready**, no authority exploit.
  - The elbow is tried only after a `blocked` chord.
  - Both legs are fully checked.
  - The budget charges the longer path.
  - On foot only.
  - Minor coverage gap: no test of a private-home or private-suite refusal on an elbow path.
  - Process note: before my correction reached it, the reviewer ran `git stash` and `git stash pop` on `server/world.js` for about 2 s around 12:34:47 UTC. That was during core run 1's tooling stage, which does not load the server, and core run 1 is superseded anyway.
- Combined browser verification (Commons on Metal, spatial-streets, then the 9 fps diagnostic) is queued.

Landing this needs Val's approval, because it changes authoritative movement validation. The earlier authorization covered only the driver fix.

Follow-up results:

- **Core:** run 2 failed one tooling test, the lander file-watch wake, which then passed 29/29 four times in isolation. Its receipt is kept as `core-elbow-002-failed.json`. Run 3 passed 11/11 on `407328e7` plus the server change, with the `world.js` hash unchanged from start to end.
- **Draft PR:** #639 was converted to draft, and the signed server commit `84bde258` was pushed.
- **First hosted run on `84bde258`:** its commons job failed the post-walk 10 s town-confirmation check, with no diagnostics; the next push cancelled the run.
- **Diagnostics commit `d6000b84`:** adds refusal capture to stall errors, town-confirmation timeouts and journey reports.
- **Hosted Verify run 40099339261 on `d6000b84`:** passed, and its commons job passed 4 of 4 attempts (13:43–14:19 UTC and later).
- **Local combined run on `d6000b84`:** Metal `east-garden-commons` passed in 218 s, with exactly one refusal, the known post-stand `movement_too_fast`. The corner `blocked` refusals are gone. `spatial-streets` passed in 184 s, and the 9 fps journey passed in 1,127 s.
- **Approval:** Val approved landing #639 with the server change, by answer in this session at about 16:30 UTC.
- **Landing:** GitHub GraphQL was rate-limited, so the lander starts once the window resets (background script, log `land-639-b.log`).

## #639 delivery and retirement

GitHub GraphQL was rate-limited until 16:37 UTC, after which #639 was marked ready and the lander took its turn. It updated the branch from main (`44e51601`, which now includes #489).

Verify run 40114160932 then ran:

- **Attempt 1:** `preview shared (worlds-and-creator)` failed on `creator-approved-cafe`, the #489 café flake that the sweep session moved to on-demand in #644. Commons passed, and the café stall reproduced with the elbow fix present, so this fix does not cover it.
- **Rerun:** passed.

The merge guard merged at 17:26:50 UTC as `98c7dd7427d3421dcadfb7c9ede20873ba07cbd3`, an ancestor of freshly fetched origin/main. The merge tree equals the reviewed-head tree (`d7bce7eb…`).

Retirement of the fix checkout:

- **Task:** moved to its own register task, `commons-journey-fix-639`, with delivery evidence, then released (owner null, retirement attestation for head `44e51601`).
- **Evidence:** all 33 files of the fix worktree's `.runtime` and `output/playwright` evidence were copied to `.runtime/release-readiness/fix-worktree-evidence/`, with matching SHA-256 lists.
- **Cleanup:** only regenerable caches were cleaned, with `git clean -fdX` after a dry run. No process had its CWD there.
- **Branch:** the local branch was fast-forwarded to its own merged upstream head.
- **Prune:** the dry run was eligible; `project:prune --apply` retired the branch and worktree. Archive: `~/worktree-backups/river-oaks/retirement-ByPL4d/` (bundle SHA-256 `c26ddbe8…`, manifest and restore command recorded). The local ref and worktree are absent afterwards; the remote branch is untouched.

## Current state and next step

The readiness decision stands: **NO-GO for player-facing activation; GO for opt-in internal play.** Details are in `docs/acceptance/mvp-release-readiness-20261024.md` (draft PR #643).

This task owned and resolved the main CI blocker (D1, with D14) by landing #639. The remaining activation blockers belong to other owners:

- **D2** (#623 streaming and gate): `integrated-expansion-mvp-20261023`.
- **D3** (walking-control contrast): `movement-pad-contrast-20261024`.
- **D4** (human visual and keyboard/screen-reader acceptance, target devices and budgets): Val.

Val decided D5 (accept 1.12× for the MVP) and D11 (adopt #626's protocol) on 2026-10-24.

Next:

1. Main's Verify on `98c7dd74` (run 40116152217): Commons passed. The aggregate failed only on `creator-approved-cafe` (#489 flake, #644). Keep watching later main and PR runs for Commons reliability. If mode B recurs, read the refusals now included in the failure.
2. When #623 lands, rerun checklist rows 2–7 and 10 on the merged head.
3. Keep #643 as a draft until Val has reviewed it.
