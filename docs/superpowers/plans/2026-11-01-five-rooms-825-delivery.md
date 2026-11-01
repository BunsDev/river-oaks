# Five Rooms and a Ribbon (#825): delivery plan and sub-issue structure

- **Task id:** `five-rooms-plan-825-20261101` (live register)
- **Owner:** `claude:river-oaks-6d (2a62a6)`; goal set by Val 2026-11-01: well-defined sub-issues with
  dependencies, parallel agent work, and the first landed MVP rework expedited
- **Branch:** `docs/five-rooms-825-delivery-20261101` from `origin/main` `decb4e9a`
- **Worktree:** `/Users/buns/Documents/GitHub/BunsDev/river-oaks-five-rooms-plan-825`
- **Direction in force:** Val's 2026-11-01 comment on #825: visual/spatial foundation first, no
  new gameplay, no URL flag to activate. Slices 3–12 of the original epic text are deferred.

## Objective

Turn epic #825 into sub-issues that an agent can pick up cold, each with one PR, one register
task, owned files, hard prerequisites, acceptance and a long-running goal prompt; record the
dependency graph; run the unblocked lanes in parallel; and carry the first landed MVP (M0) to
Val's merge decision.

## What was found before shaping (2026-11-01, main `decb4e9a`)

- Existing work: draft stack #826 (slice 1 contract, head `a1d7a10d`) → #827 (slice 2a route,
  `97be93bd`) → #828 (slice 2b graybox, `1a85f208`), all hosted green; the remote heads are Val's
  GitHub main-merges of 2026-10-31 22:55Z. Register owner "cody (coven cave session)" is not a
  live Claude session (coven-cave-7a/79/f0 all denied it) and its lease expired 2026-11-01T04:00Z.
  The three local worktrees are 12–14 commits behind their remotes and untouched by this task.
- #831 (connector-authored, no local checkout, no register claim) flips `DEFAULT_FINISH` to
  `pink-jet-age`. Its only hosted failure is `preview experience (depth)`: 10 surface pairs that
  exist only under pink (`campus:jet-age:*` against slab/stone/timber/guard glass, and
  `garden-court` `bronze-satin` on `trim-ivory`). Job 124753515956 in run 41274397767.
- No sub-issues existed on #825 (`GET /issues/825/sub_issues` → 0).
- Corrections to the epic's assumptions: the District's storefronts do not read the finish
  (`buildDistrictBuildings` passes `kitFinish` to the Gardens campus only); no draw-call constant
  of 657 exists in the code; `shared/city-kit/ribbon-layout.js` exists only on the #826 branch.

## Sub-issues (created 2026-11-01, linked as GitHub sub-issues of #825)

| # | Milestone | Scope | Hard prerequisites | Register task |
| --- | --- | --- | --- | --- |
| #835 | M0 | Land #826 → #827 → #828 | Val decisions 1–3, merge authorization | `ribbon-layout/route/graybox-825-20261031` |
| #836 | M0 | Pink Jet-Age depth burndown | none | `pja-depth-burndown-825-20261101` |
| #837 | M0 | Activation (PR #831), no-flag default | #836; lands after #835 | `finish-default-on-825-20261101` |
| #838 | M1 | Spatial contract, data + validator | stacks on #827; Val's retirement list to finalise | `five-rooms-layout-825-20261101` |
| #839 | M1 | Five blank shells + finished Ribbon canopy | #838 v1 draft; #836, #838 merged to finish | `five-rooms-shells-825-20261101` |
| #840 | M1 | Landscape and ground | #838 v1 draft; decision 6 for the Shade Garden court | `five-rooms-landscape-825-20261101` |
| #841 | M1 | Integration: wiring, ground/collision authority, teardown | #839, #840, #838, #835 | `five-rooms-integration-825-20261101` |
| #842 | M1 | QA, matched cameras, budgets, acceptance packet | harness now; evidence after #841 and #837 | `five-rooms-qa-825-20261101` |

**M0 (first landed MVP):** main starts in `pink-jet-age` with no flag, `?finish=classic` still
works, the District spine Ribbon is visible from the arrival spawn past IPIC, hosted gates green.
**M1:** five distinct blank shells, courts and the complete Ribbon, traversable on authoritative
ground, with Val's acceptance packet.

Each sub-issue body holds: outcome, dependencies (build/completion prerequisites, unblocks,
parallel-safe set), files owned and files not to touch, acceptance checklist, verification
commands, register ids and branch/worktree names, a long-running goal prompt, and the shared
working rules (no gameplay, pink rule, verification, merge needs Val).

## Parallel lanes

```
now:        #836 depth ∥ #837 activation ∥ #838 contract        (workers running)
then:       #839 shells ∥ #840 landscape ∥ #842 harness         (after #838 v1 draft)
then:       #841 integration                                     (after #839/#840 branches)
then:       #842 evidence → Val acceptance packet
M0 landing: #826 → #827 → #828 → #836 → #837                     (Val decisions + authorization)
```

Workers spawned by this session (owner ids `claude:river-oaks-6d (2a62a6) worker:<name>`),
each in its own worktree, claiming its register task:

| Worker | Worktree | Branch / base |
| --- | --- | --- |
| depth-836 | `../river-oaks-pja-depth-825` | `fix/pink-jet-age-depth-burndown-825-20261101` from `origin/main` |
| activation-837 | `../river-oaks-finish-default-825` | `feat/visual-foundation-default-finish-20261031-chatgpt` (PR #831), main merged in |
| layout-838 | `../river-oaks-five-rooms-layout-825` | `feat/five-rooms-layout-825-20261101` from `origin/feat/ribbon-route-825-20261031` |

## Decisions for Val (also in the epic body)

1. Widening: accept the 2.0 m walk for M0, or move bin-54 and two lamps for 2.4 m (#838).
2. Street-tree clearance: accept for M0 and fix in #840, or require before #828 lands.
3. Merge authorization and order: #826 → #827 → #828, then #836, then #837.
4. Whether #787, #788, #789 (pink opt-ins) land before #837; anything merged becomes default.
5. Retirement list: which tenants retire and which bay hosts which room (#838 proposes options).
6. Confirm a retired tenant's bay may open as the Shade Garden court inside its mapped building.
7. Names and residents policy: deferred with gameplay.

## Checks and results

| Check | Result |
| --- | --- |
| `GET /repos/BunsDev/river-oaks/issues/825/sub_issues` | 8 linked (#835–#842) |
| `pnpm run register patch … --create` × 8 new tasks, 3 existing tasks given `issue: 835` | written; `project:check` reports only the pre-existing 285 missing-archive warning |
| Epic body | delivery plan, decisions and corrected facts appended 2026-11-01T08:43Z |
| Workers | three spawned; results recorded below as they report |

## Results

- 2026-11-01 ~10:15Z: all three workers stopped on a usage-limit API error before committing.
  Their claims passed to peer sessions that Val set /goals on:
  - #836: `claude:river-oaks-48`. The worktree holds the worker's uncommitted fixes, an untracked
    ledger and `pink-jet-age-depth.test.js`.
  - #837: `claude:river-oaks-f0`. Main merged, head `2ce693b2`, focused tests 57/57, preview unit
    0 failures, build ok. Verify and capture wait on load.
  - #838: released to `river-oaks-c2`. An untracked, unreviewed `five-rooms-layout.js` draft
    remains in the worktree.
- #842 is claimed by `river-oaks-qa-842` (draft #845, harness, core verify passed).
- #826 was marked ready (no longer a draft).
- #839, #840 and #841 have no owner yet.

## Gaps

- No merge is authorized; M0 cannot land without Val's decisions 1–3.
- #839, #840, #841 and #842 are queued, not started; they wait for the #838 v1 draft.
- The "cody" worktrees stay as they are; any fix to the stack must come from a fresh checkout of
  the PR refs, registered separately.

## Next step

Collect the three worker reports, update the Results table and the register, push this ledger
as a draft docs PR, then hand Val the seven decisions.
