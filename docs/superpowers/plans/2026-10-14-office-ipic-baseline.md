# Office + IPIC #360, design-side baseline packet (2026-10-14)

Objective: deliver the design half of the #360 G0/G1 packet under
`docs/design/office-ipic/`: a reconciled source index with hashes and approval
state, an asset manifest with budgets and axes, a brief that separates observed,
inferred and proposed geometry, and a review matrix with owners. No layout
activation, no asset import, no provider call.

Task `office-ipic-baseline-360`, owner `claude:river-oaks-fable (aa2272b7)`.
Worktree `../river-oaks-office-ipic-baseline-20261014`, branch
`docs/office-ipic-baseline-20261014` from `origin/main` `489a60e4`.

Split agreed 2026-10-14 ~19:50Z with session river-oaks-dc, which also holds
#360 by a /goal: this branch owns the design side (D0/D1); river-oaks-dc owns the
engineering side (C0/C1) on `docs/office-ipic-engineering-baseline-20261014`:
baseline check counts, envelope measurement, physical-fit analysis,
`layout-contract.json`, `camera-manifest.json` and their validator, under task
`office-ipic-engineering-baseline`. Neither branch edits the other's files.

Files owned here:

- `docs/design/office-ipic/brief.md`, `review-matrix.md`
- `docs/design/office-ipic/reference-index.json`, `asset-manifest.json` (generated)
- `scripts/office-ipic-reference-index.mjs` (generator and validators)
- `scripts/tests/office-ipic-references.test.js`
- this ledger and the task entry in `docs/project-management/tasks.json`

## Baseline evidence read

- `docs/offices.md`, `docs/ipic-interior.md`, `preview/src/office-contract.js`,
  `workplace-room.js`, `office-scene.js`, `office-arrival-model.js`,
  `office-desk-contract.js`, `workplace-contract.js`, `ipic-plan.js`,
  `server/offices.js`, `store-rooms.js` transforms; the IPIC review receipts.
- Kit at `~/Downloads/jevica-office-kit` (71/71 checksums verified), the top-level
  production guide, walkthrough and zip (72 entries), and Cody's scale review at
  `~/Downloads/jevica-office-scale-review` (assessment, library revisions 1–3,
  passing-bay check, 19 captures). Hashes, sizes and mtimes recorded in
  `reference-index.json`.
- Blob drift since the kit's receipts: `workplace-room.js` and `server/offices.js`
  unchanged; `office-contract.js`, `office-scene.js`, `package.json` changed.
- Searched for `typesafe-place-coding-familiar-handoff.md` and
  `typesafe-place-design-familiar-handoff.md`: `git ls-files`, repository grep,
  `mdfind` over the home folder. Not found; recorded as missing entries.
- Draft PR bodies #349–#358 read for keep/reuse/avoid; recorded in the brief.

## Checks

| Command | Result |
| --- | --- |
| `node scripts/office-ipic-reference-index.mjs --write --kit … --scale-review … --loose …` | 147 references, 53 assets at `489a60e4` |
| `node scripts/office-ipic-reference-index.mjs --check` | 0 problems, 0 drifted |
| `node --test scripts/tests/office-ipic-references.test.js` | 6 pass, 0 fail, 0 skipped |
| `pnpm run verify` (core) at `489a60e4` + this patch | passed: agent 82/82, preview 3,012 pass / 1 existing skip, server 486 pass / 140 Redis skips (core permits them), desktop 54/54, Python 141 passed; receipt `.runtime/agent/core.json` |

The validator is behavioural: scratch repository and scratch kit fixtures, a
tampered kit file, duplicate ids, a short revision, a wrong axis convention, an
unlisted repository path, a dangling asset reference, inverted bounds, an
over-budget proxy, and a later edit to a referenced file (drift, not failure).

## Gaps and skips

- Baseline captures with avatars, focused office/IPIC check counts, envelope
  re-measurement and the physical-fit analysis are on the engineering branch.
- No kit bytes imported; the public repository would publish generated images
  without recorded approval (decision for Val).
- No human visual, target-device, native or live-auth evidence. Core verify
  excludes Redis and browser profiles.

## Decisions for Val

Parked here as the goal asks; the brief carries the same list with context.

1. Kit import: copy the kit bytes into the public repository (all 19 MB, or
   `layout.json`, `asset-manifest.json` and the GLBs only), or keep them external
   and indexed by hash as `reference-index.json` does now. The kit's README records
   your approved direction but no approval to publish those bytes.
2. Physical fit: the kit's 7.6 m clear main volume above the 24.3 m lift rise
   exceeds the mapped building's estimated height. The measurement and options are
   in the engineering packet (#381, `layout-contract.json`). G1 cannot close
   without this answer.
3. Mezzanine programme: adopt Cody's library revision 3 (two reading chairs at
   d 18.3, bookcase-0 and the mezzanine table removed, east passing bay), or keep
   the kit's library as drawn.
4. IPIC lift: keep it decorative in this increment, or implement a fixed-endpoint,
   server-validated reduced-motion route. A decorative door is not a usable route.
5. Handoff briefs: `typesafe-place-coding-familiar-handoff.md` and
   `typesafe-place-design-familiar-handoff.md` were not found in the repository
   or on this machine. Supply them, or confirm #359 and its children are the record.
6. Local count cap (task local-prune-20261013, retired after #375): at
   2026-10-14T20:40Z the inventory shows 24 worktrees / 24 branches, 0
   retire-eligible, 0 retire-candidate: 12 active checkouts owned by live sessions,
   8 open draft PRs (#351–#358) with queued tasks, 3 parked queued/blocked tasks
   owned by other sessions, and the primary. Ten-and-ten needs one of: authorize
   `project:cancel` of the local checkouts of drafts #351–#358 once their tips are
   confirmed pushed (the PRs stay reviewable from origin), or accept the cap as a
   target for after those drafts land or close. Nothing is cancelled without that.
   Concrete candidates at 2026-10-14T20:50Z (inventory r3, 23 / 23):
   `feat/procedural-gallery-route-20261014` is now zero-commit, its tip
   `f0a55434` is on `main` through #349's integration merge, its task
   `procedural-gallery-vertical-route` is queued with no owner and no PR of its
   own; `project:prune` refuses it (no exact merged PR head) and `project:cancel`
   needs a stated staleness window, so it needs an explicit yes.
   `perf/procedural-gallery-ao-sampling-20261014` (trial outcome recorded, no PR,
   queued, no owner) and `feat/voice-acceptance-20261013` (blocked task owned by
   cody) are distinct unfinished work and need their owners or you.
   Dry runs at 2026-10-14T21:10Z (nothing applied): `project:prune --cancel-stale
   --branch feat/procedural-gallery-route-20261014 --expected-head
   f0a55434e1cd43a1e3b34e894a615b8460854d61` reports eligible under the default
   12-hour rule (latest touch 2026-10-14T01:08Z, no blockers); the same for
   `perf/procedural-gallery-ao-sampling-20261014` at `05ddd067…` is blocked
   `touched-within-cutoff` (09:43Z). A yes on the first lets any session run that
   command with `--apply` for 22 / 22; the eight draft checkouts (#351–#358) and
   the twelve owned active ones remain, so ten-and-ten still needs the broader
   answer above.
   Applied at 2026-10-14T21:40Z: `feat/procedural-gallery-route-20261014` cancelled
   through the guarded path (fresh dry run eligible, no process in the worktree,
   task queued with no owner, tip on `main`): status `cancelled-local`, manifest
   `~/worktree-backups/river-oaks/cancel-stale-dufthR/manifest.json`, archive tag
   `archive/worktree-prune/311aa502-5ba9-4895-a742-787ab47084f6`; the task
   `procedural-gallery-vertical-route` now says restore before resuming. Remote
   branch untouched. Count 22 / 22.

## Round end (2026-10-14T20:40Z)

HEAD `9825dfb3` on `docs/office-ipic-baseline-20261014`, worktree
`../river-oaks-office-ipic-baseline-20261014`, draft PR #380: all 16 hosted checks
green, mergeable clean, not merged. Engineering packet: draft PR #381
(`docs/office-ipic-engineering-baseline-20261014`, river-oaks-dc). Commands and
counts are in the Checks table above; `node scripts/project-inventory.mjs
--no-fetch` from the primary gave the counts in decision 6. Standing report:
#351–#358 mergeable and untouched, #349 moved by its codex owner, #350 stacked on
it and conflicting (owned, in progress), #309 dirty with an expired codex lease.
Skips: Redis (140 in core, permitted), browser, native, live auth.

After #349 merged (de0b64a9) the branch merged main again (d3c8683e, plans index
regenerated). The packet check now reports one drift: `docs/offices.md` changed
since `489a60e4`; the packet records the pre-#349 office documentation, and the
next reconciliation should re-read it. #349 leaving draft is a change in the
keep/reuse table's premise: its level/portal schema is now on `main`.

## Next

Draft PR #380 is open and green; the engineering packet is #381. G1 agreement
needs both packets plus Val's answers to decisions 1–3.
After G1, #361 or #366 in a new worktree, one scope per PR.
