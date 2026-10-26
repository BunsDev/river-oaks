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

## Gaps

| Item | Blocker | Owner | Next action |
| --- | --- | --- | --- |
| #649 | ABBA round 6 after 71's train | 71, 91 | 71 lands it if round 6 is within budget and hosted is green; otherwise it goes to Val |
| #662 → #663 → #673 | #649 has to merge first | 71, then e9 | 71 updates and releases each; e9 lands each after its journey and District ABBA |
| #670 | #655 and #649 have to merge first; its owner can't be reached by message | 3e | Comment on #670, or relay through 71, once they're on `main` |
| #661 → #665 → #666 → #667 → #682 | review fixes by 0b; the deploy question to Val before #661 | 0b, Val | Re-review the fixed heads, then land in order |

## Decisions for Val

1. **#661 erasure in production.** If `main` deploys automatically, landing #661 makes a WorkOS `user.deleted` event erase the account's data everywhere. Confirm before e9 lands it.
2. **#686 (the office-computer-embed fix).** It isn't in the ticked rows, but the #292 row's gate needs #665's places failure fixed, and it unblocks every PR that hits the race. Authorize `pnpm run land 686` once hosted CI is green.

## Next action

- Get #686's hosted CI green, then ask Val (Decision 2).
- Wait for 71's train and round 6 on #649.
- Wait for 0b's fixed #661 head.
