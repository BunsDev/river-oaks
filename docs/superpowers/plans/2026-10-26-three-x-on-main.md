# 3× on main: land the district stack and the #292 stack

## Objective

Land the district stack in order onto a green `main`, re-gating each step, and retire each one as it lands. Then prove 3× reachable Gardens ground once on the final `main`. Alongside that, land the #292 account-safety stack once it has been reviewed. Goal prompt: `goal-3x-on-main-20261026`, written for Val on 2026-10-26 at 20:20Z.

Owner: `claude:river-oaks-e9 (15dd41cd)`, task `three-x-on-main-20261026`.

| Worktree | Branch | Task |
| --- | --- | --- |
| `river-oaks-landing-steward` | `docs/three-x-on-main-20261026` (this ledger) | `three-x-on-main-20261026` |
| `river-oaks-computer-embed-reload` | `fix/computer-embed-account-reload-20261026` | `computer-embed-account-reload-20261026` |

## Authority as received

Val answered in this session at about 20:40Z and authorized landing two groups through `pnpm run land`, each after its gates in the goal table:

- **The district stack:** #655, #649, #670, #662, #663 and #673.
- **The #292 stack:** #661, #665, #666, #667 and #682.

The goal ledgers #664 and #668 stay unticked. Earlier, at about 19:30Z, Val also authorized two things for the landing-steward goal:

- landing #660;
- `--cancel-stale` for three named groups (see Retirements).

## Split with the parallel sessions

Each PR has exactly one lander.

| Session | Lands | Notes |
| --- | --- | --- |
| river-oaks-71 | #654, #659, #656, #655, then #649 | #649 lands only if round 6 of its ABBA meets the District gate. 71 relayed that decision from Val (91's register). If round 6 fails, the stack stops and goes back to Val |
| river-oaks-e9 (this) | #662 → #663 → #673, #670, and #661 → #665 → #666 → #667 → #682 | For #662, #663 and #673, 71 as branch owner merges `main`, retargets to `main` and runs core, then releases each to me. 71 reports that Val approved #673's A′ land in 71's session |
| river-oaks-0b | none | Owner of the #292 branches. It fixes review findings on its own branches, then releases each branch at its exact head after its merge |
| river-oaks-3e | none | Owner of #670. A message sent at 20:45Z was held and expired undelivered (different permission mode). Use a #670 comment or a relay through 71 |

71's hard constraint: #662 contains #649's whole diff, so it is not retargeted or landed before #649 merges. I run the acceptance pass after the stack lands and post its evidence on #638 and #587. 71 posts only its own train results and has dropped its separate release-candidate rerun.

## Baseline (2026-10-26 20:20Z)

- `main` was at 091b0ddc. The #587 engineering gate was a go on cb83c7cd (conditions 1–3); conditions 4 and 5 were open.
- Register: 463 tasks. There were 94 worktrees and 76 local branches. `project:check --github` reported 119 gaps.
- Open PRs: 23. The district stack and the #292 stack are signed drafts, each green on hosted CI at its head, except #665, which has 2 failures.

## Rounds

### Round 1 (20:40Z–)

- **#660 (D12) landed** at 21:07:08Z as `a13c853b`, through `pnpm run land 660 --owner river-oaks-e9`.
  - The lander updated the branch to `ba4eecdb`. Verify attempt 1 failed only because `preview experience (campus)` and `preview shared (worlds-and-creator)` were cancelled at the 20-minute job limit (20:55:44Z). The single rerun passed, and the merge guard accepted it.
  - The merge tree `ee69dad6` equals the head tree.
  - The task is `delivered` with evidence. The branch was retired at its local tip `ea7b8ca1`, a strict ancestor of the merged head (`retirement-ZfMdeN`; bundle verified). The D12 snapshot task is `retired`.
  - 71 confirmed that #655's `verify full` attempt 1 on 091b0ddc was SIGKILLed in `east-garden-commons` at 1,200 s, which is the failure #660 addresses. 71 restarted it with a13c853b merged.
- **Cancel-stale under Val's 19:30Z authorization.** Each had a dry run with no blockers, then `--apply`. Bundles verify, and refs and worktrees are confirmed absent.

  | Item | Archive |
  | --- | --- |
  | `test/screening-s1-postmerge-498-20261024` and its worktree (#650) | `cancel-stale-QEBSJ7` |
  | `fix/locomotion-handoff-637-20261024` and its worktree (#645) | `cancel-stale-cCi353` |
  | `feat/onfoot-encounter-640-20261024` and `river-oaks-onfoot-640` (#646) | `cancel-stale-scG7zq` |
  | detached `river-oaks-campus-510-review` (a8 recorded it) | `cancel-detached-Bhzi47` |
  | detached D12 snapshot | `cancel-detached-fU8awv` |

  Preserved:
  - `feat/onfoot-presentation-640-20261024`, which is unfinished.
  - The sweep aliases. a3 is their live owner and will release and retire them itself.
  - f1's `baseline-288`. Its dry run was blocked with `touched-within-cutoff`: it is back in use at cb403ba2.

- **#292 reviews.** These are independent and read-only. Each PR also carries an earlier adversarial review in its body.
  - **#661 (21f09534): land after fixes.** No HIGH findings.
    - M1: a write can land after an erasure that reported success. Reproduced by running it: a held profile save was stored up to 15 s later.
    - M2: one failing world stops erasure in every world after it.
    - M3: a failed erasure leaves no durable record.
    - M4: four claimed behaviors survive mutation.
    - LOW 5–8.
  - **#665 (dab7a8c7): land after fixes.** No HIGH findings.
    - M1: campus guest grants get around a block.
    - M2: the join-snapshot filter has no regression.
    - Voice is still open; that is a recorded Decision.
    - LOW 4–11.
  - River-oaks-0b accepted both. It is fixing #661 first, then #665, each red first, then merging the stack up. It owns the later Decisions: owner builds become a Decision, and voice stays one.
  - **Before #661 lands:** `vercel.json` routes `/api/workos/events` to the `api/server.js` function. If production deploys `main` automatically, merging #661 makes full erasure on `user.deleted` live. 0b can't confirm the deploy setup from the repo, so ask Val before landing #661.
- **The `office-computer-embed` race** (hosted `preview experience (places)`). It fails #665 twice, and has failed on docs-only branches and a Dependabot bump; `main` passes it.
  - **Mechanism.**
    1. The journey switches the `fixture_session` cookie on a live page (`preview/e2e/office-computer-embed.js:273`) and drops the town socket.
    2. `preview/src/access-entry.js:106` reloads the page whenever the session user differs from `body.dataset.accountId`, and it checks every 15 s (`:445`).
    3. A reload that lands after `openDesk` breaks the next check.
  - **The fix is journey-only.** The journey waits for the guest page's `domcontentloaded` from that reload before going on, and records "The page then reloads into the new Place account". Every assertion is kept. `access-entry.js` is untouched: 71 is keeping its reload, and the reload lands with #659 as Val approved it.
  - **Proof** (local, browser lock, logs under `scratchpad/embed/`):

    | Run | Reload | Result |
    | --- | --- | --- |
    | main's journey, hook fires the reload right after `openDesk` | about 6.5 s | **failed:** "After the account change on the same page, none of bob's tasks are shown" (red) |
    | main's journey, reload at 3 s and at 6 s | during `arrive`, or after the steps | passed; a reload during `arrive` is harmless |
    | the fix, reload forced at 3.0 s, 6.5 s and 14.5 s, plus a natural reload | 3.15 s, 6.62 s, 14.68 s, 0.46 s | all passed |
    | the fix, final file with no hooks, run twice | natural | both passed |

    The experiment hook was local and never committed. It put guest's id into `body.dataset.accountId` at the switch, so the routine check matched. At the chosen time it restored the old id and clicked `#access-retry`, so the reload landed at that moment without touching the network. (`multiplayer-client.js` also fetches `/auth/session` on reconnect.)
  - **Core verify.**
    - Attempt 1 failed in tooling, 273/274, on the known `land-pr.test.js` lander-wake test, at load 55–80. Its receipt and log are kept (`scratchpad/embed/core-verify-1.{json,log}`).
    - Attempt 2, started at load 18 and run 21:29–21:40Z, **passed**: tooling 274/274, preview 4,172 + 1 skip, server 915 + 225 Redis skips, desktop 120 + 3 skips.
    - The core run went first by agreement with 71, which held #655's `verify full` attempt 3 until it finished.
  - **Draft #686** at signed `ec0ce5a7`. Hosted CI is pending. It isn't a ticked row, so landing it needs Val's OK (Decision 2).

### Round 2 (2026-10-26 22:00Z – 10-27 03:00Z)

**Val's decisions in this session:**
- **~22:01Z:** land #686 now. Land #661 once 0b's fixes pass an independent re-review and hosted CI, accepting that erasure goes live with the deploy.
- **~22:25Z, a new request:** "commit push and merge to main and allow cars to drive off the road and drive anywhere they can physically fit, like foot traffic behavior allows" (#689).
- **~01:28Z, the 3× gates:** land #662, #663 and #673 each on green hosted CI on an up-to-date head, citing 71's existing local journey receipts. Run the district journeys and the District ABBA once, on the final `main`, in the acceptance pass. (Val had already told river-oaks-91 directly to land #649 without round 6.)

**Merged on `main`:**

| PR | Merge | Lander | Retirement |
| --- | --- | --- | --- |
| #686 office-computer-embed race fix | `c6eba6a3` (22:54Z) | e9 | `retirement-TX54Tk`; 14 evidence files archived |
| #689 vehicles drive off-road (Val's request) | `8bb3f04a` (00:22Z) | e9; the first lander process died silently during its rerun wait and was restarted | `retirement-ofeW7J`; 7 files |
| #654, #659, #656 | `8b73888a`, `40f4e786`, `caa1a7ef` | 71 | owners |
| #653 | `ba7418c6` | 7c | owner |
| #649 Bayou Heights, 2.01× | `3df540ee` (~01:20Z) | 91 | owner |
| #655 residents walk anywhere | `2d63637f` | 71 | owner |
| #661 account erasure | `66756b19` (02:08Z) | e9 | `retirement-28WWp5`; 51 files |
| #662 Studewood, 2.46× | `9ee35b4c` (02:50Z) | e9 | `retirement-FqyVMf`; 26 files |

For each e9 landing:
- the merge tree equals the head tree;
- the task is `delivered` with evidence;
- ignored evidence was archived with SHA-256 sums, verified by extraction and `chmod go-rwx`, under `~/worktree-backups/river-oaks/evidence-three-x-on-main-20261026/`;
- caches went to the Trash;
- the guarded prune ran: dry run, then `--apply`, then bundle verify.

**#689, vehicles off-road:**
- **Rule:** `vehicleCanOccupy` (`carriage-parking.js`) is the bicycle's: every footprint point must be `isFree` and not `roomAt`, plus the existing people and tree checks. The `road`/`crossing` clause is gone.
- **Regression test:** red with main's rule (the car stops at the curb, centre at 1.34 m); green without it.
- **Checks:** focused tests 49/49; core verify passed; a real-district probe drove 45 m and 7.5 m off the road.
- **Not checked:** no browser or visual check.

**#661 re-review at `10251056`: land-ready.**
- **Fixes:**
  - Finding 1: a settle pass about 60 s later, reproduced with four held POSTs.
  - Finding 2: `eraseEach`, mutation-tested at each site.
  - Finding 3: a durable pending record, retried by the `/api/erasure-sweep` cron, which authenticates and fails closed.
  - Finding 4: mutations A, B, C and D now go red.
- **New LOW:** the standalone town keeps its pending record in memory. 0b documents it in #666 and records persisting it as a follow-up.
- **Precondition, not verified by e9:** `CRON_SECRET` set in Vercel production (Decision 3).

**Reachable ground on `main` 9ee35b4c,** measured with `node preview/audit/world-expansion-footprint.js --reachable` from a scratch `git archive`:
- 0.5 m: **2.4598×**, 114,323.75 m² against 46,477.75 m²;
- 1 m: 2.4661×;
- the 3× target is 139,433.25 m² at 0.5 m.

### Round 3 (2026-10-27 03:00Z – 05:50Z): 3× reached on `main`

| PR | Merge | Lander | Notes | Retirement |
| --- | --- | --- | --- | --- |
| #663 Bayou Terraces, 2.82× | `74f12d76` (03:39Z) | e9 | 71 prepared `ee6b677e`; Verify passed on `632fb1c` | `retirement-TnCG4W`; 18 files |
| #665 player blocking | `f403dc33` (04:09Z) | e9 | Re-review land-ready (below). The first `gh pr ready` hit GitHub's secondary GraphQL limit; it was retried after the reset | `retirement-ZwqUlM`; 7 files |
| #673 Woodland Heights, 3.05× | `a5857cf4` (04:56Z) | e9 | 71 prepared `fcfc6a98`. Verify attempt 1 failed in `preview checks` on two Redis epoch tests: "switches district only to a newer epoch", the known load-flaky one, and "fences Commons rollout and rollback by epoch". The single rerun passed. First-failure log: `scratchpad/ci673-preview-checks-attempt1.log` | `retirement-VIyqcn`; 48 files |
| #666 in-app deletion (default-off flag) | `d70f4d87` (05:44Z) | e9 | Review land-ready (below); Verify passed on `22562d6` | waits for 0b's release |

**3× reachable ground on `main` a5857cf4.** Measured with `node preview/audit/world-expansion-footprint.js --reachable`; receipt sha256 `255dea7d`.

| Revision | 0.5 m | × Gardens | 1 m |
| --- | --- | --- | --- |
| `river-oaks-gardens-3` (baseline) | 46,477.75 m² | 1.000 | 46,549 m² |
| `bayou-heights-1` | 93,508 | 2.0119 | 2.0173 |
| `heights-studewood-1` | 114,323.75 | 2.4598 | 2.4661 |
| `bayou-terraces-1` | 131,269.5 | 2.8244 | 2.8294 |
| **`woodland-heights-1`** | **141,664.25** | **3.0480** | **3.0519** |

The 3× target at 0.5 m is 139,433.25 m², and Woodland clears it by 2,231 m². This measures reachable ground in source. Players still get the default District until Val activates the new revision.

**Re-reviews.** All were independent and read-only, run before landing.
- **#665 at `1f507f2c`: land-ready.**
  - Campus grants: 8 mutations go red, and a walk-out probe shows the guest put at the door, unseated, then refused by the suite.
  - The join snapshot mutation goes red separately in each architecture.
  - The LOW fixes: 23 of 23 mutations go red.
  - New LOW: the hosted recheck was skipped on `request_timeout`. 0b reproduced it and fixed it in #666 (`4df91a44`), with no timing side channel.
- **#666 at `bf835443`: land-ready.** No HIGH or MEDIUM findings.
  - Authorization, CSRF, the rate limit, the flag on every path, WorkOS-first ordering, the erasure wiring and logging are sound.
  - LOW: three test gaps, two of them contradicting the ledger's mutation claims; owner self-deletion; the overstated ten-minute rationale. 0b fixed all of them on #667's branch, red first, and corrected the ledger. Owner self-deletion is Decision 4 in `docs/account-deletion.md`.

**3× acceptance pass** (`scratchpad/accept-run.sh`, adapted from 71's `rc-run.sh`). It runs on detached snapshots of final `main` a5857cf4 and pre-stack `main` 2d63637f, registered as `three-x-acceptance-snapshots-20261027`. Its own `caffeinate` and an isolated Redis started at 04:59Z.
- Both rehearsals passed: Commons at 04:59:02–04:59:28Z and Heights at 04:59:28–04:59:42Z.
- The 7 journeys are queued fifth for the shared browser lock.
- Then the District ABBA: A is 2d63637f at `east-garden-commons-market-1`, B is a5857cf4 at `woodland-heights-1`, run A1 B1 B2 A2 under one held lock, each arm at load ≤12. After it, `baseline-compare.js` and `verify full`.

## Gaps

| Item | Blocker | Owner | Next action |
| --- | --- | --- | --- |
| #670 | 3e is finishing the wiring patch, rehearsal and `verify full` | 3e | 3e marks it ready and releases it (comment 6431515014); e9 lands it |
| #667 → #682 | 0b is merging up and verifying | 0b | Re-review each, then land in order |
| `feat/account-deletion-292-20261024` | Waits for 0b's exact-head release | 0b | e9 archives and prunes |
| 3× acceptance pass | Waits for the last district to land | e9 | The journeys and District ABBA on final `main` (needs load ≤12), then the #638 and #587 comments |

## Decisions for Val

1. **#661 erasure in production:** answered, "Land after fixes". It landed as `66756b19`.
2. **#686:** answered, "Land it". It landed as `c6eba6a3`.
3. **`CRON_SECRET` in Vercel production.** #661 is on `main`. Without the secret, the settle pass and retries never run on Vercel; a deletion still gets its first full pass. Set it, or confirm it's already set.
4. **Owner and admin self-deletion (#666, Decision 4 in `docs/account-deletion.md`).** Deletion is off by default. If it's turned on, an owner or moderator account that deletes itself loses its role until a code or config change. 0b recommends refusing those ids.

## Next action

- The 3× acceptance pass finishes. Post one evidence comment each on #638 and #587, with receipt hashes.
- Land #667 → #682 after re-review, and #670 when 3e releases it.
- Retire the deletion branch once 0b releases it. The acceptance snapshots need Val's `--cancel-stale` or stay as evidence.
