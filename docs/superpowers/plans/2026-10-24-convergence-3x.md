# Convergence, release candidate and 3× (2026-10-24)

## Objective and ownership

1. Land the open draft backlog onto `main` through the shared landing queue, one lander at a time.
2. Rerun the Commons and Heights release-candidate evidence on the converged `main` commit.
3. Open the 3× reachable-ground lane after Bayou Heights (#649).

Task `convergence-3x-20261024`, owner `claude:river-oaks-71 (3e5b45)`, branch `docs/convergence-3x-20261024`, worktree `/Users/buns/Documents/GitHub/BunsDev/river-oaks-convergence-3x`. Owned files: this ledger. Every PR stays its owner's work. This task runs only the landers and edits no other branch.

## Authorization and default decisions

Around 23:35 UTC, Val answered the proposed goal with "proceed with all of the above e2e through to full completion … I will be asleep". That plan asked whether `pnpm run land` may land the listed PRs. This task reads Val's answer as permission to land, under the plan's conditions:

- hosted checks pass on the head that is up to date with `main`;
- the owner's required local checks are recorded;
- an independent review was done and its findings addressed;
- merging goes only through `pnpm run land` and the merge guard: no auto-merge, admin bypass or force-push.

Val left four questions unanswered. Each gets the default that changes nothing:

| Question | Default applied |
| --- | --- |
| Heights retained-geometry ceiling | Keep 16 MiB; out-of-view neighborhoods stream out, as #649 already does (no budget change) |
| #641 Bayou luxe polish | Held (Val requested changes; owner river-oaks-33 is reworking it) |
| #653 core-dump trade-off | Held |
| #654 desktop packet (#373/#372 answers) | Held |

Also excluded: security changes. #659's commit `66134f27` changes the WorkOS/waitlist access recheck. #659 lands only without that commit, or after Val reviews it.

Not authorized: deployment, production activation or reads, budget/security changes, land beyond the reserve, likeness intake, paid services.

## Coordination (2026-10-24, 23:36–23:55 UTC)

- **river-oaks-e9** (`landing-steward-20261024`) holds an overlapping goal. Its session has no landing authorization (Val ticked no rows there). Agreed split:
  - 71 runs every Phase 1 lander and the Phase 2 rerun, and owns Phase 3 (e9 handed it over at about 23:50Z, unstarted).
  - e9 runs no lander. It takes guarded retirement of each merge (after an exact-head release by the owner) and its D12 experience-stage fix.
  - 71 sends e9 the PR, merge SHA and owner task for each merge.
- **river-oaks-33** runs its own lander for #657, authorized earlier by Val. #657 is removed from this train.
- **river-oaks-a3:** the open-pr-sweep has no landing work in flight and no objection. Its sweep worktrees are released to e9 for retirement.
- Owners who said "hold until I confirm":
  - #647 (a8): review and verify full browser stages pending.
  - #656 (32): Jevica cost exceeds +10% in timing run 1; a load-gated rerun is queued; no code review yet.
  - #658/#659 (f1): browser runs queued; reviews starting.
  - #655 (3e): browser stages queued.
  - #649 (91): preview check failing at `8f3c94fd`.
- Owner agreed to this task landing the PR: #648 (bc), #651/#652 (7c).
- Owner sessions gone, so this task lands on the register evidence: #645 and #646 (`claude:onfoot-637-640-728d6f06`), #650 (`claude:river-oaks-56`).

## Phase 1: landing train

Order: #648 → #650 → #651 → #652 → #645 → #646, then each held PR as its owner confirms (#658, #659, #647, #656, #655, #649).

| PR | Basis to land | Lander | Result |
| --- | --- | --- | --- |
| #657 | Val authorized earlier, in river-oaks-33's session | river-oaks-33's lander | Merged `c3eae4f5` at about 23:49Z (Verify passed on `942711f5`) |
| #648 | Docs-only; hosted 22/22; core passed at `85d66e97` | 71, queued 23:37Z | Merged `26d63a06` at about 00:05Z, reviewed head `bbd68da9` (update-branch), Verify passed; on fetched main |
| #651 | Owner 7c agreed; Desktop and Verify green; 10/10 diagnostic legs; independent review addressed | 71, queued 23:39Z | Merged `4122fe07` at about 00:40Z, reviewed head `12ae37ac`, Verify passed; on fetched main |
| #645 | Hosted 22/22; every verify full stage passed across two runs on 7e267038; two reviews addressed (owner session gone) | 71; attempt 1 refused "unstable" (CodeQL swift queued); attempt 2 through the wrapper | Merged `a437cbbf` at about 03:10Z, reviewed head `e4d0413`; 22/22 checks complete; on fetched main; owner task marked delivered. Human gameplay-feel review (#637/#599) open |
| #647 | Owner a8 confirmed final head 2586c39a; review's four defects fixed failing-first; hosted 29/29; core on identical source | 71; attempt 2 through the check-waiting wrapper | Merged `2c2f2eec` at about 02:58Z, reviewed head `0918a012`; all 29 checks complete, including CodeQL Swift; on fetched main |
| #652 | Owner 7c agreed; Desktop and Verify green; cache miss and hit proven on three runners; review addressed | 71; attempt 1 refused "unstable" (Desktop installers running); attempt 3 through the check-waiting wrapper | Merged `7ad9ffc6` at about 01:55Z, reviewed head `65aef4ac`; all 31 checks complete; on fetched main |
| #650 | Two independent reviews addressed; hosted 22/22; core `b612ac51`; actual-screen 12/12; two-browser 19/19 (owner river-oaks-56, gone) | 71, queued 23:39Z | Merged `2da76e1f` at about 00:17Z, reviewed head `b7b9e5d0`, Verify passed; on fetched main; owner task marked delivered |

### Landing incidents (kept as found)

- **01:06Z, #652 refused.** Verify passed on `65aef4ac`, but the merge guard refused with "merge state is unstable": the Desktop workflow's `installers (windows-latest)` job was still running. The repository lander waits only for Verify.
  - #652 and #647 change Desktop-workflow paths: `.github/workflows/desktop.yml` for #652, and a `shared/` file for #647.
  - Both now land through a task-local wrapper, `scratchpad/land-wait-checks.mjs`. It uses the repository's own `land()`, queue and merge guard, but its guard first runs `pnpm run pr:wait <pr> --until checks`. No repository tooling changed.
- **01:08Z, stopped lander left the queue lock.** Stopping #647's plain lander to switch tools left the queue's lock directory behind.
  - `local-queue.mjs` reclaims an abandoned lock after 30 s, but `withLock` gives up after about 10 s (400 × 25 ms).
  - So the #646 and #652 landers exited with "The queue lock is held". They were requeued at 01:09Z; nothing merged wrongly and no other session's lander was affected.
  - A follow-up for the tooling owner: make the retry window outlast the 30 s stale-lock window, or stop landers only between lock operations.
- **01:43Z, #645 refused.** Same refusal: Verify passed on `2b39b9c3`, but CodeQL's `Analyze (swift)` job and the PR workflow were still queued for runners.
  - Every lander of this task now uses the check-waiting wrapper: #652, #647, #645 and #646, in queue order after river-oaks-33's #641.
  - #646's plain lander was stopped with SIGTERM to its own PID, so it dequeued cleanly and left no lock.
  - river-oaks-33 was told about the refusal and the wrapper.

- **02:23Z, browser queue stalled.** The shared browser lock has been held since 23:36Z by river-oaks-32's `character-fidelity-baseline.mjs … --quiet load=10 … --out timing-4` (PID 85902), at 0% CPU, waiting for host load ≤ 10. Host load has stayed between 12 and 40 all night with about 20 sessions, and 11 runs are queued behind it, including both of this task's journeys. Its owner was asked to stop it or release the lock while waiting. This task did not touch it.
- **02:22Z, #647 waiting.** CodeQL's `Analyze (swift)` job was still queued for a runner on `0918a01`, the only incomplete check of 29. The wrapper holds the turn until it completes.

- **02:45Z, pace.** Each landing turn begins with an update-branch, and GitHub's default CodeQL setup then reruns `Analyze (swift)` on `macos-latest`. With macOS runners contended, those runs take 60–95 minutes: #645's ran from 01:07Z to 02:42Z, and #647's has been queued since 01:56Z. The merge guard requires every workflow to be complete, so the train lands about one PR per 60–95 minutes. That is outside this task's control, and no guard or check was bypassed.

## Phase 2: release candidate (after the train)

Not started.

## Phase 3: 3× lane

Target: ≥139,433.25 m² reachable at 0.5 m from the District spawn (3 × 46,477.75).

### Capacity, measured on #649's head

Command: `node preview/audit/world-expansion-footprint.js --reachable`, run on a detached checkout of #649's head `8f3c94fd` (2026-10-24, ~23:55Z). Receipt kept locally as `p3/footprint-8f3c94fd.json` in this session's scratchpad.

| Grid | Gardens | Commons | Bayou Heights | Heights ratio |
| --- | ---: | ---: | ---: | ---: |
| 1 m | 46,549 | 52,130 | 93,904 | 2.0173× |
| 0.5 m | 46,477.75 | 52,030.75 | 93,508 | 2.0119× |

The PR body gives 93,509.75 m² at 0.5 m for the same work. That figure came from earlier evidence; this run on `8f3c94fd` measures 93,508.

Location bounds after Heights' partition:

| Location | Status | Bounds area (m²) |
| --- | --- | ---: |
| `river-oaks-district` | authored | 73,753.12 |
| `east-garden-commons` | authored | 9,200 |
| `bayou-heights` | authored | 89,307.42 |
| `east-garden-reserve` (x 422.5–507.9 of the Commons frame, full north/south span) | reserved | 24,799.31 |
| `east-garden-reserve-north` (x 0–115, y 40–167.8) | reserved | 14,699.53 |
| `east-garden-reserve-south` (x 0–115, y −122.6 to −40) | reserved | 9,499.99 |

The tool's `expansionCapacity` at the District's measured walkable density (0.6302):

- **Projected total:** 124,386 m², about **2.676×**.
- **Bounds needed for 3×:** 72,876 m² of new location bounds, which is **23,878 m² more than is reserved**.
- **Without more land:** 3× would need the remaining reserve to be **93.7% walkable**, against the District's 63% and Heights' 46% (41,477 m² added from 89,307 m² of bounds). Even full coverage stops at 3.066×.

**Conclusion: 3× cannot be reached honestly inside the current reserve.** This task authors the remaining strips toward about 2.6× and asks Val to decide on land. Under the authorization, that is a land proposal, not added land.

### First increment: Studewood (east strip beyond Heights Boulevard)

Draft recipes live in this session's scratchpad (`p3/recipes/gen.py`, `studewood-north.json`, `studewood-south.json`). They aren't committed: they build on #649, which is still changing.

| Recipe | Site (Commons frame) | Contents | `destination build` |
| --- | --- | --- | --- |
| `studewood-north` (seed 1931) | x 404–507.5, y 0–167.5 | Studewood Street (north-running, lane 7, sidewalks 3.5); Twentieth Street continued east through the Heights frontage gap; Studewood Park with a water tower landmark, a three-stall night market with café sets, benches and lamps; a shop row and a court | 185 pieces, 99 solids, 11 materials, 45,804 triangles; within budgets; connectivity 1.0 |
| `studewood-south` (seed 1932) | x 404–507.5, y −122.5–5 | Studewood Street south; Eighteenth Street continued east; a market row and a market yard with stalls and café sets; a garden-court row and a lawn | 150 pieces, 67 solids, 13 materials, 74,244 triangles; within budgets; connectivity 1.0 |

At 0.5 m, the union of their walkable rectangles inside the reserve is 21,669 m², or 20,781 m² clear of solids. That is a source estimate before the 0.35 m walking-radius erosion, not a measurement. If it holds, the total is about 113,000 m², around 2.43×.

Seams: Twentieth (y 111) and Eighteenth (y −71) cross Heights' 2 m reserve margin and its frontage gaps, x 404–422.5. Those gaps are empty block land in #649 (frontage-mid/north at y 104.5–117.5; frontage-south/far-south at y −77.5 to −64.5). The stubs are ground inside Heights' location and must be documented and tested as seams, like Heights' footbridge landing on the Commons plaza.

### Studewood implementation (task `studewood-3x-20261024`)

- **Where.** Worktree `river-oaks-studewood-3x`, branch `feat/studewood-3x-20261024`, stacked on #649's head `7291b566` until #649 lands.
- **What.** Revision `heights-studewood-1` composes the two recipes onto Heights (`shared/studewood.js`):
  - Heights streams them as two more neighborhoods.
  - The rest of the east reserve becomes the authored `studewood` location, with the same bounds.
  - It adds a park game table (`chess-studewood`) and a checkpoint migration, first in the Redis chain.
  - The location label names Studewood.
  - The design doc is `docs/level-design/expansion/studewood.md`.
- **Seams.** The recipes' cross streets start at x 406, where Heights' streets end. Ground-only seams at x 404–407 carry the walking overlap, so kit paving never overlaps. Composition refuses any seam that crosses a Heights building.
- **Measured reachable ground** (`--reachable`, uncommitted tree on `7291b566`):

  | Grid | Studewood total | Added | Ratio |
  | --- | ---: | ---: | ---: |
  | 1 m | 114,793 m² | +20,889 | 2.4661× |
  | 0.5 m | 114,323.75 m² | +20,815.75 | 2.4598× |

  `expansionCapacity` from Studewood: the remaining strips beside the Commons project to 2.788× at District density, and 3× needs 15,645 m² more bounds.
- **Focused tests.**
  - `preview/tests/studewood.test.js`: 11/11.
  - `server/tests/studewood.test.js`: 5 pass, 1 Redis-only skip without Redis.
  - With an owned disposable Redis, the Studewood and Heights server files together pass 12/12, 0 skipped.
  - First failure kept: the first combined Redis run failed both Redis tests, under host load 29–31. Each then passed alone, both passed together, and the full files passed.
  - Heights, stream, label, manifest and plaza suites: 74 tests with two partition failures. Both came from the reserve change and are fixed with one-line updates (49/49 rerun).
  - `destination check`: 10/10 locks.
- **Core verify (uncommitted tree, diff SHA-256 `471e8caa…`).**
  - `core-001`, 00:05–00:07Z, load 42: failed in tooling, 273/274. The failure was the known load-sensitive `land-pr.test.js` "queued lander wakes on release" timing test, which passed alone. Log and receipt kept as `.runtime/studewood-core-001.{log,-receipt.json}`.
  - `core-002`, 00:07–00:14Z, load 38: **passed**. Tooling 274/274; preview 4,118 plus 1 existing skip; server 899 plus 228 Redis-only skips; desktop 115 plus 3 Windows-only skips. Build, Python, lint and secrets passed.
- **Independent review** (fresh-context agent, read-only, about 00:00–00:20Z):
  - **One confirmed defect.** The journey owner's straight leg to the east chair crosses a park tree-row trunk; in a headless simulation with the real `stepWalking`, it stalled 23 of 27 times.
  - **Fixed.** The owner now takes the west chair, alice the east one, and the owner returns north of the table via x 469, clear of the bench at x 466. All 20 jittered simulations of the four legs reach every waypoint (`scratchpad/p3/probe-swap.mjs`).
  - **No other defects.** The reviewer confirmed:
    - World fingerprints for garage, Gardens, Commons and `bayou-heights-1` are identical to `7291b566`.
    - The only newly walkable cells in the Heights location are the two cross-street strips.
    - The rollback line at x 405.65 is exact.
    - Every migration direction, including garage → Studewood, is correct.
    - The Redis chain order is correct.
  - **Nits addressed.** An unused helper, a no-op assertion (now a real Commons refusal plus a Heights equality check), stale "only bayou-heights-1" comments, and a boundary test with a player just inside and just outside the rollback line.
  - **Kept, documented.** The seam guard checks Heights building shells, not authored landmarks. Forward-migration move lists are inherited log-only behaviour.
  - Focused results after the fixes: preview Heights/Studewood suites 79/79; Studewood and Heights server files with Redis 12/12, 0 skipped.
- **Pending.** Core on the final tree (`core-003`; diff `249f33e0ddd3`, untracked `ec5b01abaf92`), the browser journey `studewood` (queued at about 00:08Z through the lock, from the detached snapshot `scratchpad/studewood-snap`, same diff hash), a signed commit, and a draft PR.

- **Delivered as draft PR #662** (https://github.com/BunsDev/river-oaks/pull/662). Signed commit `33e671e3`, based on `feat/next-district-586-20261024`, opened through REST because GraphQL was rate-limited. `core-003` (00:22–00:29Z) passed on the final tree.

- **Hosted first failure** (Verify 40146901031 on `33e671e3`). `preview experience (studewood)` failed at its streaming check after walking into Studewood (artifact `experience-failure-studewood`).
  - **Cause (inferred; the report has no figures).** The shared Heights landscape part's 6.5 MiB estimate was measured for Heights alone, and Studewood adds 76 trees and 84 planted beds to it.
  - **Fix `6be77a56` (signed).** A high allowance per added tree (4 KiB) and bed (10 KiB); `bayou-heights-1` is unchanged, which a test checks. The journey now logs measured and estimated bytes.
  - **Core attempts on that tree.** `core-004` failed the `land-pr` watch-latency timing test again, at load 17; `core-005` passed (00:44–00:49Z).
  - **Follow-up.** Pushed and commented on #662. The Studewood and terraces journey snapshots were re-synced before they started.

- **Hosted green on `6be77a56`** (19 success, 5 skipped), including `preview experience (studewood)` (Verify 40148167697) and `(heights)`.
  - **Browser figures on the CPU runner.** The shared Heights part measured 7,292,066 B, above the old 6,815,744 B estimate and within the new 7,987,200 B, which confirms the diagnosis. `studewood-north` measured 1,850,396 B and `studewood-south` 1,646,592 B, both within their estimates. Resident was 16,025,470 of 16,777,216 B.
  - **Journey passed:** the Twentieth Street walk, the "Entering Studewood" notice, the park table game, reconnect and return.

- **Local Metal journey passed** (snapshot files equal to `6be77a56`, ended 02:43:58Z): 11/11 checks in 124 s, no page errors, reconnect 1,069 ms, drift 0 m, the same byte figures as hosted.
  - **Captures inspected:** the street and the park (water tower, stalls, café tables, game table).
  - **Visual gaps noted for Val:** bare ground past the east edge on the horizon, and the inherited District address in the HUD.

- **Later merge.** #649's handoff head `c6d42f43` (91's docs-only ledger on `6e5abdff`, which merged main `2da76e1f`) was merged in as `18b9a61f`, with no conflicts.
  - Focused 66/66 preview and 10 server tests, plus 2 Redis-only skips.
  - Core attempts `core-006` and `core-007` failed only the `land-pr` watch-latency test, which passed 3/3 alone in about 100 ms. `core-008` passed. The change is pushed.

### Second increment: Bayou Terraces (task `bayou-terraces-3x-20261025`)

- **Where.** Worktree `river-oaks-terraces-3x`, branch `feat/bayou-terraces-3x-20261025`, stacked on Studewood `33e671e3`.
- **What.** Revision `bayou-terraces-1` composes two locked recipes onto Studewood:
  - `bayou-terrace-north` (seed 1933) and `bayou-terrace-south` (seed 1934);
  - each has a studio row facing Terrace Lane, bank gardens with lawns, a market and café tables, and a riverside walk;
  - a 5 m footbridge over the bayou continues Twentieth or Eighteenth Street onto the Heights greenway.
- **Connections and gates.**
  - The Commons green keeps its hedges and the District edge isn't joined, so the footbridges are the only connections.
  - The two reserved strips become authored locations with unchanged bounds, so no reserved land remains.
  - Heights streams the terraces, and its gate covers them.
  - The Commons stream gate now covers only the Commons' north–south span.
  - There is a gardens game table (`chess-terrace`), a migration that runs first in the Redis chain, and a "Bayou Terraces" label.
- **Measured** (`--reachable`, uncommitted tree on `33e671e3`):

  | Grid | Terraces total | Added | Ratio |
  | --- | ---: | ---: | ---: |
  | 1 m | 131,707 m² | +16,914 | 2.8294× |
  | 0.5 m | 131,269.5 m² | +16,945.75 | 2.8244× |

  3× now needs 8,163.75 m² more reachable ground, about 12,955 m² of new bounds at District density.
- **Focused tests.**
  - Preview Heights/Studewood/terraces/stream/Commons-stream/label/manifest/plaza suites: 99/99.
  - Terraces, Studewood and Heights server files with an owned Redis: 18/18, 0 skipped.
  - Locks: 12/12.
  - First failures kept in this ledger: three terrace test assumptions (the south bridge also lands on Eighteenth Street, a straight walk ends at a market stall, and the gate must be tested from the greenway onto the bridge) and one terrace notice wording. All were fixed in tests or notices, not in composition.
- **Journey routes.** Simulated with the real walking controller over 20 jittered runs, all reaching every waypoint (`scratchpad/p3/probe-terraces.mjs`).
- **`terraces-core-001`** (diff `d53552da195b`, untracked `6f6bb1f893e5`): failed in tooling, 273/274, on the same `land-pr` watch-latency timing test. Its receipt is kept. It never reached the server stage, where review finding 1 below would also have failed.
- **Independent review** (fresh context, read-only). Four confirmed defects and one confirmed behaviour change, all fixed with regressions:
  1. `server/tests/world-manifest.test.js` looked up a reserved location, and none remains. It now uses an authored location that the default revision doesn't compose.
  2. Rollback moved Gardens campus upper-floor players to the greenway, because it checked ground-level walkability for everyone. It now moves only people on terrace geography (the strips and bridges, with no building level), and a campus-floor regression covers it.
  3. The Heights gate trapped a walker mid-bridge on an unloaded terrace, and the notice there gave the wrong way out. Retreat direction and notice now follow the terrace plan. Regressions cover an east step mid-bridge, a real guarded walk from the terrace back to the greenway, and the notice text.
  4. The Commons-gate test didn't tell the old code from the new. It now takes an eastward terrace step.
  5. The terraces' shared bounds made District points stream about 9.5 MB. Points and cameras west of the District edge now never stream Heights when the terraces exist; earlier revisions are unchanged. A regression covers the District gateway looking at the north terrace.
  - Doc wording and stale comments were fixed.
  - The reviewer confirmed byte-identical fingerprints for every earlier revision (default, garage, Gardens, Commons, `bayou-heights-1`, `heights-studewood-1`), exact detach, the Redis chain order, and every journey route from the real stand-up points.
- **After the fixes.** Preview suites 99/99. Terraces, Studewood, Heights and manifest server files with an owned Redis: 23/23, 0 skipped. The branch was fast-forwarded to Studewood `6be77a56` (shared-estimate fix), with a conflict in `heights-stream.js` resolved.
- **Pending.**
  - `terraces-core-002`;
  - the journey `bayou-terraces`, queued about 00:40Z from the detached snapshot `scratchpad/terraces-snap` with matching hashes;
  - a signed commit and a draft PR stacked on #662.

- **Delivered as draft PR #663** (https://github.com/BunsDev/river-oaks/pull/663). Signed commit `125c7f3e`, based on `feat/studewood-3x-20261024`. `terraces-core-002` (00:53–00:57Z) passed: tooling 274/274; preview 4,129 plus 1 skip; server 905 plus 229 Redis-only skips; desktop 115 plus 3 skips.

- **Hosted green on `125c7f3e`** (20 success, 5 skipped), including `preview experience (terraces)` (Verify 40148743422), `(studewood)` and `(heights)`.
  - **Browser figures.** The shared part measured 8,175,390 B against 9,388,032 B estimated; `bayou-terrace-north` measured 2,093,952 B against 2,202,010 B; resident was 11,935,710 B.
  - **Journey passed:** the footbridge crossing, "Entering Bayou Terraces", the gardens table game, reconnect and return.

- **Local Metal journey passed** (snapshot files equal to `125c7f3e`, ended 03:19:27Z): 11/11 checks in 100 s, no page errors, reconnect 931 ms.
  - **Captures inspected:** the riverside walk and the gardens table.
  - **Gaps for follow-up and review:**
    - The Commons Lantern Walk chip shows on the terraces, because `lantern-walk.js` hides it only east of the bayou. That's a design call, left unchanged.
    - The bayou under the kit bridges doesn't read clearly as water.
    - The HUD shows the inherited District address.
- **Later merge.** Studewood `18b9a61f` (carrying #649 `c6d42f43`) was merged in as `9d130475`; focused 67/67 and `terraces-core-003` passed, and it's pushed.

### Land proposal for Val, updated after the terraces (projection, not measurement)

**Measured with #649, #662 and #663:** 131,269.5 m² at 0.5 m (2.8244×). The original east envelope is fully authored, so 3× (139,433.25 m²) needs **8,163.75 m² more reachable ground on new land**. Both measured increments came in at about 84–86% walkable density (Studewood 20,815.75 m² from 24,799 m² of bounds; the terraces 16,945.75 m² from 24,199.5 m²).

| Option | New bounds | At ~84% (Studewood/terraces) | At 63% (District) | Ratio if authored |
| --- | ---: | ---: | ---: | ---: |
| A. East envelope +35 m (x 507.9 → 542.9, across the 290.4 m span) | 10,165 m² | ~8,540 m² | 6,404 m² | ~3.008× at 84%; 2.96× at 63% |
| A′. East envelope +45 m | 13,069 m² | ~10,980 m² | 8,234 m² | ~3.06× at 84%; ~3.002× at 63% |
| B. A strip north or south of the whole east envelope, e.g. 40 m × 254 m beyond the District span | 10,160 m² | ~8,530 m² | 6,400 m² | ~3.007× at 84% |
| C. Keep the land and change the metric | — | — | — | Needs Val's explicit approval; not proposed |

Recommendation: **A′ (+45 m east)**. It reaches 3× even at the District's density, keeps the single east–west growth axis, and continues Studewood Street's frontage. It needs a manifest location, which only Val can authorize. 5× remains about 148,000 m² of bounds beyond the original envelope.

### Land proposal for Val (first projection, before the increments)

Suppose Studewood and the north and south strips beside the Commons are authored at about 80% walkable density, Studewood's draft level:

- **Within the reserve:** about 93,508 + 20,000 + 0.8 × 24,199 ≈ 132,900 m², around 2.86×.
- **Still needed for 3×:** about 6,500 m² of reachable ground, or about 8,200 m² of new bounds at 80% (10,300 m² at the District's 63%).
- **Option A, smallest change:** extend the east envelope by 40 m, x 507.9 → 547.9 across the District's 290.4 m span (11,617 m²).
- **Option B:** a reserve north or south of the east envelope, for example 115 × 90 m beside the Commons strips.
- **Option C:** keep the land and change the metric. This needs Val's explicit approval and is not proposed here.

The 5× target is far beyond any of these: about 148,000 m² more bounds at District density.

## Next step

Watch the #657 and #648 landers, then queue #650.
